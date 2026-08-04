# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-08-04

### Added

- One-shot `gsd-graph enable` (skill + hooks + full project sync)
- `gsd-graph ask` alias for `answer`
- Continuous update hooks + project sync corpus auto-resolve
- Quick Guide and Full Guide under `docs/`
- npm publish of public package `@opengsd/gsd-graph`

### Changed

- Config/auto_update lives in `.gsd-graph/config.json` (`.planning` optional)
- Removed per-file copyright headers

## [0.2.0] - 2026-08-03

### Added

- **Global themes via community detection** — pure TypeScript **label propagation** over an undirected projection of EXTRACTED|INFERRED triples (no graphology / Louvain / Leiden / native deps)
- Disposable `communities/` store sidecars: `index.json` + `community-c_NNNN.md` theme reports — **never** replace `graph.v1.json` as source of truth
- Library API: `detectCommunities`, `writeCommunityReports` (rewrite markdown from index without re-running LPA)
- CLI nested verbs (K22 JSON stdout): **`gsd-graph communities detect`** and **`gsd-graph communities report`**
  - `detect` options: `--min-size`, `--max-iter`
  - Result includes `ok`, `community_count`, community summaries (`id`/`size`/`label`/`stable_key`), `index_path`, `report_paths`
- **Global-search differentiator:** corpus-level theme clusters complement local `pack` / `answer` multi-hop grounding

### Notes

- Community markdown is deterministic and disposable (not SoT); no network/LLM community essays by default
- Optional LLM community prose remains out of scope for this release

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
- Disposable `GRAPH_REPORT.md` via `gsd-graph report` (non-SoT)

### Notes

- Optional LLM answer apply (`prompt` / `http`) deferred to a later release
- MCP tools shipped as optional surface in later 0.1.x work where present
- Communities deferred from 0.1.0 — shipped in **0.2.0**
- Release gated by full `npm test` green (maintain M1–M5, core CLI, pack/answer, golden-scenarios)
