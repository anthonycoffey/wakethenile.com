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
            // Content
            S.documentTypeListItem('page').title('Pages'),
            S.documentTypeListItem('show').title('Shows'),
            S.documentTypeListItem('video').title('Videos'),
            S.documentTypeListItem('release').title('Releases'),
            S.documentTypeListItem('post').title('Blog posts'),
            S.divider(),
            // Merch / commerce
            S.documentTypeListItem('product').title('Merch'),
            S.documentTypeListItem('productCategory').title('Categories'),
            S.documentTypeListItem('order').title('Orders'),
            S.listItem()
              .title('Commerce settings')
              .id('commerceSettings')
              .child(
                S.document().schemaType('commerceSettings').documentId('commerceSettings'),
              ),
          ]),
    }),
    visionTool({ defaultApiVersion: '2026-03-01' }),
  ],

  schema: {
    types: schemaTypes,
    // Hide singletons from the global "create new" menu.
    templates: (templates) =>
      templates.filter((t) => t.schemaType !== 'siteSettings' && t.schemaType !== 'commerceSettings'),
  },
});
