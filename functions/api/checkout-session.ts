/**
 * Cloudflare Pages Function — GET /api/checkout-session?session_id=...
 * Returns the status of a Checkout Session for the return page (display only;
 * fulfillment happens via the Stripe webhook in Phase 4). Edge-native raw fetch.
 */
const STRIPE_VERSION = '2026-06-24.dahlia';

interface Env {
  STRIPE_SECRET_KEY?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const sessionId = new URL(request.url).searchParams.get('session_id');

  if (!sessionId) return json({ error: 'Missing session id.' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not configured.' }, 503);

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': STRIPE_VERSION,
    },
  });
  const session = (await res.json()) as {
    status?: string;
    payment_status?: string;
    customer_details?: { email?: string };
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: session?.error?.message || 'Could not retrieve session.' }, 502);
  }
  return json({
    status: session.status ?? 'open',
    paymentStatus: session.payment_status ?? null,
    email: session.customer_details?.email ?? null,
  });
};
