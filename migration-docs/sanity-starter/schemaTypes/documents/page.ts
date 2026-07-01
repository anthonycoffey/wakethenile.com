import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * A page = a fixed TEMPLATE + the content fields that template expects.
 *
 * The `template` selects a developer-built layout (locked design). The client edits
 * content only: the page title, and the content of each `section`. They cannot change
 * the design — that's the template's job. Need a new look? Add a new template option
 * here and build it in Astro; the editing experience stays the same.
 *
 * Powers: Music (home), Connect, Champion, Mercy, Privacy Policy, Lamb, etc.
 */
export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
      description: 'URL path, e.g. "music", "connect", "champion", "privacy-policy".',
    }),
    defineField({
      name: 'template',
      title: 'Template',
      type: 'string',
      description: 'The prebuilt layout for this page. Controls the design; built by the developer.',
      options: {
        list: [
          {title: 'Landing (full-screen sections)', value: 'landing'},
          {title: 'Song / single landing', value: 'songLanding'},
          {title: 'Simple content page', value: 'simple'},
        ],
        layout: 'radio',
      },
      initialValue: 'landing',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'isHome',
      title: 'Use as homepage',
      type: 'boolean',
      initialValue: false,
      description: 'Exactly one page should have this set.',
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      of: [defineArrayMember({type: 'fullScreenSection'})],
      description: 'The content for each section of the page. Design is fixed by the template.',
    }),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  preview: {
    select: {title: 'title', slug: 'slug.current', isHome: 'isHome', template: 'template'},
    prepare({title, slug, isHome, template}) {
      return {title: isHome ? `🏠 ${title}` : title, subtitle: `/${slug ?? ''} · ${template ?? 'landing'}`}
    },
  },
})
