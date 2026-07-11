/**
 * Cloudflare Pages Function — GET /api/ticket?c=<ticketCode>
 *
 * Public, read-only lookup of a ticket's display info for the /ticket page and
 * the thank-you screen. Returns only safe fields (name, tier, admits, check-in
 * status). The unguessable `ticketCode` is the bearer credential; the
 * state-changing check-in lives in /api/checkin (PIN-gated). Edge-native.
 */
interface Env {
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_WRITE_TOKEN?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function sanityQuery<T>(env: Env, query: string, params: Record<string, unknown>): Promise<T> {
  const version = env.SANITY_API_VERSION || '2026-03-01';
  const dataset = env.SANITY_DATASET || 'production';
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v${version}/data/query/${dataset}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.SANITY_WRITE_TOKEN ? { authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` } : {}),
    },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) throw new Error(`Sanity query failed (${res.status})`);
  return ((await res.json()) as { result: T }).result;
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const code = new URL(request.url).searchParams.get('c');
  if (!code) return json({ error: 'Missing ticket code.' }, 400);
  if (!env.SANITY_PROJECT_ID) return json({ error: 'Not configured.' }, 503);

  let order: {
    customerName?: string | null;
    ticketTier?: string | null;
    admits?: number | null;
    checkedInAt?: string | null;
  } | null;
  try {
    order = await sanityQuery(
      env,
      `*[_type == "order" && ticketCode == $code][0]{ customerName, ticketTier, admits, checkedInAt }`,
      { code },
    );
  } catch {
    return json({ error: 'Lookup failed.' }, 502);
  }
  if (!order) return json({ error: 'Ticket not found.' }, 404);

  return json({
    name: order.customerName ?? null,
    tier: order.ticketTier === 'vip' ? 'vip' : 'ga',
    admits: order.admits ?? 1,
    checkedInAt: order.checkedInAt ?? null,
  });
};
