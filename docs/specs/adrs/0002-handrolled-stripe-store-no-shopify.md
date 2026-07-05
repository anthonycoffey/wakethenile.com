# ADR 0002: Hand-rolled Stripe + Sanity store (no Shopify)

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** @anthonycoffey

> Recorded after the fact — this decision was already made and is documented in issue
> [#7](https://github.com/anthonycoffey/wakethenile.com/issues/7).

## Context

The site needs a merch store. The default options were a hosted platform (Shopify, or a Shopify Buy
Button / Snipcart embed) or building on the existing Astro + Sanity + Cloudflare stack. A hosted
platform means a second admin for the client, product data mirrored across two systems, a standing
monthly fee, and a checkout that's hard to brand pixel-for-pixel.

## Decision

We will build a **hand-rolled store on the existing stack — Stripe for payments, Sanity for the
catalog, no Shopify.** Products, categories, orders, and commerce settings are all Sanity document
types. Prices flow to Stripe **dynamically** via `price_data`; there is **no mirrored Stripe
catalog**. The storefront and checkout are fully custom (Stripe Custom Checkout + Appearance API),
dark/gold brand.

## Consequences

- **Easier:** one system — merch is just another Sanity doc type next to Music/Shows/Videos; no
  second admin, no product syncing. Pay-per-sale (no monthly fee). Fully brandable storefront *and*
  checkout.
- **Harder:** we own the commerce logic — cart, checkout session creation, fulfillment, stock
  decrement, emails — rather than getting it off the shelf. Requires the server-side invariants in
  [development-standards](../../development-standards.md) §3 (never trust the client cart; idempotent
  fulfillment; stock as the single source of truth).
- **Depends on** [ADR 0001](./0001-edge-native-pages-functions.md) for how the server logic runs.
