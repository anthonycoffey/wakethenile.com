# 00 — WordPress Audit (current state)

Snapshot of the existing WordPress install as extracted from `wordpress/wordpress_db.sql` and
`wordpress/wordpress_files/`. This is the source of truth the new site must reproduce or
deliberately drop.

## Environment

- **Site:** Wake the Nile (`blogname = "Wake the Nile"`, no tagline set).
- **DB export origin:** local dev (`siteurl/home = http://wake-the-nile.local`) — URLs must be
  rewritten to the production domain during migration.
- **Active theme:** `sunderland-wpcom` (a WordPress.com block/Gutenberg musician theme).
- **Permalinks:** `/%postname%/` — pretty, flat. **Preserve these paths** to keep SEO/links.
- **Front page:** `show_on_front = page` (the export's `page_on_front` was reset to 0 in dev;
  treat **Music** as the intended home, confirm before cutover).

### Brand tokens (from `sunderland-wpcom/theme.json`)

| Token | Value | Use |
|-------|-------|-----|
| Base / background | `#000000` (black) | Page background |
| Primary / Secondary / Contrast | `#ffd17b` (warm gold) | Accent, headings, buttons |
| Tertiary | `#161616` (near-black) | Surfaces/cards |
| Font | System font stack | Replace with a real brand typeface in v2 |

> The site is **dark with a gold accent**. Carry this into the new design system as CSS custom
> properties (see architecture doc).

## Active plugins (current)

`advanced-custom-fields`, `duplicate-post`, `google-site-kit`, `imagify`, `leadin` (HubSpot),
`litespeed-cache`, `redirection`, **`wake-the-nile`** (custom), `wordpress-seo` (Yoast),
`wp-maintenance-mode`.

WooCommerce, Depicter, and Gutenaforms/WPForms tables exist in the DB (so they were used at some
point), but they are **not in the active-plugins list** in this export. Treat WooCommerce as the
"merch was started here" signal (one product exists) and rebuild commerce fresh in v2.

| Plugin | Migration disposition |
|--------|----------------------|
| Advanced Custom Fields | Replaced by Sanity schema (fields become document fields) |
| wake-the-nile (custom) | Rebuilt as Astro components + Sanity types (see below) |
| Yoast SEO | Replaced by per-document SEO fields + generated sitemap/meta |
| Redirection | Replaced by Cloudflare Bulk Redirects / `_redirects` |
| LiteSpeed / Imagify | Not needed — Cloudflare CDN + Sanity image pipeline |
| Site Kit (Analytics) | Re-add analytics tag in Astro layout (GA4 / Cloudflare Web Analytics) |
| LeadIn (HubSpot) | Decide: keep HubSpot form embed, or move to a Worker form handler |
| Maintenance Mode / Duplicate Post | Not applicable |

## Content inventory

### Pages (10 total; 9 published, 1 private)

| Title | Slug | Role in new site |
|-------|------|------------------|
| Music | `/music` | **Home / landing** (full-screen hero + latest release) |
| Videos | `/videos` | Video coverflow slider page |
| Shows | `/shows` | Tour dates (from `show` type) |
| Connect | `/connect` | Social links / EPK / newsletter |
| Contact Us | `/contact-us` | Contact form |
| Champion | `/champion` | Single/song landing page |
| Mercy | `/mercy` | Single/song landing page |
| Lamb Intake Form | `/lamb` | Specialized form page (keep as-is or fold into a campaign) |
| Privacy Policy | `/privacy-policy` | Legal |
| Maintenance Page | `/maintenance-page` | Private — drop |

The "5 simple pages" the site is known by map to **Music, Videos, Shows, Connect, Contact**. The
song pages (Champion, Mercy) and Lamb form are extras to carry over.

### Posts (blog)

Effectively empty: **1 published post** ("Demo Blog Post") + 1 auto-draft. Confirms "no real blog
today." v2 introduces a proper blog from scratch — nothing meaningful to migrate.

### Custom post types (registered via ACF)

- **`show`** — 3 sample drafts (Austin Blues Fest, Jazz Fest, Lollapalooza). Tour dates.
- **`video`** — 4 published (Champion FF1/FF2/FF3, Mercy). Feed the coverflow slider.

