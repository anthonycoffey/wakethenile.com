/**
 * Order fulfillment + reversal, shared by two Pages Functions (ADR 0009):
 *
 *   functions/api/stripe-webhook.ts   — Stripe's signed events (all channels)
 *   functions/api/checkout-session.ts — the thank-you page, so a ticket buyer
 *                                       gets their QR the instant they land,
 *                                       not whenever Stripe's event arrives
 *
 * Both may try to fulfil the same Checkout Session at once. That is safe by
 * construction: the order is written with `create` on a deterministic _id,
 * so exactly one caller wins; the loser's transaction (and its stock
 * decrements) is rolled back and it returns before sending any email. One
 * order, one stock move, one confirmation email — whoever gets there first.
 *
 * Lives outside functions/ so Pages doesn't route it; esbuild bundles it into
 * each Function that imports it. Edge-native: raw fetch + Web Crypto only.
 */
import {
  DOOR_TICKET_SKUS,
  LEGACY_SHOW_ID,
  TIER_PRIORITY,
  showInfo,
  ticketProduct,
  type TicketTier,
} from '../src/lib/shows';
import { qrEmailTable } from '../src/lib/qr';

const STRIPE_VERSION = '2026-06-24.dahlia';

// Which products and booth SKUs admit to which show, and the per-show copy,
// HubSpot property and sales state, all come from the show registry —
// src/lib/shows.ts, ADR 0009.
const LEGACY = LEGACY_SHOW_ID;

export interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_WRITE_TOKEN?: string;
  EMAIL_API_KEY?: string;
  HUBSPOT_TOKEN?: string;
}

interface OrderLine {
  _key: string;
  _type: 'object';
  title: string;
  sku: string;
  productId: string;
  qty: number;
  unitAmount?: number;
  options?: { _key: string; _type: 'object'; name: string; value: string }[];
}

const enc = new TextEncoder();
const fromCents = (c: unknown): number | undefined =>
  typeof c === 'number' ? Math.round(c) / 100 : undefined;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = sigHeader.split(',').map((p) => p.split('='));
  const t = parts.find((p) => p[0] === 't')?.[1];
  const v1s = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || v1s.length === 0) return false;
  // 5-minute tolerance against replay.
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = toHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`)));
  return v1s.some((v1) => timingSafeEqual(sig, v1));
}

async function stripeGet(env: Env, path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION },
  });
  if (!res.ok) throw new Error(`Stripe GET ${path} failed (${res.status})`);
  return res.json();
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

class SanityMutateError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Sanity mutate failed (${status}): ${body}`);
  }
  /** A losing race: the doc we tried to `create` already exists, or the
   *  `ifRevisionID` we pinned has moved on. Safe to ack — someone else did it. */
  get isConflict(): boolean {
    return this.status === 409 || /already exists|revision/i.test(this.body);
  }
}

async function sanityMutate(env: Env, mutations: unknown[]): Promise<void> {
  const res = await fetch(`${sanityBase(env, 'mutate')}?returnIds=false`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
    },
    body: JSON.stringify({ mutations }),
  });
  if (!res.ok) throw new SanityMutateError(res.status, await res.text());
}

/**
 * Run a transaction whose first mutation is a `create` used as a lock. A
 * concurrent duplicate loses the race, the whole transaction rolls back
 * (stock included), and we ack so Stripe stops retrying.
 */
async function mutateOnce(env: Env, mutations: unknown[], ackMessage: string): Promise<Response | null> {
  try {
    await sanityMutate(env, mutations);
    return null;
  } catch (e) {
    if (e instanceof SanityMutateError && e.isConflict) {
      return new Response(ackMessage, { status: 200 });
    }
    throw e;
  }
}

async function sendEmail(env: Env, from: string, to: string[], subject: string, html: string) {
  // A blank commerceSettings.fromEmail silently kills every store email. Make
  // that visible in the logs rather than letting it look like Resend's fault.
  if (!from) {
    console.error('[webhook] no commerceSettings.fromEmail — skipped email:', subject);
    return;
  }
  if (!env.EMAIL_API_KEY || to.length === 0) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch (e) {
    console.error('[webhook] email send failed:', e);
  }
}

