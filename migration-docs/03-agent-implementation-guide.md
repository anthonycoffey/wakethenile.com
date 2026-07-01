# 03 — Agent Implementation Guide

**Audience: an LLM coding agent.** This is a prescriptive build script for the new wakethenile.com.
Follow steps in order. Each step has an explicit **acceptance check** — do not proceed until it
passes. Where a choice exists, a default is given; if the human has recorded a different DECISION
(see `02-architecture.md`), honor that instead.

> ## Scope: tonight is a 1:1 migration
>
> The goal of this build session is a **faithful 1:1 reproduction** of the current site on the new
> stack, deployed to Cloudflare. Build **Steps 1–9 and 11** tonight. **Step 10 (v2: blog, Spotify/
> presale, merch) is explicitly OUT of scope tonight** — those are planned with the client in the
> next meeting and built incrementally afterward (roadmap Phase D). Don't build v2 features now;
> just make sure the schema/templates don't preclude them.
>
> **Build philosophy — templatized, not a page builder.** Design lives in fixed Astro templates
> that you build. Content lives in constrained Sanity fields (titles, subtitles, body, images, show
> dates). Do not add design controls (color/spacing/layout pickers, drag-and-drop section building)
> to the CMS. A new layout is a new template you write — never a client-facing builder.

## Context you must load first

- Read `00-wordpress-audit.md` for the exact content, the `show`/`video` data model, the custom
  plugin behaviors to replicate, and the brand tokens.
- Read `02-architecture.md` for stack + DECISIONs.
- The Sanity schema to use lives in `sanity-starter/` — copy it, don't reinvent it.
- The old WordPress site lives in `wordpress/` (DB at `wordpress/wordpress_db.sql`, files at
  `wordpress/wordpress_files/`). Use it as a read-only reference for content and assets.

## Ground rules

1. **Static output only.** No SSR pages. The only server code permitted is an optional
   `/api/contact` Worker route (Step 9).
2. **Never commit media.** No images/videos from `wordpress/wp-content/uploads` go into the repo.
   Content images → Sanity; videos → the chosen video host. Only logo/favicon/og-image go in
   `public/`.
3. **Pin versions** at install and record them in `package.json`. Re-check changelogs for breaking
   changes (Astro 6.x, `@sanity/astro` 3.4.x, `sanity` 5.28.x as of June 2026).
4. **Brand:** background `#1a1919`, accent/gold `#ffd17b`, surface `#161616`. Dark theme.
5. Preserve existing URL paths (`/music`, `/videos`, `/shows`, `/connect`, `/contact-us`,
   `/privacy-policy`, `/champion`, `/mercy`, `/lamb`).

---

## Step 1 — Scaffold the Astro project

```bash
npm create astro@latest -- --template minimal --typescript strict --no-install --no-git .
npm install
npm install @sanity/astro @astrojs/react react react-dom @sanity/image-url astro-portabletext swiper
# CSS: pick one. Tailwind is fine; or plain CSS with custom properties.
npx astro add tailwind   # optional
```

Move the WordPress export out of the working tree so it doesn't get bundled or linted:

```bash
mkdir -p _archive && git mv wordpress _archive/wordpress 2>/dev/null || mv wordpress _archive/wordpress
echo "_archive/" >> .gitignore
```

**Acceptance:** `npm run build` produces `./dist` with a placeholder page; `_archive/` is gitignored.

---

## Step 2 — Configure Astro + Sanity

Create `astro.config.mjs`:

```js
import {defineConfig} from 'astro/config'
import sanity from '@sanity/astro'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://wakethenile.com',
  output: 'static',
  integrations: [
    sanity({
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET ?? 'production',
      apiVersion: '2026-03-01',
      useCdn: true,            // build-time reads from CDN are fine for published content
      studioBasePath: '/admin' // embed Studio; remove if hosting Studio separately
    }),
    react(), // required for embedded Studio and React islands
  ],
})
```

Add `.env` (gitignored) and set the same vars in Cloudflare later:

```
SANITY_PROJECT_ID=xxxxx
SANITY_DATASET=production
```

> For a pure static site you do **not** need `@astrojs/cloudflare` (that adapter is for SSR). Static
> output is deployed as plain assets in Step 8. Only add the adapter if a DECISION moves a route to
> SSR.

