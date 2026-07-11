/**
 * Cloudflare Pages Function — POST /api/stripe-webhook
 *
 * Fulfillment. Verifies the Stripe signature with Web Crypto (no SDK), then on
 * `checkout.session.completed`: writes an order to Sanity, decrements variant
 * stock, and emails a confirmation. Edge-native (raw fetch + crypto.subtle).
 *
 * Idempotent: the order uses a deterministic _id derived from the session, and
 * we skip if it already exists — so Stripe's retries don't double-count stock.
 */
const STRIPE_VERSION = '2026-06-24.dahlia';

// Admit-granting products for the Sep 19 show. Mirrors the ids in
// functions/api/checkout.ts (PICKUP_ELIGIBLE_PRODUCT_IDS) — keep in sync if
// these products are ever recreated. VIP = the Ultimate Fan Experience bundle.
const TICKET_PRODUCT_ID = '2480f00d-9317-4ed0-9406-bcef1e34bc71'; // Live Show Ticket → GA
const VIP_PRODUCT_ID = 'b351d11f-4c78-4a1f-b36b-c10d951c96ea'; // Ultimate Fan Experience → VIP
// HubSpot contact property that flags a Sep 19 attendee (value "GA"/"VIP").
const HUBSPOT_TICKET_PROPERTY = 'wtn_show_2026_09_19';

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_WRITE_TOKEN?: string;
  EMAIL_API_KEY?: string;
  HUBSPOT_TOKEN?: string;
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

async function verifyStripeSignature(
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

async function sanityMutate(env: Env, mutations: unknown[]): Promise<void> {
  const res = await fetch(`${sanityBase(env, 'mutate')}?returnIds=false`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
    },
    body: JSON.stringify({ mutations }),
  });
  if (!res.ok) throw new Error(`Sanity mutate failed (${res.status}): ${await res.text()}`);
}

async function sendEmail(env: Env, from: string, to: string[], subject: string, html: string) {
  if (!env.EMAIL_API_KEY || !from || to.length === 0) return;
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
// property. Best-effort: guarded on HUBSPOT_TOKEN, never throws.
async function hubspotUpsertAttendee(
  env: Env,
  email: string | null,
  name: string | null,
  tier: 'ga' | 'vip',
): Promise<void> {
  if (!env.HUBSPOT_TOKEN || !email) return;
  const [firstname, ...rest] = (name ?? '').trim().split(/\s+/);
  const lastname = rest.join(' ');
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
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
              [HUBSPOT_TICKET_PROPERTY]: tier.toUpperCase(),
            },
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error('[webhook] HubSpot upsert failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[webhook] HubSpot upsert error:', e);
  }
}

