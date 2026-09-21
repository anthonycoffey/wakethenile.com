# Spec: Post-show site reset (after the Sept 19 album release show)

- **Status:** Active
- **Date:** 2026-09-21
- **Related:** [early-bird-sold-out.md](./early-bird-sold-out.md),
  [albumrelease-consolidate-releaseparty.md](./albumrelease-consolidate-releaseparty.md),
  ADR [0006](../adrs/0006-live-show-ticket-presale-on-stripe-store.md)

## Problem

The album release show happened. The site is still selling it: the home page pushes tickets, `/shows`
carries a "sold out / door only" banner and a live "Get Tickets" button, `/music` is fronted by
old single art with only four songs, and `/albumrelease` + `/releaseparty` still serve the presale funnel.
The site should now present the finished album instead. This is the first batch of changes; more will follow.

## Changes

| # | Surface | Change |
|---|---|---|
| 1 | `/` (home) | The "Get Tickets To Our Album Release Party" CTA no longer renders |
| 2 | `/shows` | The "sold out" banner is removed. Any show whose date has passed renders greyed out with a non-clickable "Get Tickets" button (currently: Album Release Party) |
| 3 | `/music` | Banner/background is the *Obuntu* album art; the track list is the full 9-song album in album order, each row using the album art as its icon and its own inline player |
| 4 | `/albumrelease`, `/releaseparty` | 301 to `/shows` (`/superfans` too, so it doesn't chain through `/releaseparty`) |

### 1. Home CTA

The CTA is Sanity content (`page-home.ctaLabel` / `ctaHref`). `src/pages/index.astro` drops those two
fields before rendering rather than editing the document, for the same reason as
[early-bird-sold-out.md](./early-bird-sold-out.md): preview and production share one dataset, so a data
write would land in production before the change is reviewed, while a code change ships atomically with the
merge. The stale values are still in Sanity; clear them in Studio (Home page → CTA) whenever convenient and
then the two-line strip in `index.astro` can go.

### 2. Past shows

`ShowList` already splits shows into `upcoming` / `past` (by `dateTime(date) < now()` in the GROQ
queries), so "past" is data-driven — no per-show flag to maintain, and the next show renders normally
until its date passes. `ShowCard` takes an `isPast` prop: the row is dimmed and the ticket link becomes a
`<span aria-disabled="true">` styled as a disabled outline button (no `href`, no hover, no pointer). It
takes precedence over the "Sold Out" label. The `EarlyBirdBanner` is removed from `/shows`.

> Site is statically built, so a show flips to "past" on the first deploy after its start time, not the
> instant it starts.

### 3. Music

- Art: `public/images/obuntu-cover.jpg` (1600 px, hero) and `obuntu-cover-thumb.jpg` (240 px, track icons),
  both derived from the 3000×3000 final cover art.
- Hero: the CMS cover image (`page-music.coverImage`) is no longer used on this page. The square art sits
  centred on a field of its own edge red (`#d4101a`, sampled from the art) so it reads as a full-bleed
  banner at any width without cropping the *OBUNTU* wordmark, fading into the page background at the bottom.
- Track order (from the sequenced album files): 1 Lamb, 2 Fall, 3 Mercy, 4 Dance, 5 Drifting Away,
  6 Elements, 7 Walk (Run), 8 Champion, 9 Matter.
- Every row now has an inline player; the "Early Access" CTA on Drifting Away is gone now that the album
  is out (the `/drifting` email gate page itself is untouched).
- Audio: `lamb`, `mercy`, `champion`, `drifting-away` reuse the mp3s already in `public/audio/`. `fall`,
  `dance`, `elements`, `walk`, `matter` are the 320 kbps mp3s from the album masters (`... 48-24.mp3`).
  All are `preload="none"`, so nothing downloads until Play.
- The old per-single cover JPGs in `public/images/` are no longer referenced by `/music` (still used by `/drifting`).

### 4. Redirects

`public/_redirects`: `/albumrelease`, `/releaseparty`, `/superfans` → `/shows` (301). The ticket-product
redirect in `src/pages/merch/[slug].astro` also points straight at `/shows` instead of `/albumrelease` to avoid
a two-hop. `src/pages/albumrelease.astro` is left in the tree, dormant behind the redirect, so the
presale funnel is easy to lift for the next show.

## Not affected

`/ticket`, `/attendees`, `/api/checkin`, order emails, and QR check-in for people who already bought.
`EARLY_BIRD_SOLD_OUT` and the checkout guard stay on — online ticket sales remain closed.
