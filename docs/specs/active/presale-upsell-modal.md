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
   - copy: browse the store, everything is picked up at the show, 15% off applied automatically, limited time;
   - **"Look around the store"** (and backdrop / Esc) → closes the modal onto the store to browse;
   - **"No thanks — go to checkout"** → navigates to `/checkout`.
3. `/checkout` (`CheckoutCustom.tsx`) reads `wtn_promo` and, once the Payment Element is ready, calls
   `applyPromotionCode()` automatically, shows it as applied, and clears the flag. The code lives only in
   `/superfans`; checkout applies whatever was armed. Failure is silent (manual promo entry still works).

## Discount

`WTN15OFF` → Stripe coupon `DFFqDqbe`, **15% off**, live, no expiry, capped at 30 redemptions. Applies to the whole
checkout session (Stripe percent-off coupon).

## Notes / trade-offs

- The offer is armed on arrival, so it also applies if the customer skips browsing and checks out with just the
  ticket (15% off the ticket). Acceptable as goodwill; revisit if it should be gated to "Look around" only.
- "Limited time" is copy (urgency); enforced practically by the 30-redemption cap and session scope, not a live
  countdown.
