# Spec: Checkout polish — no shipping for tickets, region-based shipping for merch

- **Status:** Active (Stage 1 shipped; Stage 2 pending)
- **Date:** 2026-07-11
- **Related:** ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md), [qr-ticketing](./qr-ticketing.md)

## Problem
For a **ticket-only** cart, checkout still asked for a shipping address and defaulted to **$5 Standard
Shipping** — charging a ticket buyer for shipping they don't need. And the buyer's **name** was only captured
inside the shipping-address block. Separately, merch shipping is a single flat rate for everyone; the owner wants
**region-based** rates (Lower-48 $9, AK/HI $13, US-only, free show-pickup for ticket/bundle buyers).

## Stage 1 — Ticket-only checkout (this PR)
A cart where **every** line is a pickup product (Live Show Ticket `2480f00d…` or VIP Fan Experience
`b351d11f…`) is "pickup-only":
- `functions/api/checkout.ts`: for pickup-only carts, omit `shipping_address_collection` **and**
  `shipping_options` (no address, no shipping cost).
- `CheckoutCustom.tsx`: for pickup-only carts, hide the shipping-address + options sections, show a **"Your name"**
  field (required to pay) and a **"🎟️ Digital ticket — nothing ships"** notice.
- Name capture: since there's no address, the typed name is saved to the Checkout Session metadata via
  `functions/api/set-buyer-name.ts` (`POST {sessionId,name}`) just before confirm (best-effort, never blocks pay).
  `functions/api/stripe-webhook.ts` reads `customer_details.name ?? metadata.buyerName ?? shipping name`.

## Stage 2 — Region-based merch shipping (next PR)
- Zones editable in Sanity `commerceSettings` (seed: Lower-48 $9, AK/HI $13; US-only).
- `permissions.update_shipping_details: server_only` on the session; a new `/api/shipping-options` endpoint
  recalculates `shipping_options` from the entered state; client wires `runServerUpdate` on address change.
- Keep the free "Pick up at Merch booth" option when a ticket/bundle is in the cart.
- Note: Stripe does not fetch live carrier rates — we define the zone rules. (True carrier rates = separate
  provider integration, out of scope.)

## Verification
- Stage 1: on the preview, a ticket-only cart checkout shows **Email + Your name + Payment** with the notice and
  **no shipping**; `/api/checkout` returns a session (no shipping params); `/api/set-buyer-name` accepts a name;
  a completed test purchase records `customerName` from metadata. Mixed/merch carts are unchanged.