### Commerce

- WooCommerce: **1 product** ("T-Shirt"), shop page id 22. Merch was started but not built out —
  v2 rebuilds it on a headless commerce provider.

## The custom plugin: `wake-the-nile` (v0.3.26)

A small (~1,560 LOC) plugin by Anthony Coffey. Everything it does and how it ports:

> **Porting principle:** these blocks were a *WordPress workaround*, not a requirement. They gave the
> Gutenberg editor granular controls because that was the only way to surface ACF data in the page
> builder. The new site doesn't need that. We keep the **data** (venue, date, tickets, city/state,
> map, video URL) as simple Sanity fields and bake the **presentation** into the Shows and Videos
> templates. The client adds a show date; they never manage the design of the shows page.

### 1. "Show Fields" Gutenberg blocks (server-rendered, read ACF fields)

Five dynamic blocks under a custom **"Show Fields"** category, each rendering an ACF field of the
current `show` post:

| Block | Reads ACF field | Notes |
|-------|-----------------|-------|
| `show-fields/venue-name` | `venue_name` (text) | |
| `show-fields/show-date` | `show_date` (text, stored `d/m/Y g:i a`) | Configurable PHP date format |
| `show-fields/tickets-link` | `tickets_link` (url) | Button or text link; opens new tab |
| `show-fields/city-state` | `city`, `state` (text) | Joined with separator |
| `show-fields/google-map` | `google_map_url` (ACF Google Map → `{lat,lng}`) | Embeds Google Maps iframe + "Get Directions"; needs `google_maps_api_key` option |

**Port:** these become fields on the Sanity `show` document and a single Astro `<ShowCard>` /
`<ShowDetails>` component. The Google Map becomes a static map image or a lightweight embed driven
by `lat/lng` + an API key in an env var.

### 2. Video coverflow slider (Swiper.js)

`[video_coverflow]` shortcode → queries all published `video` posts, reads ACF `video_url`, and
renders a **Swiper "coverflow"** carousel (`js/swiper-init.js`, `css/styles.css`) with:

- Centered slides, coverflow rotation, prev/next + pagination.
- Autoplay of the active slide's `<video>` (muted), pause others on slide change.
- A "**Tap to Unmute**" overlay that unmutes all videos on first interaction.

**Port:** an Astro island (client component) using Swiper, reading `video` documents from Sanity.
Same UX (coverflow, autoplay active, tap-to-unmute). Video files move off WordPress (see Media).

### 3. Behaviors / hooks

- `wp_insert_post_data` filter **auto-publishes** `show` posts scheduled in the future.
  → Not needed: in Sanity, query upcoming vs past shows by date in GROQ at build time.
- Settings page storing a **Google Maps API key** option. → Becomes an env var.
- Enqueues Swiper from `unpkg` CDN + Dashicons. → Bundle Swiper via npm in Astro.

## Asset footprint (the big one)

`wp-content/uploads` ≈ **2.4 GB**:

- **Video:** 11 files, **~615 MB** (individual files 40–77 MB; e.g. `Champion-Ff2.mp4` 77 MB,
  several `Lamb-FF*.mp4`, `Mercy-FF2-COMPRESSED.mov`).
- **Images:** ~2,093 files, ~1.7 GB — but most are WordPress-generated thumbnail variants. The set
  of **original** images is far smaller.

**Implication:** do **not** commit raw media into the Astro repo or ship 615 MB of video as static
assets. Video belongs on a video host (Cloudflare Stream, R2, or Bunny); content images belong in
Sanity (served via its image CDN with on-the-fly resizing). Pull only the originals, not the
thumbnail soup. This is the single most important media decision in the migration.

## What carries over vs. what gets dropped

**Carry over:** the 5 core pages + song pages + privacy page (as content), the `show` and `video`
content models, the video coverflow UX, the show "fields" data, the dark/gold brand, the URL paths.

**Drop:** all PHP/theme code, WP plugins, the WooCommerce/Depicter/forms DB cruft, thumbnail image
variants, maintenance page, and the local-dev URLs.
