import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * Singleton store settings, read by the checkout function and the fulfillment
 * webhook. All fields are optional — sensible defaults apply when unset.
 */
export const commerceSettings = defineType({
  name: 'commerceSettings',
  title: 'Store settings',
  type: 'document',
  fields: [
    defineField({
      name: 'storeEnabled',
      title: 'Store enabled',
      type: 'boolean',
      initialValue: true,
      description:
        'Master switch for the storefront. When OFF, the live site enters maintenance mode: the ' +
        'Merch nav link is hidden and /merch, product pages, /cart and /checkout all show the ' +
        'maintenance page, and the checkout API refuses new orders. Preview deploys always show ' +
        'the full store regardless, so it can be reviewed before launch.',
    }),
    defineField({
      name: 'maintenanceHeading',
      title: 'Maintenance page heading',
      type: 'string',
      description: 'Shown when the store is disabled. Defaults to “We’ll be right back”.',
    }),
    defineField({
      name: 'maintenanceMessage',
      title: 'Maintenance page message',
      type: 'text',
      rows: 3,
      description:
        'Shown under the heading on the maintenance page. Defaults to a generic “closed for ' +
        'maintenance” note.',
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      initialValue: 'usd',
      description: 'ISO code, lowercase (e.g. usd).',
    }),
    defineField({
      name: 'allowedShippingCountries',
      title: 'Ship to countries',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
      description: 'ISO country codes (e.g. US, CA). Defaults to US.',
    }),
    defineField({
      name: 'shippingRates',
      title: 'Shipping options',
      type: 'array',
      description: 'Up to 5 flat-rate options shown at checkout.',
      validation: (Rule) => Rule.max(5),
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            {name: 'label', type: 'string', title: 'Label (e.g. Standard)'},
            {name: 'amount', type: 'number', title: 'Amount (USD)'},
            {
              name: 'taxBehavior',
              type: 'string',
              title: 'Tax behavior',
              options: {list: ['exclusive', 'inclusive']},
              initialValue: 'exclusive',
            },
            {name: 'taxCode', type: 'string', title: 'Stripe tax code (optional)'},
          ],
          preview: {
            select: {title: 'label', amount: 'amount'},
            prepare: ({title, amount}) => ({title, subtitle: amount != null ? `$${amount}` : ''}),
          },
        }),
      ],
    }),
    defineField({
      name: 'enableTax',
      title: 'Collect sales tax (Stripe Tax)',
      type: 'boolean',
      initialValue: false,
      description: 'Requires Stripe Tax to be configured in the Stripe dashboard.',
    }),
    defineField({
      name: 'defaultTaxCode',
      title: 'Default Stripe tax code',
      type: 'string',
      description: 'Used when a product has none. e.g. txcd_99999999 (general goods).',
    }),
    defineField({
      name: 'lowStockThreshold',
      title: 'Low-stock threshold',
      type: 'number',
      initialValue: 3,
      description:
        'Email the addresses below when a size drops to this many or fewer after a sale. ' +
        'Set to 0 to turn low-stock alerts off.',
    }),
    defineField({
      name: 'fromEmail',
      title: 'Order email "from" address',
      type: 'string',
      description:
        'Verified sender for ALL store email. Leave this blank and no order confirmation, ' +
        'no admin alert and no low-stock alert can be sent \u2014 silently. Must be an address ' +
        'verified with the email provider.',
    }),
    defineField({
      name: 'adminNotificationEmails',
      title: 'Admin notification emails',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
      description: 'Who gets low-stock alerts (and new-order alerts, if switched on below).',
    }),
    defineField({
      name: 'alertOnNewOrder',
      title: 'Email me on every order',
      type: 'boolean',
      initialValue: false,
      description:
        'Off by default \u2014 a busy night would mean an email per sale. Low-stock alerts are ' +
        'sent regardless, as long as a threshold and at least one address are set above.',
    }),
  ],
  preview: {prepare: () => ({title: 'Store settings'})},
})
