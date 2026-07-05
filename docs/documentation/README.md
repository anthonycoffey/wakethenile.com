# Documentation

Evergreen "how it works" reference for shipped features and subsystems. One page per
feature/subsystem. When you build something non-trivial and it lands, document it here.

| Doc | What it covers |
|-----|----------------|
| [`videos-page.md`](./videos-page.md) | The `/videos` 3D coverflow carousel — autoplay/unmute behavior, where videos are hosted, and the path to Cloudflare Stream. |
| [`ecommerce-architecture.md`](./ecommerce-architecture.md) | The hand-rolled Stripe + Sanity merch store — architecture, purchase flow, feature phases, and data model. |
| [`project-links.md`](./project-links.md) | Environments and credentials — Studio, Pages, Sanity project IDs, Stripe mode, credentials sheet. |

For *how we build* (rules, invariants, conventions) see
[`../development-standards.md`](../development-standards.md). For decisions and specs see
[`../specs/`](../specs/).
