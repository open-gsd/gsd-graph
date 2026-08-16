---
phase: 02-build-pipeline
plan: 04
subsystem: build-status
tags: [build, status, incremental, fingerprints, lock, publish, STAT-01, EXT-03, D-09, D-10]

requires:
  - phase: 01-foundation-identity
    provides: acquireBuildLock, publishGraphFiles, loadGraphV1, loadOntologyPack, resolveStoreRoot
  - phase: 02-build-pipeline
    provides: discoverSources, extractByPath, fingerprintFile, normalize, mergeReviewItems, review queue schema
provides:
  - build() orchestrator under lock with dual-write publish (D-09)
  - sources.manifest.json content_hash incremental skip (EXT-03, D-04)
  - status() STAT-01 over graph.v1 + lock + queue + last-build-status (D-10)
  - LIMIT_EXCEEDED caps (100k nodes / 250k triples) and CORPUS_NOT_FOUND
  - Phase 2 public façade exports (build, status, stages)
affects:
  - Phase 3 Query IR / maintain M1–M5
  - Phase 4 CLI gsd-graph binary surface
  - Phase 5 pack/answer consumers of store status

actuals:
  tokens: 11841
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - Caller-held acquireBuildLock → publishGraphFiles → release (never projection as SoT)
    - Incremental: strip provenance for changed paths, re-extract, always re-normalize
    - status composes STAT-01 on read side from minimal .last-build-status writer

key-files:
  created:
    - src/pipeline/build.ts
    - src/pipeline/status.ts
    - tests/build-pipeline.test.ts
    - tests/status.test.ts
  modified:
    - src/types.ts
    - src/index.ts

key-decisions:
  - "Tasks 1–3 co-implemented in one feat commit (orchestrator + incremental + status tightly coupled)"
  - "Incremental strategy: retain prior triples whose provenance is not on re-extracted paths; always re-normalize"
  - "status.stale true when manifest path missing; with corpus option also re-fingerprints content_hash"
  - "assertGraphCaps + _afterNormalize test hook for LIMIT_EXCEEDED without multi-GB fixtures"
  - "ontology.lock.json uses pack_id/version/packHash/node_types/predicates:id[] per plan"

patterns-established:
  - "build owns lock+publish; pure stages remain unit-testable"
  - "sources.manifest.json is the EXT-03 fingerprint sidecar"
  - "status never opens graph.json; projection_stale is informational only"

requirements-completed: [EXT-03, STAT-01, EXT-01, EXT-02, NORM-01, NORM-02, REV-01]

coverage:
  - id: D1
    description: "build publishes graph.v1 under lock; loadGraphV1 works; lock released"
    requirement: STAT-01
    verification:
      - kind: integration
        ref: tests/build-pipeline.test.ts#builds structured-edges.md → graph.v1 loadable via loadGraphV1; releases lock
        status: pass
    human_judgment: false
  - id: D2
    description: "sources.manifest + review-queue + ontology.lock sidecars written"
    requirement: EXT-03
    verification:
      - kind: integration
        ref: tests/build-pipeline.test.ts#writes sources.manifest.json, review-queue.json, ontology.lock.json sidecars
        status: pass
    human_judgment: false
  - id: D3
    description: "full:false skips unchanged fingerprints (sources_skipped_fresh ≥ 1)"
    requirement: EXT-03
    verification:
      - kind: integration
        ref: tests/build-pipeline.test.ts#incremental full:false skips unchanged fingerprints (sources_skipped_fresh ≥ 1)
        status: pass
    human_judgment: false
  - id: D4
    description: "JSONL multi-hop + MD+JSONL merge + free-prose honesty"
    requirement: EXT-02
    verification:
      - kind: integration
        ref: tests/build-pipeline.test.ts#JSONL multi-hop fixture alone builds EXTRACTED causes chain into graph.v1
        status: pass
      - kind: integration
        ref: tests/build-pipeline.test.ts#combined MD + JSONL corpus merges via normalize multiset
        status: pass
      - kind: integration
        ref: tests/build-pipeline.test.ts#free-prose corpus builds graph without inventing typed causes chain
        status: pass
    human_judgment: false
  - id: D5
    description: "LIMIT_EXCEEDED and CORPUS_NOT_FOUND reason codes"
    requirement: STAT-01
    verification:
      - kind: unit
        ref: tests/build-pipeline.test.ts#nodes/triples over caps → LIMIT_EXCEEDED before publish
        status: pass
      - kind: unit
        ref: tests/build-pipeline.test.ts#missing corpus root → CORPUS_NOT_FOUND
        status: pass
    human_judgment: false
  - id: D6
    description: "status STAT-01 fields: counts, engine, last_build, review_queue, lock, stale"
    requirement: STAT-01
    verification:
      - kind: integration
        ref: tests/status.test.ts#after build: counts match graph; engine gsd-graph; last_build set
        status: pass
      - kind: integration
        ref: tests/status.test.ts#review_queue_count reflects pending items when unknown predicates queued
        status: pass
      - kind: integration
        ref: tests/status.test.ts#build_in_progress true when .build.lock held
        status: pass
      - kind: integration
        ref: tests/status.test.ts#stale true when a manifest source path is missing on disk
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-03
status: complete
---

