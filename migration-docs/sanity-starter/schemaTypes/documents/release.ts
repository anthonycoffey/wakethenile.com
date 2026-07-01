import {defineType, defineField, defineArrayMember} from 'sanity'

/**
 * Album / single / EP. New for v2. Drives the release hub + per-release page
 * with Spotify embeds and the pre-save / presale flow.
 */
export const release = defineType({
  name: 'release',
  title: 'Release',
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
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          {title: 'Album', value: 'album'},
          {title: 'EP', value: 'ep'},
          {title: 'Single', value: 'single'},
        ],
        layout: 'radio',
      },
      initialValue: 'single',
    }),
    defineField({name: 'coverArt', title: 'Cover art', type: 'image', options: {hotspot: true}}),
    defineField({
      name: 'releaseDate',
      title: 'Release date',
      type: 'datetime',
      description: 'Used to switch the page between "pre-save / countdown" and "stream now".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'spotifyEmbedId',
      title: 'Spotify album/track ID or URL',
      type: 'string',
      description: 'Paste the Spotify share URL or the ID. Renders an embedded player after release.',
    }),
    defineField({
      name: 'preSaveUrl',
      title: 'Pre-save / pre-add URL',
      type: 'url',
      description: 'From your pre-save service (Feature.fm / Hypeddit / etc). Shown before release.',
    }),
    defineField({
      name: 'presaleUrl',
      title: 'Presale purchase URL',
      type: 'url',
      description: 'Optional paid presale (merch provider / Stripe link / Bandcamp).',
    }),
    defineField({
      name: 'streamingLinks',
      title: 'Streaming links',
      type: 'array',
      of: [defineArrayMember({type: 'socialLink'})],
      description: 'Spotify, Apple Music, YouTube, Bandcamp, etc.',
    }),
    defineField({
      name: 'tracklist',
      title: 'Tracklist',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            {name: 'title', type: 'string', title: 'Track title'},
            {name: 'duration', type: 'string', title: 'Duration (mm:ss)'},
          ],
          preview: {select: {title: 'title', subtitle: 'duration'}},
        }),
      ],
    }),
    defineField({name: 'notes', title: 'Liner notes / story', type: 'blockContent'}),
    defineField({name: 'featured', title: 'Feature on homepage', type: 'boolean', initialValue: false}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  orderings: [
    {title: 'Release date (newest)', name: 'dateDesc', by: [{field: 'releaseDate', direction: 'desc'}]},
  ],
  preview: {
    select: {title: 'title', subtitle: 'type', media: 'coverArt'},
  },
})
