// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// The site stays STATIC: every marketing/merch page is prerendered. The
// Cloudflare adapter is enabled only so the few commerce endpoints under
// src/pages/api/* (and the checkout return page) can opt into on-demand
// rendering via `export const prerender = false`. The adapter emits
// _worker.js + _routes.json into dist/, so `wrangler pages deploy dist`
// (and the Git-connected Pages build) work unchanged.
export default defineConfig({
  site: 'https://wakethenile.com',
  output: 'static',
  adapter: cloudflare({
    // Expose Cloudflare env/bindings via `locals.runtime` during `astro dev`.
    platformProxy: { enabled: true },
  }),
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // Emit flat files (/videos.html) instead of /videos/index.html so Cloudflare
    // Pages serves clean, extensionless URLs with NO trailing-slash redirect.
    format: 'file',
    // Inline CSS into the document head to kill the render-blocking round-trip.
    inlineStylesheets: 'always',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
});
