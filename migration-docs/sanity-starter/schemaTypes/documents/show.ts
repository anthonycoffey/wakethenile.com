import {defineType, defineField} from 'sanity'

/**
 * Tour date. Replaces the WordPress ACF `show` CPT and the plugin's
 * "Show Fields" Gutenberg blocks (venue-name, show-date, tickets-link,
 * city-state, google-map). "Upcoming vs past" is derived from `date` in
 * GROQ at build time (no auto-publish hook needed).
 */
export const show = defineType({
  name: 'show',
  title: 'Show',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (Rule) => Rule.required()}),
    defineField({
      name: 'date',
      title: 'Date & time',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      description: 'Real datetime. (Old ACF stored this as text d/m/Y g:i a — parse on import.)',
    }),
    defineField({name: 'venueName', title: 'Venue name', type: 'string'}),
    defineField({name: 'city', title: 'City', type: 'string'}),
    defineField({name: 'state', title: 'State', type: 'string'}),
    defineField({
      name: 'ticketsUrl',
      title: 'Tickets URL',
      type: 'url',
      validation: (Rule) => Rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({
      name: 'ticketsLabel',
      title: 'Tickets button label',
      type: 'string',
      initialValue: 'Get Tickets',
    }),
    defineField({
      name: 'location',
      title: 'Venue location (map)',
      type: 'geopoint',
      description: 'Replaces the ACF Google Map field. Drives the venue map + directions link.',
    }),
    defineField({name: 'soldOut', title: 'Sold out', type: 'boolean', initialValue: false}),
    defineField({name: 'seo', title: 'SEO', type: 'seo'}),
  ],
  orderings: [
    {title: 'Date (soonest)', name: 'dateAsc', by: [{field: 'date', direction: 'asc'}]},
    {title: 'Date (latest)', name: 'dateDesc', by: [{field: 'date', direction: 'desc'}]},
  ],
  preview: {
    select: {title: 'title', date: 'date', city: 'city', state: 'state'},
    prepare({title, date, city, state}) {
      const when = date ? new Date(date).toLocaleDateString() : 'TBD'
      const where = [city, state].filter(Boolean).join(', ')
      return {title, subtitle: `${when}${where ? ' · ' + where : ''}`}
    },
  },
})