// Upsert a HubSpot contact for a ticket buyer, tagging tier on a custom
// property. Best-effort: guarded on HUBSPOT_TOKEN, never throws. Passing an
// empty tier clears the flag, which is how a refund un-invites someone.
async function hubspotSetAttendeeTier(
  env: Env,
  email: string | null,
  name: string | null,
  tier: TicketTier | '',
  showId: string | null | undefined,
): Promise<void> {
  if (!env.HUBSPOT_TOKEN || !email) return;
  const [firstname, ...rest] = (name ?? '').trim().split(/\s+/);
  const lastname = rest.join(' ');
  const property = showInfo(showId)?.hubspotProperty;
  const upsert = (withShow: boolean) =>
    fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [
          {
            idProperty: 'email',
            id: email,
            properties: {
              email,
              ...(firstname ? { firstname } : {}),
              ...(lastname ? { lastname } : {}),
              ...(withShow && property ? { [property]: tier ? tier.toUpperCase() : '' } : {}),
            },
          },
        ],
      }),
    });
  try {
    let res = await upsert(true);
    // A show property nobody has created in HubSpot yet rejects the WHOLE
    // upsert. Land the contact anyway; the flag can be backfilled later.
    if (res.status === 400 && property) {
      console.error(`[webhook] HubSpot rejected property ${property} — retrying without it:`, await res.text());
      res = await upsert(false);
    }
    if (!res.ok) {
      console.error('[webhook] HubSpot upsert failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[webhook] HubSpot upsert error:', e);
  }
}

const SETTINGS_QUERY = `*[_type == "commerceSettings" && _id == "commerceSettings"][0]{
  fromEmail, adminNotificationEmails, alertOnNewOrder, lowStockThreshold
}`;

/**
 * Email the shop when a sale takes a size down to the low-stock threshold.
 *
 * Runs after the decrement has committed, so it reports the real remaining
 * count rather than a prediction. Entirely best-effort: it is wrapped by its
 * caller and can never fail a webhook or hold up a 200.
 */
async function warnLowStock(env: Env, lines: OrderLine[], preloaded?: any): Promise<void> {
  const settings = preloaded ?? (await sanityQuery<any>(env, SETTINGS_QUERY, {}).catch(() => null));
  const to: string[] = settings?.adminNotificationEmails ?? [];
  const from: string | undefined = settings?.fromEmail;
  const threshold = Number(settings?.lowStockThreshold ?? 0);
  // No recipients, no sender, or the threshold switched off — nothing to do,
  // and no extra query to run.
  if (!from || to.length === 0 || !Number.isFinite(threshold) || threshold <= 0) return;

  const ids = [...new Set(lines.map((li) => li.productId).filter(Boolean))];
  if (!ids.length) return;

  const rows = await sanityQuery<any[]>(
    env,
    `*[_type == "product" && _id in $ids]{ _id, title, stock, variants[]{ sku, label, stock } }`,
    { ids },
  );

  const low: string[] = [];
  for (const li of lines) {
    const p = (rows ?? []).find((r) => r._id === li.productId);
    if (!p) continue;
    const variant = (p.variants ?? []).find((v: any) => v.sku && v.sku === li.sku);
    const raw = variant ? variant.stock : p.stock;
    // An unset stock field means "not tracked", not "none left" — reporting it
    // as SOLD OUT would fire a false alarm on every single sale.
    if (typeof raw !== 'number') continue;
    const left = raw;
    if (left > threshold) continue;
    const name = variant?.label ? `${p.title} — ${variant.label}` : p.title;
    const entry = `<li><strong>${name}</strong> — ${left} left${left <= 0 ? ' (SOLD OUT)' : ''}</li>`;
    if (!low.includes(entry)) low.push(entry);
  }
  if (!low.length) return;

  await sendEmail(
    env,
    from,
    to,
    `Low stock — ${low.length} item${low.length > 1 ? 's' : ''} running out`,
    `<h2>Running low</h2>
     <p>After the latest sale, these are at or below your threshold of ${threshold}:</p>
     <ul>${low.join('')}</ul>
     <p>Restock them in Sanity, or mark the size sold out before the next show.</p>`,
  );
}

/**
 * Build Sanity stock patches for a set of order lines.
 *
 * Variant lines target the variant by _key (a _key filter is guaranteed valid
 * in a patch path; an attribute filter is not), variant-less lines move the
 * product's base `stock`. `op` is 'dec' on a sale and 'inc' on a refund, so
 * the two directions can never drift apart.
 */
