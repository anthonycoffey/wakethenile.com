# Spec: Early bird tickets sold out — door sales only

- **Status:** Active
- **Date:** 2026-09-19
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md),
  [pause-ticket-sales.md](./pause-ticket-sales.md) (earlier, Sanity-data-driven version of the same
  idea), [booth-sales-and-refunds.md](./booth-sales-and-refunds.md) (how door tickets are sold)

## Problem

Early bird (online) tickets for the Sept 19 show are sold out. From now on the only way in is a ticket
bought at the door on the booth Stripe Reader (`TICKET-DOOR-GA`). Every place a visitor could still try
to buy online has to say so, and online purchase has to actually be impossible — not just hidden.

## Decision

One code flag, `EARLY_BIRD_SOLD_OUT` ([`src/lib/tickets.ts`](../../../src/lib/tickets.ts)), drives all of
it. Deliberately **not** a Sanity data change (unlike `pause-ticket-sales.md`): preview and production
share one dataset, so a data write would hit production before the change is reviewed, and it would
overwrite the remaining-stock counts. A code flag ships atomically with the merge and reopening sales is
a one-line revert.

| Surface | While the flag is on |
|---|---|
| `/albumrelease` | [`EarlyBirdBanner`](../../../src/components/EarlyBirdBanner.astro) under the title; GA / GA+ / VIP cards render disabled with a "Sold Out" label (no hover, no click, VIP tee/size pickers not rendered); presale copy replaced |
| `/shows` | Banner above the show list (its "Get Tickets" link still goes to `/albumrelease`, which explains door sales) |
| `/merch` grid | GA, GA+, VIP Fan Experience, and the legacy Early Bird ticket are filtered out. The standalone **Ultimate Fan Merch Bundle** and all other merch stay |
| `/merch/<ticket slug>` | `superfans`, `ga-album-release`, `ga-plus-album-release`, `live-show-ticket` redirect to `/albumrelease` |
| `POST /api/checkout` | Any cart line for a ticket product is refused with a 409 and a "door only" message |

The server check lives in [`functions/api/checkout.ts`](../../../functions/api/checkout.ts) as its own
mirrored `EARLY_BIRD_SOLD_OUT` constant (separate Workers bundle — it can't import `src/lib`). It is the
authoritative guard: it also covers stale carts in a visitor's localStorage, direct API calls, and the
case where a refund restocks a ticket back above zero in Sanity (`stockPatches(..., 'inc')`), which
would otherwise quietly reopen online sales.

The home page CTA ("Get Tickets To Our Album Release Party") is Sanity content and is unchanged: it goes
to `/albumrelease`, which now carries the banner.

## Not affected

People who already bought: `/ticket`, `/attendees`, `/api/checkin`, confirmation emails, and QR check-in
are untouched. Door tickets sold on the booth Reader flow through the existing `charge.succeeded`
(card_present) webhook path unchanged.

## Resuming online sales

1. Set `EARLY_BIRD_SOLD_OUT = false` in `src/lib/tickets.ts` **and** in `functions/api/checkout.ts`.
2. Confirm ticket stock in Sanity is what you want sellable (it was left untouched by this change).

## Notes / trade-offs

- The door price is intentionally not shown on the site — it's set in Stripe (`TICKET-DOOR-GA`), not
  Sanity, and the copy shouldn't drift from it. Add it to the banner once confirmed.
- A visitor with a ticket already in their cart gets the 409 message at checkout, telling them to remove
  it; a mixed ticket + merch cart is blocked until the ticket is removed (the order can't be split).
- The two flags must be flipped together; there is no build-time check that they agree.
