---
phase: 01-foundation-identity
plan: 03
subsystem: store-io
tags: [realpath, dual-write, build-lock, atomic-publish, path-escape, graph.v1]

requires:
  - phase: 01-foundation-identity
    provides: CJS package scaffold, GraphError, GSD_GRAPH_REASON, validateGraphV1
provides:
  - resolveStoreRoot / confineUnderRoot / DEFAULT_STORE_DIR (STORE-01/05)
  - publishGraphFiles dual-write v1-first rename (STORE-02/03)
  - loadGraphV1 SoT-only loader (never projection)
  - acquireBuildLock exclusive wx + stale/dead-PID steal (STORE-04)
  - DEFAULT_WRITE_PROJECTION = false product default
affects:
  - phase-2 build pipeline publish under lock
  - CLI init / status consumers of store paths

actuals:
  tokens: 10431
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Hand-rolled multi-file dual-write (tmp fsync rename v1 first)
    - Hand-rolled .build.lock via openSync wx exclusive
    - realpath + relative/prefix confinement → PATH_ESCAPE
    - publish does not acquire lock (caller holds lock)

key-files:
  created:
    - src/io/paths.ts
    - src/io/safe-json.ts
    - src/io/atomic-publish.ts
    - src/io/load-graph.ts
    - src/io/lock.ts
    - tests/paths-confine.test.ts
    - tests/lock.test.ts
    - tests/publish-dual-write.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "DEFAULT_WRITE_PROJECTION = false until a viewer needs projection"
  - "publishGraphFiles does not acquire lock — single responsibility; caller holds lock"
  - "Missing graph.v1.json maps to SCHEMA_INVALID (no projection fallback)"
  - "STORE-03 proven by rename spy AND mid-protocol fault injection"

patterns-established:
  - "Store IO lives under src/io/*; public surface re-exported from index.ts"
  - "Usage: acquireBuildLock → publishGraphFiles → release"
  - "Test hooks _renameSync / _afterV1Rename for ordered-rename proof only"

requirements-completed: [STORE-01, STORE-02, STORE-03, STORE-04, STORE-05]

coverage:
  - id: D1
    description: "resolveStoreRoot defaults to .gsd-graph; dir and GSD_GRAPH_DIR overrides"
    requirement: STORE-01
    verification:
      - kind: unit
        ref: tests/paths-confine.test.ts#defaults to .gsd-graph under cwd
        status: pass
      - kind: unit
        ref: tests/paths-confine.test.ts#honors GSD_GRAPH_DIR env override
        status: pass
    human_judgment: false
  - id: D2
    description: "confineUnderRoot rejects .. and symlink escape with PATH_ESCAPE"
    requirement: STORE-05
    verification:
      - kind: unit
        ref: tests/paths-confine.test.ts#rejects .. escape with PATH_ESCAPE
        status: pass
      - kind: unit
        ref: tests/paths-confine.test.ts#rejects symlink escape with PATH_ESCAPE when OS allows symlinks
        status: pass
    human_judgment: false
  - id: D3
    description: "publish writes graph.v1 first; loadGraphV1 never uses projection as SoT"
    requirement: STORE-02
    verification:
      - kind: unit
        ref: tests/publish-dual-write.test.ts#writes graph.v1.json only when writeProjection is false
        status: pass
      - kind: unit
        ref: tests/publish-dual-write.test.ts#loadGraphV1 fails SCHEMA_INVALID when only projection exists (D-04)
        status: pass
    human_judgment: false
  - id: D4
    description: "Dual-write rename order v1 before projection (spy + fault injection)"
    requirement: STORE-03
    verification:
      - kind: unit
        ref: tests/publish-dual-write.test.ts#STORE-03 renames graph.v1.json before graph.json (rename spy)
        status: pass
      - kind: unit
        ref: tests/publish-dual-write.test.ts#STORE-03 mid-protocol fault after v1 leaves v1 loadable
        status: pass
    human_judgment: false
  - id: D5
    description: "Exclusive .build.lock; contention BUILD_LOCKED; stale/dead-PID steal"
    requirement: STORE-04
    verification:
      - kind: unit
        ref: tests/lock.test.ts#second acquire without release throws BUILD_LOCKED
        status: pass
      - kind: unit
        ref: tests/lock.test.ts#stale lock by age with dead/nonexistent pid → steal succeeds
        status: pass
      - kind: unit
        ref: tests/lock.test.ts#dead PID (non-stale age) → steal succeeds
        status: pass
    human_judgment: false
  - id: D6
    description: "Lock + publish integration; projection disposable; DEFAULT_WRITE_PROJECTION false"
    requirement: STORE-03
    verification:
      - kind: integration
        ref: tests/publish-dual-write.test.ts#acquireBuildLock → publishGraphFiles → release; projection disposable
        status: pass
      - kind: unit
        ref: tests/publish-dual-write.test.ts#DEFAULT_WRITE_PROJECTION is false
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-08-03
status: complete
---

