# 02 — Architecture

Target architecture for the new wakethenile.com. Decisions you still need to make are tagged
**DECISION**. Everything else is a recommended default with rationale.

## 0. Editing philosophy — a templatized CMS, not a page builder

This is the core design principle, and it's the direct lesson from WordPress. The old site handed
the client a page builder (Gutenberg) and granular controls — and that's exactly what made it
fragile and unusable for them. The new site does the opposite:

- **Developer owns the design; the client owns the content.** We build elegant, on-brand templates
  once. The client fills in **content fields** — titles, subtitles, body text, images, show dates —
  that flow into those fixed templates.
- **No design controls in the CMS.** No color pickers, no margin/padding, no layout knobs, no
  drag-and-drop section builder. The client cannot break the look because the look isn't theirs to
  edit.
- **New design = new template, by the developer.** When a new layout or page type is needed, we
  build a new template and wire it to its content fields. This is a quick dev task, not a
  client-facing builder.
- **The custom Gutenberg blocks are NOT replicated as editor controls.** They existed only to work
  around WordPress limitations. Their *data* (venue, date, tickets, city/state, map, video URL)
  becomes simple Sanity fields; their *presentation* is baked into the Shows and Videos templates.
  The client adds a show date — they don't manage the design of the shows page.

Everything below serves this principle: constrained content in Sanity, fixed templates in Astro.

## 1. Stack overview

```
            ┌─────────────────────┐        publish webhook        ┌──────────────────────┐
  Editors → │   Sanity Studio      │ ───────────────────────────▶ │  Cloudflare Deploy   │
            │  (/admin or *.sanity)│                               │  Hook → Workers Build│
            └──────────┬───────────┘                               └──────────┬───────────┘
                       │ content (GROQ over HTTPS)                            │ astro build (SSG)
                       ▼                                                       ▼
            ┌─────────────────────┐    build-time fetch    ┌───────────────────────────────┐
            │   Sanity Content     │ ─────────────────────▶ │  Astro 6 (static output)       │
            │   Lake + Image CDN   │                        │  → ./dist (HTML/CSS/JS)        │
            └─────────────────────┘                        └──────────────┬────────────────┘
                                                                           │ wrangler deploy
   Video host (Cloudflare Stream / R2 / Bunny) ── playback URLs ──┐        ▼
   Commerce (Shopify Buy Button / Snipcart)  ── client JS ───────┐│  ┌──────────────────────┐
   Spotify embeds (iframe)                   ── client ──────────┘└─▶│ Cloudflare Workers     │
                                                                     │ static assets (+ tiny  │
                                                                     │ Worker for /api/contact│
                                                                     └──────────────────────┘
```

- **Astro 6, static output.** Pages are pre-rendered to HTML at build time by fetching from
  Sanity. No server runtime needed for the pages themselves.
- **`@sanity/astro` 3.x** wires the Sanity client + (optionally) embeds Studio.
- **Cloudflare Workers static assets** serve `./dist`. (The Astro Cloudflare adapter no longer
  targets Cloudflare **Pages** — Workers is the supported path now.)
- **Rebuild on publish:** a Sanity webhook calls a Cloudflare deploy hook so content edits go live
  without a developer.
- **Dynamic bits stay client-side** (Spotify iframes, commerce overlays) so the site stays static.
  The one server concession is a minimal Worker route for the contact form.

### Why this fits Wake the Nile

A 5-page informational artist site with occasional content updates is the ideal SSG case: near-zero
hosting cost, fast global delivery from Cloudflare's edge, no VM to patch, and editors get a real
CMS. It directly replaces the GCP Compute Engine VM and the WordPress maintenance burden.

## 2. Versions (June 2026 — pin at install)

| Package | Version |
|---------|---------|
| `astro` | 6.x (6.4.2 known-good) |
| `@astrojs/cloudflare` | latest 12.x line |
| `@sanity/astro` | 3.4.x |
| `@astrojs/react` | latest (needed only if embedding Studio / React islands) |
| `sanity` (Studio) | 5.28.x |
| `@sanity/image-url` | 2.1.x |
| `astro-portabletext` | 0.13.x |
| `swiper` | latest 11.x |
| Sanity `apiVersion` | `2026-03-01` |

## 3. Repository layout

