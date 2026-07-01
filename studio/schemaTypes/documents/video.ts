import {defineType, defineField} from 'sanity'

/**
 * Video for the coverflow slider. Replaces the ACF `video` CPT (`video_url`).
 * The actual file is NOT uploaded to Sanity — store the playback URL or
 * Cloudflare Stream ID and host the file on your video provider.
 */
export const video = defineType({
  name: 'video',
  title: 'Video',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'source',
      title: 'Source type',
      type: 'string',
      options: {
        list: [
          {title: 'Cloudflare Stream (id)', value: 'stream'},
          {title: 'Direct file URL (R2/Bunny/MP4)', value: 'url'},
        ],
        layout: 'radio',
      },
      initialValue: 'stream',
    }),
    defineField({
      name: 'streamId',
      title: 'Cloudflare Stream ID',
      type: 'string',
      hidden: ({parent}) => parent?.source !== 'stream',
    }),
    defineField({
      name: 'videoUrl',
      title: 'Video file URL',
      type: 'url',
      hidden: ({parent}) => parent?.source !== 'url',
    }),
    defineField({
      name: 'poster',
      title: 'Poster image',
      type: 'image',
      options: {hotspot: true},
      description: 'Shown before playback. Recommended for the coverflow.',
    }),
    defineField({
      name: 'order',
      title: 'Sort order',
      type: 'number',
      description: 'Lower numbers appear first in the slider.',
      initialValue: 0,
    }),
    defineField({name: 'relatedRelease', title: 'Related release', type: 'reference', to: [{type: 'release'}]}),
  ],
  orderings: [{title: 'Manual order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]}],
  preview: {
    select: {title: 'title', media: 'poster', subtitle: 'source'},
  },
})
