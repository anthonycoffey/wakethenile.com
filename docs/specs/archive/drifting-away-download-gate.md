# Spec: "Drifting Away" download-gate landing page

- **Status:** Shipped
- **Date:** 2026-07-14

## Problem

We're releasing a new single, "Drifting Away," and want to trade an early listen/download for an
email address instead of just linking straight to streaming. The Music page currently points at
the previous single ("Mercy").

## Approach

- **`/drifting`** — new static page. Full-bleed cover-art background (same stretched-cover
  treatment used on Music/Connect/Home) with the HubSpot form (portal 243317127, form
  `264f2cb7-1a10-4f93-86fc-8e3fedc53956`) embedded on top. Submit → HubSpot sends the confirmation
  email and redirects to a HubSpot-hosted thank-you page with the download link (both configured
  in HubSpot, outside this repo).
- **Music page** (`page-music` in Sanity) — subheading/CTA updated to reference "Drifting Away"
  and point at `/drifting` instead of the old Spotify link for "Mercy".
- **Download asset** — hosted directly on wakethenile.com (`/audio/drifting-away.mp3`) rather than
  Google Drive, so the link doesn't depend on a personal Drive account's sharing settings or hit
  Drive's antivirus-scan interstitial for a file this size. The HubSpot thank-you page's download
  button should point at `https://wakethenile.com/audio/drifting-away.mp3`.

## Out of scope

- The HubSpot thank-you page content and confirmation email are authored directly in HubSpot, not
  in this repo.