# Phase 2 Plan 04: Build orchestrator + status Summary

**Offline `build()` under lock publishes graph.v1 with fingerprints and review sidecars; `status()` reports honest STAT-01 counts and engine identity without treating projection as SoT.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-03T03:46:38Z
- **Completed:** 2026-08-03T03:50:16Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- Wired full offline build orchestrator: discover → extract → normalize → merge review → publishGraphFiles under acquireBuildLock
- Incremental rebuild via sources.manifest.json content_hash (full:false skip; full:true force)
- status() composes exists, node/triple/edge counts, engine `gsd-graph`, last_build, stale, build_in_progress, review_queue_count
- Hard caps (100k/250k) and CORPUS_NOT_FOUND; Phase 2 public API exported; coverage lines 84.9% ≥ 80

## Task Commits

Each task was committed atomically:

1. **Tasks 1–3 (co-implemented): End-to-end build + incremental + status façade** - `626563e` (feat)

**Plan metadata:** `da26941` (docs: complete plan)

_Note: Tracer + expansion tasks shared the same modules; shipped as one feat commit with full integration coverage._

## Files Created/Modified

- `src/pipeline/build.ts` — build() orchestrator, assertGraphCaps, manifest/sidecars
- `src/pipeline/status.ts` — status() STAT-01 read path
- `src/types.ts` — BuildOptions, BuildResult, StatusResult, SourcesManifest
- `src/index.ts` — export build, status, caps, types
- `tests/build-pipeline.test.ts` — lock/publish/incremental/caps/multi-source
- `tests/status.test.ts` — STAT-01 fields + public façade smoke

## Decisions Made

- Incremental: strip prior provenance for re-extracted paths, union new extract, always re-normalize (Phase 2 scope — not full M1–M5)
- status.stale: missing manifest path always; content_hash recheck when `corpus` option passed
- Test-only `_afterNormalize` + exported `assertGraphCaps` for LIMIT_EXCEEDED without huge fixtures
- ontology.lock.json fields: pack_id, version, packHash, node_types, predicates (id array)

## Deviations from Plan

### Auto-fixed Issues

None - plan executed as written (tasks co-committed due to module coupling).

### Intentional co-commit

**1. [Process] Tasks 1–3 single feat commit**
- **Found during:** Task 1 tracer expanded immediately into Task 2/3 behaviors
- **Issue:** Incremental + status polish live in the same build.ts/status.ts as the tracer
- **Fix:** One feat commit with full test suite covering all three task behaviors
- **Files modified:** all plan files
- **Commit:** 626563e

## Sample status JSON shape

```json
{
  "exists": true,
  "store_dir": "/path/to/.gsd-graph",
  "engine": "gsd-graph",
  "schema_version": 1,
  "ontology_pack_id": "general",
  "engine_version": "0.1.0",
  "node_count": 21,
  "triple_count": 12,
  "edge_count": 12,
  "last_build": "2026-08-03T03:50:16.322Z",
  "stale": false,
  "age_hours": 0.0,
  "build_in_progress": false,
  "review_queue_count": 7,
  "projection_stale": true,
  "last_build_status": {
    "status": "ok",
    "reason": "ok",
    "finished_at": "2026-08-03T03:50:16.322Z"
  },
  "reason": "ok"
}
```

## Known Stubs

None.

## Threat Flags

None beyond plan threat model mitigations (T-02-10 lock+publish, T-02-11 v1-only status, T-02-12 caps).

## Self-Check: PASSED

- FOUND: src/pipeline/build.ts
- FOUND: src/pipeline/status.ts
- FOUND: tests/build-pipeline.test.ts
- FOUND: tests/status.test.ts
- FOUND: 626563e
- npm test: 121 pass
- npm run test:coverage: lines 84.9% ≥ 80
