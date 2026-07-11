# ADR 0007: Per-line "options" for bundle tee selection (not priced variants)

- **Status:** Accepted  <!-- Proposed | Accepted | Deprecated | Superseded by NNNN -->
- **Date:** 2026-07-10
- **Deciders:** Wake the Nile

## Context

The two bundle products — **Ultimate Fan Experience** (`superfans`, sold on `/superfans`) and **Ultimate Fan
Merch Bundle** (`merch-bundle`, sold on `/merch`) — each include a tee, but the customer had no way to choose
**which** tee (Obuntu vs Champion) or **what size**, and fulfillment had no record of the choice.

The choice has two properties that shape the design:

1. It does **not** affect price or stock — the bundle costs the same whichever tee/size is picked.
2. It is **two orthogonal dimensions** (tee × size).

The existing commerce model has a `variants` array on products, but variants are price/stock overrides selected by
SKU and rendered by `ProductPurchase.tsx` as a single flat "Size" row. Encoding tee × size as variants would mean a
2×5 SKU matrix per bundle, misusing a price/stock construct for a free customization, and reading poorly in the UI.

The cart → `/api/checkout` → Stripe → webhook → Sanity `order` pipeline already exists and already carries a
per-line `sku` and human-readable name end-to-end.

## Decision

We will represent the tee/size choice as a per-cart-line **`options`** array (`{ name, value }[]`) — a non-priced
fulfillment annotation — rather than as Sanity variants.

- The allowed values live in `src/lib/bundleOptions.ts` (frontend, single source) and are **mirrored** in
  `functions/api/checkout.ts` (the Workers bundle can't import app code).
- `/api/checkout` **re-validates** every bundle line against the allow-list, rebuilding the options from trusted
  values (never the raw client strings), and rejects a bundle line with a missing/invalid choice (`409`). It appends
  the chosen values to the Stripe line `product_data.name` and stores them as `metadata.optionsJson`.
- The Stripe webhook copies those options onto the `order.lineItems[].options` it writes to Sanity; the line title
  already carries the values too.
- Cart-line identity becomes `lineKey = sku + options` (see `src/lib/cart.ts`) so two bundles with different
  tee/size are distinct lines.

## Consequences

- **Easier:** the choice is captured in one place per line, shows in the Studio order (line title + a dedicated
  `Selected options` field) with no manual steps, and the pattern generalizes to any future non-priced per-line
  option. Bundle price/stock logic is untouched.
- **Harder / trade-offs:** the allow-list is duplicated in two files that must be kept in sync (documented with
  cross-reference comments, same convention as `PICKUP_ELIGIBLE_PRODUCT_IDS`). Selecting a bundle tee does **not**
  decrement the standalone Obuntu/Champion tee inventory — bundle stock is the only limit; revisit if per-tee
  inventory accounting is needed. Server-side validation is authoritative; the storefront selectors are UX only.
