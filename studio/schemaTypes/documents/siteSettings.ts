import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * Singleton. Enforced via structure + a fixed document id ("siteSettings")
 * in sanity.config.ts.
 */
export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Site title', type: 'string', initialValue: 'Wake the Nile'}),
    defineField({name: 'tagline', title: 'Tagline', type: 'string'}),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
    }),
    defineField({
      name: 'nav',
      title: 'Primary navigation',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            {name: 'label', type: 'string', title: 'Label'},
            {name: 'href', type: 'string', title: 'URL / path'},
          ],
          preview: {select: {title: 'label', subtitle: 'href'}},
        }),
      ],
    }),
    defineField({
      name: 'merchEnabled',
      title: 'Show merch in navigation',
      type: 'boolean',
      description:
        'When off, the Merch link is hidden from the site navigation on the live (production) ' +
        'site. The /merch page still exists but is unlinked — turn this off to launch the site ' +
        'while the store is still in progress. Note: preview deploys always show the Merch link ' +
        'regardless of this toggle, so the store can be reviewed before launch.',
      initialValue: true,
    }),
    defineField({
      name: 'socials',
      title: 'Social links',
      type: 'array',
      of: [defineArrayMember({type: 'socialLink'})],
    }),
    defineField({
      name: 'defaultSeo',
      title: 'Default SEO',
      type: 'seo',
    }),
    defineField({
      name: 'analytics',
      title: 'Analytics',
      type: 'object',
      options: {collapsible: true, collapsed: true},
      fields: [
        {name: 'ga4Id', title: 'GA4 Measurement ID', type: 'string'},
        {name: 'cloudflareToken', title: 'Cloudflare Web Analytics token', type: 'string'},
      ],
    }),
    defineField({name: 'footerText', title: 'Footer text', type: 'string'}),
  ],
  preview: {prepare: () => ({title: 'Site settings'})},
})
