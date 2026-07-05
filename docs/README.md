# Wake the Nile — Documentation

This is the documentation home for the Wake the Nile rebuild (WordPress → Astro + Sanity +
Cloudflare Pages, with a hand-rolled Stripe merch store). We practice **Document Driven
Development (DDD)**: significant work is described in a written **spec** before it's built,
architectural choices are captured as **ADRs**, and "how it works" knowledge lives as
evergreen reference docs — so the docs are the source of truth and the code follows them.

## Layout

```
docs/
├── development-standards.md   # how we build here — architecture rules, invariants, conventions
├── documentation/             # evergreen "how it works" reference (a feature/subsystem each)
│   ├── videos-page.md
│   ├── ecommerce-architecture.md
│   └── project-links.md
└── specs/                     # the DDD workflow
    ├── active/                # specs for work in progress
    ├── archive/               # specs for work that's shipped or been superseded
    └── adrs/                  # Architecture Decision Records (immutable, numbered)
```

## How to use this

- **Starting a new feature or a non-trivial change?** Write a spec in [`specs/active/`](./specs/)
  first. When the work ships (or the spec is superseded), move it to [`specs/archive/`](./specs/archive/).
- **Making an architectural decision** (a choice that's expensive to reverse)? Record it as an
  [ADR](./specs/adrs/). ADRs are immutable — you supersede one with a new one, you don't rewrite it.
- **Documenting how a shipped feature works?** Add a page under [`documentation/`](./documentation/).
- **Onboarding / setting expectations?** Read [`development-standards.md`](./development-standards.md).

See [`specs/README.md`](./specs/README.md) for the spec lifecycle and
[`specs/adrs/README.md`](./specs/adrs/README.md) for how to add an ADR.

## Related, but not here

- **[`../README.md`](../README.md)** — the project README (stack, local dev, deploy commands).
- **[`../migration-docs/`](../migration-docs/README.md)** — the original WordPress→Astro migration
  pack (audit, roadmap, architecture, agent build guide, starter Sanity schema). Historical; kept
  in place as the record of how the rebuild was planned.
- **GitHub issue [#13](https://github.com/anthonycoffey/wakethenile.com/issues/13)** — the *living*
  project-status tracker. Intentionally kept as an issue (not a doc) so it stays a fast-moving,
  client-facing status update rather than a versioned file.