# Phase 1 Plan 03: Store IO Summary

**Realpath-confined `.gsd-graph` store, exclusive `.build.lock`, and dual-write publish that renames `graph.v1.json` before optional projection — load never treats `graph.json` as SoT.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-03T02:57:03Z
- **Completed:** 2026-08-03T03:01:54Z
- **Tasks:** 3/3
- **Files modified:** 9 (8 created, 1 modified)

## Accomplishments

- Implemented `resolveStoreRoot` / `ensureStoreRoot` / `confineUnderRoot` with PATH_ESCAPE (STORE-01/05)
- Hand-rolled `publishGraphFiles` dual-write: tmp → fsync → rename **v1 first** → projection/sidecars → status
- `loadGraphV1` refuses projection-only stores with SCHEMA_INVALID (STORE-02)
- `acquireBuildLock` exclusive `wx` create, fail-fast contention, 15m/dead-PID steal (STORE-04)
- STORE-03 proven by rename-order spy **and** mid-protocol fault injection (not final-state-only)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end store path resolve + publish one graph.v1** - `1e7de8d` (feat)
2. **Task 2: Exclusive .build.lock with stale steal** - `88e2764` (feat)
3. **Task 3: Wire lock + publish contract tests** - `5fe2d9e` (feat)

_Note: Task 1 was tracer TDD-shaped (behavior tests + implementation together) committed green after verify._

## Files Created/Modified

- `src/io/paths.ts` — DEFAULT_STORE_DIR, resolveStoreRoot, ensureStoreRoot, confineUnderRoot, storeFile
- `src/io/safe-json.ts` — readJsonFile / writeJsonAtomicTemp (fsync)
- `src/io/atomic-publish.ts` — publishGraphFiles, DEFAULT_WRITE_PROJECTION=false
- `src/io/load-graph.ts` — loadGraphV1 (v1-only SoT)
- `src/io/lock.ts` — acquireBuildLock, STALE_MS, LockHandle
- `src/index.ts` — public IO exports
- `tests/paths-confine.test.ts` — STORE-01/05
- `tests/lock.test.ts` — STORE-04
- `tests/publish-dual-write.test.ts` — STORE-02/03 + lock integration

## Decisions Made

- **DEFAULT_WRITE_PROJECTION = false** — research discretion; projection still supported when requested
- **publish does not take the lock** — single responsibility; documented usage is acquire → publish → release
- **Missing SoT → SCHEMA_INVALID** — no dedicated missing-file code; maps cleanly to existing reason surface
- **Test-only hooks** `_renameSync` / `_afterV1Rename` on PublishPlan for STORE-03 order proof without mocking all of `fs`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 complete: package + ontology + store IO foundations ready for Phase 2 extract/normalize/build pipeline
- Callers should use `acquireBuildLock(store, owner)` → `publishGraphFiles({..., writeProjection: DEFAULT_WRITE_PROJECTION})` → `release()`
- No extract/CLI yet (deferred)

## Known Stubs

None — IO modules are production-quality hand-rolls; test hooks are intentional and not public API surface beyond PublishPlan optional fields.

## Self-Check: PASSED

- FOUND: src/io/paths.ts, src/io/lock.ts, src/io/atomic-publish.ts, src/io/load-graph.ts, src/io/safe-json.ts
- FOUND: tests/paths-confine.test.ts, tests/lock.test.ts, tests/publish-dual-write.test.ts
- FOUND: .planning/phases/01-foundation-identity/01-03-SUMMARY.md
- FOUND commits: 1e7de8d, 88e2764, 5fe2d9e
- npm test: 54/54 pass; npm run build: pass; test:coverage lines 86.15% (≥80)
