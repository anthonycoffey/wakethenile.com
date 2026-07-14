import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * A paid order. Created automatically by the Stripe webhook
 * (functions/api/stripe-webhook.ts) — not by hand. The client uses this to see
 * orders and set fulfillment status; marking one "fulfilled" is what later
 * drives the shipping-notification automation (Phase 5).
 */
export const order = defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  fields: [
    defineField({
      name: 'fulfillmentStatus',
      title: 'Fulfillment',
      type: 'string',
      options: {list: ['unfulfilled', 'fulfilled', 'cancelled'], layout: 'radio'},
      initialValue: 'unfulfilled',
    }),
    defineField({name: 'email', title: 'Customer email', type: 'string', readOnly: true}),
    defineField({name: 'customerName', title: 'Customer name', type: 'string', readOnly: true}),

    // --- Live-show ticketing (set by the Stripe webhook when the order
    // contains a ticket/bundle; drives the QR pass + door check-in). ---
    defineField({
      name: 'ticketTier',
      title: 'Ticket tier',
      type: 'string',
      readOnly: true,
      options: {list: ['ga', 'vip'], layout: 'radio'},
      description: 'ga = Live Show Ticket, vip = VIP Fan Experience. Absent on merch-only orders.',
    }),
    defineField({name: 'admits', title: 'Admits (# people)', type: 'number', readOnly: true}),
    defineField({
      name: 'ticketCode',
      title: 'Ticket code',
      type: 'string',
      readOnly: true,
      description: 'Unguessable id embedded in the QR (…/ticket?c=<code>).',
    }),
    defineField({
      name: 'checkedInAt',
      title: 'Checked in at',
      type: 'datetime',
      readOnly: true,
      description: 'Stamped when scanned at the door. Empty = not yet arrived.',
    }),
    defineField({name: 'checkedInBy', title: 'Checked in by', type: 'string', readOnly: true}),
    defineField({
      name: 'lineItems',
      title: 'Items',
      type: 'array',
      readOnly: true,
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            {name: 'title', type: 'string', title: 'Title'},
            {name: 'sku', type: 'string', title: 'SKU'},
            {name: 'productId', type: 'string', title: 'Product ID'},
            {name: 'qty', type: 'number', title: 'Qty'},
            {name: 'unitAmount', type: 'number', title: 'Unit price (USD)'},
            {
              // Customer-selected bundle options (tee/size). Written by the
              // Stripe webhook; the choice a customer made at purchase.
              name: 'options',
              title: 'Selected options',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'object',
                  fields: [
                    {name: 'name', type: 'string', title: 'Option'},
                    {name: 'value', type: 'string', title: 'Choice'},
                  ],
                  preview: {
                    select: {name: 'name', value: 'value'},
                    prepare: ({name, value}) => ({title: `${name}: ${value}`}),
                  },
                }),
              ],
            },
          ],
          preview: {
            select: {title: 'title', qty: 'qty', sku: 'sku', options: 'options'},
            prepare: ({title, qty, sku, options}) => {
              const opts = Array.isArray(options)
                ? options.map((o: {value?: string}) => o?.value).filter(Boolean).join(' · ')
                : ''
              return {title: `${qty}× ${title}`, subtitle: [opts, sku].filter(Boolean).join(' — ')}
            },
          },
        }),
      ],
    }),
    defineField({name: 'amountSubtotal', title: 'Subtotal (USD)', type: 'number', readOnly: true}),
    defineField({name: 'amountShipping', title: 'Shipping (USD)', type: 'number', readOnly: true}),
    defineField({name: 'amountTax', title: 'Tax (USD)', type: 'number', readOnly: true}),
    defineField({name: 'amountTotal', title: 'Total (USD)', type: 'number', readOnly: true}),
    defineField({name: 'currency', title: 'Currency', type: 'string', readOnly: true}),
    defineField({name: 'promoCode', title: 'Promo code', type: 'string', readOnly: true}),
    defineField({
      name: 'shippingAddress',
      title: 'Ship to',
      type: 'object',
      readOnly: true,
      options: {collapsible: true, collapsed: false},
      fields: [
        {name: 'name', type: 'string', title: 'Name'},
        {name: 'line1', type: 'string', title: 'Address line 1'},
        {name: 'line2', type: 'string', title: 'Address line 2'},
        {name: 'city', type: 'string', title: 'City'},
        {name: 'state', type: 'string', title: 'State'},
        {name: 'postalCode', type: 'string', title: 'Postal code'},
        {name: 'country', type: 'string', title: 'Country'},
      ],
    }),
    defineField({name: 'stripeSessionId', title: 'Stripe session id', type: 'string', readOnly: true}),
    defineField({name: 'stripeEventId', title: 'Stripe event id', type: 'string', readOnly: true}),
    defineField({name: 'createdAt', title: 'Placed at', type: 'datetime', readOnly: true}),
  ],
  orderings: [
    {title: 'Newest', name: 'createdDesc', by: [{field: 'createdAt', direction: 'desc'}]},
    {title: 'Checked in (newest)', name: 'checkedInDesc', by: [{field: 'checkedInAt', direction: 'desc'}]},
  ],
  preview: {
    select: {
      name: 'customerName',
      email: 'email',
      total: 'amountTotal',
      status: 'fulfillmentStatus',
      date: 'createdAt',
      tier: 'ticketTier',
      checkedInAt: 'checkedInAt',
    },
    prepare({name, email, total, status, date, tier, checkedInAt}) {
      const when = date ? new Date(date).toLocaleDateString('en-US') : ''
      const tierTag = tier ? ` [${String(tier).toUpperCase()}]` : ''
      const door = tier ? (checkedInAt ? ' · ✅ checked in' : ' · ⬜ not arrived') : ''
      return {
        title: `${name || email || 'Order'} — $${(total ?? 0).toFixed(2)}${tierTag}`,
        subtitle: `${status ?? 'unfulfilled'}${when ? ` · ${when}` : ''}${door}`,
      }
    },
  },
})
