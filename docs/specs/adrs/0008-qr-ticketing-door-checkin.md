# ADR 0008: QR ticketing + door check-in

- **Status:** Accepted  <!-- Proposed | Accepted | Deprecated | Superseded by NNNN -->
- **Date:** 2026-07-11
- **Deciders:** Wake the Nile

## Context

The Sep 19 presale sells admit-granting products (Live Show Ticket = GA, Ultimate Fan Experience bundle = VIP).
Orders already record to Stripe + Sanity via the webhook, but there was no scannable pass, no way to check people
in at the door seeing GA vs VIP, and no attendee list for cross-off. Constraints: static SSG site + edge-native
Cloudflare Pages Functions (ADR 0001), no server session store, a small-budget door operation using phone cameras.

## Decision

We will issue **one QR per ticket order**, encoding a URL to our own ticket page
(`/ticket?c=<ticketCode>`), and check attendees in against **Sanity**:

- The Stripe webhook stamps each ticket order with a random unguessable `ticketCode` (`crypto.randomUUID()`), a
  `ticketTier` (`ga`/`vip`), and `admits` (summed ticket qty). Identity is the stored random code — **no signed
  token / signing secret**; the unguessable code is the bearer credential.
- Check-in state lives on the `order` (`checkedInAt`), so Sanity is the single source of truth shared by the door
  scanner, the `/attendees` page, and the CSV export — they can't disagree. Idempotent via `setIfMissing`.
- Viewing a ticket needs only the link; the **state-changing check-in** and the attendee list are gated by a
  single shared **door PIN** (`STAFF_PIN`), validated server-side in the edge functions. Sufficient for a door;
  no user accounts.
- QR is generated **client-side** from a vendored dependency-free lib (`qrcode-generator`) as inline SVG — no
  external requests (CSP-safe), no image service.
- Ticket buyers are upserted into **HubSpot** from the webhook (best-effort, guarded on `HUBSPOT_TOKEN`).

## Consequences

- **Easier:** phone-camera scanning opens a rich ticket page (name, VIP/GA, admits, check-in) with zero app to
  install; the attendee page doubles as the printable/exportable cross-off list; everything stays in the existing
  Stripe→webhook→Sanity pipeline.
- **Trade-offs / limits:** a QR image can be screenshot/shared — the design prevents **double-entry** (second scan
  → "already checked in"), not image sharing. De-dup needs **internet at the door**; offline falls back to the CSV.
  One order = one QR that "admits N". The shared PIN is coarse (no per-staff identity). New server-only env
  (`STAFF_PIN`, `HUBSPOT_TOKEN`) must be set in Cloudflare Production, and a HubSpot contact property
  `wtn_show_2026_09_19` must exist. Ticket/VIP product ids are duplicated across `checkout.ts`,
  `stripe-webhook.ts`, and `checkout-session.ts` (Workers bundles can't share imports) — keep in sync.
