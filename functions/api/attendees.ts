/**
 * Cloudflare Pages Function — GET /api/attendees   (header: x-staff-pin)
 *
 * Staff-only. Returns every ticket/bundle order (name, email, tier, admits,
 * check-in status) for the /attendees page + CSV export. PIN-gated. Edge-native.
 */
interface Env {
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_WRITE_TOKEN?: string;
  STAFF_PIN?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sanityQuery<T>(env: Env, query: string): Promise<T> {
  const version = env.SANITY_API_VERSION || '2026-03-01';
  const dataset = env.SANITY_DATASET || 'production';
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v${version}/data/query/${dataset}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.SANITY_WRITE_TOKEN ? { authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Sanity query failed (${res.status})`);
  return ((await res.json()) as { result: T }).result;
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.STAFF_PIN || !env.SANITY_PROJECT_ID) return json({ error: 'Not configured.' }, 503);

  const pin =
    request.headers.get('x-staff-pin') || new URL(request.url).searchParams.get('pin') || '';
  if (!pin || !safeEqual(pin, env.STAFF_PIN)) return json({ error: 'Wrong door PIN.' }, 401);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await sanityQuery(
      env,
      `*[_type == "order" && defined(ticketCode)] | order(customerName asc){
        "name": customerName, email, "tier": ticketTier, admits, checkedInAt, ticketCode
      }`,
    );
  } catch {
    return json({ error: 'Lookup failed.' }, 502);
  }
  return json({ attendees: rows ?? [] });
};
