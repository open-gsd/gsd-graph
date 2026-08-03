---
phase: 03-query-lifecycle-maintain
plan: 02
subsystem: maintain
tags: [maintain, invalidate-provenance, m1-m5, multiset, last-diff-base, project-graph, incremental-build]

requires:
  - phase: 02-build-pipeline
    provides: build(), fingerprint/manifest, normalize bestTier, publishGraphFiles, acquireBuildLock
  - phase: 03-query-lifecycle-maintain
    provides: 03-01 query IR + confidenceRank (shared ranks)
provides:
  - "invalidateProvenance pure multiset drop + bestTier recompute (MNT-01)"
  - "build({ full: false }) pathsToDrop = changed ∪ removed (deleted-source fix)"
  - "maintain() alias of build({ full: false }) — no second orchestrator"
  - "projectGraph(v1) disposable edges projection"
  - "snapshots/.last-diff-base.json after successful build under lock"
affects:
  - 03-03 snapshots
  - 03-04 diff/repair
  - DIFF-01 last-diff-base baseline
  - REP-01 projection from v1

actuals:
  tokens: 7385
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure invalidateProvenance; build owns orchestration"
    - "pathsToDrop = changedPaths ∪ removedManifestPaths (realpath keys)"
    - "Always invalidate when !full && priorGraph (even zero re-extracts)"
    - "projectGraph → publishGraphFiles projection payload (Pitfall 7)"
    - "last-diff-base full graph.v1 copy under confineUnderRoot + lock"

key-files:
  created:
    - src/pipeline/maintain.ts
    - src/pipeline/project.ts
    - tests/maintain.test.ts
  modified:
    - src/pipeline/build.ts
    - src/index.ts
    - tests/build-pipeline.test.ts

key-decisions:
  - "Normative incremental API remains build({ full: false }); maintain is alias only (OQ-1)"
  - "Always call invalidateProvenance when priorGraph exists on !full, not only when sources_skipped_fresh > 0"
  - "last-diff-base written after publishGraphFiles while lock still held (D-10)"
  - "DEFAULT_WRITE_PROJECTION stays false; projection only when writeProjection true"

patterns-established:
  - "M1–M5 unit matrix targets pure helper; deleted-source uses temp corpus + build"
  - "Lazy require of build inside maintain() avoids CJS circular init"
  - "projectGraph edges: source/target/relation/label/confidence/id from triples only"

requirements-completed: [MNT-01]

coverage:
  - id: D1
    description: "M1 two provenance EXTRACTED+INFERRED; drop EXTRACTED → INFERRED"
    requirement: MNT-01
    verification:
      - kind: unit
        ref: "tests/maintain.test.ts#M1: two provenance EXTRACTED+INFERRED; drop EXTRACTED path → remains INFERRED"
        status: pass
    human_judgment: false
  - id: D2
    description: "M2–M5 matrix (drop both, single drop, two EXTRACTED, mixed tiers)"
    requirement: MNT-01
    verification:
      - kind: unit
        ref: "tests/maintain.test.ts#M2–M5"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deleted corpus source invalidates orphan provenance on full:false"
    requirement: MNT-01
    verification:
      - kind: integration
        ref: "tests/maintain.test.ts#deletes corpus file and drops triples that only had provenance from that path"
        status: pass
    human_judgment: false
  - id: D4
    description: "maintain() alias matches build({ full: false }) counts"
    requirement: MNT-01
    verification:
      - kind: integration
        ref: "tests/maintain.test.ts#matches sources_extracted / sources_skipped_fresh and triple counts on second run"
        status: pass
    human_judgment: false
  - id: D5
    description: "writeProjection true materializes graph.json edges from triples; last-diff-base always written"
    requirement: MNT-01
    verification:
      - kind: integration
        ref: "tests/maintain.test.ts#build({ writeProjection: true }) / last-diff-base"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-03
status: complete
---

# Phase 3 Plan 02: Maintain Invalidation Summary

**Pure multiset provenance invalidation (M1–M5) with deleted-source fix on build({ full: false }), maintain alias, projectGraph projection payload, and last-diff-base baseline under lock**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-03T11:20:26Z
- **Completed:** 2026-08-03T11:25:58Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Extracted `invalidateProvenance` as the single pure M1–M5 helper (D-05, D-06, MNT-01)
- Fixed deleted-source gap: `pathsToDrop = changed ∪ removed`; always invalidate when prior graph exists on incremental builds
- Documented `maintain()` alias of `build({ full: false })` with no second orchestrator (OQ-1)
- Added `projectGraph(v1)` and wired `writeProjection: true` so `graph.json` materializes (Pitfall 7)
- Successful build writes `snapshots/.last-diff-base.json` (full graph.v1) under the same lock (DIFF-01 prep)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end invalidateProvenance M1 + deleted-source build path** - `a2c84ad` (feat)
2. **Task 2: Complete M2–M5 matrix + maintain alias contract** - `f1bfa06` (feat)
3. **Task 3: projectGraph, writeProjection wire, last-diff-base after build** - `cf525a1` (feat)

## Decisions Made

- Normative incremental API = `build({ full: false })`; `maintain` is alias only
- Invalidation runs whenever `!full && priorGraph`, including zero re-extracts with only removals
- last-diff-base write is confined under store/snapshots and happens while build holds lock

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None — write paths reuse existing lock + `confineUnderRoot` for last-diff-base (T-03-04/05/06 mitigated as planned).

## Known Stubs

None.

## Self-Check: PASSED
