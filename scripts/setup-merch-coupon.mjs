/**
 * Scope the WTN15OFF promo code to merch only (never the Live Show Ticket,
 * VIP Fan Experience, or Ultimate Fan Merch Bundle).
 *
 * Why this needs a script at all: functions/api/checkout.ts builds every line
 * item with an ad-hoc `price_data.product_data` (a brand-new, one-off Stripe
 * Product per checkout session). Stripe's native "restrict a coupon to
 * specific products" feature (`applies_to.products`) can only reference
 * *persistent* Product IDs, which don't exist in this flow. This script:
 *
 *   1. Creates a persistent Stripe Product for every merch SKU (one per
 *      variant, since sizes etc. need their own so order/stock tracking in
 *      stripe-webhook.ts — which reads productId/sku off the line item's
 *      product metadata — still works per-variant), and saves each ID back
 *      onto the Sanity product/variant as `stripeProductId`.
 *   2. Deactivates any existing active WTN15OFF promotion code.
 *   3. Creates a new coupon (15% off) restricted via `applies_to.products` to
 *      just those merch product IDs, and a new WTN15OFF promotion code
 *      bound to it.
 *
 * checkout.ts uses `stripeProductId` when present and falls back to today's
 * ad-hoc behavior otherwise — so it's safe to re-run this after adding a new
 * merch product/variant (only the new one gets created) and nothing breaks
 * for products that haven't been synced yet, they just aren't coupon-eligible
 * until the next run.
 *
 * Run:  node --env-file=.env scripts/setup-merch-coupon.mjs
 * Needs STRIPE_SECRET_KEY (your own — never commit it) + SANITY_WRITE_TOKEN.
 * Idempotent for the Stripe Products (skips ones already synced); always
 * creates a fresh coupon + promotion code (Stripe coupons/promo code expiry
 * can't be edited after creation — this is the same "archive + recreate"
 * pattern already used for WTN15OFF, see docs/specs/active/presale-upsell-modal.md).
 */
import { createClient } from '@sanity/client';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || 'production';
const token = process.env.SANITY_WRITE_TOKEN;
const stripeKey = process.env.STRIPE_SECRET_KEY;

// Never eligible for WTN15OFF — the ticket and both bundles that include one.
const EXCLUDED_PRODUCT_IDS = new Set([
  '2480f00d-9317-4ed0-9406-bcef1e34bc71', // Live Show Ticket
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea', // VIP Fan Experience
  'ca04e096-228b-4bee-a28b-46829ed68ecf', // Ultimate Fan Merch Bundle
]);

const PROMO_CODE = 'WTN15OFF';
const PERCENT_OFF = 15;

if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_WRITE_TOKEN.');
  process.exit(1);
}
if (!stripeKey) {
  console.error('Missing STRIPE_SECRET_KEY.');
  process.exit(1);
}

const sanity = createClient({ projectId, dataset, token, apiVersion: '2026-03-01', useCdn: false });

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      // No Stripe-Version pin here on purpose — this is a one-off admin
      // script, not the live payment path (that's checkout.ts, which does
      // pin it). Letting Stripe use the account's current default version
      // avoids a version-transform quirk on /promotion_codes that rejected
      // the (perfectly standard) `coupon` param under the pinned version.
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path} failed: ${data?.error?.message || res.status}`);
  return data;
}

async function ensureStripeProduct(name, { taxCode, imageUrl, sanityId, sku }) {
  const params = { name, active: 'true' };
  if (taxCode) params.tax_code = taxCode;
  if (imageUrl) params['images[0]'] = imageUrl;
  params['metadata[productId]'] = sanityId;
  if (sku) params['metadata[sku]'] = sku;
  const product = await stripe('POST', 'products', params);
  return product.id;
}

async function main() {
  console.log(`Syncing merch catalog from ${projectId}/${dataset} to Stripe…`);

  const products = await sanity.fetch(
    `*[_type == "product" && !(_id in path("drafts.**")) && !(_id in $excluded)]{
      _id, title, taxCode, "imageUrl": images[0].asset->url,
      stripeProductId,
      variants[]{ _key, label, sku, stripeProductId }
    }`,
    { excluded: [...EXCLUDED_PRODUCT_IDS] },
  );

  const eligibleProductIds = [];

  for (const p of products) {
    if (p.variants?.length) {
      for (const v of p.variants) {
        if (v.stripeProductId) {
          eligibleProductIds.push(v.stripeProductId);
          console.log(`  = ${p.title} — ${v.label}: already synced (${v.stripeProductId})`);
          continue;
        }
        const id = await ensureStripeProduct(`${p.title} — ${v.label}`, {
          taxCode: p.taxCode,
          imageUrl: p.imageUrl,
          sanityId: p._id,
          sku: v.sku,
        });
        eligibleProductIds.push(id);
        await sanity.patch(p._id).set({ [`variants[_key=="${v._key}"].stripeProductId`]: id }).commit();
        console.log(`  + ${p.title} — ${v.label}: created ${id}`);
      }
    } else {
      if (p.stripeProductId) {
        eligibleProductIds.push(p.stripeProductId);
        console.log(`  = ${p.title}: already synced (${p.stripeProductId})`);
        continue;
      }
      const id = await ensureStripeProduct(p.title, {
        taxCode: p.taxCode,
        imageUrl: p.imageUrl,
        sanityId: p._id,
      });
      eligibleProductIds.push(id);
      await sanity.patch(p._id).set({ stripeProductId: id }).commit();
      console.log(`  + ${p.title}: created ${id}`);
    }
  }

  console.log(`\n${eligibleProductIds.length} Stripe Products eligible for ${PROMO_CODE}.`);

  // Deactivate any existing active promotion code with this exact code —
  // Stripe enforces code uniqueness among active codes, and coupon
  // duration/expiry/applies_to can't be edited after creation.
  const existing = await stripe('GET', `promotion_codes?code=${PROMO_CODE}&active=true&limit=10`);
  for (const code of existing.data ?? []) {
    await stripe('POST', `promotion_codes/${code.id}`, { active: 'false' });
    console.log(`Deactivated old promotion code ${code.id}.`);
  }

  const couponParams = {
    percent_off: String(PERCENT_OFF),
    duration: 'once',
    name: `${PROMO_CODE} (merch only)`,
  };
  eligibleProductIds.forEach((id, i) => {
    couponParams[`applies_to[products][${i}]`] = id;
  });
  const coupon = await stripe('POST', 'coupons', couponParams);
  console.log(`Created coupon ${coupon.id}: ${PERCENT_OFF}% off, restricted to ${eligibleProductIds.length} products.`);

  // Current API: a promotion code points at a `promotion` object rather than
  // a flat `coupon` field (older docs/examples still show the flat form).
  const promo = await stripe('POST', 'promotion_codes', {
    'promotion[type]': 'coupon',
    'promotion[coupon]': coupon.id,
    code: PROMO_CODE,
  });
  console.log(`Created promotion code ${promo.id} ("${PROMO_CODE}") → coupon ${coupon.id}.`);

  console.log('\nDone. WTN15OFF now only discounts synced merch line items.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