const SETTINGS_QUERY = `*[_type == "commerceSettings" && _id == "commerceSettings"][0]{
  fromEmail, adminNotificationEmails
}`;

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

  // Only fulfillment matters here; ack everything else so Stripe stops retrying.
  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 });
  }

  const sessionId: string = event.data?.object?.id;
  if (!sessionId) return new Response('no session', { status: 200 });

  if (!env.SANITY_WRITE_TOKEN || !env.SANITY_PROJECT_ID) {
    console.error('[webhook] missing Sanity write config — cannot record order');
    return new Response('Store not configured', { status: 503 });
  }

  const orderId = `order-${sessionId}`;

  try {
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
      `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price.product`,
    );

    const lineItems = (session.line_items?.data ?? []).map((li: any) => {
      const meta = li.price?.product?.metadata ?? {};
      const qty = li.quantity ?? 1;
      // Bundle tee/size selections travel as JSON in the product metadata.
      let options: { _key: string; _type: 'object'; name: string; value: string }[] | undefined;
      if (meta.optionsJson) {
        try {
          const parsed = JSON.parse(meta.optionsJson);
          if (Array.isArray(parsed)) {
            options = parsed.map((o: any, i: number) => ({
              _key: `opt${i}`,
              _type: 'object',
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
        _type: 'object',
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
    const admits = lineItems
      .filter((li: any) => li.productId === TICKET_PRODUCT_ID || li.productId === VIP_PRODUCT_ID)
      .reduce((n: number, li: any) => n + (li.qty ?? 1), 0);
    const isTicketOrder = admits > 0;
    const ticketTier: 'ga' | 'vip' | undefined = isTicketOrder
      ? lineItems.some((li: any) => li.productId === VIP_PRODUCT_ID)
        ? 'vip'
        : 'ga'
      : undefined;
    const ticketCode = isTicketOrder ? crypto.randomUUID() : undefined;

    const orderDoc = {
      _id: orderId,
      _type: 'order',
      fulfillmentStatus: 'unfulfilled',
      email: session.customer_details?.email ?? null,
      customerName: session.customer_details?.name ?? ship?.name ?? null,
      lineItems,
      ...(isTicketOrder ? { ticketTier, admits, ticketCode } : {}),
      amountSubtotal: fromCents(session.amount_subtotal),
      amountShipping: fromCents(session.total_details?.amount_shipping),
      amountTax: fromCents(session.total_details?.amount_tax),
      amountTotal: fromCents(session.amount_total),
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
      stripeEventId: event.id,
      createdAt: new Date(((session.created ?? Math.floor(Date.now() / 1000)) as number) * 1000).toISOString(),
    };

    // Resolve variant _keys (a _key filter is guaranteed valid in a patch path;
    // an attribute filter is not) so a decrement can never break the write.
    const productIds = [...new Set(lineItems.map((li: any) => li.productId).filter(Boolean))];
    const variantKeyBySku = new Map<string, string>();
    if (productIds.length) {
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
    }

    // Build stock-decrement patches grouped by product. Variant lines target the
    // variant by _key; variant-less lines decrement the product's base `stock`.
    const decByProduct = new Map<string, Record<string, number>>();
    for (const li of lineItems) {
      if (!li.productId) continue;
      const key = variantKeyBySku.get(`${li.productId}::${li.sku}`);
      const dec = decByProduct.get(li.productId) ?? {};
      const path = key ? `variants[_key=="${key}"].stock` : 'stock';
      dec[path] = (dec[path] ?? 0) + li.qty;
      decByProduct.set(li.productId, dec);
    }
    const patches = [...decByProduct.entries()].map(([id, dec]) => ({ patch: { id, dec } }));

    // One transaction: create the order (idempotent) + decrement stock.
    await sanityMutate(env, [{ createIfNotExists: orderDoc }, ...patches]);

    // Push ticket buyers into HubSpot (best effort; never blocks the 200).
    if (isTicketOrder && ticketTier) {
      await hubspotUpsertAttendee(env, orderDoc.email, orderDoc.customerName, ticketTier);
    }

    // Confirmation + admin alert (best effort; never blocks the 200).
    const settings = await sanityQuery<any>(env, SETTINGS_QUERY, {}).catch(() => null);
    const from = settings?.fromEmail;
    const admins: string[] = settings?.adminNotificationEmails ?? [];
    const itemsHtml = lineItems
      .map((li: any) => `<li>${li.qty}× ${li.title} — $${(li.unitAmount ?? 0).toFixed(2)}</li>`)
      .join('');
    const total = (orderDoc.amountTotal ?? 0).toFixed(2);
    // Ticket buyers get a prominent link to their scannable pass.
    const origin = new URL(context.request.url).origin;
    const ticketHtml =
      isTicketOrder && ticketCode
        ? `<div style="margin:20px 0;padding:16px;border:2px solid #caa04a;border-radius:10px">
             <p style="margin:0 0 8px"><strong>🎟️ Your ${ticketTier === 'vip' ? 'VIP' : 'show'} ticket${
               (admits ?? 1) > 1 ? `s (admits ${admits})` : ''
             }</strong></p>
             <p style="margin:0 0 12px">Show this at the door on September 19 — save it or screenshot it:</p>
             <p style="margin:0"><a href="${origin}/ticket?c=${ticketCode}">View your ticket &amp; QR code →</a></p>
           </div>`
        : '';
    if (orderDoc.email) {
      await sendEmail(env, from, [orderDoc.email], 'Your Wake the Nile order is confirmed', `
        <h2>Thank you for your order!</h2>
        <ul>${itemsHtml}</ul>
        <p><strong>Total: $${total}</strong></p>
        ${ticketHtml}
        <p>We’ll email you again when it ships.</p>`);
    }
    if (admins.length) {
      await sendEmail(env, from, admins, `New order — $${total}`, `
        <h2>New order</h2>
        <p>${orderDoc.customerName ?? ''} (${orderDoc.email ?? ''})</p>
        <ul>${itemsHtml}</ul>
        <p><strong>Total: $${total}</strong></p>`);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[webhook] processing failed:', err);
    // 500 → Stripe retries; idempotency guard makes that safe.
    return new Response('processing error', { status: 500 });
  }
};
