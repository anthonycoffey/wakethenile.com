/**
 * Black Friday ticket deal for the Dec 4 show — 2 for $30 / 4 for $60.
 * See docs/specs/active/black-friday-ticket-promo.md.
 *
 *   node --env-file=.env scripts/setup-bf-promo.mjs            # create the deal (once)
 *   node --env-file=.env scripts/setup-bf-promo.mjs --close    # after Sunday: return leftovers
 *
 * Create: makes `dec4-bf` ($15/ticket, tagged `hidden`, the show poster) with
 * POOL tickets taken out of the $30 `dec4-ga` pool, in one transaction, so the
 * 150 online cap never moves. Idempotent: if `dec4-bf` already exists nothing
 * is created or moved (stock someone set in Studio is left alone).
 *
 * Close: moves whatever deal stock is left back into `dec4-ga` and zeroes the
 * deal. Revision-pinned, so a sale landing mid-move fails the transaction
 * instead of double-counting — just re-run.
 */
import { createClient } from '@sanity/client';

const POOL = 40;
const DEAL = 'dec4-bf'; // MUST match TICKET_PRODUCTS in src/lib/shows.ts
const GA = 'dec4-ga';

const projectId = process.env.SANITY_PROJECT_ID;
const token = process.env.SANITY_WRITE_TOKEN;
if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_WRITE_TOKEN.');
  process.exit(1);
}
const client = createClient({
  projectId,
  dataset: process.env.SANITY_DATASET || 'production',
  token,
  apiVersion: '2026-03-01',
  useCdn: false,
});

const get = () => client.fetch(`*[_id in [$deal, $ga]]{ _id, _rev, title, price, stock, images }`, { deal: DEAL, ga: GA });
const show = (rows) => rows.forEach((d) => console.log(`  ${d._id} — ${d.title} · $${d.price} · stock ${d.stock}`));

const rows = await get();
const ga = rows.find((d) => d._id === GA);
const deal = rows.find((d) => d._id === DEAL);
if (!ga) {
  console.error(`${GA} not found — run setup-dec4-show.mjs first.`);
  process.exit(1);
}

if (process.argv.includes('--close')) {
  if (!deal) {
    console.log('No deal product — nothing to close.');
    process.exit(0);
  }
  const left = Math.max(0, deal.stock ?? 0);
  if (!left) console.log('Deal stock already 0.');
  else {
    await client
      .transaction()
      .patch(DEAL, (p) => p.ifRevisionId(deal._rev).set({ stock: 0 }))
      .patch(GA, (p) => p.ifRevisionId(ga._rev).inc({ stock: left }))
      .commit();
    console.log(`✓ Moved ${left} unsold deal tickets back to ${GA}.`);
  }
  show(await get());
  process.exit(0);
}

if (deal) {
  console.log(`${DEAL} already exists — nothing created or moved.`);
  show(rows);
  process.exit(0);
}
if ((ga.stock ?? 0) < POOL) {
  console.error(`${GA} has only ${ga.stock} left — can't move ${POOL}. Lower POOL and re-run.`);
  process.exit(1);
}

await client
  .transaction()
  .create({
    _id: DEAL,
    _type: 'product',
    title: 'Dec 4 Show — Black Friday GA',
    slug: { _type: 'slug', current: DEAL },
    price: 15,
    stock: POOL,
    tags: ['hidden'],
    ...(ga.images ? { images: ga.images } : {}),
    description: [
      {
        _key: 'd1',
        _type: 'block',
        style: 'normal',
        children: [
          {
            _key: 's1',
            _type: 'span',
            text: "Black Friday deal — 2 tickets for $30 or 4 for $60. General admission to Wake the Nile with special guests Gators, Friday, December 4 at Maggie Mae's (Upstairs), Austin. Doors 8 PM. 21+.",
          },
        ],
      },
    ],
  })
  .patch(GA, (p) => p.ifRevisionId(ga._rev).dec({ stock: POOL }))
  .commit();
console.log(`✓ Created ${DEAL} with ${POOL} tickets taken from ${GA}.`);
show(await get());
