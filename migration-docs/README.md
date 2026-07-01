# Wake the Nile — WordPress → Astro + Sanity Migration

This folder is the planning + implementation pack for migrating **wakethenile.com** from a
self-hosted WordPress/Gutenberg site (on Google Cloud Compute Engine) to a statically-generated
**Astro** site backed by **Sanity** as the headless CMS, deployed to **Cloudflare Workers**
(static assets). It also defines the **v2** scope: blog, Spotify/album presale, and merch.

## Who each doc is for

| Doc | Audience | Purpose |
|-----|----------|---------|
| [`00-wordpress-audit.md`](./00-wordpress-audit.md) | You | Ground truth of what exists today: pages, custom post types, ACF fields, the custom plugin, brand tokens, and the asset footprint. Read this first. |
| [`01-migration-roadmap.md`](./01-migration-roadmap.md) | You | Phased plan with milestones, decisions, risks, DNS cutover and rollback, and GCP teardown. |
| [`02-architecture.md`](./02-architecture.md) | You | Target stack, repo layout, Sanity content model, Cloudflare deploy model, media strategy, and v2 (Spotify/presale/merch) design. |
| [`03-agent-implementation-guide.md`](./03-agent-implementation-guide.md) | LLM coding agents | Prescriptive, step-by-step build instructions an agent can follow to scaffold and ship the site. |
| [`sanity-starter/`](./sanity-starter/) | LLM agents / you | Concrete starter Sanity schema (TypeScript) for every content type, ready to drop into a Studio. |

## The 30-second summary

- **Approach:** a same-night **1:1 migration** — reproduce the current site's exact look and feel on
  the new stack, deploy to Cloudflare tonight, demo to the client tomorrow, then add v2 features
  incrementally. (See `01-migration-roadmap.md`.)
- **Philosophy — templatized CMS, not a page builder:** the developer owns the design (fixed,
  on-brand templates); the client owns the **content** (titles, subtitles, images, show dates). No
  color pickers, no layout controls. A new design is a new template, built by the developer — never
  a client-facing builder. This is the explicit fix for what failed with WordPress/Gutenberg.
- **Stack:** Astro 6 (static output) + `@sanity/astro` 3.x + Sanity Studio 5.x, deployed to
  Cloudflare Workers static assets. Sanity Cloud hosts content; a publish webhook triggers a rebuild.
- **Rendering:** 100% static (SSG). One optional tiny Worker route handles contact-form POSTs.
- **Content model:** 5 core full-screen pages (Home/Music, Videos, Shows, Connect, Contact) plus
  single/song landing pages, a new **blog**, plus `show` and `video` content types ported from the
  ACF custom post types.
- **Custom plugin replication:** the Swiper video coverflow slider and the "Show Fields" Gutenberg
  blocks become fixed Astro **templates** fed by Sanity fields — not editor controls. The granular
  blocks existed only to work around WordPress; their data becomes simple fields, their design is
  baked into the templates. No PHP carries over.
- **Media:** ~615 MB of video must NOT go in the repo. Host video on Cloudflare Stream or R2/Bunny;
  serve content images through Sanity's image CDN.
- **v2:** new blog, Spotify embeds + album **pre-save/presale** flow, and a **merch** store
  (Shopify Buy Button or Snipcart) — the gaps a professional recording-artist site should fill.

## Suggested reading order

1. `00-wordpress-audit.md` — confirm the audit matches your mental model.
2. `01-migration-roadmap.md` — agree the phases and the cutover plan.
3. `02-architecture.md` — lock the stack and the v2 decisions (a few are flagged "DECISION").
4. Hand `03-agent-implementation-guide.md` + `sanity-starter/` to your coding agent to build.

> Versions in these docs reflect the ecosystem as of **June 2026**: Astro 6.x, `@sanity/astro`
> 3.4.x, `sanity` (Studio) 5.28.x, `@sanity/image-url` 2.1.x, `astro-portabletext` 0.13.x, Sanity
> API version `2026-03-01`. Pin exact versions at install time and re-check the changelogs.
