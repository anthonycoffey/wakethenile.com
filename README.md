# Wake the Nile

Astro 5 (static) + Sanity + Cloudflare Pages — the WordPress→headless rebuild of
[wakethenile.com](https://wakethenile.com). Content-only CMS: developers own design (Astro
templates), the client owns content (Sanity). No page builder.

- **Live preview:** https://wakethenile.pages.dev
- **Editing Studio:** https://wakethenile.sanity.studio
- **Sanity project:** `c7fly3e4` / dataset `production`

## Stack
- **Astro 5** static (`output: 'static'`, `build.format: 'file'` → clean extensionless URLs,
  no trailing slash), `@sanity/client` + `@sanity/image-url`, **Tailwind v4**, React islands.
- **Martel Sans** (approved brand font), self-hosted via `@fontsource/martel-sans`.
- Dark/gold brand tokens in `src/styles/tokens.css` (`--accent: #ffd17b`).
- **Video coverflow** = Swiper React island (`src/components/VideoCoverflow.tsx`) — autoplays
  the active muted clip, tap-to-unmute, 3D coverflow. Mirrors the old WP plugin UX.
- **Forms** = the live site's existing HubSpot embeds (portal `243317127`).
- **Video hosting** = Cloudflare Pages static files at `/videos/*.mp4` (compressed ~66 MB total,
  each < 25 MB → fits Pages free tier; relative URLs survive the move to wakethenile.com).
  R2 was the original plan but isn't enabled on the account; Pages-static is free and simpler.

## Develop
```bash
npm install
cp .env.example .env      # fill in Sanity values (already set locally)
npm run dev               # http://localhost:4321
npm run studio:install    # one-time
npm run studio:dev        # http://localhost:3333
npm run build             # → dist/
```
Video files live in `_archive/video-optimized/` and are copied to `public/videos/`
(gitignored — not tracked, but included in the build/deploy).

## Deploy (Cloudflare Pages — direct upload)
```bash
export CLOUDFLARE_ACCOUNT_ID=e509e14d0d0c385b0aec7f70282c949f   # Info@freedarecords.com's account
npm run build
npx wrangler pages deploy dist --project-name wakethenile --branch main --commit-dirty=true
```

## Content edits → live
The site is static; content is baked in at build time. After editing in the Studio, **rebuild +
redeploy** to publish changes (the two commands above). There is no auto-rebuild webhook yet — see
Next steps.

## Seeding / re-seeding content
```bash
node --env-file=.env scripts/seed.mjs   # idempotent; createOrReplace on fixed _ids
```
Uploads logo/hero/posters and (re)writes siteSettings, pages, shows, videos.

## Notes / decisions
- **Schema lives in two places:** the canonical source is `studio/schemaTypes/` (full validation).
  The hosted Studio + MCP tooling use an MCP-managed copy (deployed via the Sanity MCP because the
  CLI `sanity schema deploy` crashes on this Node/CLI combo and the project token lacks the
  deployStudio grant). Keep them in sync when the schema changes.
- **Shows are placeholder** sample data (the WP export's shows were fake drafts). Replace in Studio.
- **Venue maps** need `PUBLIC_GOOGLE_MAPS_API_KEY` (currently a "Get Directions" link only).
- **Analytics:** set `PUBLIC_GA4_MEASUREMENT_ID` (or `siteSettings.analytics.ga4Id`) to enable GA4.

## Next steps (post-Phase-A)
- Connect a Git repo to Cloudflare Pages + a Sanity publish webhook → auto rebuild on edit.
- Point `wakethenile.com` at the Pages project (DNS cutover) + 301 redirect map.
- v2: blog, Spotify/release/presale, merch (schemas already present, deferred).
