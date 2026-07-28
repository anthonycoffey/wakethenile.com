# Spec: Scope WTN15OFF to merch only

- **Status:** Active
- **Date:** 2026-07-27
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md), [presale-upsell-modal.md](./presale-upsell-modal.md)

## Problem

`WTN15OFF` previously discounted the whole checkout session — ticket, VIP Fan Experience, and merch
alike (see [presale-upsell-modal.md](./presale-upsell-modal.md)). We now want it to apply to merch
only: never the Live Show Ticket, the VIP Fan Experience (`b351d11f…`), or the Ultimate Fan Merch
Bundle (`ca04e096…`) — the latter excluded even though it has no ticket in it, at the owner's call.

## The constraint

`functions/api/checkout.ts` builds every Checkout Session line item with an ad-hoc
`price_data.product_data` — a brand-new, one-off Stripe Product created per session. Stripe's native
"restrict a coupon to specific products" feature (`Coupon.applies_to.products`) can only reference
*persistent* Product IDs, which this flow never creates. There's no way to scope a coupon to "some
line items in this cart" without giving the eligible items a stable Stripe Product to point at.

## Decision

1. **[`scripts/setup-merch-coupon.mjs`](../../../scripts/setup-merch-coupon.mjs)** (run locally by
   whoever holds the Stripe secret key — never shared in chat/CI) creates one persistent Stripe
   Product per merch **variant** (not per product — sizes etc. need their own, since
   `functions/api/stripe-webhook.ts` reads `productId`/`sku` off the line item's product metadata to
   decrement stock and record the order; a shared per-product Stripe Product would only have static
   metadata and couldn't carry which size was actually purchased). The resulting IDs are saved back
   onto the Sanity product/variant as a new `stripeProductId` field
   ([`studio/schemaTypes/documents/product.ts`](../../../studio/schemaTypes/documents/product.ts)).
2. The script then deactivates any existing active `WTN15OFF` promotion code and creates a fresh
   coupon (15% off, `applies_to.products` = every synced merch product ID) + a new `WTN15OFF`
   promotion code bound to it. Coupons can't have their `applies_to`/duration edited after creation,
   so "cancel and recreate" is the only path — same pattern already used once before for this exact
   code's expiry (see presale-upsell-modal.md).
3. **`checkout.ts`** uses `price_data.product: <stripeProductId>` when a line's product/variant has
   one synced, and falls back to today's ad-hoc `price_data.product_data` otherwise. The ticket and
   both bundles never get a `stripeProductId` (the script explicitly skips them), so they always take
   the ad-hoc path — nothing about their checkout behavior changes.

## Maintenance

**A new merch product or variant (new size, new item) isn't coupon-eligible until the script is
re-run.** It still checks out fine in the meantime (ad-hoc fallback), it just won't get 15% off until
synced. Re-run `node --env-file=.env scripts/setup-merch-coupon.mjs` after adding one. The script is
idempotent — it skips anything that already has a `stripeProductId` and only creates what's new.

Also: `taxCode`/images baked into a synced Stripe Product at creation time don't auto-update if you
change them in Sanity later — re-run the script (or edit the Product directly in Stripe) if that ever
matters in practice.

## Trade-off accepted

This is real ongoing surface area (a synced Stripe catalog to keep current) in exchange for using
Stripe's coupon restriction natively rather than reimplementing discount math ourselves. The
alternative — computing the 15% discount server-side ourselves instead of via a Stripe coupon at all
— would have required reworking how `CheckoutCustom.tsx` applies promo codes (today it calls Stripe's
own `applyPromotionCode()` against an already-created session), a bigger and riskier change to an area
with a documented Stripe live-mode quirk already. Owner confirmed "build it properly" over that.