async function stockPatches(
  env: Env,
  lines: OrderLine[],
  op: 'dec' | 'inc',
): Promise<unknown[]> {
  const productIds = [...new Set(lines.map((li) => li.productId).filter(Boolean))];
  if (!productIds.length) return [];

  const variantKeyBySku = new Map<string, string>();
  const rows = await sanityQuery<any[]>(
    env,
    `*[_type == "product" && _id in $ids]{ _id, variants[]{ _key, sku } }`,
    { ids: productIds },
  );
  for (const p of rows ?? []) {
    for (const v of p.variants ?? []) {
      if (v.sku && v._key) variantKeyBySku.set(`${p._id}::${v.sku}`, v._key);
    }
  }

  // Patch only products that still exist. A patch against a deleted document
  // fails the WHOLE transaction, which would throw away the order record for a
  // sale we already took money for — a missing stock move is far cheaper.
  const live = new Set((rows ?? []).map((p: any) => p._id));

  const byProduct = new Map<string, Record<string, number>>();
  for (const li of lines) {
    if (!li.productId) continue;
    if (!live.has(li.productId)) {
      console.error('[webhook] stock skipped, no such product in Sanity:', li.productId, li.sku);
      continue;
    }
    const key = variantKeyBySku.get(`${li.productId}::${li.sku}`);
    const moves = byProduct.get(li.productId) ?? {};
    const path = key ? `variants[_key=="${key}"].stock` : 'stock';
    moves[path] = (moves[path] ?? 0) + (li.qty ?? 1);
    byProduct.set(li.productId, moves);
  }
  return [...byProduct.entries()].map(([id, moves]) => ({ patch: { id, [op]: moves } }));
}

/**
 * After stock has been decremented, check whether any touched variant/product
 * went negative.
 *
 * Nothing reserves stock between the read in `/api/checkout` (before payment)
 * and the decrement here (after payment) — two buyers checking out for the
 * last unit at nearly the same moment can both pay before either decrement
 * lands, and each individual `dec` is atomic but unconditional, so the count
 * simply goes negative. That gap can't be closed without holding inventory
 * during checkout (a separate, larger change — see
 * docs/specs/active/pre-show-hardening.md). This makes the resulting oversell
 * loud and immediately actionable instead of a silently-drifting number
 * someone eventually notices during a recount.
 */
async function warnIfOversold(
  env: Env,
  lines: OrderLine[],
  orderId: string,
  preloaded?: any,
): Promise<void> {
  const productIds = [...new Set(lines.map((li) => li.productId).filter(Boolean))];
  if (!productIds.length) return;
  const rows = await sanityQuery<any[]>(
    env,
    `*[_type == "product" && _id in $ids]{ _id, title, stock, variants[]{ sku, label, stock } }`,
    { ids: productIds },
  ).catch(() => null);
  if (!rows) return;

  const oversold: string[] = [];
  for (const li of lines) {
    const p = rows.find((r) => r._id === li.productId);
    if (!p) continue;
    const variant = (p.variants ?? []).find((v: any) => v.sku && v.sku === li.sku);
    const stock = variant ? variant.stock : p.stock;
    if (typeof stock === 'number' && stock < 0) {
      const name = variant?.label ? `${p.title} — ${variant.label}` : p.title;
      const entry = `${name} (${stock})`;
      if (!oversold.includes(entry)) oversold.push(entry);
    }
  }
  if (!oversold.length) return;

  console.error(`[webhook] OVERSOLD on order ${orderId}:`, oversold.join(', '));
  const settings = preloaded ?? (await sanityQuery<any>(env, SETTINGS_QUERY, {}).catch(() => null));
  const to: string[] = settings?.adminNotificationEmails ?? [];
  const from: string | undefined = settings?.fromEmail;
  // The console.error above already fires unconditionally; the email is
  // best-effort on top of it.
  if (!from || to.length === 0) return;
  // Urgent, not the opt-in per-order alert — never silenced by that toggle.
  await sendEmail(
    env,
    from,
    to,
    `⚠️ OVERSOLD — order ${orderId}`,
    `<h2>This order sold past available stock</h2>
     <p>Order <strong>${orderId}</strong> pushed stock negative for:</p>
     <ul>${oversold.map((o) => `<li>${o}</li>`).join('')}</ul>
     <p>Two buyers likely checked out for the last unit at nearly the same moment. Reconcile
        inventory by hand and decide whether a buyer needs to be contacted.</p>`,
  ).catch((e) => console.error('[webhook] oversold alert email failed:', e));
}

/**
 * Headline tier + admit count for a set of lines.
 *
 * `channel` matters: door-ticket SKUs are only honoured on the booth path.
 * A web cart's sku originates from the client, so trusting it here would let
 * anyone mint admission by naming a product's sku "TICKET-DOOR-GA".
 */
