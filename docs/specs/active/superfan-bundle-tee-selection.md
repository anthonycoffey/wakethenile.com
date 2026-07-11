# Spec: Bundle tee selection (Obuntu vs Champion + size)

- **Status:** Active
- **Date:** 2026-07-10
- **Related:** ADR [0007](../adrs/0007-bundle-line-item-options.md), ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md)

## Problem

Both bundle products include a tee, but the customer can't say which one or what size, and fulfillment has no
record of the choice:

- **Ultimate Fan Experience** — `superfans`, id `b351d11f-4c78-4a1f-b36b-c10d951c96ea`, sold on `/superfans`.
- **Ultimate Fan Merch Bundle** — `merch-bundle`, id `ca04e096-228b-4bee-a28b-46829ed68ecf`, sold on `/merch`.

## Requirements

- On both purchase surfaces, the customer picks a **Tee** (Obuntu Tee / Champion Tee) **and** a **Size**
  (S / M / L / XL / XXL) before adding the bundle to the cart.
- The selection is recorded per order somewhere the client conveniently reads it for fulfillment.
- The selection does not change the bundle's price or stock.

## UX

- **`/merch/merch-bundle`** (`ProductPurchase.tsx`): two selector rows ("Tee", "Size") appear above the quantity
  control. "Add to Cart" is disabled and labeled "Select tee & size" until both are chosen.
- **`/superfans`** (bundle card): the same two selector rows render inline on the card; the "Add to Cart →" CTA is
  disabled until both are chosen, then adds the bundle (with options) and continues to `/checkout`.
- **Cart drawer + cart page**: the chosen options render under the line title (e.g. "Champion Tee · L"). Two
  different selections of the same bundle are separate cart lines.

## Data flow

Cart line `options: {name,value}[]` → `POST /api/checkout` (`items[].options`) → **validated** against the
allow-list in `functions/api/checkout.ts`, appended to the Stripe line `product_data.name` and stored as
`metadata.optionsJson` → `checkout.session.completed` webhook copies them onto `order.lineItems[].options` in
Sanity → visible in the Studio order (line title + "Selected options" field).

Allowed values are defined once in `src/lib/bundleOptions.ts` (frontend) and mirrored in
`functions/api/checkout.ts` (edge). See ADR 0007 for why. Server-side validation is authoritative.

## Acceptance criteria

1. Adding either bundle without choosing tee **and** size is impossible in the UI, and is rejected `409` by
   `/api/checkout` if attempted directly.
2. A completed purchase produces a Sanity `order` whose bundle line shows the tee + size in both the title and the
   `options` field.
3. Non-bundle products are unaffected (no options UI, no validation).

## Out of scope

- Bundle sales do not decrement standalone Obuntu/Champion tee stock.
- The duplicate tee SKUs in Sanity (both tees use `TEE-CHMP-*`) are not addressed here.

> Note: the `/superfans` bundle is now labeled **Ultimate Fan Experience** (title/slug/sku aligned to the CMS
> product), resolving the earlier copy mismatch.
