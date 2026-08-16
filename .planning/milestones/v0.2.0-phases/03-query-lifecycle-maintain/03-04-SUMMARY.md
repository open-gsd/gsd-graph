---
phase: 03-query-lifecycle-maintain
plan: 04
subsystem: lifecycle
tags: [diff, repair, last-diff-base, NO_BASELINE, projection, graph.v1, DIFF-01, REP-01]

requires:
  - phase: 03-query-lifecycle-maintain
    provides: projectGraph, last-diff-base after build, snapshot save/list/restore
  - phase: 01-foundation
    provides: loadGraphV1, publishGraphFiles, acquireBuildLock, confineUnderRoot
provides:
  - "diff() id-set DiffResult vs named snapshot or snapshots/.last-diff-base.json (DIFF-01)"
  - "NO_BASELINE when no snapshot and no last-diff-base (D-08)"
  - "repair() regenerates graph.json from loadGraphV1 + projectGraph only (REP-01)"
  - "Phase 3 library façade: query, maintain, snapshot*, diff, repair"
affects:
  - Phase 4 CLI surface for diff/repair
  - DIFF-01 / REP-01 ROADMAP success criteria 3–4

actuals:
  tokens: 8145
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Baseline order: snapshot arg → last-diff-base → NO_BASELINE"
    - "resolveNamedSnapshot shared path confinement for diff + restore"
    - "Comparable payloads exclude document built_at; nodes type/label/aliases/description; triples s/p/o/confidence/provenance"
    - "repair always writeProjection true under acquireBuildLock; v1 sole input"

key-files:
  created:
    - src/pipeline/diff.ts
    - src/pipeline/repair.ts
    - tests/diff.test.ts
    - tests/repair.test.ts
  modified:
    - src/pipeline/snapshot.ts
    - src/types.ts
    - src/index.ts

key-decisions:
  - "Export resolveNamedSnapshot from snapshot.ts so diff reuses PATH_ESCAPE confinement"
  - "resolveBaseline before loadGraphV1 so empty store yields NO_BASELINE not SCHEMA_INVALID"
  - "repair ignores writeProjection:false — always materializes graph.json (repair contract)"

patterns-established:
  - "Controlled publish mutates graph.v1 without rewriting last-diff-base for ± tests"
  - "Poisoned graph.json proves diff/repair never treat projection as SoT"

requirements-completed: [DIFF-01, REP-01]

coverage:
  - id: D1
    description: "diff vs last-diff-base reports triples removed/added by id after controlled mutate"
    requirement: DIFF-01
    verification:
      - kind: integration
        ref: "tests/diff.test.ts#diff({ dir }) after build A + controlled mutate reports triples removed/added by id vs last-diff-base"
        status: pass
    human_judgment: false
  - id: D2
    description: "diff named snapshot baseline; empty store NO_BASELINE"
    requirement: DIFF-01
    verification:
      - kind: integration
        ref: "tests/diff.test.ts#diff({ dir, snapshot }) / NO_BASELINE"
        status: pass
    human_judgment: false
  - id: D3
    description: "changed same-id payload detection; current from graph.v1 only"
    requirement: DIFF-01
    verification:
      - kind: integration
        ref: "tests/diff.test.ts#changed payload / reads only graph.v1"
        status: pass
    human_judgment: false
  - id: D4
    description: "repair writes graph.json edges from v1 triples only; no invented ids"
    requirement: REP-01
    verification:
      - kind: integration
        ref: "tests/repair.test.ts#repair creates graph.json when missing"
        status: pass
    human_judgment: false
  - id: D5
    description: "missing v1 SCHEMA_INVALID; lock held and released on repair"
    requirement: REP-01
    verification:
      - kind: integration
        ref: "tests/repair.test.ts#missing graph.v1 / holds build lock"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-03
status: complete
---

# Phase 3 Plan 04: Diff & Repair Summary

**Diff by node/triple id vs snapshot or last-diff-base (NO_BASELINE when missing) and repair that regenerates disposable graph.json from graph.v1 only under build lock**

## Performance

- **Duration:** 4 min
- **Tasks:** 2
- **Commits:** 4 (2 RED + 2 GREEN TDD)
- **Tests:** 166 pass; lines coverage 87.15% (≥80)

## Accomplishments

- Implemented `diff({ dir, snapshot? })` with DESIGN DiffResult shape and baseline resolution order
- Implemented `repair({ dir })` → loadGraphV1 → projectGraph → publishGraphFiles(writeProjection true) under lock
- Exported Phase 3 library APIs needed by Phase 4 CLI (query, maintain, snapshot*, diff, repair, …)
- DIFF-01 and REP-01 requirement truths verified with dedicated tests

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 RED | failing diff tests | 7031130 | test |
| 1 GREEN | implement diff | f48c715 | feat |
| 2 RED | failing repair tests | 30ca2c4 | test |
| 2 GREEN | implement repair | 3a29efb | feat |

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

1. `test(03-04)` RED commits exist before corresponding GREEN
2. `feat(03-04)` GREEN commits follow RED for both diff and repair
3. No refactor commit required

## Known Stubs

None.

## Threat Flags

None beyond plan `<threat_model>` (baseline confined + validateGraphV1; repair v1-only; lock on repair).

## Self-Check: PASSED

- FOUND: src/pipeline/diff.ts
- FOUND: src/pipeline/repair.ts
- FOUND: tests/diff.test.ts
- FOUND: tests/repair.test.ts
- FOUND: commits 7031130, f48c715, 30ca2c4, 3a29efb
- FOUND: npm test 166 pass; coverage lines 87.15%
