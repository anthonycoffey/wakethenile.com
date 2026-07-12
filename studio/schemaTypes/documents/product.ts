import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * Merch product sold through the site's own Stripe checkout — Sanity is the
 * source of truth for catalog, price, and stock.
 *
 * - A product with a single SKU uses the base price + stock below.
 * - A product with options (e.g. sizes) uses per-variant price + stock; the
 *   base stock is ignored when variants exist.
 *
 * Stock auto-decrements on each completed order; stock 0 = sold out. To pull a
 * product from the shop, unpublish or delete it — there is no "active" flag.
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
      name: 'order',
      title: 'Sort order',
      type: 'number',
      description:
        'Controls the order on the Merch page — lower numbers show first (1, 2, 3…). ' +
        'Leave blank to fall back to alphabetical.',
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
      description: 'Base price. Variants can override this per option.',
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: 'stock',
      title: 'Stock on hand',
      type: 'number',
      description:
        'Units available for products with no variants. Auto-decrements on each sale; 0 = sold out. ' +
        'Ignored when the product has variants (each variant tracks its own stock).',
      initialValue: 0,
      validation: (Rule) => Rule.min(0).integer(),
    }),
    defineField({
      name: 'variants',
      title: 'Variants',
      type: 'array',
      description:
        'One entry per purchasable option (e.g. each size). Leave empty for a single-SKU product ' +
        'and use the base price/stock above.',
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
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{type: 'productCategory'}],
      description: 'Powers the /merch filters.',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
    }),
    defineField({
      name: 'taxCode',
      title: 'Stripe tax code',
      type: 'string',
      description:
        'Stripe Tax product tax code (e.g. txcd_99999999 general goods, txcd_30011000 apparel). ' +
        'Falls back to the store default when blank.',
    }),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  orderings: [
    {title: 'Manual order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]},
    {title: 'Title A–Z', name: 'titleAsc', by: [{field: 'title', direction: 'asc'}]},
  ],
  preview: {
    select: {title: 'title', media: 'images.0', subtitle: 'price', order: 'order'},
    prepare({title, media, subtitle, order}) {
      const price = subtitle ? `$${subtitle}` : ''
      const pos = typeof order === 'number' ? `#${order}` : ''
      return {title, media, subtitle: [pos, price].filter(Boolean).join(' · ')}
    },
  },
})
