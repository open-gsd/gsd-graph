# Phase 3: Query, lifecycle & maintain — Context

**Phase:** 03  
**Goal:** Users can multi-hop query a published graph and keep it correct across edits  
**Requirements:** QRY-01, QRY-02, MNT-01, SNAP-01, DIFF-01, REP-01  
**Depends on:** Phase 1–2 complete (store, ontology, extract, normalize, review, build, status)

## Decisions

Locked (non-negotiable):

- **D-01** Query IR is structured only: term seed+expand, path, neighborhood, filter — **no NL→IR** (QRY-01)
- **D-02** Confidence budget filtering uses shared tier rank order with normalize/`best_tier` (QRY-02, K6)
- **D-03** Pure-TS adjacency BFS/path — no graphology/ngraph dependency
- **D-04** Query and lifecycle read **only** `graph.v1.json` via `loadGraphV1` — never projection as SoT
- **D-05** Incremental maintain invalidates multiset provenance correctly for **M1–M5** matrix (MNT-01)
- **D-06** Fingerprints from Phase 2 (`sha256:`) drive which sources are re-extracted; provenance entries drop when sources removed; triple confidence recompute = best_tier(remaining entries); drop triple when provenance empty
- **D-07** Snapshot save/list/restore of full `graph.v1` (and necessary lock/sidecars as designed) under store `snapshots/` (SNAP-01)
- **D-08** Diff: current graph vs named snapshot or `last-diff-base` — ± nodes & triples by id (DIFF-01, K25)
- **D-09** Repair regenerates projection from v1 only; invents no triples (REP-01)
- **D-10** Reuse Phase 1 lock for any write path that mutates store (maintain/snapshot/repair as needed)
- **D-11** Copyright headers on all source files
- **D-12** Tests: `node:test` + c8; dedicated M1–M5 tests; query path tests

## Claude's Discretion

- Exact Query IR TypeScript types / function split (`query` vs `path` helpers) as long as ops match DESIGN
- Budget units (token estimate vs node/triple count) — prefer DESIGN: budget drops worst confidence first
- Snapshot naming / retention policy for list
- Whether maintain is `maintain()` separate from `build({ full: false })` or extends build — RESEARCH must pick one clear API; prefer explicit `maintain` or documented incremental `build` contract that satisfies M1–M5
- Diff output JSON shape details

## Deferred Ideas (OUT OF SCOPE for Phase 3)

- packSubgraph / answer — Phase 5
- CLI binary surface — Phase 4 (library APIs only)
- LLM / MCP — Phase 6
- Communities — Phase 7
- NL→Query IR
- Neo4j export

## Phase 1–2 surface to reuse

- `loadGraphV1`, `publishGraphFiles`, `acquireBuildLock`, `resolveStoreRoot`
- `build()`, `status()`, normalize multiset + best_tier, fingerprints, review queue
- Graph schema validation

## Success criteria (from ROADMAP)

1. Query IR: term/path/neighborhood/filter + confidence budget tiers  
2. Maintain M1–M5 provenance invalidation  
3. Snapshot save/list/restore; diff by id  
4. Repair projection from v1 only  

## Research fold-in

- `docs/DESIGN.md` Query IR, pack algorithm (for later; do not implement pack), maintain, diff, snapshots  
- `.planning/research/PITFALLS.md` — invalidation, budget hiding paths  
- `.planning/research/ARCHITECTURE.md` — query under pack layer  
