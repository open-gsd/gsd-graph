# Milestones

## v0.2.0 Global Themes (Shipped: 2026-08-16)

**Phases completed:** 7 phases, 25 plans, 61 tasks

**Key accomplishments:**

- Installable `@opengsd/gsd-graph` CJS+types library with Graph Engineering identity, frozen reason codes, and Node 22 CI — zero gsd-core runtime coupling.
- Checked-in draft-2020-12 schemas, Ajv compile-once validators, DESIGN general pack with closed allowlists, replace-only load, and review|coerce|drop policy matrix — ONT-01/02/03.
- Realpath-confined `.gsd-graph` store, exclusive `.build.lock`, and dual-write publish that renames `graph.v1.json` before optional projection — load never treats `graph.json` as SoT.
- Deterministic Markdown OQ-1 extract, sha256 source fingerprints, realpath-confined corpus discovery, and free-prose honesty fixtures with no invented multi-hop edges offline.
- JSON/JSONL field-map adapter and extension router emit EXTRACTED multi-hop chains (Drought→Crop Failure→Food Shortage via `causes`) with fingerprint-bound provenance for honest offline goldens.
- Multiset provenance with best_tier, exact same-type merge only, and review-queue accept/reject that mutates graph/ontology solely on accept under the build lock.
- Offline `build()` under lock publishes graph.v1 with fingerprints and review sidecars; `status()` reports honest STAT-01 counts and engine identity without treating projection as SoT.
- Pure-TS Query IR (path/seed/neighborhood/filter) with shared confidence ranks and DESIGN budget filtering over graph.v1
- Pure multiset provenance invalidation (M1–M5) with deleted-source fix on build({ full: false }), maintain alias, projectGraph projection payload, and last-diff-base baseline under lock
- Full graph.v1 snapshot lifecycle under store/snapshots with lock, name confinement (PATH_ESCAPE), and Ajv-safe restore that never invents triples
- Diff by node/triple id vs snapshot or last-diff-base (NO_BASELINE when missing) and repair that regenerates disposable graph.json from graph.v1 only under build lock
- Publishable `gsd-graph` bin with commander adapter, K22 exit mapping, and library `init()` for store layout + gitignore append.
- Full Phase 4 `gsd-graph` command surface as thin commander adapters over existing library exports — pack/answer deferred.
- Process-spawn E2E proves machine CLI contract: init→build→query→path exit 0 JSON, full K22 0/1/2/3 matrix, pack/answer exit 1, PKG-03 bin spawn.
- `packSubgraph` ships as public Query IR composition: tokenize/score → expandHops by seed id → path among top seeds → applyBudget → citations from remaining triples only (PACK-01).
- `answer()` ships as a pure formatter over `packSubgraph`: cited Seeds/Relationships/Paths/Citations markdown for non-empty packs, honest abstain (`empty_subgraph`) with no fabricated edges for empty packs (ANS-01, ANS-02).
- CLI registers pack and answer as thin K22 adapters; Phase 4 unregistered exit-1 tests flipped to registered happy path with abstain exit 0
- Offline G0 free-prose abstains (no typed multi-hop) and G1 multi-hop.jsonl yields cited ≥3-node causes paths; CHANGELOG/README mark 0.1.0 releasable with full suite green (233 tests).
- Optional `none|prompt|http` LLM providers with Ajv fail-closed apply, citation honesty on answers, confined prompt file exchange, and mockable OpenAI-compatible HTTP — default path stays deterministic offline.
- MCP stdio server with default-on read tools (status/query/pack/answer/review list) and default-off build/review-write, using `@modelcontextprotocol/sdk` 1.x + zod.
- Disposable GRAPH_REPORT.md writer from published graph.v1 (counts + top predicates), explicit CLI report, write_on_build default false.
- Shipped replace-only `research` and `engineering` ontology packs (DESIGN type/predicate tables) with READMEs and offline loadOntologyPack suite gates for ONT-04 / D-09.
- Pure-TypeScript label propagation library clusters EXTRACTED|INFERRED undirected edges into deterministic c_NNNN communities (max 20 iters, min size 3) with offline two-clique proof.
- Production detectCommunities loads graph.v1 only, writes confined non-authoritative communities/index.json + community-c_NNNN.md theme reports, and exposes writeCommunityReports rewrite without mutating SoT.
- Nested K22 `communities detect|report` CLI plus package 0.2.0 identity, CHANGELOG, and README global-themes docs

---
