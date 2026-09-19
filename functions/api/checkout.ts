/**
 * Cloudflare Pages Function — POST /api/checkout
 *
 * Fully edge-native: raw fetch to the Sanity query API and the Stripe REST API,
 * no SDKs — so it runs on the Workers runtime with no nodejs_compat flag. Creates
 * an embedded Checkout Session and returns its client secret.
 *
 * Prices/stock are ALWAYS re-read from Sanity here; the client cart only supplies
 * productId + sku + qty, never trusted amounts.
 */

// Pinned to the Stripe SDK's API version so the value `embedded_page` and the
// client libraries (@stripe/stripe-js) stay in lockstep.
const STRIPE_VERSION = '2026-06-24.dahlia';

// Products that unlock the "Pick up at Merch booth" shipping option — the
// ticket/bundle products sold from /releaseparty and /albumrelease. Update
// this set if those products are ever recreated with new IDs. See
// docs/specs/active/albumrelease-ga-tiers.md for the full sync checklist.
const PICKUP_ELIGIBLE_PRODUCT_IDS = new Set([
  '2480f00d-9317-4ed0-9406-bcef1e34bc71', // Live Show Ticket
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea', // VIP Fan Experience (superfan bundle)
  'albumrelease-ga', // GA (/albumrelease)
  'albumrelease-ga-plus', // GA Plus (/albumrelease)
]);

// Early bird ticket kill switch. MIRRORS EARLY_BIRD_SOLD_OUT in
// src/lib/tickets.ts (separate Workers bundle — flip both together). While
// true, any cart line for a PICKUP_ELIGIBLE product (every one of them carries
// a ticket) is refused. Enforced here, not just in the UI, so stale carts,
// direct API calls, and a refund restocking a ticket back above zero in Sanity
// can't reopen online sales. Door tickets are sold on the booth Stripe Reader.
const EARLY_BIRD_SOLD_OUT = true;

// Required tee/size selections for the bundle products. MIRRORS
// src/lib/bundleOptions.ts (this runs in a separate Workers bundle and can't
// import it — keep the two in sync). Validation here is authoritative; the
// storefront selectors are only UX. See ADR 0007.
// Two tees per bundle: a style + size for each. Mirrors TWO_TEES in
// src/lib/bundleOptions.ts — keep the group names/values identical.
const TEE_VALUES = ['Obuntu Tee (Red)', 'Champion Tee (Black)'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const BUNDLE_TWO_TEES = [
  { name: 'Tee #1', values: TEE_VALUES },
  { name: 'Size #1', values: SIZES },
  { name: 'Tee #2', values: TEE_VALUES },
  { name: 'Size #2', values: SIZES },
];
const BUNDLE_OPTION_ALLOW: Record<string, { name: string; values: string[] }[]> = {
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea': BUNDLE_TWO_TEES, // VIP Fan Experience
  'ca04e096-228b-4bee-a28b-46829ed68ecf': BUNDLE_TWO_TEES, // Ultimate Fan Merch Bundle
};

interface Env {
  STRIPE_SECRET_KEY?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
}

interface IncomingItem {
  productId: string;
  sku?: string;
  qty: number;
  /** Customer-selected bundle options (tee/size); validated server-side. */
  options?: { name?: string; value?: string }[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const toCents = (n: number) => Math.round(n * 100);

// Flatten nested objects/arrays into Stripe's bracketed form-encoding.
function formEncode(
  obj: Record<string, unknown>,
  prefix = '',
  pairs: [string, string][] = [],
): [string, string][] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          formEncode(item as Record<string, unknown>, `${key}[${i}]`, pairs);
        } else {
          pairs.push([`${key}[${i}]`, String(item)]);
        }
      });
    } else if (typeof v === 'object') {
      formEncode(v as Record<string, unknown>, key, pairs);
    } else {
      pairs.push([key, String(v)]);
    }
  }
  return pairs;
}

async function sanityQuery<T>(env: Env, query: string, params: Record<string, unknown>): Promise<T> {
  const version = env.SANITY_API_VERSION || '2026-03-01';
  const dataset = env.SANITY_DATASET || 'production';
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v${version}/data/query/${dataset}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) throw new Error(`Sanity query failed (${res.status})`);
  const data = (await res.json()) as { result: T };
  return data.result;
}

const PRODUCTS_QUERY = `*[_type == "product" && !(_id in path("drafts.**")) && _id in $ids]{
  _id, title, price, stock, taxCode, stripeProductId, "imageUrl": images[0].asset->url,
  variants[]{ label, sku, price, stock, stripeProductId }
}`;

const SETTINGS_QUERY = `*[_type == "commerceSettings" && _id == "commerceSettings"][0]{
  storeEnabled, currency, allowedShippingCountries, defaultTaxCode, enableTax,
  shippingRates[]{ label, amount, taxCode, taxBehavior }
}`;