function ticketSummary(
  lines: OrderLine[],
  channel: 'web' | 'booth',
): {
  admits: number;
  tier?: TicketTier;
  show?: string;
  breakdown: { tier: TicketTier; admits: number }[];
} {
  const ticketOf = (li: OrderLine): { show: string; tier: TicketTier } | undefined =>
    ticketProduct(li.productId) ??
    (channel === 'booth' ? DOOR_TICKET_SKUS[(li.sku || '').trim().toUpperCase()] : undefined);
  const admitsByTier = new Map<TicketTier, number>();
  const shows = new Set<string>();
  for (const li of lines) {
    const t = ticketOf(li);
    if (!t) continue;
    shows.add(t.show);
    admitsByTier.set(t.tier, (admitsByTier.get(t.tier) ?? 0) + (li.qty ?? 1));
  }
  const admits = [...admitsByTier.values()].reduce((n, c) => n + c, 0);
  if (!admits) return { admits: 0, breakdown: [] };
  // Checkout refuses mixed-show carts, and a booth cart can only ring up door
  // tickets for one night. If one slips through anyway, the order admits to
  // the first show only — log it so someone can split it by hand.
  if (shows.size > 1) console.error('[webhook] ticket order spans shows:', [...shows].join(', '));
  const breakdown = TIER_PRIORITY.filter((t) => admitsByTier.has(t)).map((t) => ({
    tier: t,
    admits: admitsByTier.get(t)!,
  }));
  return { admits, tier: breakdown[0]?.tier, show: [...shows][0], breakdown };
}

/* ------------------------------------------------------------------ *
 * Web store: checkout.session.completed
 * ------------------------------------------------------------------ */

export async function handleCheckoutCompleted(
  env: Env,
  event: any,
  requestUrl: string,
): Promise<Response> {
  const sessionId: string = event.data?.object?.id;
  if (!sessionId) return new Response('no session', { status: 200 });
  return fulfillCheckoutSession(env, sessionId, new URL(requestUrl).origin, event.id ?? null);
}

/**
 * Record a paid Checkout Session as an order (+ ticket, stock, emails).
 * Called by the webhook AND by the thank-you page's status lookup — see the
 * module header for why two callers racing is safe. `eventId` is null when
 * the thank-you page got there first.
 */
