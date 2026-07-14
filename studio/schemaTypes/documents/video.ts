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
      type: 'string',
      description: 'Absolute URL or a site-relative path like /videos/clip.mp4.',
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
    defineField({
      name: 'enabled',
      title: 'Show in slider',
      type: 'boolean',
      description: 'Uncheck to hide from the /videos page without deleting it.',
      initialValue: true,
    }),
    defineField({name: 'relatedRelease', title: 'Related release', type: 'reference', to: [{type: 'release'}]}),
  ],
  orderings: [{title: 'Manual order', name: 'orderAsc', by: [{field: 'order', direction: 'asc'}]}],
  preview: {
    select: {title: 'title', media: 'poster', subtitle: 'source', enabled: 'enabled'},
    prepare({title, media, subtitle, enabled}) {
      return {title: enabled === false ? `${title} (hidden)` : title, media, subtitle}
    },
  },
})
