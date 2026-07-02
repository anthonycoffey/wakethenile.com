import {defineType, defineField} from 'sanity'

/**
 * A merch category (custom taxonomy). Create these in Studio (e.g. "Apparel",
 * "Accessories", "Vinyl") and assign one to each product to power the /shop
 * filters. Add as many as you like — no code change needed.
 */
export const productCategory = defineType({
  name: 'productCategory',
  title: 'Product category',
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
    defineField({name: 'order', title: 'Sort order', type: 'number', initialValue: 0}),
  ],
  orderings: [{title: 'Sort order', name: 'order', by: [{field: 'order', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'slug.current'}},
})
