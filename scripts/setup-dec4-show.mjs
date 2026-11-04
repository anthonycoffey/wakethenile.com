/**
 * Sanity setup for the Dec 4 show (Wake the Nile with special guests Gators,
 * Maggie Mae's Upstairs). See docs/specs/active/dec4-gators-show-ticketing.md.
 *
 *   node --env-file=.env scripts/setup-dec4-show.mjs           # ticket products only
 *   node --env-file=.env scripts/setup-dec4-show.mjs --show    # + the /shows listing
 *
 * Products are safe to create before the PR merges: they're tagged `hidden`,
 * so nothing in production lists them. The `show` document is NOT — it puts
 * the show on production /shows on the next build — so it only goes in with
 * --show, at merge time.
 *
 * Idempotent: `createIfNotExists`, so a re-run never resets stock or a price
 * someone has since edited in Studio.
 */
import { createClient } from '@sanity/client';

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

const desc = (text) => [
  { _key: 'd1', _type: 'block', style: 'normal', children: [{ _key: 's1', _type: 'span', text }] },
];

// Ids MUST match TICKET_PRODUCTS in src/lib/shows.ts.
const products = [
  {
    _id: 'dec4-ga-early',
    _type: 'product',
    title: 'Dec 4 Show — Early Bird GA',
    slug: { _type: 'slug', current: 'dec4-ga-early' },
    price: 20,
    stock: 75,
    tags: ['hidden'],
    description: desc(
      "Early bird general admission to Wake the Nile with special guests Gators — Friday, December 4 at Maggie Mae's (Upstairs), Austin. Doors 8 PM. 21+.",
    ),
  },
  {
    _id: 'dec4-ga',
    _type: 'product',
    title: 'Dec 4 Show — GA',
    slug: { _type: 'slug', current: 'dec4-ga' },
    price: 30,
    stock: 75,
    tags: ['hidden'],
    description: desc(
      "General admission to Wake the Nile with special guests Gators — Friday, December 4 at Maggie Mae's (Upstairs), Austin. Doors 8 PM. 21+.",
    ),
  },
];

// _id MUST match SHOWS['2026-12-04'].sanityShowId in src/lib/shows.ts.
const show = {
  _id: 'show-2026-12-04',
  _type: 'show',
  title: 'Wake the Nile with Gators',
  date: '2026-12-05T02:00:00.000Z', // 8:00 PM CST, doors
  venueName: "Maggie Mae's (Upstairs)",
  city: 'Austin',
  state: 'TX',
  ticketsUrl: 'https://wakethenile.com/shows#tickets-2026-12-04',
  ticketsLabel: 'Get Tickets',
  location: { _type: 'geopoint', lat: 30.26713, lng: -97.73907 }, // 323 E 6th St
  soldOut: false,
};

const docs = process.argv.includes('--show') ? [...products, show] : products;
const tx = client.transaction();
for (const d of docs) tx.createIfNotExists(d);
await tx.commit();

const live = await client.fetch(`*[_id in $ids]{ _id, title, price, stock, date }`, {
  ids: docs.map((d) => d._id),
});
for (const d of live) console.log(`✓ ${d._id} — ${d.title}${d.price != null ? ` · $${d.price} · stock ${d.stock}` : ` · ${d.date}`}`);
