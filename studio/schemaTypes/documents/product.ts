import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * Optional self-hosted merch product. Use this ONLY if Sanity is your source of
 * truth for merch (e.g. paired with Stripe / Snipcart). If you use Shopify as
 * the backend, products live in Shopify and this type can be omitted or kept thin
 * as a curated "featured merch" list referencing Shopify handles.
 */
export const product = defineType({
  name: 'product',
  title: 'Product (merch)',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [defineArrayMember({type: 'image', options: {hotspot: true}})],
    }),
    defineField({name: 'description', title: 'Description', type: 'blockContent'}),
    defineField({
      name: 'price',
      title: 'Price (USD)',
      type: 'number',
      description: 'Display price. Authoritative price/charge should come from the payment provider.',
    }),
    defineField({
      name: 'variants',
      title: 'Variants',
      type: 'array',
      description:
        'One entry per purchasable option (e.g. each size). If a product has no variants, ' +
        'the base price/stock below are used.',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'variant',
          fields: [
            {name: 'label', type: 'string', title: 'Label (e.g. Size M)', validation: (Rule) => Rule.required()},
            {name: 'sku', type: 'string', title: 'SKU', validation: (Rule) => Rule.required()},
            {
              name: 'price',
              type: 'number',
              title: 'Price (USD)',
              description: 'Overrides the base price for this variant. Leave blank to use the base price.',
              validation: (Rule) => Rule.min(0),
            },
            {
              name: 'stock',
              type: 'number',
              title: 'Stock on hand',
              description: 'Units available. Auto-decrements on each sale. 0 = out of stock.',
              initialValue: 0,
              validation: (Rule) => Rule.min(0).integer(),
            },
          ],
          preview: {
            select: {title: 'label', sku: 'sku', stock: 'stock'},
            prepare({title, sku, stock}) {
              const s = typeof stock === 'number' ? `${stock} in stock` : 'no stock set'
              return {title, subtitle: [sku, s].filter(Boolean).join(' · ')}
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'active',
      title: 'Active (available for purchase)',
      type: 'boolean',
      description: 'Uncheck to hide from the shop and block checkout without deleting the product.',
      initialValue: true,
    }),
    defineField({
      name: 'taxCode',
      title: 'Stripe tax code',
      type: 'string',
      description:
        'Stripe Tax product tax code (e.g. txcd_99999999 general goods, txcd_30011000 apparel). ' +
        'Falls back to the store default when blank.',
    }),
    defineField({name: 'soldOut', title: 'Sold out (manual override)', type: 'boolean', initialValue: false}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  preview: {
    select: {title: 'title', media: 'images.0', subtitle: 'price'},
    prepare({title, media, subtitle}) {
      return {title, media, subtitle: subtitle ? `$${subtitle}` : ''}
    },
  },
})