export async function fulfillCheckoutSession(
  env: Env,
  sessionId: string,
  origin: string,
  eventId: string | null,
): Promise<Response> {
  const orderId = `order-${sessionId}`;

  // Idempotency: skip if we already recorded this order.
  const existing = await sanityQuery<string | null>(
    env,
    `*[_type == "order" && _id == $id][0]._id`,
    { id: orderId },
  );
  if (existing) return new Response('already processed', { status: 200 });

  // Authoritative session data + line items (product metadata carries our ids).
  const session = await stripeGet(
    env,
    `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price.product` +
      `&expand[]=discounts.promotion_code`,
  );

  // Delayed-notification methods (ACH, Klarna, some wallets) complete the
  // session before the money settles. Wait for async_payment_succeeded rather
  // than minting a ticket against a debit that can still fail.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return new Response('awaiting payment', { status: 200 });
  }

  const lineItems: OrderLine[] = (session.line_items?.data ?? []).map((li: any) => {
    const meta = li.price?.product?.metadata ?? {};
    const qty = li.quantity ?? 1;
    // Bundle tee/size selections travel as JSON in the product metadata.
    let options: OrderLine['options'];
    if (meta.optionsJson) {
      try {
        const parsed = JSON.parse(meta.optionsJson);
        if (Array.isArray(parsed)) {
          options = parsed.map((o: any, i: number) => ({
            _key: `opt${i}`,
            _type: 'object' as const,
            name: String(o?.name ?? ''),
            value: String(o?.value ?? ''),
          }));
        }
      } catch {
        /* ignore malformed metadata */
      }
    }
    return {
      _key: li.id,
      _type: 'object' as const,
      title: li.description ?? li.price?.product?.name ?? 'Item',
      sku: meta.sku || '',
      productId: meta.productId || '',
      qty,
      unitAmount: fromCents(li.price?.unit_amount),
      ...(options ? { options } : {}),
    };
  });

  const ship =
    session.collected_information?.shipping_details ??
    session.shipping_details ??
    session.shipping ??
    null;
  const addr = ship?.address ?? null;

  // Live-show ticketing: if this order includes a ticket/bundle, stamp a QR
  // code + tier + admit count so it becomes a scannable pass at the door.
  const { admits, tier: ticketTier, show, breakdown } = ticketSummary(lineItems, 'web');
  const isTicketOrder = admits > 0;
  const ticketCode = isTicketOrder ? crypto.randomUUID() : undefined;
  // A cart that mixes tiers (one VIP + one GA, say) would otherwise flatten to
  // "VIP × 2" at the door — see docs/specs/active/attendees-mixed-tier-breakdown.md.
  const ticketBreakdown =
    breakdown.length > 1 ? breakdown.map((b, i) => ({ _key: `tier${i}`, _type: 'object' as const, ...b })) : undefined;

  const orderDoc = {
    _id: orderId,
    _type: 'order',
    channel: 'web',
    fulfillmentStatus: 'unfulfilled',
    email: session.customer_details?.email ?? null,
    // For pickup-only orders there's no address name; /api/set-buyer-name
    // stashes it in session metadata instead.
    customerName: session.customer_details?.name ?? session.metadata?.buyerName ?? ship?.name ?? null,
    lineItems,
    ...(isTicketOrder
      ? { show, ticketTier, admits, ticketCode, ...(ticketBreakdown ? { ticketBreakdown } : {}) }
      : {}),
    amountSubtotal: fromCents(session.amount_subtotal),
    amountShipping: fromCents(session.total_details?.amount_shipping),
    amountTax: fromCents(session.total_details?.amount_tax),
    amountTotal: fromCents(session.amount_total),
    // Which campaign actually converted. Without this the discount is only
    // visible as a gap between subtotal and total, indistinguishable from
    // shipping or tax.
    promoCode: session.discounts?.[0]?.promotion_code?.code ?? null,
    amountDiscount: fromCents(session.total_details?.amount_discount),
    currency: session.currency ?? 'usd',
    shippingAddress: addr
      ? {
          name: ship?.name ?? null,
          line1: addr.line1 ?? null,
          line2: addr.line2 ?? null,
          city: addr.city ?? null,
          state: addr.state ?? null,
          postalCode: addr.postal_code ?? null,
          country: addr.country ?? null,
        }
      : undefined,
    stripeSessionId: sessionId,
    // Refunds arrive as charge events that know only the PaymentIntent, so
    // store it now rather than reverse-looking-up the session later.
    stripePaymentIntentId:
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
    stripeEventId: eventId,
    createdAt: new Date(((session.created ?? Math.floor(Date.now() / 1000)) as number) * 1000).toISOString(),
  };

  // One transaction: create the order + decrement stock. `create` (not
  // `createIfNotExists`) is the lock — a concurrent redelivery fails here and
  // rolls its decrements back with it, so stock can never move twice.
  const raced = await mutateOnce(
    env,
    [{ create: orderDoc }, ...(await stockPatches(env, lineItems, 'dec'))],
    'already processed',
  );
  if (raced) return raced;

  // Settings are needed twice (low-stock thresholds, then the emails below).
  // Fetch once.
  const settings = await sanityQuery<any>(env, SETTINGS_QUERY, {}).catch(() => null);

  // Best-effort, never blocks the 200.
  await warnIfOversold(env, lineItems, orderId, settings).catch((e) =>
    console.error('[webhook] oversold check failed:', e),
  );
  await warnLowStock(env, lineItems, settings).catch((e) =>
    console.error('[webhook] low-stock check failed:', e),
  );

  // Push ticket buyers into HubSpot (best effort; never blocks the 200).
  if (isTicketOrder && ticketTier) {
    await hubspotSetAttendeeTier(env, orderDoc.email, orderDoc.customerName, ticketTier, show);
  }

  // Confirmation + admin alert (best effort; never blocks the 200).
  const from = settings?.fromEmail;
  const admins: string[] = settings?.adminNotificationEmails ?? [];
  const itemsHtml = lineItems
    .map((li) => `<li>${li.qty}× ${li.title} — $${(li.unitAmount ?? 0).toFixed(2)}</li>`)
    .join('');
  const total = (orderDoc.amountTotal ?? 0).toFixed(2);
  // Does this order contain anything that actually ships (i.e. real merch,
  // not the ticket or the pickup-at-show bundle)? Drives the closing line.
  const hasShippableMerch = lineItems.some(
    (li) => li.productId && !ticketProduct(li.productId),
  );
  const showDoc = isTicketOrder ? showInfo(show) : undefined;
  const showWhen = showDoc ? `${showDoc.dateText} at ${showDoc.venue}` : '';
  const showDetails = showDoc
    ? [showDoc.timesText, showDoc.age ? `${showDoc.age} — bring your ID` : ''].filter(Boolean).join(' · ')
    : '';
  // Merch-only orders (ticket orders get their own email below).
  const closingHtml = hasShippableMerch ? `<p>We’ll email you again when it ships.</p>` : '';
  // Ticket orders get ONE email, and it IS the ticket: the scannable QR sits
  // in the body (it encodes the same /ticket URL as the ticket page, so the
  // door phone scans either), with a link as a fallback. Nothing ships unless
  // the order also carries real merch.
  const ticketUrl = ticketCode ? `${origin}/ticket?c=${ticketCode}` : '';
  const tierWord = ticketTier === 'vip' ? 'VIP' : ticketTier === 'ga-plus' ? 'GA+ (free drinks!)' : 'GA';
  const showHtml = showDoc
    ? `<p style="margin:0 0 4px;font-size:18px"><strong>${showDoc.billing}</strong>${showDoc.support ? ` ${showDoc.support}` : ''}</p>
       <p style="margin:0 0 4px">${showDoc.dateText} · ${showDoc.venue} · ${showDoc.city}</p>
       ${showDetails ? `<p style="margin:0">${showDetails}</p>` : ''}`
    : '';
  const ticketHtml =
    isTicketOrder && ticketCode
      ? `<div style="margin:20px 0;padding:20px 16px;border:2px solid #caa04a;border-radius:10px;text-align:center">
           ${showHtml}
           <p style="margin:16px 0 12px"><strong>🎟️ ${tierWord} ticket${(admits ?? 1) > 1 ? ` — admits ${admits}` : ''}</strong></p>
           ${qrEmailTable(ticketUrl, { cellSize: 6, margin: 4 })}
           <p style="margin:12px 0 4px"><strong>Show this QR code at the door.</strong></p>
           <p style="margin:0;font-size:13px">Can’t see the code? <a href="${ticketUrl}">Open your ticket →</a></p>
         </div>`
      : '';
  if (orderDoc.email) {
    if (isTicketOrder) {
      await sendEmail(
        env,
        from,
        [orderDoc.email],
        `Your ticket — Wake the Nile, ${showDoc?.dateText ?? 'live'}`,
        `<h2>You’re in! 🎶</h2>
         ${ticketHtml}
         <p style="margin:16px 0 4px"><strong>Your order</strong></p>
         <ul>${itemsHtml}</ul>
         <p><strong>Total: $${total}</strong></p>
         ${hasShippableMerch
           ? `<p>We’ll email you again when your merch ships.</p>`
           : `<p>Nothing ships — this email is your ticket. See you on ${showWhen}!</p>`}`,
      );
    } else {
      await sendEmail(env, from, [orderDoc.email], 'Your Wake the Nile order is confirmed', `
        <h2>Thank you for your order!</h2>
        <ul>${itemsHtml}</ul>
        <p><strong>Total: $${total}</strong></p>
        ${closingHtml}`);
    }
  }
  // Opt-out, not opt-in: the live commerceSettings document predates this
  // field, so `alertOnNewOrder` reads as undefined on it — an opt-in gate
  // (`=== true`) would silently turn off admin notifications for every
  // existing store the moment this field was added, with no migration and no
  // visible signal that anything changed. `!== false` preserves the prior
  // always-on behavior until someone explicitly flips the new Studio toggle.
  if (admins.length && settings?.alertOnNewOrder !== false) {
    await sendEmail(env, from, admins, `New order — $${total}`, `
      <h2>New order</h2>
      <p>${orderDoc.customerName ?? ''} (${orderDoc.email ?? ''})</p>
      <ul>${itemsHtml}</ul>
      <p><strong>Total: $${total}</strong></p>`);
  }

  return new Response('ok', { status: 200 });
}

