# Mixed-tier orders show a misleading tier + admit count

**Status:** implemented, not yet deployed
**Touches:** `functions/api/stripe-webhook.ts`, `functions/api/attendees.ts`,
`functions/api/ticket.ts`, `src/components/AttendeeList.tsx`,
`src/components/TicketView.tsx`, `studio/schemaTypes/documents/order.ts`
**Related:** [qr-ticketing.md](./qr-ticketing.md)

## Why

`ticketSummary()` in `stripe-webhook.ts` flattens every ticket-shaped line in
a cart into a single headline `ticketTier` (the best perk present) and a
single summed `admits`. That's fine when a cart is one tier, but a cart that
mixes tiers — one VIP Fan Experience + one separate GA ticket, say — writes
`ticketTier: 'vip', admits: 2` with nothing recording that only one of those
two admits is actually VIP.

The door only ever sees the flattened fields: `/attendees` renders `VIP` in
the Tier column with `2` in Admits, and the scanned `/ticket?c=…` page shows
a "VIP · Ultimate Fan" badge with "Admits 2" — both read as *two VIP
admissions*, when it's one VIP + one GA. Found via order `624134`
(`scottkuhr@yahoo.com`): Stripe shows the real cart (1× VIP Fan Experience
bundle, 1× GA ticket, $120 total) but the order doc and every UI built on it
collapsed that to `VIP × 2`.

## Approach

Don't touch the meaning of the existing `ticketTier`/`admits` fields — they
stay the flattened headline tier + total admit count, which is what
`checkin.ts`'s counter and the check-in button logic already key off. Add a
new field, `ticketBreakdown`, that's **only populated when a cart actually
mixes tiers** (`ticketSummary()`'s per-tier admit map has more than one
entry). Single-tier orders — the overwhelming majority — get no new field
and no behavior change.

1. `stripe-webhook.ts`: `ticketSummary()` now builds a per-tier admit map
   instead of a flat total, and returns `breakdown: {tier, admits}[]`
   (ordered by `TIER_PRIORITY`) alongside the existing `admits`/`tier`.
   `handleCheckoutCompleted` and `handleBoothCharge` both stamp
   `order.ticketBreakdown` from it when `breakdown.length > 1`.
2. `order.ts` schema: `ticketBreakdown` — array of `{tier, admits}` objects,
   read-only, documented as "only set on a mixed cart."
3. `attendees.ts` / `ticket.ts`: project `ticketBreakdown` alongside the
   existing fields.
4. `AttendeeList.tsx`: a `tierLabel()` helper renders `"1× VIP + 1× GA"` (used
   in both the Tier column and the CSV export) instead of the bare headline
   tier whenever a breakdown is present.
5. `TicketView.tsx`: the tier badge reads "Mixed order — see admits" instead
   of the (wrong) single-tier badge, and the admits line appends the same
   `"(1× VIP + 1× GA)"` breakdown, when present.

Existing orders written before this change have no `ticketBreakdown` and keep
showing the old flattened view — this doesn't retroactively fix `624134` in
Sanity, only orders placed after deploy. Backfilling `624134`'s Sanity
document by hand is a separate, explicit action (a production data edit),
not part of this change.

## Acceptance criteria

1. A cart with one VIP line + one separate GA line → `/attendees` shows
   `1× VIP + 1× GA` in the Tier column (not `VIP` / `2`), and the scanned
   ticket shows "Mixed order" with `Admits 2 (1× VIP + 1× GA)`.
2. A normal single-tier cart (the common case) is unchanged: no
   `ticketBreakdown` written, `/attendees` and the ticket page render exactly
   as before.
3. Check-in counting (`/api/checkin`) is untouched — it still counts against
   the flattened `admits` regardless of tier mix.
