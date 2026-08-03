---
phase: 02-build-pipeline
plan: 03
subsystem: normalize-review
tags: [normalize, provenance, best_tier, exact-merge, review-queue, rv_ids, accept-reject, NORM-01, NORM-02, REV-01]

requires:
  - phase: 01-foundation-identity
    provides: applyUnknownPolicy, loadOntologyPack, acquireBuildLock, publishGraphFiles, loadGraphV1, Ajv validators
  - phase: 02-build-pipeline
    provides: pipeline ids (tripleId, bestTier, reviewItemId, stableStringify), GraphNode/Triple types
provides:
  - normalize() multiset provenance + best_tier confidence (NORM-01)
  - Exact same-type id/alias merge; same_as advisory only (NORM-02)
  - Unknown predicate/type policy gate → reviewItems without write (D-07)
  - schemas/review-queue.schema.json + validateReviewQueue
  - loadReviewQueue / mergeReviewItems / reviewResolve accept/reject under lock (REV-01)
affects:
  - 02-04 build orchestrator normalize + review publish
  - Phase 3 maintain provenance invalidation
  - Phase 4 CLI review accept|reject surface

actuals:
  tokens: 14370
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - Multiset provenance union keyed by source_path+extractor+content_hash+confidence
    - Stable rv_ review ids from kind + stableStringify(payload) without timestamps
    - reviewResolve is sole privileged mutation path under acquireBuildLock + publishGraphFiles
    - extendOntology is opt-in only — never ambient lock expansion

key-files:
  created:
    - src/pipeline/normalize.ts
    - src/pipeline/review.ts
    - schemas/review-queue.schema.json
    - tests/normalize.test.ts
    - tests/review-queue.test.ts
  modified:
    - src/types.ts
    - src/schema/validators.ts
    - src/index.ts

key-decisions:
  - "Tasks 1–2 co-committed: merge + multiset shipped together (shared normalize module)"
  - "predicate_unknown accept without extendOntology coerces p→related_to (fail-closed, no ambient expand)"
  - "entity_merge payload accepts keep_id/drop_id and keep/drop aliases for normalize compatibility"
  - "mergeReviewItems never reopens accepted/rejected when decisions[] contains id"

patterns-established:
  - "normalize is pure (no FS); reviewResolve owns lock+publish"
  - "Review queue is a publish sidecar validated by Ajv like graph.v1"
  - "same_as edges write when allowlisted but never rewrite node ids in normalize"

requirements-completed: [NORM-01, NORM-02, REV-01]

coverage:
  - id: D1
    description: "Dedup (s,p,o) unions provenance multiset; triple.confidence = bestTier (EXTRACTED wins)"
    requirement: NORM-01
    verification:
      - kind: unit
        ref: tests/normalize.test.ts#unions provenance multiset on (s,p,o) and sets confidence = bestTier (EXTRACTED wins)
        status: pass
    human_judgment: false
  - id: D2
    description: "Exact same-type id/alias merge only; cross-type queues entity_merge; same_as advisory"
    requirement: NORM-02
    verification:
      - kind: unit
        ref: tests/normalize.test.ts#two nodes same type with identical id → single keeper; aliases/labels merged
        status: pass
      - kind: unit
        ref: tests/normalize.test.ts#exact alias merge: label/alias slug equals other id local part → single keeper
        status: pass
      - kind: unit
        ref: tests/normalize.test.ts#cross-type same label → no auto-merge; entity_merge review item
        status: pass
      - kind: unit
        ref: tests/normalize.test.ts#same_as triple remains advisory edge; node ids not rewritten
        status: pass
    human_judgment: false
  - id: D3
    description: "Unknown predicate with review policy emits review item and does not write triple"
    requirement: NORM-01
    verification:
      - kind: unit
        ref: tests/normalize.test.ts#unknown predicate with review policy → reviewItems kind predicate_unknown; triple not written
        status: pass
    human_judgment: false
  - id: D4
    description: "Stable rv_ ids across rebuilds; reject no-write; accept entity_merge mutates graph under lock"
    requirement: REV-01
    verification:
      - kind: unit
        ref: tests/review-queue.test.ts#same kind+payload → identical rv_ id (no created_at in hash)
        status: pass
      - kind: unit
        ref: tests/review-queue.test.ts#reject records decision and does not add contested triple
        status: pass
      - kind: unit
        ref: tests/review-queue.test.ts#accept entity_merge rewrites triples and deletes drop node
        status: pass
      - kind: unit
        ref: tests/review-queue.test.ts#accept predicate_unknown without extendOntology coerces to related_to
        status: pass
      - kind: unit
        ref: tests/review-queue.test.ts#accept predicate_unknown with extendOntology writes proposed p + lock sidecar
        status: pass
      - kind: unit
        ref: tests/review-queue.test.ts#prior decision prevents re-opening pending on identical payload rebuild
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-03
status: complete
---

