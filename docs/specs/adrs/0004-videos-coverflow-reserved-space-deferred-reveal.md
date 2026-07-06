# ADR 0004: Reserved space + deferred reveal for the videos coverflow

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** Anthony Coffey

## Context

`/videos` is a Swiper 3D coverflow carousel rendered as a `client:load` React island
(`src/components/VideoCoverflow.tsx`). It is the primary above-the-fold feature of the page.

On first paint — before Swiper's JavaScript initializes and hydrates — the slides render as a
plain, left-aligned strip (`slidesPerView="auto"`, each slide `min(68vw, 360px)` wide, no
transform applied). When Swiper finishes initializing, it centers the active slide and applies the
coverflow 3D transforms, so the whole strip visibly **jumps** from left-aligned to
centered-with-rotation. That reflow is a **Cumulative Layout Shift (CLS)** and reads as the carousel
"shuffling around" as it loads — it degrades the Lighthouse performance score and looks unpolished
for a media-heavy page.

This is a well-known failure mode for hydrated carousels. The industry-standard remedies are: (1)
**reserve the final layout footprint up front** so hydration cannot move anything in document flow,
and (2) **suppress the flash of un-initialized content** — Swiper's own documentation recommends
keeping the carousel hidden until it reports initialization complete. We wanted a fix that keeps the
existing Swiper/coverflow design (no library swap) and adds no new dependencies.

Options considered:

- **Do nothing / accept the shift** — rejected; it's the exact problem being reported.
- **Replace Swiper with a CSS-only carousel** — rejected; disproportionate to the problem, loses the
  coverflow effect and the existing autoplay/unmute behavior documented in
  [`documentation/videos-page.md`](../../documentation/videos-page.md).
- **Reserve space + skeleton + deferred reveal (chosen)** — minimal, framework-agnostic, no new
  deps, keeps the component's behavior intact.

## Decision

We will render the coverflow inside a **fixed-height "stage"** that occupies the carousel's final
footprint from the first paint, and **defer revealing Swiper until it has initialized**:

- The stage (`.coverflow__stage`) has an explicit height derived from the slide dimensions
  (`--slide-w` / `--media-h`), so it reserves the space in document flow regardless of Swiper's
  internal state. Swiper and a skeleton are both absolutely positioned inside it, so neither
  contributes to flow height — **CLS is structurally zero**.
- A **poster-based skeleton** (a static mock of the coverflow: a bright center card flanked by two
  dimmed side cards, using the videos' poster images) fills the stage until the carousel is ready,
  so the reserved space reads as the media already loading rather than as an empty box.
- Swiper is held at `opacity: 0` and revealed (`.coverflow.is-ready`) only when its `onSwiper`
  callback fires — i.e. after init, when the centered coverflow transform is already applied. The
  skeleton cross-fades out as Swiper fades in, so the user sees a smooth reveal of the
  already-centered layout instead of a jump.

The fix is CSS + a single `ready` state flag; no new dependencies and no change to the existing
autoplay/unmute/playback behavior.

## Consequences

- **CLS on `/videos` is eliminated by construction** — measured at `0` during load/hydration in
  local verification (the reserved stage stays a fixed height throughout). This lifts the Lighthouse
  layout-stability signal for the page.
- **Perceived load is smoother** — the poster skeleton gives an enterprise "large media already
  loading" feel, and the carousel fades in rather than snapping into place.
- **The stage height is derived, not measured.** It is sized from `--media-h` plus a fixed allowance
  for the title and pagination. If the slide sizing, the title area, or the pagination spacing
  changes materially, the stage-height allowance in `VideoCoverflow.tsx` must be revisited so the
  reserved box still matches the rendered carousel (a mismatch shows as a gap or a clipped title,
  not as CLS). Titles are expected to stay short (one to two lines).
- **Applies to both hosting paths.** The reserved stage and reveal wrap the whole carousel, so it
  works for the current `<video>` slides and for the future Cloudflare Stream `<iframe>` slides
  (see [`documentation/videos-page.md`](../../documentation/videos-page.md)) without further change.
- Skeleton poster images are fetched eagerly (`loading="eager"`) so the placeholder is populated
  immediately; these are the same posters the slides use, so there is no extra unique download.
