# Spec: /albumrelease presale page with GA / GA+ tiers

- **Status:** Active
- **Date:** 2026-08-26
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md) (presale-on-Stripe-store
  pattern this extends), ADR [0007](../adrs/0007-bundle-line-item-options.md), ADR
  [0008](../adrs/0008-qr-ticketing-door-checkin.md) (tier model this adds a third value to),
  [qr-ticketing.md](./qr-ticketing.md)

## Problem

The band's partner is running an ad campaign for the Sept 19 live show and needs a dedicated landing
page — `/albumrelease` — with its own pricing tiers, separate from the existing `/releaseparty` presale
(which keeps selling its current Live Show Ticket / VIP Fan Experience tiers unchanged, for a different
traffic source).

## Decision

Add a second, independent presale landing page rather than modifying `/releaseparty`, following the same
hand-rolled Stripe + Sanity pattern from ADR 0006: two more ordinary Sanity `product` documents, checked
out ad-hoc (no persistent Stripe Product — same as the existing ticket/bundle, since neither tier needs
coupon targeting yet).

### New products (Sanity, tagged `hidden` so they don't appear in the `/merch` grid)

| Product | `_id` | Price | Stock | Contents |
|---|---|---|---|---|
| GA | `albumrelease-ga` | $30 | 500 | Live show ticket only |
| GA+ | `albumrelease-ga-plus` | $60 | 500 | Live show ticket + free drinks all night (no merch item — no tee/size picker needed) |

Both reuse the existing show poster image asset. GA+'s stock was not specified by the requester; 500
was chosen to match GA as a reasonable starting cap — adjust freely in Sanity Studio, it's just a number
field.

### Page (`src/pages/albumrelease.astro`)

Mirrors `/releaseparty.astro`'s layout, copy tone, and mechanics (same show date/venue), with two cards:

- **GA+** (left, $60) — plain click-to-add card, same as a standalone ticket. No options to pick (no
  merch), so it skips straight to `/checkout` on click — mirroring how the old VIP bundle went straight to
  checkout, but without the tee/size gate since there's no merch line.
- **GA** (right, $30) — plain click-to-add card, routes to `/merch` with the same upsell nudge
  (`wtn_upsell_msg` / `wtn_promo` sessionStorage flags) the current ticket-only flow uses, encouraging a
  merch add-on before checkout.

### Ticket-tier model extended to three values

ADR 0008's door check-in system keys off `order.ticketTier` (`'ga' | 'vip'`) to show a badge and drive a
HubSpot property. This adds a third value, **`'ga-plus'`**, distinct from `'vip'` (which still implies the
merch tee) so door staff can tell a free-drinks buyer from a plain GA buyer. Priority when a single order
somehow mixes tiers (rare — a customer would need to add tickets from both pages to one cart): `vip` >
`ga-plus` > `ga` for the order's tier label; `admits` always sums every ticket-shaped line regardless of
tier.

Every file in ADR 0008's "keep these hard-coded ID lists in sync" set (each runs in a separate Workers
bundle and can't share a module) gets the two new product IDs added, and the `'ga' | 'vip'` binary widens
to include `'ga-plus'`:

- `functions/api/checkout.ts` — `PICKUP_ELIGIBLE_PRODUCT_IDS` (both new IDs get the free "pick up at Merch
  booth" shipping option, same as the existing ticket/bundle)
- `functions/api/checkout-session.ts` — `TICKET_PRODUCT_IDS`
- `functions/api/stripe-webhook.ts` — product-id → tier map (was two consts + a ternary, now a lookup
  table + priority list), `hubspotUpsertAttendee`'s tier type, the confirmation email's ticket copy
- `functions/api/ticket.ts`, `functions/api/checkin.ts` — tier pass-through (was `=== 'vip' ? 'vip' : 'ga'`)
- `src/components/TicketView.tsx` — badge ("GA+ · Free Drinks"), `Tier` type
- `src/components/AttendeeList.tsx` — `tier` type widened (table/CSV already render any string)
- `src/components/CheckoutReturn.tsx` — thank-you copy
- `src/components/CheckoutCustom.tsx` — `PICKUP_PRODUCT_IDS` (both new IDs; `hasPickupMerch` stays scoped
  to the VIP bundle only, since GA+ has no physical merch to pick up)
- `studio/schemaTypes/documents/order.ts` — `ticketTier` options list + description

GA+ is **not** added to any bundle-options allow-list (`src/lib/bundleOptions.ts`,
`BUNDLE_OPTION_ALLOW` in `checkout.ts`) — it has no tee/size to select.

## Consequences

**Easier:**

- `/releaseparty` is completely untouched — zero regression risk to its existing funnel.
- New tiers reuse 100% of the existing checkout/webhook/QR/check-in machinery; no new infra.

**Harder / trade-offs:**

- A fifth and sixth hard-coded product ID now need to stay in sync across the same six files ADR 0008
  already flagged as a maintenance cost. If GA/GA+ are ever recreated with new Sanity `_id`s, all six
  need updating together (this spec's table is the checklist).
- Door staff now see three tiers instead of two; the attendee CSV/list already renders `tier` as a raw
  string, so no export format changed, but anyone reading a "GA" row now needs to check the campaign the
  attendee came from is implied only by the tier value, not the page — `ga` could be either a
  `/releaseparty` Live Show Ticket or an `/albumrelease` GA ticket bought at a different price. That's
  accepted here since door capacity/perks are identical for both.
