# The Videos page — how it works & video hosting

> Migrated from GitHub issue [#6](https://github.com/anthonycoffey/wakethenile.com/issues/6).
> Living documentation.

## What the visitor sees

`/videos` is a **3D coverflow carousel** of vertical (9:16) music videos. The centered clip
autoplays **muted**; a **Tap to Unmute** control sits dead-center. Tapping enables sound, and
swiping/arrows move between clips. Once unmuted, subsequent clips **auto-play with audio**.

## How it works (component: `src/components/VideoCoverflow.tsx`)

- Built on **Swiper** (`effect: 'coverflow'`), hydrated with `client:load` (it's the primary
  above-the-fold feature, so it must always be interactive).
- **Browser autoplay policy:** browsers only allow *muted* autoplay. Audible playback must be
  initiated by a **user gesture**. So the unmute handler unmutes **and** calls `play()`
  synchronously inside the tap; after that first interaction, later slides can auto-play with sound
  ("sticky activation").
- The unmute control uses the `swiper-no-swiping` class so the tap isn't swallowed by Swiper's swipe
  handling, while the rest of the video still swipes.
- **Performance:** only the **active** clip preloads fully (`preload="auto"`); the others load
  `metadata` only — otherwise all clips download at once (~68 MB) and stall the browser.

## Where videos are hosted (important)

Currently the `.mp4` files live in **`public/videos/`** and are committed to the repo, so the
Cloudflare Pages **Git build** deploys them (served from the CDN at `/videos/*.mp4`).

### History / gotcha

They were originally **gitignored** and uploaded separately via `wrangler`. After switching to the
Git-connected build, they 404'd (not in the repo) — so videos silently wouldn't play. Fix was to
commit them (each is < 25 MB, Cloudflare's per-file limit).

### Recommended long-term: Cloudflare Stream

Committing large binaries bloats git. The proper home is **Cloudflare Stream** (adaptive streaming,
no size/limit issues). The `video` schema **already supports it**:

- `source: 'stream'` + `streamId` → renders a Stream `<iframe>`
- `source: 'url'` + `videoUrl` → renders a `<video>` (current setup)

Migration = upload clips to Stream, switch each `video` doc to `source: 'stream'` with its
`streamId`, then delete the mp4s from git. (Tracked separately when we do it.)

## Managing videos (in Studio)

Each **Video** doc has: `title`, `source` (`url` | `stream`), `videoUrl` **or** `streamId`,
`poster` (thumbnail image), and `order` (carousel position). Add a doc → publish → the deploy
webhook rebuilds → it appears in the coverflow.

## Related

- Video hosting migration to Stream (future)
- Deploy webhook: issue [#5](https://github.com/anthonycoffey/wakethenile.com/issues/5)
