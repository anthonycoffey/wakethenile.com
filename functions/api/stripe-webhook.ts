/**
 * Cloudflare Pages Function — POST /api/stripe-webhook
 *
 * Fulfillment + reversal for every sales channel. Verifies the Stripe
 * signature with Web Crypto (no SDK), then routes three event types:
 *
 *   checkout.session.completed → web store order  (channel: 'web')
 *   charge.succeeded (card_present) → merch-booth order (channel: 'booth')
 *   charge.refunded (FULL refunds only) → mark the order refunded + restock
 *
 * Booth sales never produce a Checkout Session — the POS app (Payment for
 * Stripe) creates an invoice plus a Terminal PaymentIntent — so without the
 * card_present branch a door ticket would never reach Sanity or /attendees.
 *
 * Idempotent everywhere: orders use a deterministic _id (session id for web,
 * payment intent for booth) and refunds no-op once `refundedAt` is set, so
 * Stripe's retries can't double-count stock in either direction.
 */
import {
  handleBoothCharge,
  handleCheckoutCompleted,
  handleRefund,
  verifyStripeSignature,
  type Env,
} from '../../server/fulfillment';


/* ------------------------------------------------------------------ */

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) {
    return new Response('Webhook not configured', { status: 503 });
  }

  const rawBody = await request.text();
  const ok = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('Invalid signature', { status: 400 });

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  const type: string = event.type;
  const isCardPresent =
    event.data?.object?.payment_method_details?.type === 'card_present';

  // Ack anything we don't act on so Stripe stops retrying.
  const handled =
    type === 'checkout.session.completed' ||
    type === 'checkout.session.async_payment_succeeded' ||
    type === 'charge.refunded' ||
    (type === 'charge.succeeded' && isCardPresent);
  if (!handled) return new Response('ignored', { status: 200 });

  if (!env.SANITY_WRITE_TOKEN || !env.SANITY_PROJECT_ID) {
    console.error('[webhook] missing Sanity write config — cannot record order');
    return new Response('Store not configured', { status: 503 });
  }

  try {
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      return await handleCheckoutCompleted(env, event, request.url);
    }
    if (type === 'charge.refunded') {
      return await handleRefund(env, event);
    }
    return await handleBoothCharge(env, event);
  } catch (err) {
    console.error('[webhook] processing failed:', type, err);
    // 500 → Stripe retries; idempotency guards make that safe.
    return new Response('processing error', { status: 500 });
  }
};
