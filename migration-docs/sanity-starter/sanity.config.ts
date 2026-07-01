import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

/**
 * Studio config. Works standalone (`sanity dev`) or embedded in Astro via
 * @sanity/astro's `studioBasePath` (e.g. "/admin").
 *
 * Replace projectId/dataset with your values from sanity.io/manage.
 * Keep apiVersion in sync with the Astro integration.
 */
export default defineConfig({
  name: 'wakethenile',
  title: 'Wake the Nile',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'YOUR_PROJECT_ID',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            // Singleton: Site settings
            S.listItem()
              .title('Site settings')
              .id('siteSettings')
              .child(S.document().schemaType('siteSettings').documentId('siteSettings')),
            S.divider(),
            // Collections
            S.documentTypeListItem('page').title('Pages'),
            S.documentTypeListItem('release').title('Releases'),
            S.documentTypeListItem('show').title('Shows'),
            S.documentTypeListItem('video').title('Videos'),
            S.documentTypeListItem('post').title('Blog posts'),
            S.documentTypeListItem('product').title('Merch'),
          ]),
    }),
    visionTool(), // GROQ playground; remove in production if desired
  ],

  schema: {
    types: schemaTypes,
    // Hide the singleton from the global "create new" menu.
    templates: (templates) => templates.filter((t) => t.schemaType !== 'siteSettings'),
  },
})
