import {defineType, defineArrayMember} from 'sanity'

/**
 * Portable Text body content. Used by blog posts, release notes, and rich page copy.
 * Render on the Astro side with `astro-portabletext`.
 */
export const blockContent = defineType({
  name: 'blockContent',
  title: 'Body',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'H2', value: 'h2'},
        {title: 'H3', value: 'h3'},
        {title: 'H4', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      lists: [
        {title: 'Bullet', value: 'bullet'},
        {title: 'Numbered', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
        ],
        annotations: [
          {
            name: 'link',
            type: 'object',
            title: 'Link',
            fields: [
              {name: 'href', type: 'url', title: 'URL'},
              {
                name: 'blank',
                type: 'boolean',
                title: 'Open in new tab',
                initialValue: true,
              },
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: 'image',
      options: {hotspot: true},
      fields: [{name: 'alt', type: 'string', title: 'Alt text'}],
    }),
    // Inline media embed (e.g. a Spotify or YouTube URL) rendered as an iframe on the frontend.
    defineArrayMember({
      type: 'object',
      name: 'embed',
      title: 'Embed',
      fields: [
        {name: 'url', type: 'url', title: 'Embed URL'},
        {name: 'caption', type: 'string', title: 'Caption'},
      ],
      preview: {select: {title: 'url'}},
    }),
  ],
})
