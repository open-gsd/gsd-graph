# @opengsd/gsd-graph

**Graph Engineering toolkit** — a standalone TypeScript library and CLI binary `gsd-graph` for building and querying local knowledge graphs.

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
| Store directory | `.gsd-graph/` | Overridable via config / CLI `--dir` |
| Source of truth | `graph.v1.json` | Canonical SoT for all native load/query APIs |
| Projection | `graph.json` (optional) | **Disposable** viewer projection — never read as SoT by native APIs |

## CLI

Binary name: **`gsd-graph`**. Machine contract: **JSON on stdout** for successful commands; errors as JSON on stderr with non-zero exit (K22).

```bash
# Initialize store (default .gsd-graph/)
gsd-graph init

# Build graph from a corpus directory
gsd-graph --dir .gsd-graph build --corpus ./docs

# Status / query IR
gsd-graph status
gsd-graph query drought
gsd-graph path Concept:drought Concept:food-shortage

# Grounded pack + deterministic answer (Phase 5)
gsd-graph pack "why does drought cause food shortage?"
gsd-graph answer "why does drought cause food shortage?"
gsd-graph pack "why does drought cause food shortage?" --budget 200
```

| Command | Role |
|---------|------|
| `init` | Create store layout + config |
| `build` | Extract → normalize → publish `graph.v1.json` |
| `status` | Store health / counts |
| `query` | Seed expand by term |
| `path` | Shortest path between node ids |
| `pack` | Subgraph pack for a natural-language question (seeds, triples, paths, citations) |
| `answer` | Deterministic cited markdown from pack; abstains when empty (exit 0) |
| `diff` / `repair` / `snapshot` / `review` / `ontology` | Maintain & ops surface |

Library entry: `require('@opengsd/gsd-graph')` exports `packSubgraph`, `answer`, `query`, `build`, `init`, and the rest of the public façade.

## Honesty bar (0.1.0)

Offline goldens (no API keys, no network):

- **G0** — free-prose corpus alone does not invent typed multi-hop edges (`causes` / `supports` / …); pack/answer abstains for multi-hop questions
- **G1** — structured `multi-hop.jsonl` yields a ≥3-node `causes` path with citations
- Maintain M1–M5 and core CLI remain green in `npm test`

## Design

Full system design, key decisions, and contracts: [`docs/DESIGN.md`](./docs/DESIGN.md).

Release notes: [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT © 2026 Jeremy McSpadden
