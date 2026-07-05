# Development Standards

How we build Wake the Nile. These are the rules and invariants that keep the site fast,
cheap to run, and easy for the client to operate. If a change contradicts something here,
that's a decision worth an [ADR](./specs/adrs/) — don't just quietly break the rule.

> Source-of-truth for the specifics: the root [`README.md`](../README.md) and the reviewer
> notes in GitHub issue [#13](https://github.com/anthonycoffey/wakethenile.com/issues/13).

---

## 1. Architecture principles

- **Static SSG by default.** Astro builds to static output (`output: 'static'`,
  `build.format: 'file'` → clean extensionless URLs, no trailing slash). The site is baked at
  build time and served from the CDN. Dynamic behavior is the exception, not the rule.
- **Content-only CMS — developers own design, the client owns content.** Design lives in Astro
  templates (fixed, on-brand); the client edits titles, images, dates, products in Sanity. **No
  page builder, no color pickers, no layout controls.** A new design is a new template, built by a
  developer — never a client-facing builder. This is the explicit fix for what failed with
  WordPress/Gutenberg. See [ADR 0003](./specs/adrs/0003-static-ssg-content-only-cms.md).
- **Sanity is the sole source of truth.** Prices, stock, content — all authoritative in Sanity.
  Nothing is mirrored into a second system (e.g. no mirrored Stripe product catalog); prices go to
  Stripe dynamically via `price_data`.

## 2. Edge-native functions

- Server logic lives in `functions/api/*` (Cloudflare Pages Functions), written **edge-native**:
  **raw `fetch` to REST/HTTP APIs + Web Crypto for signature verification — no Node SDKs, no
  `@astrojs/cloudflare` adapter, no `nodejs_compat` flag.**
- Why: the adapter's build repeatedly failed on Cloudflare. Pages Functions with plain `fetch`
  sidestep it entirely and keep the site a plain static build. See
  [ADR 0001](./specs/adrs/0001-edge-native-pages-functions.md).
- Entry points: `functions/api/checkout.ts`, `functions/api/stripe-webhook.ts`.

## 3. Server-side invariants (commerce)

These are non-negotiable — check them in any change to the checkout/fulfillment path:

- **Never trust the client cart.** `/api/checkout` re-fetches authoritative price + stock from
  Sanity and rejects out-of-stock or inactive items. Client-supplied prices are never used.
- **Fulfillment is idempotent.** The order uses a deterministic `_id` (`order-<sessionId>`) derived
  from the Stripe session, so webhook retries never double-count stock.
- **Stock `0` = sold out.** Sold-out is *derived* from stock, not a separate manual flag. There is
  no redundant `active`/`soldOut` boolean to keep in sync.
- **Stock decrement is atomic.** The webhook creates the Order and decrements stock (per-variant and
  base stock) in a single Sanity transaction.

## 4. Schema lives in two places — keep them in sync

- **Canonical:** `studio/schemaTypes/` (TypeScript, full validation) — this is what you edit.
- **Deployed:** the hosted Studio + MCP tooling use an **MCP-managed copy**, deployed via the Sanity
  MCP because the CLI `sanity schema deploy` crashes on this Node/CLI combo and the project token
  lacks the `deployStudio` grant.
- **Rule:** when you change the schema, update both. The canonical source is `studio/schemaTypes/`;
  the deployed copy must be brought in line with it.

## 5. Environments, hosting & limits

- **Cloudflare env vars are per-environment.** Production and Preview each have their own set — set
  secrets (e.g. `EMAIL_API_KEY`) in **both** where needed, or expect Preview to behave differently.
- **Cloudflare 25 MB per-file limit.** Video MP4s are committed under `public/videos/` and each is
  kept < 25 MB so the git-connected build deploys them. Long-term home is Cloudflare Stream (see
  [`documentation/videos-page.md`](./documentation/videos-page.md)).
- **Sanity free-tier caps webhooks at 2.** This is why post-launch automations funnel through one
  internal event-bus dispatcher rather than registering many Sanity webhooks
  (issue [#10](https://github.com/anthonycoffey/wakethenile.com/issues/10)).
- **Static build:** no server runtime beyond the Pages Functions above.

## 6. Engineering principles

- **SRP / DRY / DI / TDD.** Single responsibility per module; don't repeat yourself; inject
  dependencies rather than hard-wiring them; write the test first where practical. These are the
  cross-project principles our review/audit tooling checks against.
- **Match the surrounding code.** Comment density, naming, and idioms should read like the file
  you're editing. Prefer reusing existing utilities (`src/lib/*`) over adding new ones.
- **Stack conventions:** TypeScript throughout; **Tailwind v4** with brand tokens in
  `src/styles/tokens.css` (`--accent: #ffd17b`); interactive UI as **React islands** hydrated with
  `client:load` (`src/components/*.tsx`); Astro components for everything static.

## 7. Workflow — Document Driven Development

- **Spec first for non-trivial work.** Write a spec in [`specs/active/`](./specs/) describing the
  intent and approach *before* building. Move it to [`specs/archive/`](./specs/archive/) when it
  ships or is superseded.
- **ADR for architectural decisions.** Any choice that's expensive to reverse gets an
  [ADR](./specs/adrs/). ADRs are immutable and numbered; supersede, don't rewrite.
- **Reference docs for shipped features.** Once something works, capture "how it works" under
  [`documentation/`](./documentation/).
- **PR / git conventions.** Branch off `main`; keep the branch focused. **Do not merge a PR unless
  explicitly asked to** — opening/updating a PR is fine, merging is the owner's call.