```
wakethenile/
├─ migration-docs/            # this pack (can be deleted post-launch or kept in /docs)
├─ public/                    # static brand assets: favicon, logo, og-image, robots.txt
├─ sanity/                    # embedded Studio config + schema (or a separate repo)
│  ├─ sanity.config.ts
│  └─ schemaTypes/…           # see sanity-starter/
├─ src/
│  ├─ layouts/
│  │  └─ BaseLayout.astro     # <head>, design system vars, header/footer, analytics
│  ├─ components/
│  │  ├─ FullScreenSection.astro
│  │  ├─ VideoCoverflow.tsx    # Swiper island (client:visible)
│  │  ├─ ShowList.astro / ShowCard.astro
│  │  ├─ VenueMap.astro
│  │  ├─ SpotifyEmbed.astro
│  │  ├─ PresaleCTA.astro
│  │  ├─ ShareButtons.astro
│  │  └─ MerchGrid.astro / BuyButton.tsx
│  ├─ lib/
│  │  ├─ sanity.ts            # client + image-url helper
│  │  └─ queries.ts           # GROQ queries
│  ├─ pages/
│  │  ├─ index.astro          # Home / Music
│  │  ├─ videos.astro
│  │  ├─ shows.astro
│  │  ├─ connect.astro
│  │  ├─ contact-us.astro
│  │  ├─ privacy-policy.astro
│  │  ├─ lamb.astro
│  │  ├─ [slug].astro         # song/landing pages (champion, mercy) from Sanity `page`
│  │  ├─ blog/
│  │  │  ├─ index.astro
│  │  │  └─ [slug].astro
│  │  └─ releases/[slug].astro
│  └─ styles/global.css
├─ functions or src/worker.ts # optional: /api/contact handler
├─ astro.config.mjs
├─ wrangler.jsonc
└─ package.json
```

> **DECISION — Studio location:** embed Studio at `/admin` in this repo (one deploy, one domain),
> *or* keep Studio in its own repo deployed to `*.sanity.studio` (cleaner separation, independent
> deploys). Embedding is simplest for a solo maintainer; recommended default.

## 4. Content model (Sanity)

Concrete schema is in [`sanity-starter/`](./sanity-starter/). Summary:

**Singletons**
- `siteSettings` — site title, nav, social links, default SEO/OG, analytics IDs, footer.

**Documents**
- `page` — a page bound to a fixed **`template`** (e.g. `landing`, `songLanding`, `simple`) plus the
  content fields that template expects, expressed as `fullScreenSection` content blocks + `seo`.
  Powers Music/Connect/song pages/privacy, etc. `slug` drives the URL. The template controls layout;
  the client only edits content.
- `post` — blog post: title, slug, excerpt, cover, author, publishedAt, tags, `blockContent` body,
  `seo`. Enables the v2 blog.
- `show` — tour date: title, `date` (real datetime, replacing the ACF text string), `venueName`,
  `city`, `state`, `ticketsUrl`, `location` (geopoint lat/lng), `seo`. Replaces the ACF `show` CPT
  and the "Show Fields" blocks.
- `video` — title, `videoUrl`/`streamId`, `poster` image, order. Feeds the coverflow slider.
  Replaces the ACF `video` CPT.
- `release` — album/single: title, slug, type (album/single/EP), `coverArt`, `releaseDate`,
  `spotifyUrl`/`spotifyEmbedId`, streaming links, `preSaveUrl`, `presaleProduct` (optional),
  tracklist, `blockContent` notes, `seo`. **New for v2.**
- `product` — only if self-hosting merch (title, slug, images, price, variants, provider id). If
  using Shopify/Snipcart as source of truth, this can be thin or omitted.

**Shared objects**
- `seo` — metaTitle, metaDescription, ogImage, noIndex.
- `fullScreenSection` — the `100vh` section as a **content** block: eyebrow, heading, subheading,
  body (Portable Text), an image, and an optional CTA (label + link). Design (layout, alignment,
  colors, background treatment) is fixed by the template, **not** exposed to the editor. This is how
  "one big section per page" is authored without giving the client design control.
- `socialLink` — platform + url.
- `blockContent` — Portable Text config (headings, links, images, embeds).

### How the old ACF fields map

| Old (ACF / plugin) | New (Sanity `show`) |
|--------------------|---------------------|
| `venue_name` (text) | `venueName` (string) |
| `show_date` (text `d/m/Y g:i a`) | `date` (datetime) — parse/clean on import |
| `tickets_link` (url) | `ticketsUrl` (url) |
| `city`, `state` (text) | `city`, `state` (string) |
| `google_map_url` (`{lat,lng}`) | `location` (geopoint) |
| (plugin auto-publish future shows) | GROQ filter `date >= now()` for "upcoming" |
| ACF `video_url` | `video.videoUrl` / `video.streamId` |

## 5. Media strategy

This is the make-or-break decision (615 MB of video, 2.4 GB uploads).

- **Content images → Sanity.** Upload originals only. Reference via `@sanity/image-url` to get
  resized/`format=auto`/`q` URLs at render time. No thumbnail management, served from Sanity's CDN.
