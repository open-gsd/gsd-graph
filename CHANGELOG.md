# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-03

### Added

- Graph Engineering library foundation: extract → normalize → store → query → ground → maintain
- File-first store under `.gsd-graph/` with `graph.v1.json` source of truth (optional disposable `graph.json` projection)
- Ontology pack load/validate (`general` pack) and review-queue accept/reject
- Query IR: `path`, `seed_expand`, `neighborhood`, `filter`, `applyBudget`, `confidenceRank`
- Maintain / incremental rebuild with provenance invalidation (M1–M5)
- Snapshot save/list/restore, diff vs last-diff-base, repair projection from v1
- CLI binary `gsd-graph` with K22 JSON stdout: `init`, `build`, `status`, `query`, `path`, `diff`, `repair`, `snapshot`, `review`, `ontology`, **`pack`**, **`answer`**
- `packSubgraph` — public query composition (seed → expand → path → budget → citations)
- Deterministic `answer` — Seeds / Relationships / Paths / Citations markdown; empty pack abstains (`mode: abstain`) without fabricating edges
- Offline goldens G0 (free-prose honesty / no typed multi-hop) and G1 (multi-hop.jsonl causes path ≥3 nodes)
- Cheap G2 path assert Drought → Food Shortage on multi-hop store

### Notes

- Optional LLM answer apply (`prompt` / `http`) deferred to a later release
- MCP tools deferred
- Communities / GRAPH_REPORT deferred (target 0.2.0+)
- Package version remains `0.1.0`; this release is gated by full `npm test` green (maintain M1–M5, core CLI, pack/answer, golden-scenarios)
