# ADR 0001: Edge-native Cloudflare Pages Functions (no Astro adapter)

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** @anthonycoffey

> Recorded after the fact — this decision was already made and is documented in the root README and
> issue [#13](https://github.com/anthonycoffey/wakethenile.com/issues/13).

## Context

The store needs server-side logic for checkout session creation and Stripe webhook handling. The
obvious path on an Astro + Cloudflare project is the `@astrojs/cloudflare` adapter (SSR routes), but
its build **repeatedly failed on Cloudflare**. We also wanted to keep the site a plain static build
rather than turning the whole app into an SSR deployment just to get two endpoints.

## Decision

We will implement server logic as **Cloudflare Pages Functions** under `functions/api/*`, written
**edge-native**: **raw `fetch`** to the Stripe REST API and the Sanity HTTP API, and **Web Crypto**
for HMAC signature verification. **No Node SDKs, no `@astrojs/cloudflare` adapter, and no
`nodejs_compat` flag.** The Astro app stays `output: 'static'`.

Entry points: `functions/api/checkout.ts`, `functions/api/stripe-webhook.ts`.

## Consequences

- **Easier:** the site remains a plain static build (fast, cheap, simple); no adapter build
  failures; functions run at the edge with no cold-start Node runtime; no `nodejs_compat` juggling.
- **Harder:** no SDK conveniences — we hand-roll REST calls and signature verification, and must
  track Stripe/Sanity HTTP API shapes ourselves. Contributors must understand Web Crypto for the
  webhook HMAC.
- **Invariant this enables:** the webhook is idempotent via a deterministic `order-<sessionId>` id,
  and `/api/checkout` re-reads price/stock from Sanity server-side (see
  [development-standards](../../development-standards.md) §3).
