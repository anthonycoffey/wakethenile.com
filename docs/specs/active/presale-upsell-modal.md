# Spec: Presale store upsell modal + auto-applied 15% offer

- **Status:** Active
- **Date:** 2026-07-10
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md)

## Problem

After buying a ticket-only on `/superfans`, the customer was sent to `/merch` with a small toast that
auto-dismissed after 7 seconds — easy to miss. We want a prominent prompt to browse the store (merch is picked up
at the show) and a real, time-limited **15% off** incentive that applies without the customer hunting for a code.

## Behavior

1. `/superfans` "Live Show Ticket" path arms two session flags and navigates to `/merch`:
   - `wtn_upsell_msg` — triggers the modal.
   - `wtn_promo = "WTN15OFF"` — the promo to auto-apply at checkout.
2. `/merch` shows a **centered modal over a dimmed store** (replaces the toast) with:
   - copy: browse the store, everything is picked up at the show, 15% off applied automatically;
   - **"Look around the store"** (and backdrop / Esc) → closes the modal onto the store to browse;
   - **"No thanks — go to checkout"** → navigates to `/checkout`.
3. `/superfans` **also** shows a lighter reminder modal, in the same visual style, immediately on landing
   (once per session, gated on `wtn_promo_seen`) — **regardless of which card the customer eventually picks**.
   This exists because only the ticket-only path auto-applies the code; a **VIP Fan Experience** purchase does
   not (see Notes), so the reminder tells the customer the code (`WTN15OFF`) up front with a "Copy code" button,
   in case they need to enter it manually at checkout.
4. `/checkout` (`CheckoutCustom.tsx`) reads `wtn_promo` and, once the Payment Element is ready, calls
   `applyPromotionCode()` automatically, shows it as applied, and clears the flag. The code lives only in
   `/superfans`; checkout applies whatever was armed. Because Stripe's `applyPromotionCode()` can spuriously
   return "invalid" if called the instant the Payment Element reports ready, the auto-apply **retries with
   backoff** (6 attempts over ~6s) before giving up; on exhaustion the flag is left so a reload or manual entry
   still works. The retry effect depends **only** on `paymentReady` and reads the live `checkout` from a ref —
   depending on `checkout` (whose reference changes on every state update, e.g. shipping auto-select) tore the
   loop down mid-flight and was the reason an earlier version of the fix silently did nothing.

## Discount

`WTN15OFF` → Stripe coupon `DFFqDqbe`, **15% off**, live, capped at 30 redemptions, **expires 2026-07-17 23:59
America/Chicago** (`expires_at` set on the code, matching the modal countdown). Applies to the whole checkout
session (Stripe percent-off coupon). Note: Stripe locks a promotion code's `expires_at` at creation — this expiry
was set by archiving the original code and recreating `WTN15OFF` with the deadline baked in.

## Countdown (removed for now)

The `/merch` modal previously showed a live countdown to a fixed deadline (2026-07-17 23:59 America/Chicago).
**Removed for now** at the owner's request — the modal no longer displays a timer. **The underlying Stripe
promotion code (`WTN15OFF`) still has that `expires_at` set** (a code's expiry can't be edited after creation —
only archived + recreated), so the code will stop working at that instant with no on-screen countdown warning
anyone. Revisit before that date: either extend the code's expiry (archive + recreate) or reinstate the
countdown once a final promotion window is decided.

## Notes / trade-offs

- The offer is armed on arrival, so it also applies if the customer skips browsing and checks out with just the
  ticket (15% off the ticket). Acceptable as goodwill; revisit if it should be gated to "Look around" only.
- The `/superfans` reminder modal does **not** arm `wtn_promo` — it's informational only. A **VIP Fan Experience**
  purchase still does not auto-apply the code (only the ticket-only → `/merch` path does); the customer must type
  `WTN15OFF` manually at checkout. Confirmed acceptable by the owner as long as the code is surfaced up front.
