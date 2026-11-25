# Spec: Black Friday ticket promo — 2 for $30 / 4 for $60 (Dec 4 show)

- **Status:** Active
- **Date:** 2026-11-24
- **Related:** [dec4-gators-show-ticketing.md](./dec4-gators-show-ticketing.md), ADR
  [0009](../adrs/0009-per-show-ticketing-shared-registry.md) (the show registry this extends)

## The offer

| | |
|---|---|
| Deal | **2 tickets for $30** or **4 tickets for $60** (GA, Dec 4 at Maggie Mae's) |
| On sale | Tue Nov 24, 2026 (as soon as this ships) → **Sun Nov 29, 11:59:59 PM Central** |
| Countdown | Counts down to **end of Black Friday** — Sat Nov 28, 12:00 AM Central (Fri night midnight) |
| After Friday | Countdown disappears; the deal stays buyable through Sunday with "Extended through Sunday" copy |
| Pool | Its own 40 tickets, moved out of the $30 GA pool, so the 150 online cap still holds |

Early bird ($20 singles) stays on sale next to it, unchanged.

## How it's modelled

One extra Sanity ticket product, **`dec4-bf`** — "Dec 4 Show — Black Friday GA", **$15 per ticket,
sold only in quantities of 2 or 4**. Pricing per ticket (rather than a "$30 pack" product that admits 2)
means stock, admit counts, the QR, the attendee list, partial refunds and restocking all keep working
exactly as they do for every other ticket: 4 × $15 is a 4-admit order, the same as 4 × $20.

The time window and allowed quantities live in the show registry (`PROMOS` in `src/lib/shows.ts`);
price and stock live in Sanity (editable in Studio without a deploy).

## Where it's sold: the `/shows` ticket panel

"Get Tickets" on the Dec 4 row expands the panel as today, now in two columns (stacked on phones):

- **Left — Early Bird**: exactly the current panel (price phase, quantity stepper, Add to cart).
- **Right — Black Friday**: "2 for $30 / 4 for $60" choice and a "Grab the deal" button.
- **Below both** — a live countdown "Black Friday ends in 2d 14h 03m 22s" until Fri midnight; then
  "Black Friday pricing extended through Sunday at midnight" until the deal closes; then the right
  column and the countdown are gone and the panel is the single early-bird panel again.

The countdown is synced to server time (from `/api/ticket-stock`), so a phone with a wrong clock
neither shows a bogus timer nor hides the deal early. If the deal's stock drops below 2 the right
column reads "Black Friday deal sold out".

Checkout after the click is unchanged: the button puts the pair/quad in the cart and goes straight
to `/checkout`. Picking again replaces the deal line rather than stacking (2 + 4 ≠ 6). In the cart
drawer / cart page the deal line steps 2 ↔ 4.

## Server-side guarantees (`functions/api/checkout.ts`)

The page is only the shop window; checkout is the source of truth.

1. **Window**: a deal line outside `startsAt`–`endsAt` is refused (409) with "The Black Friday deal
   ended Sunday at midnight — remove it from your cart…". Stale carts in localStorage can't use it
   after Sunday.
2. **Quantity**: total deal quantity in the cart must be one of the allowed quantities (2 or 4).
3. **Stock / price**: re-read from Sanity as for every product.
4. **Session expiry**: a Stripe Checkout Session holding the deal expires at the deal's end (min 30
   min, Stripe's floor), so a session opened Sunday night can't be paid Monday afternoon.
5. Stripe payment description: "Dec 04 Maggie Mae's with Gators — Black Friday"; session metadata
   `promo=bf2026`.

## Integrations

| System | What changes |
|---|---|
| **Sanity** | New product `dec4-bf` ($15, stock 40, tagged `hidden`, poster image); `dec4-ga` stock 75 → 35. Via `scripts/setup-bf-promo.mjs` (idempotent). Orders carry the `dec4-bf` line, so reports can split deal sales out. |
| **Stripe** | No catalog object needed (ticket lines are ad-hoc products). Line item "Dec 4 Show — Black Friday GA" with the poster, payment description suffixed "— Black Friday", `promo` metadata on the session. |
| **HubSpot** | New contact property `wtn_ticket_promo` (single-line text). Deal buyers get `BF2026` on it, alongside the usual `wtn_show_2026_12_04 = GA`. If the property is missing the upsert retries without it, so the contact still lands. |

## After the deal

`node --env-file=.env scripts/setup-bf-promo.mjs --close` (any time after Sunday midnight) moves
whatever deal stock is left back into the $30 GA pool. Nothing breaks if it's never run — the
leftover just isn't sold online.

## Not in scope

- A Stripe promotion code (the deal is a price, not a code — nothing to type, nothing to leak).
- Email / social announcements (suggested separately; not sent from here).
