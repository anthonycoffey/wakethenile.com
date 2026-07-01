export const prerender = false;

import type { APIRoute } from 'astro';
import type { Stripe } from '../../lib/stripe';
import { getEnv } from '../../lib/env';
import { getStripe } from '../../lib/stripe';
import { getSanityServerClient } from '../../lib/sanityServer';
import { productsForCheckoutQuery, commerceSettingsQuery } from '../../lib/queries';
import { urlForWidth } from '../../lib/sanityImage';
import { toCents } from '../../lib/format';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Defaults used until a commerceSettings document is configured (Phase 4/6).
const DEFAULTS = {
  currency: 'usd',
  countries: ['US'],
  shipping: [{ label: 'Standard Shipping', amount: 5 }],
  defaultTaxCode: 'txcd_99999999',
};

interface IncomingItem {
  productId: string;
  sku?: string;
  qty: number;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);

  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Checkout is not configured yet.' }, 503);
  }

  let body: { items?: IncomingItem[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'Your cart is empty.' }, 400);

  const sanity = getSanityServerClient(env);
  if (!sanity) return json({ error: 'Store is unavailable.' }, 503);

  const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [products, settings] = await Promise.all([
    sanity.fetch<any[]>(productsForCheckoutQuery, { ids }),
    sanity.fetch<any>(commerceSettingsQuery).catch(() => null),
  ]);
  const byId = new Map<string, any>((products ?? []).map((p) => [p._id, p]));

  const currency: string = settings?.currency ?? DEFAULTS.currency;
  const taxEnabled: boolean = settings?.enableTax === true;
  const defaultTaxCode: string = settings?.defaultTaxCode ?? DEFAULTS.defaultTaxCode;
  const countries: string[] = settings?.allowedShippingCountries?.length
    ? settings.allowedShippingCountries
    : DEFAULTS.countries;

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || p.active === false || p.soldOut === true) {
      return json({ error: `“${p?.title ?? 'An item'}” is no longer available.` }, 409);
    }
    const variant = (p.variants ?? []).find((v: any) => v.sku === item.sku);
    const unit: number = variant ? (variant.price ?? p.price) : p.price;
    const stock: number = variant ? (variant.stock ?? 0) : Infinity;
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));

    if (!unit || unit <= 0) return json({ error: `“${p.title}” is not purchasable.` }, 409);
    if (stock < qty) {
      const which = variant?.label ? `${p.title} — ${variant.label}` : p.title;
      return json({ error: `Only ${stock} of “${which}” left in stock.` }, 409);
    }

    const imageUrl = p.image ? urlForWidth(p.image, 600) : null;
    line_items.push({
      quantity: qty,
      price_data: {
        currency,
        unit_amount: toCents(unit),
        tax_behavior: 'exclusive',
        product_data: {
          name: variant?.label ? `${p.title} — ${variant.label}` : p.title,
          ...(imageUrl ? { images: [imageUrl] } : {}),
          ...(taxEnabled ? { tax_code: p.taxCode ?? defaultTaxCode } : {}),
          metadata: { productId: p._id, sku: item.sku ?? '' },
        },
      },
    });
  }

  const rates = (settings?.shippingRates?.length ? settings.shippingRates : DEFAULTS.shipping).slice(0, 5);
  const shipping_options: Stripe.Checkout.SessionCreateParams.ShippingOption[] = rates.map(
    (r: any) => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: r.label ?? 'Shipping',
        fixed_amount: { amount: toCents(r.amount ?? 0), currency },
        tax_behavior: r.taxBehavior ?? 'exclusive',
        ...(taxEnabled ? { tax_code: r.taxCode ?? defaultTaxCode } : {}),
      },
    }),
  );

  const origin = new URL(request.url).origin;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    // Stripe SDK v22 renamed the classic "embedded" ui_mode to "embedded_page"
    // (pairs with @stripe/react-stripe-js <EmbeddedCheckout> + return_url).
    ui_mode: 'embedded_page',
    line_items,
    shipping_address_collection: {
      allowed_countries: countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
    },
    shipping_options,
    allow_promotion_codes: true,
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    metadata: { source: 'wtn-web' },
  };
  if (taxEnabled) params.automatic_tax = { enabled: true };

  try {
    const stripe = getStripe(env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create(params);
    return json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('[checkout] Stripe error:', err);
    const message = err instanceof Error ? err.message : 'Could not start checkout.';
    return json({ error: message }, 502);
  }
};
