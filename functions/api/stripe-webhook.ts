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

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_WRITE_TOKEN?: string;
  EMAIL_API_KEY?: string;
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
      return {
        _key: li.id,
        _type: 'object',
        title: li.description ?? li.price?.product?.name ?? 'Item',
        sku: meta.sku || '',
        productId: meta.productId || '',
        qty,
        unitAmount: fromCents(li.price?.unit_amount),
      };
    });

    const ship =
      session.collected_information?.shipping_details ??
      session.shipping_details ??
      session.shipping ??
      null;
    const addr = ship?.address ?? null;

    const orderDoc = {
      _id: orderId,
      _type: 'order',
      fulfillmentStatus: 'unfulfilled',
      email: session.customer_details?.email ?? null,
      customerName: session.customer_details?.name ?? ship?.name ?? null,
      lineItems,
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

    // Confirmation + admin alert (best effort; never blocks the 200).
    const settings = await sanityQuery<any>(env, SETTINGS_QUERY, {}).catch(() => null);
    const from = settings?.fromEmail;
    const admins: string[] = settings?.adminNotificationEmails ?? [];
    const itemsHtml = lineItems
      .map((li: any) => `<li>${li.qty}× ${li.title} — $${(li.unitAmount ?? 0).toFixed(2)}</li>`)
      .join('');
    const total = (orderDoc.amountTotal ?? 0).toFixed(2);
    if (orderDoc.email) {
      await sendEmail(env, from, [orderDoc.email], 'Your Wake the Nile order is confirmed', `
        <h2>Thank you for your order!</h2>
        <ul>${itemsHtml}</ul>
        <p><strong>Total: $${total}</strong></p>
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