const DEFAULTS = {
  currency: 'usd',
  countries: ['US'],
  shipping: [{ label: 'Standard Shipping', amount: 5 }],
  defaultTaxCode: 'txcd_99999999',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not configured yet.' }, 503);
  if (!env.SANITY_PROJECT_ID) return json({ error: 'Store is unavailable.' }, 503);

  let body: { items?: IncomingItem[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'Your cart is empty.' }, 400);
  // Stripe caps a session at 100 line items; stop well short so an oversized
  // cart fails fast here instead of after two Sanity round-trips.
  if (items.length > 50) return json({ error: 'That cart is too large — please split the order.' }, 400);

  if (EARLY_BIRD_SOLD_OUT && items.some((i) => PICKUP_ELIGIBLE_PRODUCT_IDS.has(i.productId))) {
    return json(
      {
        error:
          'Early bird tickets are sold out — tickets are now available at the door only. Remove the ticket from your cart to check out with the rest of your order.',
      },
      409,
    );
  }

  const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  let products: any[];
  let settings: any;
  let settingsFailed = false;
  try {
    [products, settings] = await Promise.all([
      sanityQuery<any[]>(env, PRODUCTS_QUERY, { ids }),
      sanityQuery<any>(env, SETTINGS_QUERY, {}).catch((e) => {
        settingsFailed = true;
        console.error('[checkout] settings fetch failed:', e);
        return null;
      }),
    ]);
  } catch {
    return json({ error: 'Could not load products.' }, 502);
  }
  // Shipping rates, tax and currency all live in settings. Falling back to
  // built-in defaults would quietly under-charge shipping and skip sales tax
  // on every order placed during the outage, with nothing in the logs to
  // reconcile afterwards. Fail closed instead.
  if (settingsFailed) {
    return json({ error: 'Could not start checkout — please try again in a moment.' }, 503);
  }

  // Honour the storefront master switch. `storeEnabled === false` is the only
  // value that closes the store; a missing/failed settings fetch (null) fails
  // open so a transient Sanity blip never blocks legitimate checkouts.
  if (settings?.storeEnabled === false) {
    return json({ error: 'The store is closed for maintenance.' }, 503);
  }

  const byId = new Map<string, any>((products || []).map((p) => [p._id, p]));

  const currency: string = settings?.currency || DEFAULTS.currency;
  const taxEnabled: boolean = settings?.enableTax === true;
  const defaultTaxCode: string = settings?.defaultTaxCode || DEFAULTS.defaultTaxCode;
  const countries: string[] = settings?.allowedShippingCountries?.length
    ? settings.allowedShippingCountries
    : DEFAULTS.countries;

  // Stock has to be checked against the TOTAL quantity of each sku in the
  // cart, not per line. The cart keys lines by sku + chosen options, so the
  // same sku legitimately appears more than once (e.g. two bundles with
  // different tee choices) and a per-line check would let each one through.
  const normQty = (q: unknown) => Math.max(1, Math.floor(Number(q) || 1));
  // Resolve the sku against the real product before using it as the bucket
  // identity. Keying on the raw client string let a variant-less product be
  // split across as many buckets as the caller invented sku strings, and each
  // bucket got its own full stock allowance.
  const bucketKey = (it: IncomingItem) => {
    const p = byId.get(it.productId);
    const v = (p?.variants || []).find((x: any) => x.sku === it.sku);
    return `${it.productId}::${v?.sku ?? ''}`;
  };
  const qtyBySku = new Map<string, number>();
  for (const it of items) {
    qtyBySku.set(bucketKey(it), (qtyBySku.get(bucketKey(it)) ?? 0) + normQty(it.qty));
  }

  const line_items: Record<string, unknown>[] = [];
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p) {
      return json({ error: 'An item in your cart is no longer available.' }, 409);
    }
    const variant = (p.variants || []).find((v: any) => v.sku === item.sku);
    // A variant product with an unmatched sku would silently fall back to the
    // base price and base stock — both of which go stale once sizes exist.
    if ((p.variants || []).length > 0 && !variant) {
      return json({ error: `"${p.title}" — that option is no longer available.` }, 409);
    }
    const unit: number = variant ? (variant.price ?? p.price) : p.price;
    // Stock is authoritative: no variants → base stock; else the variant's. 0 = sold out.
    const stock: number = variant ? (variant.stock ?? 0) : (p.stock ?? 0);
    const qty = normQty(item.qty);
    const cartQty = qtyBySku.get(bucketKey(item)) ?? qty;
    const which = variant?.label ? `${p.title} — ${variant.label}` : p.title;

    if (!unit || unit <= 0) return json({ error: `"${p.title}" is not purchasable.` }, 409);
    if (stock <= 0) return json({ error: `"${which}" is sold out.` }, 409);
    if (stock < cartQty) {
      return json({ error: `Only ${stock} of "${which}" left in stock.` }, 409);
    }

    // Bundle tee/size: rebuild the options from our allow-list (never trust the
    // raw client strings) so a required choice can't be skipped or spoofed.
    let cleanOptions: { name: string; value: string }[] | undefined;
    const requiredGroups = BUNDLE_OPTION_ALLOW[item.productId];
    if (requiredGroups) {
      cleanOptions = [];
      for (const group of requiredGroups) {
        const val = (item.options || []).find((o) => o?.name === group.name)?.value;
        if (!val || !group.values.includes(val)) {
          return json({ error: `Please choose a ${group.name.toLowerCase()} for "${p.title}".` }, 409);
        }
        cleanOptions.push({ name: group.name, value: val });
      }
    }

    const price_data: Record<string, unknown> = {
      currency,
      unit_amount: toCents(unit),
      tax_behavior: 'exclusive',
    };
    // Merch synced by scripts/setup-merch-coupon.mjs checks out against a
    // persistent Stripe Product (one per SKU/variant) instead of an ad-hoc one,
    // so the merch-only WTN15OFF coupon (applies_to.products) can target it.
    // Name/images/tax_code/metadata are baked in at creation time in that case.
    // Ticket/bundle products never get a stripeProductId, so they always fall
    // through to the ad-hoc path below — which is also the fallback for any
    // merch item that hasn't been synced yet (checkout still works, it's just
    // not coupon-eligible until the script runs).
    const stripeProductId: string | undefined = variant ? variant.stripeProductId : p.stripeProductId;
    if (stripeProductId) {
      price_data.product = stripeProductId;
    } else {
      const optionSuffix = cleanOptions?.length
        ? ` — ${cleanOptions.map((o) => o.value).join(' / ')}`
        : '';
      const baseName = variant?.label ? `${p.title} — ${variant.label}` : p.title;
      // Server-resolved sku only. The client's string is a lookup key, never a
      // value we persist — the webhook treats this metadata as authoritative.
      const metadata: Record<string, string> = { productId: p._id, sku: variant?.sku ?? '' };
      if (cleanOptions?.length) metadata.optionsJson = JSON.stringify(cleanOptions);

      const product_data: Record<string, unknown> = {
        name: `${baseName}${optionSuffix}`,
        metadata,
      };
      if (p.imageUrl) product_data.images = [p.imageUrl];
      if (taxEnabled) product_data.tax_code = p.taxCode || defaultTaxCode;
      price_data.product_data = product_data;
    }

    line_items.push({ quantity: qty, price_data });
  }

  const rates = (settings?.shippingRates?.length ? settings.shippingRates : DEFAULTS.shipping).slice(0, 5);
  const shipping_options = rates.map((r: any) => {
    const shipping_rate_data: Record<string, unknown> = {
      type: 'fixed_amount',
      display_name: r.label || 'Shipping',
      fixed_amount: { amount: toCents(r.amount || 0), currency },
      tax_behavior: r.taxBehavior || 'exclusive',
    };
    if (taxEnabled) shipping_rate_data.tax_code = r.taxCode || defaultTaxCode;
    return { shipping_rate_data };
  });

  // Free "pick up at the show" is NOT offered on a mixed cart. It used to be
  // pushed whenever ANY line was pickup-eligible, so a single ticket bought
  // alongside merch made shipping free for the whole order — while the
  // confirmation email still promised to post it. A cart that is entirely
  // collectable takes the `allPickup` branch below, which skips shipping
  // altogether; anything else pays a real rate.

  // A pickup-only cart (every line is a ticket / show-pickup bundle) ships
  // nothing — so we skip the shipping address + options entirely. The storefront
  // shows a "details emailed to you" notice and collects just the buyer's name.
  const allPickup =
    items.length > 0 && items.every((i) => PICKUP_ELIGIBLE_PRODUCT_IDS.has(i.productId));

  const origin = new URL(request.url).origin;
  const params: Record<string, unknown> = {
    mode: 'payment',
    // Custom Checkout with Elements — fully styleable on our own page (dark
    // theme). Still a server Checkout Session, so pricing/tax/shipping/promo all
    // apply. Pairs with <CheckoutElementsProvider> on the client.
    ui_mode: 'elements',
    line_items,
    allow_promotion_codes: true,
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { source: 'wtn-web' },
  };
  if (!allPickup) {
    params.shipping_address_collection = { allowed_countries: countries };
    params.shipping_options = shipping_options;
  }
  if (taxEnabled) params.automatic_tax = { enabled: true };

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_VERSION,
    },
    body: new URLSearchParams(formEncode(params)).toString(),
  });
  // Stripe can return a non-JSON body (edge 502/503). Parsing before checking
  // res.ok would throw past every handler and leave no log to debug from.
  const raw = await res.text();
  let session: { client_secret?: string; error?: { message?: string } } = {};
  try {
    session = JSON.parse(raw);
  } catch {
    console.error('[checkout] Stripe returned non-JSON:', res.status, raw.slice(0, 500));
    return json({ error: 'Could not start checkout — please try again.' }, 502);
  }
  if (!res.ok) {
    console.error('[checkout] Stripe error:', res.status, session?.error);
    return json({ error: session?.error?.message || 'Could not start checkout.' }, 502);
  }
  if (!session.client_secret) {
    console.error('[checkout] Stripe returned no client_secret:', raw.slice(0, 500));
    return json({ error: 'Could not start checkout — please try again.' }, 502);
  }
  return json({ clientSecret: session.client_secret });
};
