import {defineType, defineField} from 'sanity'

/**
 * A full-screen ("100vh") section as CONTENT, not a page builder.
 *
 * The client supplies content only — eyebrow, heading, subheading, body, an image,
 * and an optional call-to-action. ALL design (layout, alignment, colors, background
 * treatment, spacing) is owned by the Astro template that renders this section.
 * There are deliberately no color/spacing/alignment/background controls here: the
 * client cannot — and should not — manage the design from the CMS.
 *
 * If a new visual treatment is needed, the developer builds a new template (or a new
 * `module` option below); the client keeps editing the same simple content fields.
 */
export const fullScreenSection = defineType({
  name: 'fullScreenSection',
  title: 'Section',
  type: 'object',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Eyebrow / kicker',
      type: 'string',
      description: 'Small label above the heading (optional).',
    }),
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
    }),
    defineField({
      name: 'subheading',
      title: 'Subheading',
      type: 'string',
    }),
    defineField({
      name: 'body',
      title: 'Body text',
      type: 'blockContent',
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
      description: 'The section image/background. Cropping/placement is handled by the template.',
    }),
    defineField({
      name: 'cta',
      title: 'Button',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      description: 'Optional call-to-action. Styling is set by the template.',
      fields: [
        {name: 'label', title: 'Button text', type: 'string'},
        {name: 'href', title: 'Button link', type: 'string'},
      ],
    }),
    // Lets a section render a prebuilt module instead of plain content. These are
    // developer-built templates the client simply switches on — NOT design controls.
    defineField({
      name: 'module',
      title: 'Prebuilt module',
      type: 'string',
      description: 'Render a developer-built module in this section instead of plain content.',
      options: {
        list: [
          {title: 'None (content only)', value: 'none'},
          {title: 'Video coverflow slider', value: 'videoCoverflow'},
          {title: 'Shows list', value: 'shows'},
          {title: 'Latest release', value: 'latestRelease'},
          {title: 'Contact form', value: 'contactForm'},
          {title: 'Merch grid', value: 'merch'},
        ],
        layout: 'radio',
      },
      initialValue: 'none',
    }),
    defineField({
      name: 'sectionId',
      title: 'Anchor id (advanced)',
      type: 'string',
      description: 'Optional anchor for in-page links, e.g. "music". Leave blank if unsure.',
    }),
  ],
  preview: {
    select: {title: 'heading', module: 'module', media: 'image'},
    prepare({title, module, media}) {
      const isModule = module && module !== 'none'
      return {
        title: title || (isModule ? '(module section)' : '(empty section)'),
        subtitle: isModule ? `▶ ${module}` : 'Content section',
        media,
      }
    },
  },
})
