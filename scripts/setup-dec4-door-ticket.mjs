/**
 * Stripe setup for the Dec 4 door: the card-reader ticket.
 *
 *   Dec 4 — Door GA    $30    (TICKET-DOOR-GA-DEC4)
 *
 * Booth-only, Stripe-only (no Sanity product → unlimited stock, same as the
 * Sep 19 Door GA). The SKU is what grants admission: it must match
 * DOOR_TICKET_SKUS in src/lib/shows.ts, which also says which show it admits to.
 *
 * Also archives the Sep 19 door ticket (TICKET-DOOR-GA, $35) so it can't be
 * rung up by mistake. Archiving is reversible in the Stripe dashboard, and a
 * refund of an old Sep 19 door sale still works — the refund path finds the
 * order, not the product.
 *
 * Run:  node --env-file=.env scripts/setup-dec4-door-ticket.mjs
 * Needs Products Write + Prices Write. Idempotent per step, like
 * add-raffle-products.mjs.
 */
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('Missing STRIPE_SECRET_KEY.');
  process.exit(1);
}

const DOOR = {
  sku: 'TICKET-DOOR-GA-DEC4',
  name: 'Dec 4 — Door GA',
  // Printed by Payment for Stripe on the charge, invoice and receipt.
  nickname: 'Door GA Ticket — Dec 4',
  amount: 3000,
  description:
    "General admission purchased at the door. Wake the Nile with special guests Gators, Maggie Mae's (Upstairs), Austin TX, Fri Dec 4 2026.",
  show: '2026-12-04',
};
const RETIRE_SKU = 'TICKET-DOOR-GA';

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${stripeKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path} failed: ${data?.error?.message || res.status}`);
  return data;
}

async function findBySku(sku) {
  let startingAfter;
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ limit: '100', active: 'true' });
    if (startingAfter) qs.set('starting_after', startingAfter);
    const list = await stripe('GET', `products?${qs.toString()}`);
    const hit = (list.data || []).find((p) => p?.metadata?.sku === sku);
    if (hit) return hit;
    if (!list.has_more || !list.data?.length) return null;
    startingAfter = list.data[list.data.length - 1].id;
  }
  return null;
}

async function main() {
  let product = await findBySku(DOOR.sku);
  if (product?.default_price) {
    const price = await stripe('GET', `prices/${product.default_price}`);
    console.log(`= ${DOOR.name}: already priced at $${(price.unit_amount / 100).toFixed(2)} (${product.id})`);
  } else {
    if (!product) {
      // No metadata.productId on purpose — that absence is the unlimited stock.
      product = await stripe('POST', 'products', {
        name: DOOR.name,
        description: DOOR.description,
        active: 'true',
        'metadata[sku]': DOOR.sku,
        'metadata[channel]': 'booth',
        'metadata[show]': DOOR.show,
      });
    }
    const price = await stripe('POST', 'prices', {
      product: product.id,
      currency: 'usd',
      unit_amount: String(DOOR.amount),
      nickname: DOOR.nickname,
    });
    await stripe('POST', `products/${product.id}`, { default_price: price.id });
    console.log(`+ ${DOOR.name}: $${(DOOR.amount / 100).toFixed(2)} — ${product.id} / ${price.id}`);
  }

  const old = await findBySku(RETIRE_SKU);
  if (old) {
    await stripe('POST', `products/${old.id}`, { active: 'false' });
    console.log(`- archived ${old.name} (${old.id})`);
  } else {
    console.log(`= ${RETIRE_SKU}: already archived`);
  }

  console.log('\nOpen Payment for Stripe on the reader phone and pull to refresh the Products tab.');
}

main().catch((e) => {
  console.error('\nFailed:', e.message);
  process.exit(1);
});
