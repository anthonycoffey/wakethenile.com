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
  _id, title, price, taxCode, active, soldOut, "imageUrl": images[0].asset->url,
  variants[]{ label, sku, price, stock }
}`;

const SETTINGS_QUERY = `*[_type == "commerceSettings" && _id == "commerceSettings"][0]{
  currency, allowedShippingCountries, defaultTaxCode, enableTax,
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

  const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  let products: any[];
  let settings: any;
  try {
    [products, settings] = await Promise.all([
      sanityQuery<any[]>(env, PRODUCTS_QUERY, { ids }),
      sanityQuery<any>(env, SETTINGS_QUERY, {}).catch(() => null),
    ]);
  } catch {
    return json({ error: 'Could not load products.' }, 502);
  }
  const byId = new Map<string, any>((products || []).map((p) => [p._id, p]));

  const currency: string = settings?.currency || DEFAULTS.currency;
  const taxEnabled: boolean = settings?.enableTax === true;
  const defaultTaxCode: string = settings?.defaultTaxCode || DEFAULTS.defaultTaxCode;
  const countries: string[] = settings?.allowedShippingCountries?.length
    ? settings.allowedShippingCountries
    : DEFAULTS.countries;

  const line_items: Record<string, unknown>[] = [];
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || p.active === false || p.soldOut === true) {
      return json({ error: `"${p?.title || 'An item'}" is no longer available.` }, 409);
    }
    const variant = (p.variants || []).find((v: any) => v.sku === item.sku);
    const unit: number = variant ? (variant.price ?? p.price) : p.price;
    const stock: number = variant ? (variant.stock ?? 0) : Infinity;
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));

    if (!unit || unit <= 0) return json({ error: `"${p.title}" is not purchasable.` }, 409);
    if (stock < qty) {
      const which = variant?.label ? `${p.title} — ${variant.label}` : p.title;
      return json({ error: `Only ${stock} of "${which}" left in stock.` }, 409);
    }

    const product_data: Record<string, unknown> = {
      name: variant?.label ? `${p.title} — ${variant.label}` : p.title,
      metadata: { productId: p._id, sku: item.sku || '' },
    };
    if (p.imageUrl) product_data.images = [p.imageUrl];
    if (taxEnabled) product_data.tax_code = p.taxCode || defaultTaxCode;

    line_items.push({
      quantity: qty,
      price_data: { currency, unit_amount: toCents(unit), tax_behavior: 'exclusive', product_data },
    });
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

  const origin = new URL(request.url).origin;
  const params: Record<string, unknown> = {
    mode: 'payment',
    ui_mode: 'embedded_page',
    line_items,
    shipping_address_collection: { allowed_countries: countries },
    shipping_options,
    allow_promotion_codes: true,
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { source: 'wtn-web' },
  };
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
  const session = (await res.json()) as { client_secret?: string; error?: { message?: string } };
  if (!res.ok) {
    console.error('[checkout] Stripe error:', session?.error);
    return json({ error: session?.error?.message || 'Could not start checkout.' }, 502);
  }
  return json({ clientSecret: session.client_secret });
};