**Acceptance:** `astro build` succeeds with the Sanity integration loaded (no projectId error).

---

## Step 3 — Bring in the Sanity schema and run Studio

- Copy `migration-docs/sanity-starter/schemaTypes/` → `src/sanity/schemaTypes/` (or a `/studio`
  folder) and `sanity.config.ts` to the project root (or `/studio`).
- Point the embedded Studio at that config (the `@sanity/astro` `studioBasePath` mounts it).
- In `sanity.io/manage` → API → CORS origins, add: `http://localhost:4321`, the `*.workers.dev`
  preview, and `https://wakethenile.com`.

**Acceptance:** visiting `/admin` locally loads the Studio; you can create a `siteSettings`
document and one `page`.

---

## Step 4 — Sanity client, image helper, and queries

`src/lib/sanity.ts`:

```ts
import {sanityClient} from 'sanity:client'
import imageUrlBuilder from '@sanity/image-url'

export const client = sanityClient
const builder = imageUrlBuilder(client)
export const urlFor = (source: any) => builder.image(source)
```

`src/lib/queries.ts` (GROQ):

```ts
import groq from 'groq'

export const siteSettingsQuery = groq`*[_type == "siteSettings"][0]`

export const pageBySlugQuery = groq`*[_type == "page" && slug.current == $slug][0]{
  ..., sections[]{...}
}`

export const homePageQuery = groq`*[_type == "page" && isHome == true][0]{ ..., sections[]{...} }`

export const allPageSlugsQuery = groq`*[_type == "page" && defined(slug.current)].slug.current`

// Videos for the coverflow, ordered.
export const videosQuery = groq`*[_type == "video"] | order(order asc){
  _id, title, source, streamId, videoUrl, poster
}`

// Upcoming vs past shows (replaces the WP auto-publish-future hook).
export const upcomingShowsQuery = groq`*[_type == "show" && dateTime(date) >= dateTime(now())]
  | order(date asc)`
export const pastShowsQuery = groq`*[_type == "show" && dateTime(date) < dateTime(now())]
  | order(date desc)`

// Blog
export const allPostsQuery = groq`*[_type == "post"] | order(publishedAt desc){
  _id, title, slug, excerpt, coverImage, author, publishedAt, tags
}`
export const postBySlugQuery = groq`*[_type == "post" && slug.current == $slug][0]`

// Releases
export const featuredReleaseQuery = groq`*[_type == "release" && featured == true]
  | order(releaseDate desc)[0]`
export const releaseBySlugQuery = groq`*[_type == "release" && slug.current == $slug][0]`
```

**Acceptance:** a temporary `.astro` page can `await client.fetch(siteSettingsQuery)` and print the
site title from Sanity at build time.

---

## Step 5 — Base layout + design system

`src/styles/global.css` — define the brand tokens:

```css
:root {
  --bg: #1a1919;
  --surface: #161616;
  --accent: #ffd17b;
  --text: #f5f5f5;
  --muted: #b8b8b8;
}
html, body { background: var(--bg); color: var(--text); margin: 0; }
a { color: var(--accent); }
.section { min-height: 100vh; display: grid; place-items: center; }
/* Optional scroll-snap for the full-screen feel */
.snap { scroll-snap-type: y mandatory; }
.snap > .section { scroll-snap-align: start; }
```

`src/layouts/BaseLayout.astro` — `<head>` (title/meta/OG from `seo` + `siteSettings.defaultSeo`),
header nav from `siteSettings.nav`, footer with socials, and the analytics tag (GA4 or Cloudflare
per DECISION). Accept `seo` and `title` props per page.

**Acceptance:** every page renders the dark/gold shell; meta tags populate from Sanity with sane
fallbacks.

---

## Step 6 — Build the core pages

Render each page from Sanity. Two patterns:

- **Fixed-route pages** with their own `.astro` file when logic is bespoke
  (`videos.astro`, `shows.astro`, `contact-us.astro`).
- **Template-driven `page` documents** via `src/pages/[slug].astro` using `getStaticPaths()` over
  `allPageSlugsQuery`, dispatching on the page's `template` field to the right layout and rendering
  its `sections`. Use this for Music (home via `index.astro` reading `homePageQuery`), Connect,
  Champion, Mercy, Privacy Policy, Lamb.

