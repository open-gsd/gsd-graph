---
phase: 03-query-lifecycle-maintain
plan: 03
subsystem: snapshot
tags: [snapshot, save, list, restore, path-escape, lock, graph.v1, SNAP-01]

requires:
  - phase: 01-foundation
    provides: acquireBuildLock, publishGraphFiles, loadGraphV1, confineUnderRoot
  - phase: 02-build-pipeline
    provides: build(), last-diff-base under snapshots/
  - phase: 03-query-lifecycle-maintain
    provides: projectGraph for optional projection rewrite
provides:
  - "snapshotSave writes full graph.v1 under store/snapshots/<iso>-<name>.json under lock"
  - "snapshotList newest-first excluding .last-diff-base.json (no auto-prune)"
  - "snapshotRestore validates Ajv then publishGraphFiles; invents no triples"
  - "sanitizeSnapshotName PATH_ESCAPE for traversal/empty/unsafe names"
affects:
  - 03-04 diff/repair
  - DIFF-01 named snapshot baselines
  - SNAP-01 lifecycle rollback

actuals:
  tokens: 6359
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "snapshots/<iso-colons-to-hyphens>-<safe-name>.json under confineUnderRoot"
    - "Logical name restore matches *-<name>.json newest mtime; full fileName exact"
    - "Mutating snapshot ops: acquireBuildLock → work → release in finally"
    - "validateGraphV1 before publish on restore; corrupt leaves prior v1 intact"

key-files:
  created:
    - src/pipeline/snapshot.ts
    - tests/snapshot.test.ts
  modified:
    - src/types.ts
    - src/index.ts

key-decisions:
  - "Restore rewrites projection via projectGraph(writeProjection true) from snapshot v1 only — no invented triples; sidecars unchanged (A2)"
  - "Logical name resolution: suffix -name.json newest wins; also accept full fileName basename"
  - "No auto-prune of snapshots (A5); list skips .last-diff-base.json and .tmp- files"

patterns-established:
  - "sanitizeSnapshotName: empty/..///\\/non-[A-Za-z0-9._-] → PATH_ESCAPE"
  - "Missing snapshot → SCHEMA_INVALID with not found message"
  - "ISO timestamp uses toISOString with colons replaced by hyphens"

requirements-completed: [SNAP-01]

coverage:
  - id: D1
    description: "snapshotSave writes full graph.v1 under snapshots/<iso>-name.json; list includes it; restore recovers triple/node ids after mutation"
    requirement: SNAP-01
    verification:
      - kind: integration
        ref: "tests/snapshot.test.ts#snapshotSave creates snapshots/<iso>-name.json with full graph.v1; list includes it; restore recovers triple ids"
        status: pass
    human_judgment: false
  - id: D2
    description: "snapshotSave/restore hold and release acquireBuildLock"
    requirement: SNAP-01
    verification:
      - kind: integration
        ref: "tests/snapshot.test.ts#snapshotSave holds lock during write and releases it"
        status: pass
    human_judgment: false
  - id: D3
    description: "PATH_ESCAPE for .., ../x, a/b, a\\b, empty snapshot names"
    requirement: SNAP-01
    verification:
      - kind: unit
        ref: "tests/snapshot.test.ts#snapshotSave rejects traversal-like names with PATH_ESCAPE"
        status: pass
    human_judgment: false
  - id: D4
    description: "Missing restore name throws SCHEMA_INVALID; corrupt Ajv snapshot leaves prior graph.v1 intact"
    requirement: SNAP-01
    verification:
      - kind: integration
        ref: "tests/snapshot.test.ts#corrupt snapshot failing Ajv does not publish; prior graph.v1 intact"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-03
status: complete
---

# Phase 3 Plan 03: Snapshot Save/List/Restore Summary

**Full graph.v1 snapshot lifecycle under store/snapshots with lock, name confinement (PATH_ESCAPE), and Ajv-safe restore that never invents triples**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-03T11:27:47Z
- **Completed:** 2026-08-03T11:32:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented `snapshotSave` / `snapshotList` / `snapshotRestore` under `src/pipeline/snapshot.ts` (SNAP-01, D-07, D-10)
- Named snapshots as `snapshots/<iso>-<name>.json`; list newest-first, excludes `.last-diff-base.json` (OQ-3, A5)
- Name sanitization rejects `..`, separators, empty, unsafe chars → `PATH_ESCAPE` (STORE-05)
- Restore validates with `validateGraphV1` before `publishGraphFiles`; corrupt files leave prior SoT intact
- Public exports + `Snapshot*` types from `src/index.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end snapshot save → list → restore graph.v1** - `a323890` (feat)
2. **Task 2: Snapshot name confinement and restore validation** - `66299b7` (feat)

## Decisions Made

- Restore rewrites disposable projection from restored v1 via `projectGraph` (no invented triples); does not roll back `sources.manifest` / review queue (A2)
- Logical restore name matches `*-<name>.json` (newest mtime); full basename fileName also accepted
- No auto-prune; retention is list-all (A5)

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None — T-03-07/08/09 mitigated as planned (sanitize + confine, lock, validate before publish). No new packages (T-03-SC).

## Known Stubs

None.

## Files Created/Modified

- `src/pipeline/snapshot.ts` — save/list/restore + sanitizeSnapshotName
- `src/types.ts` — SnapshotSave/Restore/List options, SnapshotResult, SnapshotInfo
- `src/index.ts` — public exports
- `tests/snapshot.test.ts` — round-trip + PATH_ESCAPE + corrupt restore safety

## Self-Check: PASSED

- FOUND: src/pipeline/snapshot.ts
- FOUND: tests/snapshot.test.ts
- FOUND: commit a323890
- FOUND: commit 66299b7
- npm test: 156 pass
- npm run build: ok
