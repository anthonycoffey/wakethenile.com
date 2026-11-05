/**
 * Cloudflare Pages Function — GET /api/attendees   (header: x-staff-pin)
 *
 * Staff-only. Returns every live ticket/bundle order (name, email, tier,
 * admits, check-in status, sales channel) for the /attendees page + CSV
 * export. Refunded orders are excluded. PIN-gated. Edge-native.
 */
import { LEGACY_SHOW_ID, SHOWS, doorShowAt, showStatus } from '../../src/lib/shows';

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
  if (!env.STAFF_PIN || !env.SANITY_PROJECT_ID) return json({ error: 'Not configured.' }, 503);

  // Header only — a PIN in a query string is written to edge logs, browser
  // history and outbound Referer headers.
  // Trim both sides: a stray space pasted into the Cloudflare setting or typed
  // by a phone keyboard shouldn't lock the door out.
  const pin = (request.headers.get('x-staff-pin') || '').trim();
  if (!pin || !safeEqual(pin, env.STAFF_PIN.trim())) return json({ error: 'Wrong door PIN.' }, 401);

  // One show's door list at a time (ADR 0009). ?shows=1 returns just the
  // show picker (every registered show, its door status and headcount);
  // ?show=<id> returns that show's list, defaulting to tonight's door show.
  const params = new URL(request.url).searchParams;
  const describe = (s: (typeof SHOWS)[string]) => ({
    id: s.id,
    label: s.label,
    dateText: s.dateText,
    venue: s.venue,
    // 'open' = the door is admitting this show; 'past' = frozen, view only.
    status: showStatus(s),
  });

  if (params.get('shows') === '1') {
    const ordered = Object.values(SHOWS).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    let counts: Record<string, { tickets: number; admits: number; inRoom: number }> = {};
    try {
      // One round trip: a GROQ object keyed by show id.
      const live = `_type == "order" && !(_id in path("drafts.**")) && defined(ticketCode) && !defined(refundedAt) && fulfillmentStatus != "cancelled"`;
      counts = await sanityQuery(
        env,
        `{${ordered
          .map(
            (s, i) =>
              `"${s.id}": { "tickets": count(*[${live} && coalesce(show, $legacy) == $s${i}]), "admits": math::sum(*[${live} && coalesce(show, $legacy) == $s${i}].admits), "inRoom": math::sum(*[${live} && coalesce(show, $legacy) == $s${i}].admitted) }`,
          )
          .join(',')}}`,
        Object.fromEntries([['legacy', LEGACY_SHOW_ID], ...ordered.map((s, i) => [`s${i}`, s.id])]),
      );
    } catch {
      /* the picker still works without counts */
    }
    return json({
      shows: ordered.map((s) => ({
        ...describe(s),
        tickets: counts[s.id]?.tickets ?? null,
        admits: counts[s.id]?.admits ?? null,
        inRoom: counts[s.id]?.inRoom ?? null,
      })),
      doorShow: doorShowAt().id,
    });
  }

  const requested = params.get('show');
  const show = requested && SHOWS[requested] ? SHOWS[requested] : doorShowAt();

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await sanityQuery(
      env,
      `*[_type == "order" && !(_id in path("drafts.**")) && defined(ticketCode) && !defined(refundedAt) && fulfillmentStatus != "cancelled" && coalesce(show, $legacy) == $show] | order(coalesce(createdAt, _createdAt) desc){
        "name": customerName, email, "tier": ticketTier, admits,
        "admitted": coalesce(admitted, select(defined(checkedInAt) => 1, 0)), checkedInAt, ticketCode,
        "channel": coalesce(channel, "web"),
        "breakdown": ticketBreakdown[]{tier, admits}
      }`,
      { show: show.id, legacy: LEGACY_SHOW_ID },
    );
  } catch {
    return json({ error: 'Lookup failed.' }, 502);
  }
  return json({ attendees: rows ?? [], show: describe(show) });
};
