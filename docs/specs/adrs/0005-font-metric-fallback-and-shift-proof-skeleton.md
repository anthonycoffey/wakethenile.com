# ADR 0005: Metric-adjusted font fallback + shift-proof video skeleton

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** Anthony Coffey

## Context

[ADR 0004](./0004-videos-coverflow-reserved-space-deferred-reveal.md) reserved space for the videos
coverflow and deferred its reveal to remove the Swiper hydration "shuffle." That part worked — the
transform-driven shift is gone. But 0004's claim of "CLS = 0" was a **false negative**: it was
measured on an un-throttled desktop load with a warm cache, where the real shift never triggers.

A PageSpeed Insights mobile run on the deployed preview told the true story: **CLS ≈ 0.48–0.86
(red)**, with the "Layout shift culprits" insight pointing at the coverflow region. Reproducing it
with Lighthouse under **real** mobile throttling (`--throttling-method=devtools`) against the
deployed URL confirmed it and named two causes:

1. **Web font loaded** (`martel-sans-*.woff2`). Martel Sans is self-hosted via `@fontsource` with
   `font-display: swap` and no preload. Under real conditions the ~14 MB of video payload delays the
   font so it lands *after* first paint; the swap from the system fallback to Martel Sans reflows the
   page's text (and, because the fallback and brand font have very different metrics, moves the whole
   carousel region). This is **site-wide**, not specific to `/videos` — every page renders text in
   this font. It was mis-measured as absent in 0004.
2. **Unsized image element** — the poster `<img>` that 0004 added *inside its own skeleton*. Each
   poster is a 720×1282 image with no width/height; under throttle it paints at natural size before
   the layout CSS constrains it, then snaps into the 360-wide card. The fix's own skeleton had become
   a CLS source.

Local reproduction of cause (1) proved impractical (it needs the real throttled timing + heavy
payload), so the fix was validated by (a) a direct metric-equivalence measurement in-browser and (b)
a Lighthouse run against the redeployed preview.

## Decision

We will eliminate both causes:

- **Font swap → metric-adjusted fallback.** Add the **`fontaine`** Vite plugin (in
  `astro.config.mjs`). At build time it reads each Martel Sans `@font-face` and emits a matching
  `@font-face` (`Martel Sans Fallback`, forced via `overrideName`) built on a local system font with
  `size-adjust` / `ascent-override` / `descent-override` / `line-gap-override` so the fallback
  occupies nearly the same box as the real font. We wire that family into the `--font-sans` stack in
  `tokens.css` (fontaine rewrites literal `font-family` declarations but **not** CSS-variable values,
  and the whole site renders text via `var(--font-sans)`). The swap-in of Martel Sans then reflows
  almost nothing. We keep `font-display: swap` and the brand font — nothing is hidden.
- **Unsized skeleton image → CSS `background-image`.** The skeleton cards paint their poster as a
  `background-image` instead of an `<img>`. A background is painted, never laid out, so it cannot
  shift the card as it loads; the card's size comes solely from its `aspect-ratio`.

Measured metric equivalence (700 weight, single line): the `Martel Sans Fallback` advance width is
within **~1.5%** of Martel Sans (raw `system-ui` is ~4.6% off) and its line-box height within
~8% (raw `system-ui` ~27% off) — and the site pins `line-height: 1.5`, so vertical line-box height
doesn't move on swap at all.

## Consequences

- **CLS is addressed at the source, site-wide.** The font fallback benefits every page, not just
  `/videos`; the coverflow shift specifically drops out because the carousel's text no longer reflows
  under it. (Confirmed on the redeployed preview with a throttled Lighthouse run.)
- **New build dependency: `fontaine`** (dev-only, runs at build time; no runtime cost, no new
  network requests — the fallback uses `local()` system fonts).
- **A hardcoded coupling:** `tokens.css` references the family name `Martel Sans Fallback`, which is
  produced by the `overrideName: () => 'Martel Sans Fallback'` option in `astro.config.mjs`. If that
  name changes, the variable must change with it (there's a comment on both sides). fontaine derives
  names from the font's first family word ("Martel"), which is why the name is forced explicitly.
- **This corrects, not supersedes, [ADR 0004](./0004-videos-coverflow-reserved-space-deferred-reveal.md).**
  0004's reserved-space + deferred-reveal approach stays — it fixed the transform shuffle. This ADR
  fixes the font-swap and unsized-image shifts it missed, and records the measurement lesson:
  **CLS must be measured under real mobile throttling (or on the deployed page), never an
  un-throttled local load.**
- Verify future CLS changes the same way: `lighthouse <url> --form-factor=mobile
  --throttling-method=devtools`, or PageSpeed Insights on the deployed preview.
