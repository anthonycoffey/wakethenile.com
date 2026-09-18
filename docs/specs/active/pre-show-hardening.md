# Pre-show hardening: 5 fixes from the d90926c review

**Status:** implemented, not yet deployed
**Touches:** `functions/api/stripe-webhook.ts`, `functions/api/checkin.ts`,
`src/components/TicketView.tsx`, `studio/schemaTypes/documents/commerceSettings.ts`
**Related:** commit `d90926c` ("Record booth sales, reverse refunds, close
integration gaps"), reviewed and found to have 9 real gaps of its own. This
spec covers the 5 the user asked to fix before the Sep 19 show; the other 4
(full ticketCode exposed in `/api/attendees` JSON, a missing-settings-document
edge case in `checkout.ts`'s shipping/tax fallback, a variant-SKU-rename edge
case in refund stock-restore, and a missing `cancelled` filter in the refund
handler's HubSpot lookup) are deliberately deferred — flagged, not silently
dropped.

## 1. Stock oversell race (checkout.ts + stripe-webhook.ts)

**Gap:** `/api/checkout` checks stock with a plain read at Checkout Session
creation, before payment. The actual decrement only happens later, in the
webhook, once payment settles. Nothing reserves the stock in between, so two
buyers can both pass the check on the last unit, both pay, and both webhooks
decrement — stock goes negative with nothing to say why.

**Scope decision:** true prevention needs an inventory-hold system (decrement
optimistically at session creation, release it on `checkout.session.expired`
or an abandoned-session sweep) — a materially larger, riskier change to ship
hours before a live show. Instead: **detect and alert immediately.** A new
`warnIfOversold()` re-reads the touched products/variants right after the
stock-decrement transaction commits; if anything went negative, it
`console.error`s and emails the admin list unconditionally (not gated by
`alertOnNewOrder` — this is not a routine per-order notification). This won't
stop an oversell, but it turns a silent, eventually-discovered inventory drift
into something a human can react to within minutes.

## 2. Refund conflicts silently swallowed (stripe-webhook.ts)

**Gap:** `SanityMutateError.isConflict` treats any HTTP 409 as "a duplicate
delivery, safe to ack." `handleRefund`'s `ifRevisionID`-pinned patch can 409
for two very different reasons: a genuine redelivery of the same refund event
(safe to ack), or an unrelated concurrent write to the same order — a door
lane stamping `admitted`/`checkedInAt` via `/api/checkin`, or a Studio edit
(NOT safe to ack — the refund would be silently dropped, money refunded in
Stripe but the order left live and stock never restored).

**Fix:** `handleRefund` no longer uses the shared `mutateOnce`/`isConflict`
for this patch. On a 409 it re-reads the order fresh: if `refundedAt` is now
set, that's a genuine redelivery and it acks; otherwise it retries the patch
against the fresh revision (bounded at 4 attempts), and only throws (→ Stripe
retries the whole webhook) if conflicts don't resolve. The order-creation
paths (`handleCheckoutCompleted`, `handleBoothCharge`) still use
`mutateOnce`/`isConflict` unchanged — those transactions only ever conflict on
the `create` (a genuine idempotency case), so that reuse remains correct.

## 3. Admin new-order emails silently disabled (commerceSettings.ts, stripe-webhook.ts)

**Gap:** the previous commit gated a previously-unconditional admin
notification behind a new `alertOnNewOrder` boolean with `initialValue: false`.
A Sanity `initialValue` only applies to documents created from now on; the
live `commerceSettings` singleton predates the field, so it reads as
`undefined` — an opt-in check (`=== true`) would silently turn off
notifications the site owner was previously always getting, the day before a
show, with zero visible signal that anything changed.

**Fix:** flipped to opt-out (`!== false`) and the schema's `initialValue` to
`true`, so the existing document's undefined field preserves prior behavior;
an owner who wants quiet now has to explicitly flip the (renamed-in-spirit,
same field) Studio toggle off.

## 4. Booth POS: one bad cart entry dropped silently (stripe-webhook.ts)

**Gap:** `boothLinesFromCharge` only falls back to its "unparseable, record
one opaque line" recovery when *every* entry in the cart string fails to
parse. A single malformed entry inside an otherwise-valid multi-item cart hit
a bare `continue` — dropped with zero logging, discoverable only by a manual
inventory recount after the show.

**Fix:** a malformed entry now throws instead of silently continuing, exactly
matching the existing behavior for an unresolvable price lookup a few lines
below (same comment/reasoning: dropping a line under-decrements stock forever
and a 200 stops Stripe from retrying; failing the whole event is safe because
the `create`-as-lock makes any retry idempotent). The all-entries-unparseable
fallback path is unaffected — it's now reached only when the cart string
itself yields zero entries, which better matches its original intent.

## 5. Every check-in refusal shows the same "DO NOT ADMIT" banner (checkin.ts, TicketView.tsx)

**Gap:** `checkin.ts` returns HTTP 409 for three different situations — the
ticket is fully used up (a genuine refusal), staff asked to let in more people
than remain (the ticket is still valid, just a smaller party fits), and a
lost race with another door lane (informational, retry). The frontend's own
comments describe wanting to show the alarming red banner only for the first
case — but the gate it used (`typeof data.admitted === 'number'`) is true for
all three responses `checkin.ts` actually sends, so every 409 got the same
red "DO NOT ADMIT" treatment.

**Fix:** `checkin.ts`'s three 409 responses now carry an explicit
`refused: boolean` — `true` only when the ticket is actually used up, `false`
for the other two. `TicketView.tsx` gates the red banner on `refused === true`
specifically, while still syncing the admitted count/timestamp for all three
cases.

## Acceptance criteria

1. Two near-simultaneous webhook deliveries that together oversell a product
   result in a `console.error` and an admin email within the same request,
   not a silently negative stock count discovered later.
2. A refund webhook that races with an in-flight check-in write on the same
   order retries and completes (refundedAt set, stock restored) rather than
   acking "already refunded" without having done either.
3. The live `commerceSettings` document (predates `alertOnNewOrder`) continues
   sending admin new-order emails after deploy, unchanged from before.
4. A booth charge with one malformed cart-string entry among otherwise-valid
   ones fails the whole webhook (Stripe retries) instead of silently
   recording a partial order.
5. Door staff asking to let in more people than remain on a ticket see a
   neutral "only N left" message, not the red DO-NOT-ADMIT banner; a fully
   spent ticket still shows red.
