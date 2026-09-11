# Booth sales + refund reversal

**Status:** implemented, not yet deployed
**Touches:** `functions/api/stripe-webhook.ts`, `functions/api/attendees.ts`,
`functions/api/ticket.ts`, `functions/api/checkin.ts`,
`src/components/AttendeeList.tsx`, `studio/schemaTypes/documents/order.ts`

## Why

Two gaps, found while wiring up the Sep 19 merch booth.

**Booth sales never reached Sanity.** The booth runs Payment for Stripe
(Nudge) driving a Stripe Reader M2. That app does not create a Checkout
Session — it creates an invoice plus a Terminal PaymentIntent — so
`checkout.session.completed` never fired. Every Door GA sold at the table
would have been invisible to `/attendees`, and every tee sold there would have
left Sanity stock untouched while the web store kept selling the same shirt.

**Refunds did nothing.** The webhook subscribed to one event and returned
`ignored` for the rest. A refunded ticket kept its `/attendees` row, its QR
kept scanning green at the door, and its stock never came back.

## What changed

The webhook now routes three events instead of one:

| Event | Condition | Effect |
| --- | --- | --- |
| `checkout.session.completed` | — | Web order, `channel: 'web'` (unchanged behaviour) |
| `charge.succeeded` | `payment_method_details.type === 'card_present'` | Booth order, `channel: 'booth'` |
| `charge.refunded` | **full** refunds only | Mark refunded, restock, un-invite |

`card_present` is the trigger for the booth branch rather than the app's
`from_app` metadata, so swapping POS apps later doesn't silently break
fulfillment.

### Booth orders

- `_id` is `order-<paymentIntentId>` — deterministic, and the id a refund
  event can reach directly without a session lookup.
- Line items come from the POS app's `line_items` charge metadata, formatted
  `<priceId>:<qty>`. Each price is expanded to its product, whose metadata
  carries the Sanity `productId` and `sku` — the same ids the web path uses,
  so stock decrements work identically.
- `fulfillmentStatus` is `fulfilled` on creation: the goods crossed the table.
- Ticket lines are matched by SKU (`BOOTH_TICKET_TIER_BY_SKU`) because door
  tickets exist only in Stripe and carry no Sanity `productId`.
- Door buyers get a `ticketCode` so `/attendees` can link them and the door
  can check them in like anyone else. It is never emailed — they are standing
  at the door. They are **not** auto-checked-in, because someone can buy two
  tickets while their friend parks the car.

### Refunds

- **Full refunds only.** Stripe reports a refund amount but not which line it
  belongs to, so restocking or voiding a ticket on a partial refund would be a
  guess. Partial refunds are acked and ignored — reverse them by hand in the
  Studio.
- The order document is **kept**, not deleted: `refundedAt`, `refundedAmount`
  and `fulfillmentStatus: 'refunded'` are set. Deleting would destroy the sales
  record and a redelivered `checkout.session.completed` could resurrect it.
- Stock is added back with the same variant-key resolution used on the way
  down (`stockPatches(..., 'inc')`), so the two directions cannot drift.
- The HubSpot attendee flag is cleared so the CRM matches the door list.
- Guarded everywhere a refunded ticket could still be honoured: `/attendees`
  filters it out, `/api/ticket` returns 410, `/api/checkin` refuses to admit.

### Finding the order behind a refund

`charge.refunded` knows only a PaymentIntent. Resolution order:

1. `order-<pi>` — booth orders.
2. `stripePaymentIntentId == <pi>` — web orders written after this change.
3. Ask Stripe which Checkout Session owns the intent, then `order-<sessionId>`
   — the 73 web orders that predate the new field. No backfill needed.

## Stripe configuration

Endpoint `we_1ToYSIH77LgCOgE811yvU6mG` (https://wakethenile.com/api/stripe-webhook)
now subscribes to `checkout.session.completed`, `charge.succeeded`,
`charge.refunded`. Enabling them early is safe: the currently deployed code
acks unknown events with `ignored`.

There is a second, disabled endpoint at the same URL
(`we_1TrsnPH77LgCOgE86aagyswD`). It is a leftover and can be deleted.

## Concurrency and failure handling

Reviewed adversarially before shipping; these are the guards that came out of it.

- **`create`, not `createIfNotExists`.** The existence pre-check and the write
  are seconds apart (a Stripe expand, a Sanity product query, and on the booth
  path one price lookup per cart line). Two overlapping deliveries would both
  pass the check, and `createIfNotExists` would silently no-op the second
  create while its stock decrements applied anyway — a 2× drop with no error.
  `create` fails the transaction instead, rolling the decrements back, and the
  conflict is acked 200.
- **Refund patches are pinned with `ifRevisionID`** for the same reason in the
  restock direction, where a double-apply invents inventory that isn't there.
- **Stock patches skip products that no longer exist in Sanity.** A patch
  against a deleted document fails the entire transaction, which would have
  thrown away the order record for a sale already paid for. A missing stock
  move is much cheaper than a missing order; the skip is logged.
- **Drafts are excluded from every lookup** (`!(_id in path("drafts.**"))`).
  Opening an order in the Studio without publishing creates a draft copy
  sharing its `ticketCode` and `stripePaymentIntentId`. Unfiltered, a refund
  could stamp `refundedAt` on the draft while the published document kept
  scanning green at the door, and `/attendees` would list the buyer twice.
- **Sessions are only fulfilled when `payment_status` is `paid`.** Delayed
  methods complete the session before the money settles;
  `checkout.session.async_payment_succeeded` fulfils them when it clears.
- **A failed booth price lookup throws** rather than dropping the line. A
  dropped line would under-decrement stock permanently and still return 200,
  so Stripe would never retry it.

## Known limitation: variant re-keying between sale and refund

The sku→variant `_key` map is resolved from the product's current state in both
directions. If a variant is deleted, re-keyed, or its sku edited between a sale
and its refund, the refund can restock a product-level `stock` field instead of
the variant that was decremented. Fixing it properly means persisting the
resolved stock path on each order line at sale time. Not worth doing before
Sep 19; don't re-key variants on live products in the meantime.

## The one unverified assumption

A **single-item** booth charge stamps `line_items: "price_xxx:1"`. The
separator between entries in a **multi-item** cart is undocumented. The parser
splits on `,`, `;` or `|` and, if it can't parse anything, falls back to a
single opaque line with no `productId` — which records the sale and skips the
stock decrement rather than decrementing the wrong thing.

**Verify during dry-run scenario 2** (two Obuntu tees + a poster): ring it up,
then check that the Sanity order has three line items and that stock moved by
2 / 1. If it produced one opaque line instead, read the real separator off the
charge metadata and tighten the split.

## Not covered

- Refunding a booth sale leaves its Stripe invoice marked `paid`. Cosmetic;
  the money and the Sanity order are both correct.
- Booth sales have no customer email unless the operator collects one, so
  there is no confirmation email and no HubSpot contact for a walk-up.
