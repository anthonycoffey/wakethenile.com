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
  ],
  preview: {
    select: {name: 'customerName', email: 'email', total: 'amountTotal', status: 'fulfillmentStatus', date: 'createdAt'},
    prepare({name, email, total, status, date}) {
      const when = date ? new Date(date).toLocaleDateString('en-US') : ''
      return {
        title: `${name || email || 'Order'} — $${(total ?? 0).toFixed(2)}`,
        subtitle: `${status ?? 'unfulfilled'}${when ? ` · ${when}` : ''}`,
      }
    },
  },
})
