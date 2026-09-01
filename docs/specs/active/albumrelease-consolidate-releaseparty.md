# Spec: Consolidate ticket sales onto /albumrelease, retire /releaseparty

- **Status:** Active
- **Date:** 2026-09-01
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md) (presale-on-Stripe-store
  pattern, and the precedent of 301-redirecting a retired presale path — `/superfans` → `/releaseparty` in
  `public/_redirects`), [albumrelease-ga-tiers.md](./albumrelease-ga-tiers.md) (added `/albumrelease` with
  GA/GA+ tiers alongside `/releaseparty`), [pause-ticket-sales.md](./pause-ticket-sales.md)

## Problem

`/albumrelease` (GA $30, GA+ $60) and `/releaseparty` (Live Show Ticket $20 "Early Bird", VIP Fan
Experience $100 bundle) have been running as two independent presale funnels for the same Sept 19 show.
The $20 Early Bird ticket is no longer wanted at any price point — every other entry point on the site
(the home page CTA and the published show's "Get Tickets" button, both Sanity-driven `ctaHref` /
`ticketsUrl` fields) already points at `/albumrelease`, so `/releaseparty`'s $20 ticket is the only
remaining path to a sub-$30 GA price. `/releaseparty` also still holds the only sales channel for the VIP
Fan Experience bundle.

## Decision

Consolidate all ticket sales onto `/albumrelease` and retire `/releaseparty`, following the same
redirect-and-delete pattern already used for `/superfans`:

1. **Redirect.** Add `/releaseparty /albumrelease 301` to `public/_redirects` (same mechanism, same file,
   as the existing `/superfans /releaseparty 301` row). This catches every remaining inbound link to
   `/releaseparty` — bookmarks, old social posts, QR codes — without needing to find and edit each one.
2. **Delete the page.** Remove `src/pages/releaseparty.astro` outright (mirroring `src/pages/superfans.astro`
   having been deleted once its path 301'd away). Its markup/CSS pattern (`.superfans__*`) is superseded by
   `/albumrelease`'s (`.albumrelease__*`).
3. **Move the VIP Fan Experience tier to `/albumrelease`.** `/albumrelease` gains a third tier card, using
   the exact same Sanity product (`b351d11f-4c78-4a1f-b36b-c10d951c96ea`, unchanged `_id`) and the same
   tee/size picker mechanics (`bundleOptionGroupsFor`, ADR 0007) that `/releaseparty` used. Because the
   product `_id` doesn't change, none of ADR 0008's hard-coded product-ID lists (checkout, webhook, ticket,
   check-in, `TicketView`, `order` schema) need updating — the `'vip'` tier classification already covers
   this product regardless of which page sold it.
4. **Turn off the $20 ticket.** Set the `Live Show [Early Bird] Ticket` product's (`_id`
   `2480f00d-9317-4ed0-9406-bcef1e34bc71`) `stock` to `0` in Sanity (it was already tagged `hidden`, so it
   never appeared on `/merch`). This is a defensive backstop, not the primary fix — `functions/api/checkout.ts`
   already rejects any cart line with `stock <= 0` regardless of how it got into the cart, so a stale
   `localStorage` cart line referencing this product from before the redirect can't be checked out either.
   The product document itself is left in place (not deleted) in case historical orders reference it.

Card order on `/albumrelease`, left to right: **VIP Fan Experience, GA+, GA** — highest tier first. Top
copy (eyebrow/date/venue/note) is unchanged from the existing page; the subheading gains one clause naming
the VIP perks (free drinks + the Ultimate Fan Merch Bundle) alongside the existing GA/GA+ description.

## Consequences

**Easier:**

- Every entry point on the site now converges on one page and one price ladder ($30 / $60 / $100); no more
  a `$20` alternate route.
- No changes needed to checkout, webhook, ticket, check-in, or Studio schema code — all three tiers already
  existed as classified products before this change, only their storefront page changes.

**Harder / trade-offs:**

- `/releaseparty`'s specific copy ("Early Bird", the two-tier layout) is gone; anyone who screenshotted or
  linked directly to its exact wording will land on `/albumrelease`'s copy instead after the redirect.
- The VIP bundle is still not tagged `hidden` in Sanity, so it (already, unrelated to this change) also
  appears in the `/merch` grid at its own product page — unchanged prior behavior, not introduced by this
  spec.
