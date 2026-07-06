// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { FontaineTransform } from 'fontaine';

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
    plugins: [
      tailwindcss(),
      // Generate metric-adjusted fallback @font-face rules for the self-hosted
      // Martel Sans so the system fallback matches the brand font's metrics.
      // Eliminates the font-swap Cumulative Layout Shift (the carousel region
      // reflowing when the late web font loads) without hiding the brand font.
      // See ADR 0005. Fallbacks stay close to the --font-sans stack in tokens.css.
      FontaineTransform.vite({
        fallbacks: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        resolvePath: (id) => new URL(`.${id}`, import.meta.url),
        // Force a fixed name so tokens.css can reference the generated face in
        // the --font-sans stack (fontaine doesn't rewrite CSS-variable values,
        // and it derives names from the font's first family word — "Martel").
        overrideName: () => 'Martel Sans Fallback',
      }),
    ],
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
