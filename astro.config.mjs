// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// Fully static site. Commerce server logic runs as Cloudflare Pages Functions
// (the functions/ directory), which the Git-connected Pages build compiles
// automatically — no adapter/SSR, so the static build stays fast and deploys
// cleanly. The functions are edge-native (raw fetch to Stripe + Sanity), so no
// nodejs_compat flag or Node-version pinning is required.
export default defineConfig({
  site: 'https://wakethenile.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