- **Video → a video host, never the repo.**
  - **DECISION — video host:**
    - **Cloudflare Stream** (recommended): same platform, adaptive HLS, thumbnails, signed URLs,
      simple `<stream>`/iframe embed. Best UX for the coverflow.
    - **R2 + `<video>`**: cheapest storage, but you serve raw MP4 (no adaptive bitrate); fine for a
      handful of short clips.
    - **Bunny Stream**: cheap, good player, if you want off-Cloudflare.
  - Store the playback ID/URL on the Sanity `video`/`release` doc.
- **Static brand art** (logo, favicon, OG default) lives in `public/`.

A helper script (during the media-migration step) should walk `wp-content/uploads`, skip any file matching
`-\d+x\d+\.(jpg|png|webp)` (generated sizes), and queue the rest for upload.

## 6. Dynamic features on a static site

| Feature | Approach | Notes |
|---------|----------|-------|
| **Contact / Lamb forms** | **DECISION**: (a) tiny Worker route `/api/contact` → email via Resend; (b) keep HubSpot (LeadIn) embed; (c) Formspree/Web3Forms | (a) keeps it on Cloudflare and on-brand; the Worker coexists with static assets by adding a `main` handler that only matches `/api/*`. |
| **Spotify** | `<iframe>` embed for released tracks/albums; external **pre-save** link before release | No Spotify API/auth needed for embeds. Pre-save requires a 3rd-party campaign service. |
| **Album presale** | **DECISION**: pre-save link + countdown only, *or* a paid presale via the merch provider / Stripe Payment Link / Bandcamp | Spotify "Countdown Page" + pre-save service is the streaming side; paid presale is commerce. |
| **Merch** | **DECISION**: Shopify Buy Button (recommended for real fulfillment/inventory/tax) / Snipcart (lightweight, 2% fee) / Stripe Payment Links (simplest, no cart) | All are client-side overlays — site stays static. Shopify is the most "professional artist store" path. |
| **Newsletter** | Embed/provider form on Connect | Mailchimp/Beehiiv/ConvertKit, or the same Worker handler. |
| **Analytics** | **DECISION**: GA4 (existing) or Cloudflare Web Analytics (cookieless) | Add the tag in `BaseLayout`. |

## 7. Deploy & CI

- **Build:** `astro build` → `./dist`.
- **`wrangler.jsonc`:** `assets.directory = "./dist"`; add `main` only if you include the
  `/api/contact` Worker (with `assets.not_found_handling` set appropriately).
- **CI:** connect the Git repo to **Cloudflare Workers Builds** (build on push to `main`).
- **Content rebuilds:** Sanity webhook (on publish) → Cloudflare deploy hook → rebuild. Debounce so
  rapid edits don't queue dozens of builds.
- **Env vars / secrets:** `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_VERSION`, optional
  `SANITY_READ_TOKEN` (only if you read drafts/private data), video host keys, commerce keys,
  `RESEND_API_KEY` (if using the form Worker), maps API key. Store in Cloudflare + a local `.env`
  (gitignored).

## 8. v2 "professional artist site" gap-fill (planned with the client, post-demo)

Tonight's build is a faithful 1:1 of the current site on the new stack. v2 is **not** part of that
build — it's the menu of upgrades to prioritize *with the client* in tomorrow's meeting and ship
incrementally afterward (roadmap Phase D). Each item is a new template/feature the developer builds,
then hands to the client as content fields.

- **Releases hub** with Spotify/Apple/streaming links and per-release pages (`release` template).
- **Pre-save / presale** flow tied to the album launch, with a countdown and clear CTA.
- **Merch store** with real checkout.
- **Blog / news** for release storytelling and SEO (campaigns now favor "evergreen audience
  systems" — a blog + newsletter feeds that).
- **Shows** with structured data (`Event` JSON-LD) so dates can surface in search.
- **EPK / Connect**: bio, press photos, social links, booking/contact.
- **Newsletter capture** to own the audience beyond platform algorithms.

In every case the pattern holds: developer builds the template, client supplies the content. No
page-builder controls are added for these either.

## 9. Open decisions checklist

- [ ] Homepage identity (Music vs dedicated home)
- [ ] Studio: embedded `/admin` vs standalone
- [ ] Video host (Stream / R2 / Bunny)
- [ ] Merch provider (Shopify / Snipcart / Stripe)
- [ ] Presale model (pre-save only vs paid presale)
- [ ] Contact form handler (Worker+Resend / HubSpot / Formspree)
- [ ] Analytics (GA4 / Cloudflare)
- [ ] Brand typeface (replace the system-font stack)

---

**Sources for the platform/version facts in this doc** are listed in the chat message that
accompanied delivery (Astro Cloudflare adapter → Workers; `@sanity/astro` setup; headless commerce
options; Spotify pre-save best practices).
