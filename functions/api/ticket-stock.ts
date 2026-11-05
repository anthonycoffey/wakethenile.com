/**
 * Cloudflare Pages Function — GET /api/ticket-stock?show=<showId>
 *
 * Public, read-only. Remaining online stock for each ticket product of one
 * show, in sale order, so the static /shows page can switch from early bird
 * to the regular price the moment early bird sells out — no rebuild needed.
 * Display only: /api/checkout re-validates price + stock either way.
 * Edge-native. See ADR 0009.
 */
import { SHOWS, TICKET_PRODUCTS, productsForShow } from '../../src/lib/shows';

interface Env {
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
}

const json = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': cache },
  });

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const showId = new URL(request.url).searchParams.get('show') || '';
  const show = SHOWS[showId];
  if (!show) return json({ error: 'Unknown show.' }, 404);
  if (!env.SANITY_PROJECT_ID) return json({ error: 'Not configured.' }, 503);

  const ids = productsForShow(showId);
  const version = env.SANITY_API_VERSION || '2026-03-01';
  const dataset = env.SANITY_DATASET || 'production';
  const res = await fetch(
    `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v${version}/data/query/${dataset}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `*[_type == "product" && !(_id in path("drafts.**")) && _id in $ids]{ _id, title, price, "stock": coalesce(stock, 0) }`,
        params: { ids },
      }),
    },
  ).catch(() => null);
  if (!res?.ok) return json({ error: 'Lookup failed.' }, 502);
  const rows = ((await res.json()) as { result: { _id: string; title: string; price: number; stock: number }[] })
    .result;

  const byId = new Map(rows.map((r) => [r._id, r]));
  const products = ids
    .map((id) => {
      const r = byId.get(id);
      if (!r) return null;
      return {
        id,
        title: r.title,
        price: r.price,
        stock: Math.max(0, r.stock),
        phaseLabel: TICKET_PRODUCTS[id].phaseLabel ?? null,
      };
    })
    .filter(Boolean);

  // A few seconds of edge cache absorbs an ad-driven spike without letting
  // the "N left" count drift meaningfully.
  return json({ show: show.id, onlineSales: show.onlineSales, products }, 200, 'public, max-age=10');
};
