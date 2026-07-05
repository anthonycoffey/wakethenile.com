# ADR 0003: Static SSG + content-only CMS (no page builder)

- **Status:** Accepted
- **Date:** 2026-07-05
- **Deciders:** @anthonycoffey

> Recorded after the fact — this decision underpins the whole rebuild and is documented in the root
> README and the [migration pack](../../../migration-docs/README.md).

## Context

The old site was self-hosted WordPress/Gutenberg. Giving the client a page builder (blocks, color
pickers, layout controls) produced off-brand, inconsistent pages and a fragile site that was hard to
maintain. The rebuild had to prevent that failure mode while still letting the client manage their
own content.

## Decision

We will build a **100% static (SSG) Astro site** (`output: 'static'`, `build.format: 'file'` → clean
extensionless URLs) with a **content-only CMS**: **developers own the design** (fixed, on-brand
Astro templates) and the **client owns the content** (titles, images, dates, products in Sanity).
**No page builder, no color pickers, no layout controls.** A new design is a new template, built by
a developer — never a client-facing builder. Content is baked in at build time; a Sanity publish
webhook triggers a Cloudflare rebuild.

## Consequences

- **Easier:** the site is always on-brand and consistent; fast and cheap (static CDN); the client
  can't break layout; content edits are a publish → rebuild away.
- **Harder:** every new *design* requires developer work — the client can't self-serve novel
  layouts. Content is not instantly live; it goes live on the next build (webhook-triggered).
- **Enables** the store decision ([ADR 0002](./0002-handrolled-stripe-store-no-shopify.md)): merch is
  just another Sanity content type, and Sanity stays the sole source of truth.
