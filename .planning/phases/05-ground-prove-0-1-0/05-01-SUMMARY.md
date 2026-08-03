---
phase: 05-ground-prove-0-1-0
plan: 01
subsystem: grounding
tags: [packSubgraph, query-composition, seed-scoring, applyBudget, citations, PACK-01]

requires:
  - phase: 03-query-lifecycle-maintain
    provides: "query IR public ops (expandHops, findShortestPath, applyBudget, loadGraphV1)"
provides:
  - "packSubgraph composition over public query ops (PACK-01)"
  - "SubgraphPack / PackOptions / PackCitation types"
  - "PACK_STOPWORDS + seed scoring (tokenize/score)"
  - "pack-answer multi-hop + empty/budget/expand-by-id tests"
affects: [05-02-answer, 05-03-cli-pack-answer, 05-04-goldens]

actuals:
  tokens: 9939
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "packSubgraph = expandHops(by seed id) ∪ query(path) → applyBudget → citation projection"
    - "Seed scoring only new graph logic; walks stay on exported query helpers"
    - "Empty pack is valid (no throw) — answer abstains in 05-02"

key-files:
  created:
    - src/pipeline/pack.ts
    - tests/pack-answer.test.ts
  modified:
    - src/types.ts
    - src/index.ts

key-decisions:
  - "Expand by scored seed id via expandHops — never seedAndExpand(label) re-match (D-02 pitfall 3)"
  - "Path pairs via public query({ path }) among top min(3, seeds) with maxDepth hops+2"
  - "PACK_STOPWORDS is exact DESIGN set (no extras) for golden stability"
  - "opts.graph or loadGraphV1(resolveStoreRoot) only — never projection as SoT (D-10)"

patterns-established:
  - "Pack-layer tokenize/score → public walk → budget → citations ⊆ remaining triples"
  - "Empty/stopword/zero-score questions return empty-pack shape without GraphError"

requirements-completed: [PACK-01]

coverage:
  - id: D1
    description: "packSubgraph composes public query ops without private graph walk"
    requirement: PACK-01
    verification:
      - kind: unit
        ref: "tests/pack-answer.test.ts#public composition helpers are exported for pack to reuse"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#returns paths with causes and ≥3 nodes for drought→food shortage question"
        status: pass
    human_judgment: false
  - id: D2
    description: "Multi-hop drought→food-shortage pack returns paths with causes and citation ⊆ triples"
    requirement: PACK-01
    verification:
      - kind: unit
        ref: "tests/pack-answer.test.ts#citations every triple_id is in pack.triples (D-02)"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#loads from store via loadGraphV1 after isolated multi-hop build (D-10)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stopword/empty questions and budget citation invariants; expand-by-id stability"
    requirement: PACK-01
    verification:
      - kind: unit
        ref: "tests/pack-answer.test.ts#stopword-only / no-match questions yield empty pack without throw"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#tiny budget trims triples; citations ⊆ remaining triples"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#expands by seed id — shared label substrings do not re-seed via matchTermSeeds"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 01: packSubgraph Composition Summary

**`packSubgraph` ships as public Query IR composition: tokenize/score → expandHops by seed id → path among top seeds → applyBudget → citations from remaining triples only (PACK-01).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-03T15:21:31Z
- **Completed:** 2026-08-03T15:33:00Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Implemented `packSubgraph` with DESIGN stopwords, seed scoring (+3/+2/+1), expand-by-id, path union, budget trim, and citation projection
- Exported pack API (`packSubgraph`, `PACK_STOPWORDS`, `tokenizeQuestion`, `scoreSeeds`) plus `SubgraphPack` / `PackOptions` / `PackCitation` types
- Multi-hop fixture (in-memory + isolated build store) asserts paths ≥3 nodes with `causes` and citations ⊆ triple ids
- Empty/stopword packs and expand-by-id stability covered without private BFS in pack.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end packSubgraph multi-hop path slice** - `1d393b7` (feat)
2. **Task 2: Seed scoring, stopwords, budget, empty pack gates** - `1d393b7` (feat — same commit; edge cases implemented and verified with Task 1 vertical slice)

**Plan metadata:** (pending docs commit)

_Note: Task 2 TDD behaviors landed in the same feat commit as the tracer slice because scoring/stopwords/budget/empty are required for the multi-hop happy path; no second code delta was needed after Task 1 GREEN._

## Files Created/Modified

- `src/pipeline/pack.ts` — packSubgraph, PACK_STOPWORDS, tokenizeQuestion, scoreSeeds
- `src/types.ts` — SubgraphPack, PackOptions, PackCitation
- `src/index.ts` — public exports for pack surface
- `tests/pack-answer.test.ts` — multi-hop, stopwords, scoring, budget, expand-by-id gates

## Decisions Made

- Expand via `expandHops(adj, graph, Set([seedId]), hops)` after scoring — avoids `matchTermSeeds` / `seedAndExpand(label)` false positives when labels share substrings
- Materialize inter-seed paths with public `query({ graph, path: { from, to, maxDepth: hops + 2 } })` (strongest D-01)
- Exact DESIGN stopword set only (no extras) for 0.1.0 golden stability
- No triples after union/budget → empty nodes/triples/paths/citations (no `EMPTY_SUBGRAPH` throw; answer abstains in 05-02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for **05-02** deterministic `answer()` over `SubgraphPack` (abstain on empty pack)
- Ready for **05-03** CLI `pack` / `answer` adapters
- Ready for **05-04** goldens G0/G1 using multi-hop + free-prose fixtures

## Self-Check: PASSED

- FOUND: `src/pipeline/pack.ts`
- FOUND: `src/types.ts` (SubgraphPack / PackOptions)
- FOUND: `src/index.ts` (pack exports)
- FOUND: `tests/pack-answer.test.ts`
- FOUND: commit `1d393b7`
- VERIFY: `npm test` 212 pass / 0 fail; `npm run build` green

---
*Phase: 05-ground-prove-0-1-0*
*Completed: 2026-08-03*
