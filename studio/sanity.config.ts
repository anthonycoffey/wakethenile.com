import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'c7fly3e4';
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
  name: 'wakethenile',
  title: 'Wake the Nile',
  projectId,
  dataset,

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
              .child(
                S.document().schemaType('siteSettings').documentId('siteSettings'),
              ),
            S.divider(),
            // Phase A collections
            S.documentTypeListItem('page').title('Pages'),
            S.documentTypeListItem('show').title('Shows'),
            S.documentTypeListItem('video').title('Videos'),
            // Deferred (v2) — present in schema, kept out of the way for now
            S.divider(),
            S.documentTypeListItem('release').title('Releases (v2)'),
            S.documentTypeListItem('post').title('Blog posts (v2)'),
            S.documentTypeListItem('product').title('Merch (v2)'),
          ]),
    }),
    visionTool({ defaultApiVersion: '2026-03-01' }),
  ],

  schema: {
    types: schemaTypes,
    // Hide the singleton from the global "create new" menu.
    templates: (templates) => templates.filter((t) => t.schemaType !== 'siteSettings'),
  },
});
