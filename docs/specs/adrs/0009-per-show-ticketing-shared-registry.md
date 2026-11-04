# ADR 0009: Per-show ticketing from one shared show registry

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** Wake the Nile
- **Amends:** [0006](./0006-live-show-ticket-presale-on-stripe-store.md), [0008](./0008-qr-ticketing-door-checkin.md)

## Context

The ticketing stack (ADR 0006 + 0008) was built for exactly one show (Sep 19). Nothing on an order says
*which* show it admits to, so the moment a second show goes on sale:

- every Sep 19 QR code would still scan **green** at the Dec 4 door;
- `/attendees` would merge both crowds into one list and one headcount;
- the single `TICKET-DOOR-GA` booth SKU can't tell a Sep 19 walk-up from a Dec 4 one;
- the `EARLY_BIRD_SOLD_OUT` kill switch closes **every** ticket product, so it can't stay on for
  Sep 19 and off for Dec 4;
- the confirmation email, HubSpot property and ticket copy all hard-code Sep 19.

On top of that, the ticket product ids are hand-copied into six files (checkout, checkout-session,
webhook, CheckoutCustom, tickets.ts, albumrelease) on the belief that Pages Functions "can't share
imports". They can: Cloudflare bundles each Function with esbuild, which follows relative imports
anywhere in the repo. The duplication was a choice, not a constraint, and every new show multiplies it.

## Decision

1. **One registry, `src/lib/shows.ts`**, is the only place a show or a ticket product is declared. It
   is dependency-free TypeScript imported by both the Astro site and every Pages Function
   (`../../src/lib/shows`). It holds:
   - `SHOWS` — id, display copy (date, venue, doors, age, billing), start time, HubSpot property, and
     `onlineSales: boolean`.
   - `TICKET_PRODUCTS` — Sanity product id → `{ show, tier }`.
   - `DOOR_TICKET_SKUS` — booth SKU → `{ show, tier }` (booth path only, as before).
2. **Every ticket order is stamped with `show`** by the webhook. Orders that predate this field are
   read as the Sep 19 show (`LEGACY_SHOW_ID`) — no backfill.
3. **The door only admits the current show.** `/api/checkin` computes the door show server-side
   (`doorShowAt(now)`: the earliest show that hasn't ended yet, i.e. start + 12 h) and refuses any ticket
   for a different show with a loud "wrong show — do not admit". No client parameter, so a stale door
   phone can't pick the wrong show.
4. **`/attendees` is per show**, defaulting to the door show, with a picker for past shows.
5. **Online sales are per show.** `/api/checkout` refuses ticket lines whose show has
   `onlineSales: false`, and refuses a cart holding tickets for two different shows (one order = one
   QR = one show). `EARLY_BIRD_SOLD_OUT` becomes a derived alias for the Sep 19 show, kept so dormant
   `/albumrelease` code still compiles.
6. **Sale state the static site can't know at build time is fetched live.** A public, read-only
   `GET /api/ticket-stock?show=<id>` returns remaining stock per tier, so early-bird → regular price
   switching happens the instant the early bird sells out, without a rebuild.

## Consequences

**Easier:**
- A new show is one registry entry, two Sanity products, one Stripe door product, and one Sanity `show`
  document. No hunting through six files.
- Old tickets can't be reused at a later show; each show gets its own door list and headcount.

**Harder / trade-offs:**
- Functions now import from `src/`. A Node-only import added to `shows.ts` would break every Function;
  the file must stay dependency-free (stated at the top of the file).
- `doorShowAt` is date-based: running two shows within 12 h of each other would need an explicit
  override. Not a near-term case.
- Orders written before this change have no `show`; anything reading `show` must go through
  `showOfOrder()` (GROQ: `coalesce(show, "<legacy id>")`).