/* ------------------------------------------------------------------ *
 * Merch booth: charge.succeeded on a card-present charge
 * ------------------------------------------------------------------ */

/**
 * The POS app stamps the cart on the charge as `line_items: "<priceId>:<qty>"`.
 * The separator between entries is undocumented, so accept any of , ; | and
 * fall back to the single-item `product_*` keys when the field is unusable.
 * Each price is expanded to its product, whose metadata carries the Sanity
 * `productId` and `sku` — the same ids the web path relies on.
 */
async function boothLinesFromCharge(env: Env, charge: any): Promise<OrderLine[]> {
  const raw = String(charge.metadata?.line_items ?? '').trim();
  const entries = raw
    ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const lines: OrderLine[] = [];
  for (const [i, entryText] of entries.entries()) {
    const at = entryText.lastIndexOf(':');
    const priceId = (at === -1 ? entryText : entryText.slice(0, at)).trim();
    const qty = Math.max(1, Number(at === -1 ? 1 : entryText.slice(at + 1)) || 1);
    if (!priceId.startsWith('price_')) {
      // A malformed entry inside an otherwise-valid multi-item cart must not
      // be silently dropped — same reasoning as the catch below: that would
      // under-decrement stock forever with the 200 stopping Stripe from
      // retrying. Fail the whole event; the create-lock makes the retry safe.
      throw new Error(`booth cart entry unparseable: "${entryText}" (charge ${charge.id})`);
    }
    try {
      const price = await stripeGet(env, `prices/${encodeURIComponent(priceId)}?expand[]=product`);
      const meta = price.product?.metadata ?? {};
      lines.push({
        _key: `bl${i}`,
        _type: 'object',
        title: price.product?.name ?? price.nickname ?? 'Item',
        sku: meta.sku || '',
        productId: meta.productId || '',
        qty,
        unitAmount: fromCents(price.unit_amount),
      });
    } catch (e) {
      // Dropping a line silently would under-decrement stock forever, and the
      // 200 would stop Stripe retrying. Fail the whole event instead; the
      // create-lock makes the retry safe.
      throw new Error(`booth price lookup failed for ${priceId}: ${e}`);
    }
  }
  if (lines.length) return lines;

  // Fallback: one opaque line so the sale is still recorded and countable.
  // `productId` is deliberately left empty so stockPatches skips it — without
  // a parsed sku we could only guess at the variant, and a decrement against
  // the wrong field is worse than none. The sku is kept for the human.
  console.error('[webhook] booth cart metadata unparseable, recording opaque line:', charge.id);
  return [
    {
      _key: 'bl0',
      _type: 'object',
      title: charge.description || 'Booth sale',
      sku: String(charge.metadata?.product_sku ?? ''),
      productId: '',
      qty: 1,
      unitAmount: fromCents(charge.amount),
    },
  ];
}

