/**
 * Cloudflare Pages Function — POST /api/set-buyer-name  { sessionId, name }
 *
 * For pickup-only (ticket/bundle) checkouts we don't collect a shipping
 * address, so there's no address "name" field. The storefront collects a plain
 * name and calls this just before confirming payment; we stash it in the
 * Checkout Session metadata so the webhook can record it as the buyer/attendee
 * name. Best-effort — never blocks the payment. Edge-native.
 */
const STRIPE_VERSION = '2026-06-24.dahlia';

interface Env {
  STRIPE_SECRET_KEY?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Not configured.' }, 503);

  let body: { sessionId?: string; name?: string };
  try {
    body = (await request.json()) as { sessionId?: string; name?: string };
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const sessionId = body.sessionId ?? '';
  // Only accept genuine Checkout Session ids; cap + sanitize the name.
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json({ error: 'Bad session id.' }, 400);
  const name = (body.name ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  if (!name) return json({ error: 'Missing name.' }, 400);

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_VERSION,
    },
    body: new URLSearchParams({ 'metadata[buyerName]': name }).toString(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return json({ error: err?.error?.message || 'Could not save name.' }, 502);
  }
  return json({ ok: true });
};
