# ADR 0006: Live-show ticket presale on the hand-rolled Stripe store

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** Wake the Nile team

## Context

The band's first live show (September 19 @ Maggie Mae's Upstairs) needed a way to sell tickets
online, plus a "superfan" merch bundle tied to that show. The obvious path is a dedicated ticketing
platform (Eventbrite, DICE, etc.), but that means a second checkout, a second set of fees, a second
inventory system, and a fan being handed off to a third-party domain mid-purchase.

We already run a hand-rolled Stripe + Sanity store ([ADR 0002](./0002-handrolled-stripe-store-no-shopify.md))
on a static SSG site ([ADR 0003](./0003-static-ssg-content-only-cms.md)) with edge Functions for
checkout ([ADR 0001](./0001-edge-native-pages-functions.md)). A ticket is, mechanically, just a
product with a price and stock. The forces:

- **One checkout, one fee schedule.** Keep tickets, the bundle, and regular merch in the same cart
  and the same Stripe session.
- **Tickets shouldn't clutter the shop.** A show ticket should be sold from a focused presale
  landing page, not appear as a tile in the general `/merch` grid alongside t-shirts.
- **Tiered / promo pricing.** Early-bird pricing ("first 100 tickets are $25") and promo codes need
  to work through the existing Stripe checkout.
- **No shipping for tickets.** A ticket (and any bundle merch) is collected at the show — there's no
  parcel to ship, so the standard shipping rates shouldn't be the only option.
- **Cross-sell.** A fan buying just a ticket is a warm lead for merch; a bundle buyer wants a
  frictionless path straight to payment.

## Decision

We will sell the show ticket and the "Mega Superfan Bundle" as ordinary Sanity products checked out
through the existing Stripe store, and layer the presale UX on top of that store rather than adopting
a ticketing platform. Concretely:

1. **Dedicated presale landing page** at `/superfans`
   ([`src/pages/superfans.astro`](../../../src/pages/superfans.astro)) with two paths:
   - **Mega Superfan Bundle** — adds to cart and goes straight to `/checkout` (no merch browsing).
   - **Live Show Ticket** — adds to cart and routes to `/merch` with a temporary upsell banner,
     inviting the fan to grab more before checking out. The nudge is passed via a `sessionStorage`
     flag (`wtn_upsell_msg`) that `/merch` reads once and clears.

2. **`hidden` product tag** to keep tickets out of the shop grid. Products tagged `hidden` are still
   fully purchasable (checkout looks them up by ID) but are excluded from the `/merch` grid via a
   `NOT_HIDDEN` clause in [`src/lib/queries.ts`](../../../src/lib/queries.ts). This lets a product be
   "sold only from a dedicated landing page."

3. **Merch-booth pickup shipping option.** When the cart contains a pickup-eligible product (the
   ticket or the bundle), the checkout Function offers a free "Pick up at Merch booth (show day)"
   shipping rate alongside the normal rates. Eligibility is a hard-coded allow-list of Stripe/Sanity
   product IDs in [`functions/api/checkout.ts`](../../../functions/api/checkout.ts)
   (`PICKUP_ELIGIBLE_PRODUCT_IDS`).

4. **Promo codes in checkout.** [`CheckoutCustom`](../../../src/components/CheckoutCustom.tsx) gains a
   promo-code field backed by Stripe's `applyPromotionCode()` / `removePromotionCode()`, with
   apply/remove/error states styled in [`global.css`](../../../src/styles/global.css). (A known
   Stripe live-mode quirk around `applyPromotionCode()` is noted inline; temporary diagnostic logging
   is present pending root-cause.)

5. **Scroll-hide primary nav.** [`SiteHeader`](../../../src/components/SiteHeader.astro) dims the
   inline nav links once the page scrolls away from the top (desktop only; the logo, cart, and mobile
   burger menu are unaffected), and a floating "Go to Checkout" FAB on `/merch` keeps the checkout
   path reachable while browsing — both reducing friction on the presale → merch → checkout flow.

## Consequences

**Easier:**

- One cart, one Stripe checkout, one fee schedule for tickets + bundle + merch. Fans never leave the
  site.
- Tickets and other "landing-page-only" products can exist in the catalog without polluting the shop,
  just by tagging them `hidden`.
- Pickup-at-show fulfillment is a first-class, zero-cost shipping choice for the relevant carts.
- Early-bird tiers and promo codes reuse Stripe's existing pricing/coupon machinery.

**Harder / trade-offs to know about:**

- **Hard-coded product IDs.** The presale page and the pickup allow-list reference specific
  Sanity/Stripe product IDs in code (`BUNDLE_PRODUCT_ID`, `TICKET_PRODUCT_ID`,
  `PICKUP_ELIGIBLE_PRODUCT_IDS`). If those products are ever recreated with new IDs, these constants
  must be updated in lockstep or the page/pickup option silently breaks. This is called out in inline
  comments at each site.
- **Not a real ticketing system.** There are no seat maps, scannable tickets, will-call lists, or
  transfer/refund tooling — fulfillment is "check the order at the merch booth." Fine for a single GA
  show; would need reconsidering for anything larger or reserved-seating.
- **Presale UX is bespoke, not data-driven.** Pricing copy ("first 100 are $25, then $35"), the show
  date/venue, and the two-card layout live in `superfans.astro`, so a second show means editing the
  page (or generalizing it) rather than adding a CMS entry.
- **Temporary promo diagnostic logging** should be removed once the Stripe live-mode "invalid code"
  behavior is root-caused.
- **Client-side cross-sell signaling** (`sessionStorage` flag between `/superfans` and `/merch`) is
  best-effort UX only; it degrades silently if storage is unavailable and carries no purchase state.
