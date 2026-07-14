/**
 * Cloudflare Pages Function — GET /api/checkout-session?session_id=...
 * Returns the status of a Checkout Session for the return page (display only;
 * fulfillment happens via the Stripe webhook). Also reports whether the order
 * is a ticket purchase and, once the webhook has recorded it, the ticketCode so
 * the thank-you page can show the QR pass. Edge-native raw fetch.
 */
const STRIPE_VERSION = '2026-06-24.dahlia';

// Admit-granting products (mirror functions/api/checkout.ts + stripe-webhook.ts).
const TICKET_PRODUCT_IDS = new Set([
  '2480f00d-9317-4ed0-9406-bcef1e34bc71', // Live Show Ticket
  'b351d11f-4c78-4a1f-b36b-c10d951c96ea', // VIP Fan Experience
]);

interface Env {
  STRIPE_SECRET_KEY?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_WRITE_TOKEN?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function sanityQuery<T>(env: Env, query: string, params: Record<string, unknown>): Promise<T | null> {
  if (!env.SANITY_PROJECT_ID) return null;
  const version = env.SANITY_API_VERSION || '2026-03-01';
  const dataset = env.SANITY_DATASET || 'production';
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v${version}/data/query/${dataset}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.SANITY_WRITE_TOKEN ? { authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` } : {}),
      },
      body: JSON.stringify({ query, params }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { result: T }).result;
  } catch {
    return null;
  }
}

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const sessionId = new URL(request.url).searchParams.get('session_id');

  if (!sessionId) return json({ error: 'Missing session id.' }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not configured.' }, 503);

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price.product`,
    { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION } },
  );
  const session = (await res.json()) as {
    status?: string;
    payment_status?: string;
    customer_details?: { email?: string };
    line_items?: { data?: Array<{ price?: { product?: { metadata?: { productId?: string } } } }> };
    error?: { message?: string };
  };
  if (!res.ok) {
    return json({ error: session?.error?.message || 'Could not retrieve session.' }, 502);
  }

  const hasTicket = (session.line_items?.data ?? []).some((li) =>
    TICKET_PRODUCT_IDS.has(li.price?.product?.metadata?.productId ?? ''),
  );

  // Once the webhook has written the order, surface the ticket code for the QR.
  let ticket: { ticketCode: string; ticketTier: string; admits: number } | null = null;
  if (session.status === 'complete' && hasTicket) {
    const order = await sanityQuery<{ ticketCode?: string; ticketTier?: string; admits?: number }>(
      env,
      `*[_type == "order" && stripeSessionId == $sid][0]{ ticketCode, ticketTier, admits }`,
      { sid: sessionId },
    );
    if (order?.ticketCode) {
      ticket = { ticketCode: order.ticketCode, ticketTier: order.ticketTier ?? 'ga', admits: order.admits ?? 1 };
    }
  }

  return json({
    status: session.status ?? 'open',
    paymentStatus: session.payment_status ?? null,
    email: session.customer_details?.email ?? null,
    hasTicket,
    ticket,
  });
};
