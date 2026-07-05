# Specs

This is the Document Driven Development workflow. Non-trivial work is described in a written
**spec** before it's built; architectural choices are captured as **ADRs**.

```
specs/
├── active/    # specs for work in progress
├── archive/   # specs for work that's shipped or been superseded
└── adrs/      # Architecture Decision Records (immutable, numbered)
```

## Spec lifecycle

1. **Write** — start a spec in [`active/`](./active/) describing the *intent* (what problem, why)
   and the *approach* (how) before writing code. Keep it concrete enough to execute.
2. **Build** — implement against the spec. Update the spec if the approach genuinely changes; the
   spec should describe where the work actually landed, not a stale intention.
3. **Archive** — when the work ships (or the spec is dropped/superseded), move the file to
   [`archive/`](./archive/). Archived specs are the historical record; don't delete them.

### Naming

`SPEC-<NNN>-<short-kebab-title>.md` — e.g. `SPEC-001-order-emails.md`. Numbers are zero-padded and
monotonic; don't renumber when archiving (just move the file).

## ADRs vs specs

- A **spec** describes a *unit of work* — a feature, a fix, a migration — and moves active →
  archive.
- An **ADR** records a *decision* — a choice that's expensive to reverse (a stack choice, an
  architectural constraint). ADRs are immutable: you supersede one with a newer ADR, you don't edit
  the old one. See [`adrs/README.md`](./adrs/README.md).

A spec often *cites* ADRs; a hard decision made inside a spec often *graduates* into its own ADR.
