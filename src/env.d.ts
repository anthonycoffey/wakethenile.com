/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly SANITY_PROJECT_ID: string;
  readonly SANITY_DATASET: string;
  readonly SANITY_API_VERSION: string;
  readonly SANITY_READ_TOKEN?: string;
  readonly PUBLIC_GA4_MEASUREMENT_ID?: string;
  readonly PUBLIC_GOOGLE_MAPS_API_KEY?: string;
  readonly PUBLIC_R2_VIDEO_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
