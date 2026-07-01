import {defineType, defineField} from 'sanity'

/**
 * Blog post (v2). The blog index lists these; the post template renders the body
 * with a metadata block (date, author, reading time) and social share buttons.
 */
export const post = defineType({
  name: 'post',
  title: 'Blog post',
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
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      description: 'Shown on the blog index and in social previews.',
    }),
    defineField({name: 'coverImage', title: 'Cover image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'author', title: 'Author', type: 'string', initialValue: 'Wake the Nile'}),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'string'}],
      options: {layout: 'tags'},
    }),
    defineField({name: 'body', title: 'Body', type: 'blockContent'}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  orderings: [
    {title: 'Newest first', name: 'publishedDesc', by: [{field: 'publishedAt', direction: 'desc'}]},
  ],
  preview: {
    select: {title: 'title', subtitle: 'publishedAt', media: 'coverImage'},
  },
})