export async function handleBoothCharge(env: Env, event: any): Promise<Response> {
  const charge = event.data?.object;
  const paymentIntentId: string | null =
    typeof charge?.payment_intent === 'string' ? charge.payment_intent : null;
  if (!paymentIntentId) return new Response('no payment intent', { status: 200 });

  const orderId = `order-${paymentIntentId}`;
  const existing = await sanityQuery<string | null>(
    env,
    `*[_type == "order" && _id == $id][0]._id`,
    { id: orderId },
  );
  if (existing) return new Response('already processed', { status: 200 });

  const lineItems = await boothLinesFromCharge(env, charge);
  const { admits, tier: ticketTier, show, breakdown } = ticketSummary(lineItems, 'booth');
  const isTicketOrder = admits > 0;
  const ticketBreakdown =
    breakdown.length > 1 ? breakdown.map((b, i) => ({ _key: `tier${i}`, _type: 'object' as const, ...b })) : undefined;
  // A card-present sale that resolves to no ticket and no Sanity product is a
  // sale the door and the stock count will both miss. Make it findable.
  if (!isTicketOrder && !lineItems.some((li) => li.productId)) {
    console.error('[webhook] booth charge matched no ticket and no product:', charge.id, charge.metadata);
  }

  const orderDoc = {
    _id: orderId,
    _type: 'order',
    channel: 'booth',
    fulfillmentStatus: 'fulfilled', // handed over the table at point of sale
    email: charge.billing_details?.email ?? charge.receipt_email ?? null,
    customerName: charge.billing_details?.name ?? null,
    lineItems,
    // Door buyers get a ticketCode too, so /attendees can link them and the
    // door can check them in the same way as an advance buyer. It is not
    // emailed — they are already standing at the door.
    ...(isTicketOrder
      ? { show, ticketTier, admits, ticketCode: crypto.randomUUID(), ...(ticketBreakdown ? { ticketBreakdown } : {}) }
      : {}),
    amountSubtotal: fromCents(charge.amount),
    amountShipping: 0,
    amountTax: 0,
    amountTotal: fromCents(charge.amount),
    currency: charge.currency ?? 'usd',
    stripeChargeId: charge.id,
    stripePaymentIntentId: paymentIntentId,
    stripeEventId: event.id,
    terminalSerial: charge.metadata?.terminal_serial_number ?? null,
    createdAt: new Date(((charge.created ?? Math.floor(Date.now() / 1000)) as number) * 1000).toISOString(),
  };

  const raced = await mutateOnce(
    env,
    [{ create: orderDoc }, ...(await stockPatches(env, lineItems, 'dec'))],
    'already processed',
  );
  if (raced) return raced;

  await warnIfOversold(env, lineItems, orderId).catch((e) =>
    console.error('[webhook] oversold check failed:', e),
  );
  await warnLowStock(env, lineItems).catch((e) => console.error('[webhook] low-stock check failed:', e));

  if (isTicketOrder && ticketTier && orderDoc.email) {
    await hubspotSetAttendeeTier(env, orderDoc.email, orderDoc.customerName, ticketTier, show);
  }
  return new Response('ok', { status: 200 });
}

/* ------------------------------------------------------------------ *
 * Refunds: charge.refunded (full refunds only)
 * ------------------------------------------------------------------ */

/**
 * Locate the order behind a charge. Booth orders and web orders written after
 * this change are keyed or indexed by PaymentIntent; older web orders predate
 * `stripePaymentIntentId`, so fall back to asking Stripe which Checkout
 * Session owns the intent and rebuilding the deterministic id from that.
 */
