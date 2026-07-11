# Spec: QR ticketing + door check-in (Sep 19 live show)

- **Status:** Active
- **Date:** 2026-07-11
- **Related:** ADR [0008](../adrs/0008-qr-ticketing-door-checkin.md), ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md)

## Goal

Give each ticket buyer a scannable QR pass, let staff check people in at the door with a phone (seeing GA vs VIP),
and keep a searchable/exportable attendee list that doubles as the manual cross-off sheet. Orders continue to log
to Stripe + Sanity.

## Flow

1. **Purchase** → `functions/api/stripe-webhook.ts` detects a ticket/bundle line, stamps the `order` with
   `ticketCode` (UUID), `ticketTier` (`ga`/`vip`), `admits` (summed qty), and `checkedInAt: null`. Emails the buyer
   a link to their ticket and upserts them into HubSpot (property `wtn_show_2026_09_19` = `GA`/`VIP`).
2. **Thank-you page** (`CheckoutReturn.tsx`) shows the QR + "Open/save your ticket" once the webhook has written the
   code (polls briefly). QR encodes `…/ticket?c=<ticketCode>`.
3. **Ticket page** (`/ticket?c=<code>` → `TicketView.tsx`, `functions/api/ticket.ts`) shows tier badge, admits, the
   QR, and check-in status. Staff devices that unlocked the door PIN also see a **Check in** button.
4. **Check-in** (`functions/api/checkin.ts`, POST `{code, pin}`) validates `STAFF_PIN`, stamps `checkedInAt`
   (`setIfMissing` → idempotent), and reports "already checked in" on a repeat scan.
5. **Attendees** (`/attendees` → `AttendeeList.tsx`, `functions/api/attendees.ts`) — PIN-gated list with search,
   live check-in status, totals, and CSV export.

## Tiers
- GA = Live Show Ticket (`2480f00d…`). VIP = Ultimate Fan Experience (`b351d11f…`). Ids mirrored in
  `checkout.ts`, `stripe-webhook.ts`, `checkout-session.ts`.

## Config required (Cloudflare Production, server-only)
- `STAFF_PIN` — door code for check-in + `/attendees`.
- `HUBSPOT_TOKEN` — HubSpot private-app token (`crm.objects.contacts.write`); create contact property
  `wtn_show_2026_09_19` (single-line text). Without the token, HubSpot sync is skipped (logged), nothing else breaks.

## Limits
- QR images can be screenshot/shared; the system blocks **double-entry** (second scan warns), not sharing. De-dup
  needs internet at the door; offline → use the CSV. One order = one QR that admits N.

## Acceptance criteria
1. Buying a Live Show Ticket → thank-you shows a QR; `/ticket?c=…` shows **GA** + admits; staff Check in stamps it;
   a second check-in says "already checked in".
2. Buying the Ultimate Fan Experience → ticket shows **VIP**.
3. `/attendees` (with PIN) lists both, search works, CSV downloads; wrong PIN is rejected.
4. Sanity `order` docs carry `ticketCode`/`ticketTier`/`admits`/`checkedInAt`; non-ticket (merch-only) orders carry
   none of these and show no QR.