The template owns all design (layout, alignment, colors, background treatment). `FullScreenSection`
templates render one section's **content** — eyebrow/heading/subheading, Portable Text body
(`astro-portabletext`), image, optional CTA — and, when the section's `module` is set, mount the
matching prebuilt component (`videoCoverflow` → `VideoCoverflow`, `shows` → `ShowList`,
`latestRelease` → release card, `contactForm` → form, `merch` → `MerchGrid`). Do not read design
values off the content (there are none) — styling is in the template/CSS.

**Acceptance:** all current pages exist at their preserved paths and read from Sanity. Build has zero
broken internal links.

---

## Step 7 — Port the custom-plugin components

### 7a. Video coverflow slider (replaces `[video_coverflow]` + Swiper init)

Create `src/components/VideoCoverflow.tsx` (React island, mounted `client:visible`). Replicate the
original UX exactly (see `00-wordpress-audit.md` §"Video coverflow slider"):

- Swiper `effect: 'coverflow'`, `centeredSlides`, `slidesPerView: 'auto'`, prev/next + pagination.
- Coverflow params: `rotate: 20, depth: 150, modifier: 1, slideShadows: false`.
- Autoplay the **active** slide's video (muted), pause others on `slideChange`.
- A **"Tap to Unmute"** overlay; on first click, unmute all videos and hide overlays.
- Non-active slides dimmed (`filter: brightness(0.5)`), active full brightness.

Source the list from `videosQuery`. For Cloudflare Stream items, embed the Stream player/iframe by
`streamId`; for direct URLs, use a `<video>` tag with the `videoUrl`. Bundle `swiper` from npm (do
not load from unpkg as the old plugin did).

Pass the data from an `.astro` page into the island as props (fetch at build time, hydrate client
side):

```astro
---
import VideoCoverflow from '../components/VideoCoverflow.tsx'
import {client} from '../lib/sanity'
import {videosQuery} from '../lib/queries'
const videos = await client.fetch(videosQuery)
---
<VideoCoverflow client:visible videos={videos} />
```

**Acceptance:** `/videos` shows the coverflow; active clip autoplays muted; "Tap to Unmute" works;
prev/next + pagination work; mobile widths match the old breakpoints (280px / 220px).

### 7b. Shows list + venue map (replaces the "Show Fields" blocks)

`ShowList.astro` queries `upcomingShowsQuery` (and optionally `pastShowsQuery`). Render each show
with venue name, formatted date, city/state, a tickets button (label from `ticketsLabel`,
`target="_blank" rel="noopener"`), sold-out state, and a `VenueMap` from `location` (geopoint).

`VenueMap.astro`: build the same Google Maps embed + "Get Directions" link the plugin produced, from
`location.lat`/`location.lng` and a `PUBLIC_GOOGLE_MAPS_API_KEY` env var. (Or render a static map
image to avoid a client API key.)

**Acceptance:** `/shows` lists upcoming dates sorted ascending; tickets links and directions work;
the date renders from a real datetime (no `d/m/Y g:i a` string parsing needed).

---

## Step 8 — Deploy to Cloudflare Workers (static assets)

Create `wrangler.jsonc`:

```jsonc
{
  "name": "wakethenile",
  "compatibility_date": "2026-03-01",
  "assets": { "directory": "./dist" }
  // No "main" for a pure static deploy.
}
```

Deploy:

```bash
npm run build
npx wrangler deploy
```

Connect the Git repo to **Cloudflare Workers Builds** so pushes to `main` rebuild and deploy. Set
env vars/secrets in the Cloudflare dashboard (`SANITY_PROJECT_ID`, `SANITY_DATASET`, plus any
provider keys). For the demo, a `*.workers.dev` (or staging subdomain) URL is enough. Map the
production `wakethenile.com` domain as a custom domain on the Worker at cutover (roadmap Phase C) —
tonight or right after the client approves.

**Acceptance:** the site is live on a Cloudflare URL and rebuilds on push.

---

## Step 9 — (Optional) Contact form handler

Default per architecture DECISION. If using an on-Cloudflare handler:

- Add `"main": "./src/worker.ts"` and an `ASSETS` binding to `wrangler.jsonc`; route `POST /api/contact`
  in the Worker, send mail via Resend (`RESEND_API_KEY` secret), and fall through to
  `env.ASSETS.fetch(request)` for everything else. Verify the latest static-assets + Worker routing
  semantics in the Cloudflare docs before finalizing.