async function findOrderByPaymentIntent(env: Env, pi: string): Promise<any | null> {
  const direct = await sanityQuery<any>(
    env,
    `*[_type == "order" && !(_id in path("drafts.**")) &&
       (_id == $id || stripePaymentIntentId == $pi)][0]{
       _id, _rev, email, customerName, ticketTier, "show": coalesce(show, $legacy), refundedAt, lineItems
     }`,
    { id: `order-${pi}`, pi, legacy: LEGACY },
  );
  if (direct?._id) return direct;

  try {
    const sessions = await stripeGet(env, `checkout/sessions?payment_intent=${encodeURIComponent(pi)}&limit=1`);
    const sessionId = sessions?.data?.[0]?.id;
    if (!sessionId) return null;
    return await sanityQuery<any>(
      env,
      `*[_type == "order" && !(_id in path("drafts.**")) && _id == $id][0]{
         _id, _rev, email, customerName, ticketTier, "show": coalesce(show, $legacy), refundedAt, lineItems
       }`,
      { id: `order-${sessionId}`, legacy: LEGACY },
    );
  } catch (e) {
    console.error('[webhook] session lookup for refund failed:', e);
    return null;
  }
}

export async function handleRefund(env: Env, event: any): Promise<Response> {
  const charge = event.data?.object;
  const amount = Number(charge?.amount ?? 0);
  const refunded = Number(charge?.amount_refunded ?? 0);

  // Partial refunds are deliberately ignored: Stripe reports an amount but not
  // which line it belongs to, so restocking or voiding a ticket would be a
  // guess. Handle those by hand in the Studio.
  if (!charge?.refunded || refunded < amount || amount === 0) {
    return new Response('partial refund ignored', { status: 200 });
  }

  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!pi) return new Response('no payment intent', { status: 200 });

  const order = await findOrderByPaymentIntent(env, pi);
  if (!order?._id) {
    console.error('[webhook] refund with no matching order, pi:', pi);
    return new Response('no matching order', { status: 200 });
  }
  // Idempotent: a redelivered event must not restock twice.
  if (order.refundedAt) return new Response('already refunded', { status: 200 });

  // Bespoke conflict handling, not the shared `mutateOnce`/`isConflict`: this
  // patch's `ifRevisionID` can lose a race against an *unrelated* write to the
  // same order (a door check-in stamping `admitted`, a Studio edit) just as
  // easily as against a genuine redelivery of this same refund event.
  // `mutateOnce`'s status-based guess can't tell those apart and would ack
  // "already refunded" either way, silently dropping a real refund whenever it
  // guesses wrong. Re-read on conflict and only ack when `refundedAt` is
  // actually set; otherwise retry against the fresh revision.
  const restockPatches = await stockPatches(env, (order.lineItems ?? []) as OrderLine[], 'inc');
  let rev = order._rev;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      await sanityMutate(env, [
        {
          patch: {
            id: order._id,
            ...(rev ? { ifRevisionID: rev } : {}),
            set: {
              refundedAt: new Date().toISOString(),
              refundedAmount: fromCents(refunded),
              fulfillmentStatus: 'refunded',
            },
          },
        },
        ...restockPatches,
      ]);
      break;
    } catch (e) {
      if (!(e instanceof SanityMutateError) || e.status !== 409 || attempt >= MAX_ATTEMPTS) throw e;
      const fresh = await sanityQuery<{ _rev?: string; refundedAt?: string | null } | null>(
        env,
        `*[_type == "order" && _id == $id][0]{ _rev, refundedAt }`,
        { id: order._id },
      ).catch(() => null);
      if (fresh?.refundedAt) return new Response('already refunded', { status: 200 });
      if (!fresh?._rev) throw e;
      rev = fresh._rev;
    }
  }

  // Un-invite the buyer in HubSpot so the CRM matches the door list — unless
  // they still hold another live ticket FOR THE SAME SHOW, in which case
  // restore that tier. Each show has its own HubSpot property.
  if (order.ticketTier && order.email) {
    const stillHolds = await sanityQuery<string | null>(
      env,
      `*[_type == "order" && !(_id in path("drafts.**")) && email == $email &&
         defined(ticketCode) && !defined(refundedAt) && _id != $id &&
         coalesce(show, $legacy) == $show][0].ticketTier`,
      { email: order.email, id: order._id, show: order.show, legacy: LEGACY },
    ).catch(() => null);
    await hubspotSetAttendeeTier(
      env,
      order.email,
      order.customerName ?? null,
      (stillHolds as TicketTier) || '',
      order.show,
    );
  }
  return new Response('ok', { status: 200 });
}
