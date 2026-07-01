# 01 — Migration Roadmap

The real plan, on the real timeline. This is a **same-night 1:1 migration**, not a multi-week
project. The current site is small and well-understood; the new build reproduces its look and feel
exactly, but built the way it should have been from the start — a prebuilt, templatized site driven
by Sanity content, hostable on free tiers.

> **Guiding principle:** the live WordPress site stays up and untouched until the new site is built,
> verified, and (optionally) demoed. DNS is the last thing to change. GCP is the last thing to
> delete. Rollback is always one DNS change away.

---

## Phase A — Build, migrate & deploy (tonight, one session)

Done in a single focused sitting (a few hours, possibly a late night). Goal: a complete 1:1 of the
current site, deployed and reachable on Cloudflare, ready to demo tomorrow.

- [ ] **Scaffold** the Astro project + Sanity Studio (embedded `/admin`). See
      `03-agent-implementation-guide.md` for the exact steps.
- [ ] **Model the content** from `sanity-starter/` — pages, `show`, `video`, `siteSettings`.
      Keep it constrained: content fields wired into fixed templates (titles, subtitles, body,
      images), not a page builder.
- [ ] **Recreate the templates** for the existing pages (Music/home, Videos, Shows, Connect,
      Contact, plus Champion, Mercy, Lamb, Privacy) matching the current dark/gold full-screen look.
- [ ] **Port the two real components:** the video coverflow slider and the shows list/venue map —
      as templates fed by Sanity, not editor controls.
- [ ] **Move the media:** originals only. Images → Sanity; the ~615 MB of video → the chosen host
      (Cloudflare Stream/R2/Bunny). Never bundle raw media into the repo.
- [ ] **Enter/seed content** to match the live site (5 core pages + song/legal pages, the videos,
      and any shows you want to display).
- [ ] **Deploy to Cloudflare** (Workers static assets) on a preview URL (`*.workers.dev` or a
      staging subdomain). Wire the Sanity publish webhook → deploy hook.

**Exit criteria:** the new site is live on a Cloudflare URL, looks identical to the current site, and
reads from Sanity. You can open it in a browser and click through every page.

---

## Phase B — Demo & plan next phase with the client (tomorrow)

The meeting. Two parts: reassure with the deck, then show the working site and plan content.

- [ ] **Present the deck** (`WakeTheNile-Migration-Pitch.pptx`) — the why and the how.
- [ ] **Demo the live new site** side-by-side with the deck. Show that it's a faithful 1:1, faster,
      and that they can now edit content themselves in Sanity.
- [ ] **Walk them through Sanity** — how to swap an image, change a title/subtitle, add a show date.
      Emphasize: they manage *content*, the templates keep the design correct automatically.
- [ ] **Plan the content rollout** together: what new content/pages they want, which v2 features
      (blog, Spotify/presale, merch) matter for the album launch, and the priority order.
- [ ] **Implement the easy wins on the spot** — anything that's just content entry or an existing
      template (new shows, updated copy, swapped images) can be done live in the meeting.
- [ ] Capture anything needing a **new template or feature** as a follow-up (a dev task, not a
      client task).

**Exit criteria:** client has seen the new site, can edit basic content, and you both have an agreed,
prioritized list of next steps for content and v2 features.

---

## Phase C — Go live (when you're ready — tonight or right after the demo)

Because it's a 1:1 migration with trivial rollback, cutover is a quick, low-stakes step you control.
Do it tonight if you're confident, or wait until the client gives the nod in the meeting.

- [ ] Build the **301 redirect map**: nearly every path maps 1:1 (`/music`, `/videos`, `/shows`,
      `/connect`, `/contact-us`, `/privacy-policy`, `/champion`, `/mercy`, `/lamb`). Redirect
      `/demo-blog-post → /` (or `/blog` once it exists), `/maintenance-page → /`, and catch legacy
      `/wp-*`, `/?p=`, and feed URLs. Apply via Cloudflare Bulk Redirects.
- [ ] Point the `wakethenile.com` apex (and `www`) at the Worker (custom domain). The domain is
      already in your Cloudflare account, so this is minutes.
- [ ] Verify HTTPS, root + `www`, a sample of redirected old URLs, and that forms/embeds work.
- [ ] Re-add analytics; submit the new `sitemap.xml` to Search Console.

**Rollback:** WordPress is still running on GCP, untouched. If anything looks wrong, point DNS back
to the old origin. Keep that option open for at least a week.

**Exit criteria:** production serves the new site; redirects resolve; analytics flowing.

---

## Phase D — Iterative content & v2 (after the meeting, ongoing)

This is where the album-launch features land, on whatever schedule you and the client set. Each is
small and independent — done as a template/feature, then handed to the client as content.

- [ ] **Blog** — index + post template with metadata and social share buttons. Then the client
      writes posts as content.
- [ ] **Spotify / release / presale** — a `release` template for the album: pre-save + countdown
      before release, embedded player + streaming links after. Client fills in dates/links.
- [ ] **Merch** — store + product templates on the chosen provider (Shopify/Snipcart). Client
      manages products.
- [ ] **New pages/sections** — when the client wants a new layout, you build a new **template**; the
      client never touches design. New design = new template, by you.

**Exit criteria:** v2 features ship incrementally; the client self-serves all content within them.

---

## Phase E — Decommission GCP (after a safe window)

- [ ] Monitor ~1–2 weeks: 404s (Cloudflare analytics), Search Console coverage, forms.
- [ ] Take a final full WordPress backup (DB + uploads) and a GCP VM snapshot; archive them durably
      (e.g. R2).
- [ ] **Stop** the Compute Engine VM first; after a few more quiet days, delete the VM, disks, static
      IP, and any unused GCP DNS zone.
- [ ] Cancel WordPress-specific paid services no longer used.

**Exit criteria:** GCP spend for this project is zero; backups archived; the new stack is the only
moving part.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shipping 615 MB of video as static assets bloats/breaks the deploy | High if ignored | High | Phase A: video goes to Stream/R2/Bunny, never the repo |
| Lost SEO from changed URLs | Low | High | Permalinks preserved 1:1; full 301 map at cutover |
| Demoing on the live apex before it's verified | Low | Medium | Demo on a preview URL; cut the apex over only when ready |
| Forms silently stop working post-cutover | Medium | Medium | Test deliverability before cutover; pick a handler with confirmation |
| Client expects page-builder-level design control | Medium | Medium | Set expectation in the demo: they manage content; new layouts are new templates |
| Scope creep in tomorrow's meeting | Medium | Medium | Separate "content/existing template" (do now) from "new template/feature" (Phase D) |

## Timeline (actual)

- **Tonight:** Phase A — build, migrate, deploy to a Cloudflare preview (a few hours).
- **Tomorrow:** Phase B — demo + plan + implement the easy content wins with the client. Phase C
  (cutover) tonight or right after approval.
- **Following days/weeks:** Phase D — v2 features and new content, incrementally. Phase E — retire
  GCP once stable.
