# Spec: Merch orders report view (Studio)

- **Status:** Active
- **Date:** 2026-08-11
- **Related:** ADR [0007](../adrs/0007-bundle-line-item-options.md)

## Problem

Merch is now selling through two paths — standalone merch purchases and the Ultimate Fan
Bundle/VIP Fan Experience (which each include two tee selections, see ADR 0007). The `order`
document type ([`studio/schemaTypes/documents/order.ts`](../../../studio/schemaTypes/documents/order.ts))
holds everything needed (`lineItems[].title`/`.options`), but reviewing which shirts and sizes
were ordered means opening each order document individually — there's no aggregate view.

## Decision

Add a custom Structure Builder pane, **"Merch orders (list)"**, next to the existing "Orders"
list in [`studio/sanity.config.ts`](../../../studio/sanity.config.ts). It renders
[`studio/components/MerchOrdersTable.tsx`](../../../studio/components/MerchOrdersTable.tsx), a
read-only table that:

- Queries every `order` document and flattens `lineItems` into one row per shirt/size selection.
- **Bundle line items** (tee/size chosen via the two-tee options group, ADR 0007) expand into two
  rows — one per tee — pairing `Tee #1`/`Size #1` and `Tee #2`/`Size #2` by their `#N` suffix.
- **Standalone merch line items** have no `options`; their size lives in the Stripe-facing
  `title` string as `"<Product> — <Variant label>"` (built in `functions/api/checkout.ts`), so the
  row splits on the ` — ` separator instead.
- Each row shows date, customer, order type (Bundle/Merch), item, size, qty, fulfillment status,
  and a link (via `IntentLink`) back to the full order document.
- Supports a text search (customer/item/size) and a fulfillment-status filter, plus a "Download
  CSV" button for offline review.
- Live-updates via `client.listen` on the `order` type so a new webhook-created order appears
  without a manual refresh.

No schema changes — this is purely a read/report layer over the existing `order` documents.

## Trade-off accepted

Size-for-standalone-merch is inferred by splitting the line-item title on a literal ` — ` rather
than reading a structured field, because `functions/api/checkout.ts` never writes a structured
`options` array for non-bundle items (only the bundle allow-list does, see ADR 0007) — the
Stripe-facing product name is the only place the variant label survives to the webhook. If a
future merch item's title happens to contain that exact separator for an unrelated reason, its
row would show a misleading "size". Fixing this properly would mean changing `checkout.ts` to also
write a structured `options`/`variantLabel` field for non-bundle variant purchases — left out here
to keep this a report-only change with no effect on checkout or fulfillment.
