/**
 * Cloudflare Pages Function — POST /api/checkin  { code, pin }
 *
 * Staff-only. Validates the shared door PIN, then stamps `checkedInAt` on the
 * order with that ticketCode. Idempotent via `setIfMissing`, so a second scan
 * can't overwrite the first arrival time — the response flags it so the door
 * UI can warn "already checked in". Edge-native.
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

/** Constant-time string compare so the PIN check doesn't leak length/prefix. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function sanityBase(env: Env, kind: 'query' | 'mutate'): string {
  const version = env.SANITY_API_VERSION || '2026-03-01';
  const dataset = env.SANITY_DATASET || 'production';
  return `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v${version}/data/${kind}/${dataset}`;
}

async function sanityQuery<T>(env: Env, query: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(sanityBase(env, 'query'), {
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

async function sanityMutate(env: Env, mutations: unknown[]): Promise<void> {
  const res = await fetch(`${sanityBase(env, 'mutate')}?returnIds=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` },
    body: JSON.stringify({ mutations }),
  });
  if (!res.ok) throw new Error(`Sanity mutate failed (${res.status}): ${await res.text()}`);
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.STAFF_PIN || !env.SANITY_WRITE_TOKEN || !env.SANITY_PROJECT_ID) {
    return json({ error: 'Check-in is not configured.' }, 503);
  }

  let body: { code?: string; pin?: string };
  try {
    body = (await request.json()) as { code?: string; pin?: string };
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { code, pin } = body;
  if (!pin || !safeEqual(pin, env.STAFF_PIN)) return json({ error: 'Wrong door PIN.' }, 401);
  if (!code) return json({ error: 'Missing ticket code.' }, 400);

  let order: {
    _id?: string;
    customerName?: string | null;
    ticketTier?: string | null;
    admits?: number | null;
    checkedInAt?: string | null;
  } | null;
  try {
    order = await sanityQuery(
      env,
      `*[_type == "order" && ticketCode == $code][0]{ _id, customerName, ticketTier, admits, checkedInAt }`,
      { code },
    );
  } catch {
    return json({ error: 'Lookup failed.' }, 502);
  }
  if (!order?._id) return json({ error: 'Ticket not found.' }, 404);

  const base = {
    name: order.customerName ?? null,
    tier: order.ticketTier === 'vip' ? 'vip' : 'ga',
    admits: order.admits ?? 1,
  };

  // Already arrived — don't overwrite; tell the door it's a repeat scan.
  if (order.checkedInAt) {
    return json({ ok: true, alreadyCheckedIn: true, checkedInAt: order.checkedInAt, ...base });
  }

  const now = new Date().toISOString();
  try {
    await sanityMutate(env, [
      { patch: { id: order._id, setIfMissing: { checkedInAt: now, checkedInBy: 'door' } } },
    ]);
  } catch {
    return json({ error: 'Could not record check-in.' }, 502);
  }
  return json({ ok: true, alreadyCheckedIn: false, checkedInAt: now, ...base });
};
