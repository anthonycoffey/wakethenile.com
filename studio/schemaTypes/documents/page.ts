import {defineType, defineField} from 'sanity'

/**
 * A "cover" page — a single full-screen (100vh) section with a background cover
 * image, an optional colored overlay, optional heading/subheading, and an
 * optional call-to-action button. One template renders Music, Connect, and any
 * similar page; the homepage is the same template with `isHome` (shows the
 * wordmark instead of a heading).
 *
 * Design is owned by the Astro template — the client edits content only.
 */
export const page = defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required(),
      description: 'Internal/admin label and SEO title.'}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
      description: 'URL path, e.g. "music", "connect", "champion".',
    }),
    defineField({
      name: 'isHome',
      title: 'Use as homepage',
      type: 'boolean',
      initialValue: false,
      description: 'The homepage shows the Wake the Nile wordmark instead of a heading. Exactly one page should have this set.',
    }),
    defineField({
      name: 'coverImage',
      title: 'Cover image',
      type: 'image',
      options: {hotspot: true},
      description: 'Full-screen background image for the section.',
    }),
    defineField({
      name: 'overlay',
      title: 'Image overlay',
      type: 'object',
      options: {collapsible: true, collapsed: false},
      description: 'Optional colored overlay on top of the cover image.',
      fields: [
        {name: 'enabled', title: 'Enable overlay', type: 'boolean', initialValue: true},
        {
          name: 'color',
          title: 'Overlay color (hex)',
          type: 'string',
          initialValue: '#000000',
          description: 'e.g. #000000 for a dark wash, #ddae2d for a gold tint.',
          validation: (Rule) =>
            Rule.regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {name: 'hex color'}).warning(
              'Use a hex color like #000000',
            ),
        },
        {
          name: 'opacity',
          title: 'Overlay opacity (0–1)',
          type: 'number',
          initialValue: 0.4,
          validation: (Rule) => Rule.min(0).max(1),
        },
        {
          name: 'duotone',
          title: 'Gold duotone effect',
          type: 'boolean',
          initialValue: false,
          description: 'Apply the brand gold duotone filter to the cover image.',
        },
      ],
    }),
    defineField({name: 'heading', title: 'Title', type: 'string',
      description: 'Optional. Hidden on the homepage (wordmark shows instead).'}),
    defineField({name: 'subheading', title: 'Subtitle', type: 'string', description: 'Optional.'}),
    defineField({name: 'ctaLabel', title: 'Button text', type: 'string', description: 'Optional CTA button.'}),
    defineField({name: 'ctaHref', title: 'Button link', type: 'string', description: 'URL or path for the CTA button.'}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  preview: {
    select: {title: 'title', slug: 'slug.current', isHome: 'isHome', media: 'coverImage'},
    prepare({title, slug, isHome, media}) {
      return {title: isHome ? `🏠 ${title}` : title, subtitle: `/${slug ?? ''}`, media}
    },
  },
})
