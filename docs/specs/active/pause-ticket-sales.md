# Spec: Temporarily pause ticket sales on /superfans

- **Status:** Active
- **Date:** 2026-07-19
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md)

## Problem

The venue and one supporting act for the September 19 show fell through. We need to stop new Live
Show Ticket / VIP Fan Experience purchases immediately while the lineup and venue are re-confirmed,
without tearing out the presale infrastructure built in ADR 0006 (Stripe products, checkout flow,
pricing, pickup fulfillment).

## Behavior

1. **Product-level pause.** Both products (`Live Show Ticket` `2480f00d-9317-4ed0-9406-bcef1e34bc71`,
   `VIP Fan Experience` `b351d11f-4c78-4a1f-b36b-c10d951c96ea`) are tagged `hidden` (drops them from
   the `/merch` grid via the existing `NOT_HIDDEN` clause in
   [`src/lib/queries.ts`](../../../src/lib/queries.ts)) and their `stock` is set to `0`. Stock 0 is
   already authoritative everywhere purchase can happen:
   - [`functions/api/checkout.ts`](../../../functions/api/checkout.ts) rejects any cart line with
     `stock <= 0` with a 409, regardless of how the item was added to the cart.
   - [`ProductPurchase.tsx`](../../../src/components/ProductPurchase.tsx) disables "Add to Cart" and
     shows "Sold Out" if either product's PDP is reached directly.
2. **`/superfans` becomes a holding page.** The two purchase cards, the promo reminder modal, and the
   add-to-cart script are removed outright and replaced with a short "details coming soon" message —
   no pricing or purchase UI renders at all while the show is unconfirmed.
3. **Resuming.** Un-hide + restock both products in Sanity, and restore the purchase-card markup on
   `/superfans` (this PR's diff can be reverted, or the cards re-added once venue/lineup/date copy is
   final).

## Notes / trade-offs

- The `WTN15OFF` presale promo code (see [presale-upsell-modal.md](./presale-upsell-modal.md)) already
  expired 2026-07-17, so dropping the promo-modal code from `/superfans` is not a regression.
- Because this takes the buy UI down entirely (owner's call) rather than just disabling the buttons in
  place, resuming sales needs a page-code change in addition to flipping the two Sanity fields — a
  deliberate trade-off for a clean "nothing is buyable" holding state while venue/lineup are unresolved.
