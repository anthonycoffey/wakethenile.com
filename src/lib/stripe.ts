import Stripe from 'stripe';

/**
 * Stripe client for the Cloudflare Workers runtime.
 *
 * `httpClient: Stripe.createFetchHttpClient()` is MANDATORY on Workers — the
 * default client uses Node's http/https, which don't exist there. (Webhook
 * verification additionally needs the async `constructEventAsync` +
 * `createSubtleCryptoProvider()`; see the webhook route.)
 */
export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export { Stripe };
