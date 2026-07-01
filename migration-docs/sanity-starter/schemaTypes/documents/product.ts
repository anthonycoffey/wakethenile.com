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
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            {name: 'label', type: 'string', title: 'Label (e.g. Size M)'},
            {name: 'sku', type: 'string', title: 'SKU'},
            {name: 'providerId', type: 'string', title: 'Provider price/variant ID'},
          ],
          preview: {select: {title: 'label', subtitle: 'sku'}},
        }),
      ],
    }),
    defineField({
      name: 'provider',
      title: 'Commerce provider',
      type: 'string',
      options: {list: ['shopify', 'snipcart', 'stripe']},
    }),
    defineField({
      name: 'providerHandle',
      title: 'Provider handle / product ID',
      type: 'string',
      description: 'e.g. Shopify product handle, or Stripe product id.',
    }),
    defineField({name: 'soldOut', title: 'Sold out', type: 'boolean', initialValue: false}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  preview: {
    select: {title: 'title', media: 'images.0', subtitle: 'price'},
    prepare({title, media, subtitle}) {
      return {title, media, subtitle: subtitle ? `$${subtitle}` : ''}
    },
  },
})
