# Spec: Dec 4 show ticketing — Wake the Nile with special guests Gators

- **Status:** Active
- **Date:** 2026-11-03
- **Related:** ADR [0009](../adrs/0009-per-show-ticketing-shared-registry.md) (per-show registry this
  introduces), ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md), ADR
  [0008](../adrs/0008-qr-ticketing-door-checkin.md), [booth-sales-and-refunds.md](./booth-sales-and-refunds.md)

## The show

| | |
|---|---|
| Billing | **Wake the Nile** with special guests **Gators** |
| Date | Friday, December 4, 2026 |
| Venue | Maggie Mae's (Upstairs), Austin, TX |
| Doors | 8:00 PM · Gators 9:00 PM (WTN set time not published) |
| Age | 21+ |
| Online cap | 150 tickets |

## Tickets

GA only — one tier, one door line.

| Product | Sanity `_id` | Price | Stock | Notes |
|---|---|---|---|---|
| Early Bird GA | `dec4-ga-early` | $20 | 75 | Sold first |
| GA | `dec4-ga` | $30 | 75 | Sold once early bird hits 0 |
| Door GA (booth) | Stripe only, SKU `TICKET-DOOR-GA-DEC4` | $30 | — | Card reader at the door |

Both web products are tagged `hidden` (no `/merch` tile). Early bird + regular = the 150 online cap.
Prices and stock live in Sanity and can be changed in Studio without a deploy.

## Where it's sold: `/shows`

No separate landing page. Any upcoming show in the registry with `onlineSales: true` gets an on-page
ticket panel on its `/shows` row instead of an external "Get Tickets" link:

- "Get Tickets" expands the panel under the row: billing line, doors/age, the live price, quantity
  stepper, "Add to cart".
- The panel calls `GET /api/ticket-stock?show=2026-12-04` on open. While early bird stock > 0 it sells
  `dec4-ga-early` at $20 and shows "Early bird — N left"; after that it sells `dec4-ga` at $30. When
  both are 0 it shows "Sold out online — tickets at the door ($30)". If the call fails it falls back to
  the stock baked in at build time; checkout re-validates either way.
- Adding to cart follows the GA path that worked on Sep 19: nudge to `/merch` (upsell banner +
  `WTN15OFF` merch promo) before checkout.
- `/albumrelease`, `/releaseparty`, `/superfans` already 301 to `/shows`, so old ad links land here.

A Sanity `show` document (`show-2026-12-04`) drives the row itself (title, date, city). Preview and
production share one dataset, so it was created before merge (approved) to make the preview testable;
until merge, production renders the row with a plain "Get Tickets" link back to `/shows`.

The home page "Get Tickets" button is no longer Sanity content: it follows the registry and deep-links
to `/shows#tickets-<id>` while the next show is on sale online ("Dec 4 with Gators — Get Tickets").

## Ticket delivery: instant QR, one email

Found in the first preview test purchase: the thank-you page sat on "Preparing your ticket…" because
the QR only existed once Stripe's webhook landed. That made it hostage to webhook latency and to where
Stripe routes the event (in test mode it doesn't reach branch previews at all).

- **Fulfilment moved to `server/fulfillment.ts`**, shared by the webhook and `/api/checkout-session`.
  When the thank-you page asks about a paid ticket session that has no order yet, it fulfils the order
  itself, so the QR renders on first load. Racing the webhook is safe: the order is written with
  `create` on a deterministic `_id`, so exactly one caller wins; the loser rolls back (stock included)
  and returns before sending email.
- **One confirmation email, and it is the ticket.** Subject "Your ticket — Wake the Nile, December 4".
  The QR is in the body as an HTML table (mail clients strip SVG and block images; a hosted QR image
  would leak the bearer code). It encodes the same `/ticket?c=` URL, so the door phone scans the email
  or the ticket page the same way as Sep 19. Copy says "Nothing ships — this email is your ticket" unless
  the order also has shippable merch. ~35 KB, under Gmail's ~102 KB clipping limit.
- The thank-you page keeps polling for up to a minute (1 s, then 2 s) as a backstop.

## Backend changes (per ADR 0009)

| File | Change |
|---|---|
| `src/lib/shows.ts` (new) | Registry: shows, ticket products, door SKUs, helpers |
| `src/lib/tickets.ts` | Re-exports from the registry; `EARLY_BIRD_SOLD_OUT` derived from Sep 19 |
| `functions/api/checkout.ts` | Per-show sales gate; one-show-per-cart guard; pickup ids from registry |
| `functions/api/checkout-session.ts` | Ticket ids from registry |
| `functions/api/stripe-webhook.ts` | Stamp `show`; per-show email copy + HubSpot property; door SKU → show |
| `functions/api/ticket.ts` | Return the ticket's show (title/date) for the ticket page |
| `functions/api/checkin.ts` | Refuse tickets for any show other than the door show |
| `functions/api/attendees.ts` | `?show=` filter, default the door show; return the show list |
| `functions/api/ticket-stock.ts` (new) | Public remaining-stock-per-tier lookup |
| `src/components/TicketView.tsx` | Show name/date on the pass; "wrong show" refusal state |
| `src/components/AttendeeList.tsx` | Show picker; CSV filename carries the show id |
| `src/components/CheckoutCustom.tsx`, `CheckoutReturn.tsx` | Pickup ids from registry |
| `src/components/ShowCard.astro`, `ShowTickets.astro` (new) | On-page ticket panel |
| `src/pages/merch.astro`, `merch/[slug].astro` | Ticket products never in the grid; product links → `/shows` |
| `src/pages/index.astro` | Home CTA from the registry |
| `scripts/setup-dec4-show.mjs`, `scripts/setup-dec4-door-ticket.mjs` (new) | Idempotent Sanity / Stripe setup |
| `studio/schemaTypes/documents/order.ts` | `show` field (read-only) |

## Setup outside the code

1. ✅ **Sanity** (`scripts/setup-dec4-show.mjs --show`, 2026-11-03): `dec4-ga-early` ($20 × 75),
   `dec4-ga` ($30 × 75), and the `show-2026-12-04` listing.
2. ✅ **Stripe** (`scripts/setup-dec4-door-ticket.mjs`, 2026-11-03): "Dec 4 — Door GA", SKU
   `TICKET-DOOR-GA-DEC4`, $30 (`prod_VZ2dz2yBT3ZQn3`). Sep 19 "Album Release Party — Door GA"
   (`prod_VDfsPAS2pQEBjW`, $35) archived. Pull to refresh Products in Payment for Stripe.
3. **HubSpot:** create the contact property `wtn_show_2026_12_04` (single-line text). If it's missing,
   the webhook retries the upsert without it, so the contact still lands.
4. **Door PIN:** rotate `STAFF_PIN` in Cloudflare (Production + Preview) before doors.

## Door night

- The door phone opens `/attendees` → Dec 4 list by default. Scanning a QR opens `/ticket`, same as Sep 19.
- A Sep 19 ticket scanned on Dec 4 shows **⛔ WRONG SHOW — DO NOT ADMIT**.
- Walk-ups are rung up on the reader as "Door GA — Dec 4" and appear on the list as "Door".

## Not in scope

- GA+ / VIP tiers (GA only this show).
- Revenue split / tracked links for Gators (confirmed not needed: all sales are ours, venue takes no cut).
- Refund policy copy (confirmed: not printed).
