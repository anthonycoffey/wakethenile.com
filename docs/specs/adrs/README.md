# Architecture Decision Records (ADRs)

An ADR captures a single architectural decision — the context, the choice, and its consequences.
The format follows [Michael Nygard's ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
(MADR-flavored). ADRs are **immutable**: once accepted, you don't rewrite one — you write a new ADR
that supersedes it.

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](./0001-edge-native-pages-functions.md) | Edge-native Cloudflare Pages Functions (no Astro adapter) | Accepted |
| [0002](./0002-handrolled-stripe-store-no-shopify.md) | Hand-rolled Stripe + Sanity store (no Shopify) | Accepted |
| [0003](./0003-static-ssg-content-only-cms.md) | Static SSG + content-only CMS (no page builder) | Accepted |

## Adding an ADR

1. Copy [`0000-template.md`](./0000-template.md) to `NNNN-short-kebab-title.md` (next number).
2. Fill in **Status / Context / Decision / Consequences**.
3. Add a row to the index above.
4. If it replaces an earlier decision, set the old ADR's status to `Superseded by NNNN` and note it
   in the new ADR.

## Status values

`Proposed` → `Accepted` → (`Deprecated` | `Superseded by NNNN`). A decision that's still under
discussion stays `Proposed`.
