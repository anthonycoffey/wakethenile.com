/**
 * Dec 4 ticket polish (spec: docs/specs/active/dec4-gators-show-ticketing.md).
 * Idempotent, every step skips what's already done:
 *
 *  1. Sanity: upload the show poster and set it as the image on the two web
 *     ticket products (dec4-ga-early, dec4-ga). Checkout passes a product's
 *     first image to Stripe, so new ticket lines carry the poster.
 *  2. Stripe: poster image on the "Dec 4 — Door GA" product (booth reader).
 *  3. Stripe: customer-facing promotion code GROVEMANIA2026 on the existing
 *     100%-off "GROVEMANIA26" coupon (a coupon alone can't be typed in).
 *  4. Backfill every Dec 4 order already sold: payment description
 *     "Dec 04 Maggie Mae's with Gators" and the poster on its Stripe products.
 *
 * Run:  node --env-file=.env scripts/dec4-ticket-polish.mjs [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@sanity/client';

const DRY = process.argv.includes('--dry-run');
const SHOW_ID = '2026-12-04';
const DESCRIPTION = "Dec 04 Maggie Mae's with Gators";
const POSTER_FILE = 'public/images/shows/2026-12-04-poster.jpg';
const TICKET_IDS = ['dec4-ga-early', 'dec4-ga'];
const DOOR_PRODUCT = 'prod_VZ2dz2yBT3ZQn3';
const PROMO = { code: 'GROVEMANIA2026', couponName: 'GROVEMANIA26' };

const { SANITY_PROJECT_ID, SANITY_WRITE_TOKEN, STRIPE_SECRET_KEY } = process.env;
if (!SANITY_PROJECT_ID || !SANITY_WRITE_TOKEN || !STRIPE_SECRET_KEY) {
  console.error('Missing SANITY_PROJECT_ID, SANITY_WRITE_TOKEN or STRIPE_SECRET_KEY.');
  process.exit(1);
}
const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET || 'production',
  token: SANITY_WRITE_TOKEN,
  apiVersion: '2026-03-01',
  useCdn: false,
});

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data?.error?.message}`);
  return data;
}
const write = async (label, fn) => {
  console.log(`${DRY ? '[dry-run] would' : '→'} ${label}`);
  if (!DRY) return fn();
};

// 1. Poster on the Sanity ticket products ------------------------------------
const products = await sanity.fetch(
  `*[_id in $ids]{_id, title, "img": images[0].asset->url}`,
  { ids: TICKET_IDS },
);
let posterUrl = products.find((p) => p.img)?.img;
let posterAssetId = null;
if (products.some((p) => !p.img)) {
  if (!DRY) {
    const asset = await sanity.assets.upload('image', readFileSync(POSTER_FILE), {
      filename: '2026-12-04-poster.jpg',
      title: "Wake the Nile + Gators — Dec 4, Maggie Mae's",
    });
    posterAssetId = asset._id;
    posterUrl = asset.url;
  }
  for (const p of products.filter((p) => !p.img)) {
    await write(`set poster image on Sanity product ${p._id} (${p.title})`, () =>
      sanity
        .patch(p._id)
        .set({
          images: [
            { _type: 'image', _key: 'poster', asset: { _type: 'reference', _ref: posterAssetId } },
          ],
        })
        .commit(),
    );
  }
} else {
  console.log('✓ Sanity ticket products already have an image');
}
// Stripe wants a plain URL; ask Sanity's CDN for a 900px JPEG of the poster.
const stripeImage = posterUrl ? `${posterUrl}?w=900&fm=jpg` : null;
console.log(`  poster: ${stripeImage ?? '(uploaded on a real run)'}`);

// 2. Poster on the door product ---------------------------------------------
const door = await stripe('GET', `products/${DOOR_PRODUCT}`);
if (door.images?.length) console.log('✓ Door product already has an image');
else if (stripeImage)
  await write(`set poster image on Stripe door product ${door.name}`, () =>
    stripe('POST', `products/${DOOR_PRODUCT}`, { 'images[0]': stripeImage }),
  );

// 3. Promotion code ----------------------------------------------------------
const existing = await stripe('GET', `promotion_codes?code=${PROMO.code}&limit=1`);
if (existing.data.length) {
  console.log(`✓ Promotion code ${PROMO.code} exists (active: ${existing.data[0].active})`);
} else {
  const coupons = await stripe('GET', 'coupons?limit=100');
  const coupon = coupons.data.find((c) => c.name === PROMO.couponName && c.valid);
  if (!coupon) throw new Error(`No valid coupon named ${PROMO.couponName}`);
  await write(`create promotion code ${PROMO.code} on coupon ${coupon.id} (${coupon.percent_off}% off)`, () =>
    stripe('POST', 'promotion_codes', {
      code: PROMO.code,
      'promotion[type]': 'coupon',
      'promotion[coupon]': coupon.id,
      'metadata[purpose]': 'Dec 4 comp tickets',
    }),
  );
}

// 4. Backfill orders already sold -------------------------------------------
const orders = await sanity.fetch(
  `*[_type == "order" && show == $show && defined(stripePaymentIntentId)]{_id, stripePaymentIntentId, customerName}`,
  { show: SHOW_ID },
);
console.log(`\n${orders.length} Dec 4 order(s) with a payment to backfill`);
const touchedProducts = new Set();
for (const o of orders) {
  let pi;
  try {
    pi = await stripe('GET', `payment_intents/${o.stripePaymentIntentId}`);
  } catch (err) {
    if (!/Permission denied/.test(String(err))) throw err;
    console.log(
      '✗ Backfill skipped: this Stripe key needs "Payment Intents: Write" and "Checkout Sessions: Read".\n' +
        '  Add them to the restricted key in Stripe → Developers → API keys, then re-run this script.',
    );
    break;
  }
  if (pi.description === DESCRIPTION) console.log(`✓ ${o._id} description already set`);
  else
    await write(`describe ${pi.id} (${o.customerName ?? 'no name'}, was "${pi.description ?? '—'}")`, () =>
      stripe('POST', `payment_intents/${pi.id}`, { description: DESCRIPTION }),
    );
  if (!stripeImage) continue;
  const sessions = await stripe(
    'GET',
    `checkout/sessions?payment_intent=${pi.id}&limit=1&expand[]=data.line_items.data.price.product`,
  );
  for (const li of sessions.data[0]?.line_items?.data ?? []) {
    const prod = li.price?.product;
    const productId = prod?.metadata?.productId;
    if (!prod?.id || touchedProducts.has(prod.id) || !TICKET_IDS.includes(productId)) continue;
    touchedProducts.add(prod.id);
    if (prod.images?.length) continue;
    await write(`set poster on Stripe product ${prod.id} (${prod.name})`, () =>
      stripe('POST', `products/${prod.id}`, { 'images[0]': stripeImage }),
    );
  }
}
console.log('\nDone.');
