---
phase: 07-global-themes-0-2
plan: 01
subsystem: pipeline
tags: [communities, label-propagation, COM-01, pure-ts, determinism]

requires:
  - phase: 02-store-query
    provides: GraphV1Document, confidenceRank, loadGraphV1 patterns
provides:
  - Pure-TS detectCommunities library pipeline (projectCommunityEdges → labelPropagation → finalizeCommunities)
  - Community / DetectCommunitiesOptions / DetectCommunitiesResult types
  - Offline two-clique + AMBIGUOUS/min-size/determinism test gates
affects:
  - 07-02 (community artifacts / store writes)
  - 07-03 (CLI communities detect|report, 0.2.0 ship)

actuals:
  tokens: 6495
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Deterministic async LPA: id-asc node order, majority label, lex-min frequency ties"
    - "Undirected EXTRACTED|INFERRED edge projection via confidenceRank gate"
    - "Post-LP BFS component split + min-size drop + stable c_NNNN ids"

key-files:
  created:
    - src/pipeline/communities.ts
    - tests/communities.test.ts
  modified:
    - src/types.ts
    - src/index.ts

key-decisions:
  - "Lex-min label on frequency ties (discretion A1)"
  - "Theme label = top internal-degree member label else Community ${id} (A3)"
  - "write:true throws until plan 07-02; inject path never mutates graph.communities (A4)"
  - "maxIterations/minSize: non-finite or negative → defaults; maxIterations capped at 20 (T-07-02)"

patterns-established:
  - "Pattern: pure library detect with opts.graph + write:false for offline tests"
  - "Pattern: community stable_key = sha256(membersSorted.join('\\0')).slice(0,16)"

requirements-completed: [COM-01]

coverage:
  - id: D1
    description: "detectCommunities on two-clique synthetic graph returns two size≥3 communities with correct partition and c_NNNN ids"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/communities.test.ts#returns two communities partitioning a* vs b* with c_NNNN ids"
        status: pass
    human_judgment: false
  - id: D2
    description: "AMBIGUOUS bridge excluded from community edges; cliques stay separate"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/communities.test.ts#AMBIGUOUS-only bridge does not merge the two cliques (D-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Min-size 3 drops dyads; maxIterations clamped; bit-stable partitions; INFERRED-only communities allowed"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/communities.test.ts#confidence filter / min-size / max-iter / determinism"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-03
status: complete
---

# Phase 7 Plan 01: Pure-TS LPA Community Detection Summary

**Pure-TypeScript label propagation library clusters EXTRACTED|INFERRED undirected edges into deterministic c_NNNN communities (max 20 iters, min size 3) with offline two-clique proof.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-03T20:05:54Z
- **Completed:** 2026-08-03T20:18:00Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Implemented full LPA pipeline in `src/pipeline/communities.ts` with no new runtime deps
- Public façade exports `detectCommunities`, constants, and Community types
- Nine offline `node:test` cases cover two-clique partition, AMBIGUOUS exclusion, min-size drop, iteration clamp, determinism, INFERRED-only clusters, and non-mutation of injected graph

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end detectCommunities on two-clique synthetic graph** - `636fc86` (feat)
2. **Task 2: Confidence filter, min-size, max-iter, determinism expansion** - `11059c9` (feat)

## Files Created/Modified

- `src/pipeline/communities.ts` — projectCommunityEdges, labelPropagation, finalizeCommunities, detectCommunities
- `src/types.ts` — Community, DetectCommunitiesOptions, DetectCommunitiesResult
- `src/index.ts` — public re-exports for communities API
- `tests/communities.test.ts` — synthetic two-clique + expansion gates

## Decisions Made

- Lex-min majority-label ties + ascending id async updates for bit-stable LPA
- `write: true` intentionally throws (artifacts deferred to 07-02); library inject path is pure
- Clamp non-finite/negative maxIterations and minSize to defaults; upper-bound maxIterations at 20

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None that block COM-01 core algorithm. Artifact write path intentionally unimplemented until plan 07-02 (`write: true` throws `BUILD_FAILED` with clear message).

## Threat Flags

None beyond plan register. Mitigations applied:

| Threat | Mitigation shipped |
|--------|-------------------|
| T-07-01 | `isCommunityEdge` / rank ≥ INFERRED only |
| T-07-02 | `clampMaxIterations` caps at `COMMUNITY_MAX_ITERATIONS` |

## Self-Check: PASSED

- FOUND: `src/pipeline/communities.ts`
- FOUND: `tests/communities.test.ts`
- FOUND: commit `636fc86`
- FOUND: commit `11059c9`
- FOUND: `npm test` 299 pass; communities 9 pass
