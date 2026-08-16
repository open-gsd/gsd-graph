---
phase: 03-query-lifecycle-maintain
plan: 01
subsystem: query
tags: [query-ir, bfs, adjacency, confidence-rank, budget, pure-ts, graph-v1]

requires:
  - phase: 02-build-pipeline
    provides: loadGraphV1, bestTier/TIER_RANK, build(), GraphV1Document, tripleId/nodeId
provides:
  - "query() structured IR: path, seed_expand, neighborhood, filter"
  - "confidenceRank shared with bestTier (EXTRACTED=2 INFERRED=1 AMBIGUOUS=0)"
  - "buildAdjacencyMap undirected traversal + directed predicates"
  - "applyBudget ceil(JSON/4) worst-tier-first trim"
  - "seedAndExpand helper for later pack composition"
affects:
  - 03-02 maintain invalidation
  - 03-03 snapshots
  - 03-04 diff/repair
  - phase-5 packSubgraph

actuals:
  tokens: 9506
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure-TS AdjacencyMap + BFS (no graphology/ngraph)"
    - "Exclusive query dispatch: path > id > filter > term"
    - "Shared TIER_RANK via confidenceRank export"
    - "opts.graph bypass for unit tests; disk path loadGraphV1 only"

key-files:
  created:
    - src/pipeline/query.ts
    - tests/query.test.ts
  modified:
    - src/pipeline/ids.ts
    - src/types.ts
    - src/index.ts

key-decisions:
  - "Undirected path/neighborhood expansion with directed triple predicates preserved (OQ-4)"
  - "Budget unit = ceil(JSON.stringify({nodes,triples}).length/4); null/≤0 skips (OQ-2)"
  - "When term is set with filter fields, seed_expand wins (exclusive dispatch)"
  - "Missing op throws GraphError with BUILD_FAILED reason and clear usage message"

patterns-established:
  - "Query helpers exported for pack composition without implementing packSubgraph"
  - "Hops/maxDepth hard-clamped ≤16 (T-03-01)"
  - "Seed nodes retained when rebuilding node set after budget drops"

requirements-completed: [QRY-01, QRY-02]

coverage:
  - id: D1
    description: "Multi-hop path Drought→Crop Failure→Food Shortage with causes predicates"
    requirement: QRY-01
    verification:
      - kind: unit
        ref: "tests/query.test.ts#returns multi-hop Drought → Crop Failure → Food Shortage with causes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Term seed-expand on id/label/alias + undirected hops"
    requirement: QRY-01
    verification:
      - kind: unit
        ref: "tests/query.test.ts#seeds on id/label/alias substring and expands undirected hops"
        status: pass
    human_judgment: false
  - id: D3
    description: "Neighborhood hops=1 from node id"
    requirement: QRY-01
    verification:
      - kind: unit
        ref: "tests/query.test.ts#returns only nodes/triples within 1 hop of id"
        status: pass
    human_judgment: false
  - id: D4
    description: "Filter by types/predicates/confidenceMin using shared ranks"
    requirement: QRY-01
    verification:
      - kind: unit
        ref: "tests/query.test.ts#filters by predicates and confidenceMin using shared ranks"
        status: pass
    human_judgment: false
  - id: D5
    description: "confidenceRank matches bestTier EXTRACTED>INFERRED>AMBIGUOUS"
    requirement: QRY-02
    verification:
      - kind: unit
        ref: "tests/query.test.ts#matches bestTier rank order EXTRACTED > INFERRED > AMBIGUOUS"
        status: pass
    human_judgment: false
  - id: D6
    description: "applyBudget drops AMBIGUOUS before EXTRACTED with ceil(JSON/4)"
    requirement: QRY-02
    verification:
      - kind: unit
        ref: "tests/query.test.ts#drops AMBIGUOUS before INFERRED before EXTRACTED (ceil JSON/4)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Disk query loads graph.v1 only after build; no projection SoT"
    requirement: QRY-01
    verification:
      - kind: integration
        ref: "tests/query.test.ts#loads graph.v1 via build store dir — never needs graph.json (D-04)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-03
status: complete
---

# Phase 3 Plan 01: Query IR Summary

**Pure-TS Query IR (path/seed/neighborhood/filter) with shared confidence ranks and DESIGN budget filtering over graph.v1**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-08-03T11:15:05Z
- **Completed:** 2026-08-03T11:18:40Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Exported single `confidenceRank` from `TIER_RANK` used by `bestTier` (D-02 / QRY-02)
- Shipped `query()` with exclusive structured ops: path BFS, term seed+expand, neighborhood, filter
- Undirected adjacency walk preserves directed triple predicates on results (OQ-4, D-03)
- `applyBudget` uses `ceil(JSON/4)` and drops AMBIGUOUS → INFERRED → EXTRACTED with id-asc tie-break
- Disk path uses `loadGraphV1` only; `opts.graph` for unit tests never opens store (D-04)
- Public façade exports query helpers for later pack composition (no packSubgraph)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end path query on multi-hop graph** - `2d5984a` (feat)
2. **Task 2: seed_expand, neighborhood, and filter IR ops** - `6e7687d` (feat)
3. **Task 3: applyBudget token trim + disk loadGraphV1 path** - `a8d8cb2` (feat)

_Note: TDD tasks shipped implementation+tests together per task (tracer implemented full query module early so Task 2/3 added behavior tests against live ops)._

## Files Created/Modified

- `src/pipeline/query.ts` - Query IR dispatcher, adjacency BFS, budget, seed/filter helpers
- `src/pipeline/ids.ts` - `confidenceRank` export over shared TIER_RANK
- `src/types.ts` - QueryIR, QueryOptions, QueryResult, QueryPath
- `src/index.ts` - Public exports for query surface
- `tests/query.test.ts` - QRY-01/QRY-02 path/seed/neighborhood/filter/budget/disk gates

## Decisions Made

- Undirected path/neighborhood (OQ-4 RESOLVED) with lexicographic BFS expansion order
- Exclusive dispatch order documented in module header; term wins over filter fields
- GraphError on missing op uses `BUILD_FAILED` reason with explicit usage message
- Full query module landed in Task 1 so later tasks could green-test remaining ops without stubs

## Deviations from Plan

None - plan executed exactly as written (implementation front-loaded in tracer; Tasks 2–3 added remaining test coverage and verified budget/disk paths).

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Query IR ready for maintain/snapshot/diff/repair plans (03-02..03-04)
- `seedAndExpand` / `applyBudget` / `buildAdjacencyMap` exported for Phase 5 pack
- Do not implement maintain/snapshot/diff/repair/CLI/pack in this plan (deferred)

## Self-Check: PASSED

- FOUND: src/pipeline/query.ts
- FOUND: tests/query.test.ts
- FOUND: confidenceRank export in src/pipeline/ids.ts
- FOUND: commits 2d5984a, 6e7687d, a8d8cb2
- FOUND: npm test 138 pass; npm run build pass
- FOUND: no graphology/ngraph in package.json dependencies

---
*Phase: 03-query-lifecycle-maintain*
*Completed: 2026-08-03*
