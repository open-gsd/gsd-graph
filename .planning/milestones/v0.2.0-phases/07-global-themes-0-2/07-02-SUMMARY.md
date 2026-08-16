---
phase: 07-global-themes-0-2
plan: 02
subsystem: pipeline
tags: [communities, artifacts, loadGraphV1, COM-01, confinement, theme-reports]

requires:
  - phase: 07-01
    provides: Pure-TS detectCommunities LPA library, Community types
  - phase: 02-store-query
    provides: loadGraphV1, publishGraphFiles, confineUnderRoot, resolveStoreRoot
provides:
  - Store-backed detectCommunities (loadGraphV1 only; default write:true)
  - communities/index.json + community-c_NNNN.md disposable sidecars
  - writeCommunityReports rewrite path from index or in-memory Community[]
  - COMMUNITIES_DIR + confined write helpers (T-07-04)
affects:
  - 07-03 (CLI communities detect|report, 0.2.0 ship)

actuals:
  tokens: 6891
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Production detect defaults write:true; inject path defaults write:false"
    - "Community filenames only from c_NNNN + confineUnderRoot (snapshot SNAP_DIR pattern)"
    - "Non-authoritative index.json holds full Community[] so report rewrite needs no LPA"

key-files:
  created: []
  modified:
    - src/pipeline/communities.ts
    - src/types.ts
    - src/index.ts
    - tests/communities.test.ts

key-decisions:
  - "write defaults true only when opts.graph is omitted (production store path)"
  - "index.json stores full Community objects (members, top_nodes, top_predicates) for report rewrite without re-detect"
  - "writeCommunityReports missing index → SCHEMA_INVALID with detect-first message (A2)"
  - "writeCommunityArtifacts uses temp+rename for index.json; sync write for markdown"

patterns-established:
  - "Pattern: disposable communities/ under store root; never graph.v1 SoT"
  - "Pattern: single renderCommunityMarkdown shared by detect write and writeCommunityReports"

requirements-completed: [COM-01]

coverage:
  - id: D1
    description: "detectCommunities({ dir }) loads via loadGraphV1, writes communities/index.json + community-c_NNNN.md, leaves graph.v1 triple set/hash unchanged"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/communities.test.ts#loads via loadGraphV1, writes index + community-*.md, leaves SoT unchanged (D-04, D-08)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Missing store graph.v1 yields SCHEMA_INVALID; COMMUNITIES_DIR exported as communities"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/communities.test.ts#missing graph.v1 yields SCHEMA_INVALID (D-08)"
        status: pass
    human_judgment: false
  - id: D3
    description: "writeCommunityReports rewrites markdown from index; missing index fails closed; in-memory communities write without LPA"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/communities.test.ts#writeCommunityReports rewrite path (07-02 / D-05, A2)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-03
status: complete
---

# Phase 7 Plan 02: Community Store Artifacts Summary

**Production detectCommunities loads graph.v1 only, writes confined non-authoritative communities/index.json + community-c_NNNN.md theme reports, and exposes writeCommunityReports rewrite without mutating SoT.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-08-03T20:12:21Z
- **Completed:** 2026-08-03T20:15:42Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Wired `detectCommunities` production path: `loadGraphV1` only, default `write: true`, returns `index_path` + `report_paths`
- Disposable sidecars under `store/communities/` with realpath confinement and c_NNNN-only basenames (D-04, T-07-04)
- Deterministic markdown theme reports with non-authoritative header (D-05); no LLM
- `writeCommunityReports` rewrites from index or in-memory `Community[]`; fails closed when index absent (A2)
- Six new offline integration tests (15 total communities suite); full suite 305 pass

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end detectCommunities writes communities/ from loadGraphV1 store** - `a0925ed` (feat)
2. **Task 2: writeCommunityReports rewrite path + index contract** - `135b056` (feat)

## Files Created/Modified

- `src/pipeline/communities.ts` — COMMUNITIES_DIR, renderCommunityMarkdown, writeCommunityArtifacts, loadCommunityIndex, writeCommunityReports, detect write path
- `src/types.ts` — WriteCommunityReportsOptions/Result; DetectCommunities write default docs
- `src/index.ts` — public re-exports for artifact API
- `tests/communities.test.ts` — temp-store loadGraphV1 + SoT stability + rewrite gates

## Decisions Made

- Default write is true only for store-backed detect (no injected graph); inject path stays pure with write:false
- Index document embeds full Community records so report rewrite never needs LPA or graph reload
- Missing index uses SCHEMA_INVALID (same family as missing graph.v1) with explicit “run detect first” message
- Implemented writeCommunityReports in Task 1 shared helpers so Task 2 focused on contract tests (same module, no API split)

## Deviations from Plan

### Auto-fixed Issues

None - plan executed as written.

**Note:** `writeCommunityReports` implementation landed in Task 1 commit alongside detect write path (shared renderer/artifact writer). Task 2 commit is test coverage for the rewrite contract only — no behavioral gap.

## Known Stubs

None. Artifact write path fully implemented (replaces 07-01 intentional `write:true` throw).

## Threat Flags

None beyond plan register. Mitigations applied:

| Threat | Mitigation shipped |
|--------|-------------------|
| T-07-04 | `assertSafeCommunityId` + `confineUnderRoot` for all community-*.md paths |
| T-07-05 | Non-authoritative markdown header; tests hash graph.v1 before/after detect and report |
| T-07-06 | Deterministic-only reports; no LLM path |
| T-07-SC | No new packages |

## Self-Check: PASSED

- FOUND: `src/pipeline/communities.ts`
- FOUND: `tests/communities.test.ts`
- FOUND: commit `a0925ed`
- FOUND: commit `135b056`
- FOUND: `npm test` 305 pass; communities 15 pass
- FOUND: `npm run build` ok
