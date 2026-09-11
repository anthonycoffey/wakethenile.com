# Integration audit — fixes

**Status:** implemented, not yet deployed
**Companion to:** `booth-sales-and-refunds.md`

A full audit of the Stripe ↔ Sanity ↔ site path before the Sep 19 show. What
follows is what was wrong and what each fix actually protects.

## Money

**Stock was checked per cart line, not per sku.** The cart keys lines by sku
*plus chosen options*, so the same sku legitimately appears twice (two bundles
with different tee picks) and each line was measured against the full stock on
its own. Worse, the bucket identity was the *client's* sku string, so a
variant-less product — every ticket — could be split across as many buckets as
the caller invented strings. Two lines of `albumrelease-ga` with junk skus sold
100 admissions against a 50-seat capacity. Quantities are now summed per
**server-resolved** variant and checked once.

**An unmatched sku silently fell back to base price and base stock,** both of
which go stale the moment a product gains sizes. Now a 409.

**The client's sku was persisted into the Stripe product metadata** the webhook
treats as authoritative — and the webhook granted admission off door-ticket
SKUs on the web path. Naming a product's sku `TICKET-DOOR-GA` would have minted
tickets. Door SKUs are now booth-only, and only the server-resolved sku is
stored.

**Free "pick up at the show" was offered whenever *any* line was
pickup-eligible.** One $15 ticket made shipping free for everything else in the
cart while the confirmation email still promised to post it. Removed entirely:
a fully-collectable cart already takes the `allPickup` branch and is charged
nothing; anything else pays a real rate.

**A failed settings fetch invented a $5 shipping rate and turned tax off,**
silently, with no log. Checkout now fails closed — under-collecting shipping
and sales tax on every order in an outage window is not a graceful degradation.

**The Stripe session call parsed the response before checking `res.ok`,** so a
non-JSON edge error threw past every handler and left nothing to debug from.

## The door

**A refunded ticket read as a network glitch.** The server correctly returned
410; the client threw it away and showed "Could not check in — try again."
Under queue pressure staff read that as wifi and admit the person. There is now
a full-width red **⛔ DO NOT ADMIT** panel, and a 5xx says plainly that the
result is unknown rather than inviting a retry that could double-count.

**`fulfillmentStatus: 'cancelled'` did nothing.** `refundedAt` is webhook-only,
so the one field a human could set had no effect anywhere. Now honoured by
`/api/ticket`, `/api/checkin` and `/api/attendees` — the manual lever that
partial refunds and chargebacks need.

**Group tickets are counted, not flipped.** A 4-admit order used to grey out
after the first scan, so a party arriving in two waves had to be refused. The
door now says how many are standing there; `admitted` counts up and the ticket
works until it reaches `admits`. `checkedInAt` still records the first arrival.

**Check-in had no undo.** Scanning the wrong phone was permanent and needed a
developer with a write token, at the door, mid-show. There's an undo now.

**Two lanes scanning at once both reported success.** `setIfMissing` fails
silently in that race. Writes are pinned with `ifRevisionID`, and a missing
`_rev` is a hard stop rather than a shrug — the guard is the only thing making
the counter safe.

**The door PIN was accepted in a query string,** which writes it to edge logs,
browser history and outbound `Referer` headers. Header only now.

**The attendee CSV exported full ticket codes** — bearer credentials, one
AirDrop from being a credential dump. Last 6 characters only.

## Quiet wrongness

- The thank-you page said "your order is confirmed", cleared the cart and fired
  a Meta Purchase pixel on sessions that were `complete` but **unpaid** — real
  exposure, since Klarna and Cash App are both live. Success now requires
  `payment_status: paid`, and there's a "payment on its way" state.
- A flaky poll *after* a successful payment threw the buyer onto the error page
  with an emptied cart. The poll is contained now.
- Ticket-only orders were told their order would ship.
- `promoCode` and `amountDiscount` are recorded, so a campaign can be measured.
  Previously the discount was only visible as an unexplained gap between
  subtotal and total.
- Low-stock alerts exist. The setting promised them and no code could send one.
  Per-order admin mail is now opt-in (`alertOnNewOrder`, default off).
- A blank `commerceSettings.fromEmail` silently killed **every** store email.
  It now logs, and the field says so.
- `fromPrice` used `math::min` over variant prices, which skips nulls — so a
  size priced "blank = use base price" was excluded and the card advertised a
  higher price than the cheapest size actually costs.
- A variant with no stock value read as unlimited in the size picker (chip
  selectable, CTA then flipping to Sold Out) because the projection didn't
  coalesce.
- `shopPageQuery` had no draft filter, and `drafts.page-merch` sorts *before*
  `page-merch`, so an unpublished edit won.
- Deleted `productsForCheckoutQuery`: dead, and already drifted from the live
  inline query — consolidating onto it would have dropped `stripeProductId`
  and broken coupon targeting.

## Still open

- **No rate limiting on the staff PIN.** A short numeric PIN with no lockout is
  brute-forceable, and it unlocks every attendee's details plus every ticket
  code. Wants a Cloudflare rate-limit rule and a longer secret.
- **No per-scan audit trail.** `checkedInBy` records only the first lane.
- **The attendee list never refreshes** and shows stale rows without a warning
  if a reload fails.
- **No `Referrer-Policy` on `/ticket`**, so the code reaches GA and Meta.
- **A sequential retry after an unconfirmed write can over-count a group
  ticket** (never beyond `admits`; the effect is the rest of the party being
  refused, which undo fixes). A per-scan idempotency key would close it.
