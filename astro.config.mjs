// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// Phase A is fully static (no server routes) → no adapter needed; deploy dist/
// to Cloudflare Pages. When v2 adds a contact Worker, re-add @astrojs/cloudflare
// and switch output to 'server'/'hybrid'.
export default defineConfig({
  site: 'https://wakethenile.com',
  output: 'static',
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
