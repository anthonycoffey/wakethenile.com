/**
 * Cloudflare Pages Function — POST /api/checkin  { code, pin }
 *
 * Staff-only. Validates the shared door PIN, then admits people against the
 * order with that ticketCode.
 *
 * A ticket admits N people, and a party does not always arrive together, so
 * this counts rather than flipping a boolean: `admitted` rises by the party
 * size on each scan and the ticket keeps working until it reaches `admits`.
 * `checkedInAt` still records the FIRST arrival. Pass `undo: true` to hand
 * admissions back — the only remedy when staff scan the wrong phone.
 *
 * Writes are pinned with `ifRevisionID` so two lanes scanning the same code
 * at once can't both succeed. Edge-native.
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

  let body: { code?: string; pin?: string; party?: number; undo?: boolean; device?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { code, pin, undo } = body;
  if (!pin || !safeEqual(pin, env.STAFF_PIN)) return json({ error: 'Wrong door PIN.' }, 401);
  if (!code) return json({ error: 'Missing ticket code.' }, 400);
  const party = Math.max(1, Math.min(20, Math.floor(Number(body.party) || 1)));
  // Free-text label from the door device, so a disputed scan can be traced to
  // a lane rather than the useless constant 'door'.
  const by = String(body.device || 'door').slice(0, 40);

  let order: {
    _id?: string;
    customerName?: string | null;
    ticketTier?: string | null;
    admits?: number | null;
    admitted?: number | null;
    checkedInAt?: string | null;
    refundedAt?: string | null;
    fulfillmentStatus?: string | null;
    _rev?: string;
  } | null;
  try {
    order = await sanityQuery(
      env,
      `*[_type == "order" && !(_id in path("drafts.**")) && ticketCode == $code][0]{ _id, _rev, customerName, ticketTier, admits, admitted, checkedInAt, refundedAt, fulfillmentStatus }`,
      { code },
    );
  } catch {
    return json({ error: 'Lookup failed.' }, 502);
  }
  if (!order?._id) return json({ error: 'Ticket not found.' }, 404);
  // Refunded or hand-cancelled tickets are refused, not silently admitted.
  if (order.refundedAt) return json({ error: 'Refunded ticket — do not admit.' }, 410);
  if (order.fulfillmentStatus === 'cancelled') {
    return json({ error: 'Cancelled ticket — do not admit.' }, 410);
  }

  const admits = Math.max(1, order.admits ?? 1);
  // Orders stamped before the counter existed carry `checkedInAt` but no
  // `admitted`; treat those as one person already through.
  const used = Math.max(0, order.admitted ?? (order.checkedInAt ? 1 : 0));
  const base = {
    name: order.customerName ?? null,
    tier: order.ticketTier === 'vip' || order.ticketTier === 'ga-plus' ? order.ticketTier : 'ga',
    admits,
  };

  // Every write below is pinned to this revision. Without it two lanes can
  // both increment, so a missing _rev is a hard stop, not a shrug.
  if (!order._rev) return json({ error: 'Could not read the ticket cleanly — please rescan.' }, 503);

  if (undo) {
    const giveBack = Math.min(party, used);
    if (giveBack === 0) {
      return json({ ok: true, admitted: 0, remaining: admits, ...base, checkedInAt: null });
    }
    const nowUsed = used - giveBack;
    try {
      await sanityMutate(env, [
        {
          patch: {
            id: order._id,
            ifRevisionID: order._rev,
            set: { admitted: nowUsed },
            // Back to nobody through the door: clear the arrival stamp too, so
            // the ticket reads exactly as it did before the mistaken scan.
            ...(nowUsed === 0 ? { unset: ['checkedInAt', 'checkedInBy'] } : {}),
          },
        },
      ]);
    } catch {
      return json({ error: 'Could not undo — reload the ticket and try again.' }, 503);
    }
    return json({
      ok: true, undone: giveBack, admitted: nowUsed, remaining: admits - nowUsed,
      checkedInAt: nowUsed === 0 ? null : order.checkedInAt ?? null, ...base,
    });
  }

  const remaining = admits - used;
  if (remaining <= 0) {
    return json({
      ok: false, admitted: used, remaining: 0, alreadyCheckedIn: true,
      checkedInAt: order.checkedInAt ?? null, ...base,
      error: `All ${admits} already admitted${order.checkedInAt ? ` (first at ${order.checkedInAt})` : ''}.`,
    }, 409);
  }
  if (party > remaining) {
    return json({
      ok: false, admitted: used, remaining, alreadyCheckedIn: used > 0,
      checkedInAt: order.checkedInAt ?? null, ...base,
      error: `Only ${remaining} of ${admits} left on this ticket.`,
    }, 409);
  }

  const now = new Date().toISOString();
  try {
    // Pinned to the revision we read. Two lanes scanning the same code at the
    // same instant would both pass the checks above; without this they would
    // both report success and admit twice.
    await sanityMutate(env, [
      {
        patch: {
          id: order._id,
          ifRevisionID: order._rev,
          // Seed at `used`, not 0 — a ticket stamped under the old boolean
          // scheme has checkedInAt but no `admitted`, and seeding 0 there
          // would silently hand back an admission we already counted.
          setIfMissing: { checkedInAt: now, checkedInBy: by, admitted: used },
          inc: { admitted: party },
        },
      },
    ]);
  } catch {
    // Lost the race, or a write error. Re-read and report what is actually
    // true rather than a second, false success.
    const fresh = await sanityQuery<{ admitted?: number; checkedInAt?: string } | null>(
      env,
      `*[_type == "order" && !(_id in path("drafts.**")) && ticketCode == $code][0]{ admitted, checkedInAt }`,
      { code },
    ).catch(() => null);
    if (fresh?.checkedInAt) {
      const nowUsed = fresh.admitted ?? 1;
      return json({
        ok: false, admitted: nowUsed, remaining: Math.max(0, admits - nowUsed),
        alreadyCheckedIn: true, checkedInAt: fresh.checkedInAt, ...base,
        error: 'Another device just scanned this ticket — check the count.',
      }, 409);
    }
    return json(
      { error: 'No confirmation from the server — RELOAD this ticket before scanning again.' },
      502,
    );
  }

  const nowUsed = used + party;
  return json({
    ok: true, admitted: nowUsed, remaining: admits - nowUsed,
    alreadyCheckedIn: used > 0, checkedInAt: order.checkedInAt ?? now, ...base,
  });
};