# Phase 2 Plan 03: Normalize + Review Queue Summary

**Multiset provenance with best_tier, exact same-type merge only, and review-queue accept/reject that mutates graph/ontology solely on accept under the build lock.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-03T03:37:31Z
- **Completed:** 2026-08-03T03:43:14Z
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- `normalize()` unions provenance on `(s,p,o)`, sets `confidence = bestTier(entries)`, and gates unknowns via `applyUnknownPolicy` (no contested write on review)
- Exact same-type id/alias merge only; `same_as` remains an advisory edge; cross-type clashes emit `entity_merge` review items
- Review control plane: `schemas/review-queue.schema.json`, `validateReviewQueue`, `loadReviewQueue` / `mergeReviewItems` / `reviewResolve` with stable `rv_*` ids and lock-scoped publish

## Task Commits

Each task was committed atomically:

1. **Task 1+2: normalize multiset + exact merge** - `8d0c583` (feat) — tracer + NORM-02 merge co-located in `normalize.ts`
2. **Task 3: review queue schema + accept/reject** - `bd17ff2` (feat)

**Plan metadata:** (pending docs commit)

_Note: Tasks 1 and 2 shared one feat commit because merge + multiset live in the same pure module and ship as one green unit._

## Files Created/Modified

- `src/pipeline/normalize.ts` — pure normalize stage (canonical ids, exact merge, policy, multiset)
- `src/pipeline/review.ts` — load/merge queue + `reviewResolve` under lock
- `schemas/review-queue.schema.json` — Ajv authority for review-queue SoT
- `src/schema/validators.ts` — `validateReviewQueue` compile-once
- `src/types.ts` — ReviewItem / ReviewQueueDocument mirrors
- `src/index.ts` — public exports
- `tests/normalize.test.ts` — NORM-01/02 + policy
- `tests/review-queue.test.ts` — REV-01 stable ids + accept/reject effects

## Decisions Made

- Co-committed Task 1 (tracer multiset/policy) with Task 2 (exact merge) in one feat — shared file and interdependent tests
- `predicate_unknown` accept without `extendOntology` coerces to `related_to` rather than throwing (fail-closed, no ambient ontology expand)
- Payload field aliases: both `keep_id`/`drop_id` (DESIGN) and `keep`/`drop` (normalize emit) accepted on entity_merge resolve
- No new npm packages (T-02-SC)

## Deviations from Plan

### Auto-fixed Issues

None - plan executed as written with one packaging deviation:

**1. [Rule 2 - Process] Tasks 1–2 single commit**
- **Found during:** Task 2
- **Issue:** Plan expected separate tracer then merge commits; merge was implemented with the tracer to keep tests green as one unit
- **Fix:** Single `feat(02-03)` commit covering NORM-01 + NORM-02; documented here
- **Files modified:** `src/pipeline/normalize.ts`, `tests/normalize.test.ts`
- **Commit:** `8d0c583`

## Threat Flags

None beyond plan register (T-02-06..09 mitigated: exact merge only, policy review default, extendOntology opt-in, lock around resolve).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `src/pipeline/normalize.ts`
- FOUND: `src/pipeline/review.ts`
- FOUND: `schemas/review-queue.schema.json`
- FOUND: `tests/normalize.test.ts`
- FOUND: `tests/review-queue.test.ts`
- FOUND: commit `8d0c583`
- FOUND: commit `bd17ff2`
- `npm test`: 104 pass
- `npm run build`: pass
