# @opengsd/gsd-graph

**Graph Engineering toolkit** — a standalone TypeScript library and (planned) CLI binary `gsd-graph` for building and querying local knowledge graphs.

OpenGSD is the **publisher namespace only**. This package has **no runtime dependency** on gsd-core, GSD workflows, or host `.planning/` integration. It is not a gsd-core plugin, capability, or graphify migration tool.

## Product pitch

`@opengsd/gsd-graph` turns document corpora into a queryable graph of relationships (triples with provenance and confidence), then answers multi-hop questions from retrieved subgraphs with citations. The pipeline is:

**extract → normalize → store → query → ground → maintain**

over a **file-first** source of truth (`graph.v1.json`) under the default store directory `.gsd-graph/`.

## Requirements

- **Node.js ≥ 22**
- Install: `npm install @opengsd/gsd-graph`
- Contributors: `npm run build` / `npm test`

## Store defaults

| Item | Default | Notes |
|------|---------|--------|
| Store directory | `.gsd-graph/` | Overridable via config / CLI `--dir` (CLI Phase 4) |
| Source of truth | `graph.v1.json` | Canonical SoT for all native load/query APIs |
| Projection | `graph.json` (optional) | **Disposable** viewer projection — never read as SoT by native APIs |

## CLI name

The planned CLI binary name is **`gsd-graph`** (ships in a later phase). This repository currently publishes the library package identity and foundation APIs.

## Design

Full system design, key decisions, and contracts: [`docs/DESIGN.md`](./docs/DESIGN.md).

## License

MIT © 2026 Jeremy McSpadden