- Frontend: a progressively-enhanced `<form method="POST" action="/api/contact">` on `contact-us`
  and `lamb` with client-side validation and a success state.

Alternatively use a hosted form (HubSpot/LeadIn embed — already in the old stack — or
Formspree/Web3Forms) and skip the Worker entirely, keeping the deploy assets-only.

**Acceptance:** submitting the contact and Lamb forms delivers a message and shows a confirmation;
spam protection (honeypot/turnstile) is in place.

---

## Step 10 — v2 features (DEFERRED — do NOT build tonight)

> Out of scope for the migration session. Build these later, one at a time, after they're
> prioritized with the client (roadmap Phase D). Listed here so the data model and templates are
> designed to accommodate them. Each follows the same rule: developer builds the template, client
> fills in content.

### Blog
- `/blog` index from `allPostsQuery`: cards with cover, title, date, author, reading time, tags.
- `/blog/[slug]` from `postBySlugQuery`: metadata header (date · author · reading time), Portable
  Text body via `astro-portabletext`, and a `ShareButtons.astro` component (X, Facebook, copy-link;
  build share URLs from `Astro.site` + slug).

### Spotify / releases / presale
- `/releases/[slug]` from `releaseBySlugQuery`. Logic keyed on `releaseDate` vs now:
  - **Before release:** show cover art, countdown, and a **pre-save** CTA (`preSaveUrl`), plus an
    optional paid **presale** button (`presaleUrl`).
  - **On/after release:** embed the Spotify player from `spotifyEmbedId` (parse a share URL into the
    `https://open.spotify.com/embed/...` iframe) and show `streamingLinks`.
- `SpotifyEmbed.astro`: accepts an album/track id or URL → renders the official iframe (no API/auth).
- Surface the `featuredReleaseQuery` release on the home page.

### Merch
- Per DECISION. **Shopify Buy Button** (default for real fulfillment): include the Buy Button JS and
  render add-to-cart/cart for each product (Sanity `product` curates which Shopify handles appear, or
  query Shopify directly). **Snipcart** alt: add the Snipcart JS + `button.snipcart-add-item` with
  data attributes from the `product` doc. Keep all commerce client-side so the site stays static.

**Acceptance:** blog renders with share buttons; a release page correctly switches between
presave/stream states around its date; a test merch checkout completes.

---

## Step 11 — SEO, redirects, and pre-launch QA

- Generate `sitemap.xml` (e.g. `@astrojs/sitemap`) and `robots.txt`.
- Add JSON-LD: `MusicGroup` (site), `Event` (each show), `MusicAlbum`/`MusicRecording` (releases).
- Build the 301 map (roadmap Phase C). Apply via Cloudflare Bulk Redirects or a `_redirects` file.
  Most paths map 1:1; redirect `/demo-blog-post → /` (or `/blog` once it exists),
  `/maintenance-page → /`, and catch legacy `/wp-*`, `/?p=`, and feed URLs.
- Run Lighthouse; fix perf/a11y/SEO regressions. Confirm OG/Twitter cards render.

**Acceptance:** sitemap + robots present; redirect map verified against a sample of old URLs;
Lighthouse SEO ≥ 95, a11y ≥ 95.

---

## Definition of done (tonight's 1:1 migration)

- [ ] All current pages live at preserved URLs, reading from Sanity, matching the current look 1:1.
- [ ] Video coverflow + shows/venue-map render as templates fed by Sanity (same UX as today).
- [ ] Content is constrained: client can edit titles/subtitles/body/images/show dates — no design
      controls exposed in the CMS.
- [ ] No media committed to the repo; videos on the chosen host; images via Sanity CDN.
- [ ] Studio reachable; editors can publish; publish webhook triggers a rebuild.
- [ ] SEO meta + sitemap + 301 map ready; Lighthouse green.
- [ ] Deployed on Cloudflare and reachable on a preview URL for tomorrow's demo.
- [ ] Cutover (apex domain) done tonight or staged for client approval — rollback via DNS available.
- [ ] v2 (blog/Spotify/presale/merch) is intentionally **not** built yet — deferred to Phase D.
