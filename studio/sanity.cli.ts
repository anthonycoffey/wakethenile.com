import { defineCliConfig } from 'sanity/cli';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'c7fly3e4';
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineCliConfig({
  api: { projectId, dataset },
  studioHost: 'wakethenile',
  autoUpdates: true,
});
