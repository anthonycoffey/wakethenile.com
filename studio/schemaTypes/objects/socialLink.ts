import {defineType, defineField} from 'sanity'

export const socialLink = defineType({
  name: 'socialLink',
  title: 'Social link',
  type: 'object',
  fields: [
    defineField({
      name: 'platform',
      title: 'Platform',
      type: 'string',
      options: {
        list: [
          'Spotify',
          'Apple Music',
          'YouTube',
          'Instagram',
          'TikTok',
          'Facebook',
          'X',
          'Bandcamp',
          'SoundCloud',
          'Email',
        ],
      },
    }),
    defineField({name: 'url', title: 'URL', type: 'url', validation: (Rule) => Rule.required()}),
  ],
  preview: {
    select: {title: 'platform', subtitle: 'url'},
  },
})
