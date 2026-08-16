---
phase: 03-query-lifecycle-maintain
verified: 2026-08-03T11:40:14Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Query, lifecycle & maintain — Verification Report

**Phase Goal:** Users can multi-hop query a published graph and keep it correct across edits  
**Verified:** 2026-08-03T11:40:14Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Query IR supports term seed-expand, path, neighborhood, and filter with consistent confidence-budget tier ranks | ✓ VERIFIED | `src/pipeline/query.ts` implements exclusive dispatch (path → neighborhood → filter → seed_expand); pure-TS undirected BFS adjacency; `confidenceRank` shares `TIER_RANK` with `bestTier` in `ids.ts`. Behavioral: `tests/query.test.ts` — multi-hop Drought→Crop Failure→Food Shortage, term/alias seed-expand, 1-hop neighborhood, filter by predicates/confidenceMin/types, applyBudget drops AMBIGUOUS→INFERRED→EXTRACTED with `ceil(JSON/4)`, disk load via `loadGraphV1` without `graph.json`. |
| 2 | Incremental maintain invalidates multiset provenance correctly against the M1–M5 matrix | ✓ VERIFIED | `invalidateProvenance` in `src/pipeline/maintain.ts` filters provenance by `normPathKey`, recomputes `bestTier`, drops empty-provenance triples. `build({ full: false })` sets `pathsToDrop = changed ∪ removed` and always invalidates prior triples (deleted-source gap). `maintain()` is lazy-require alias of `build({ ...opts, full: false })`. Behavioral: `tests/maintain.test.ts` M1–M5 pure cases + deleted-source integration + maintain alias + last-diff-base + projectGraph. |
| 3 | Snapshot save/list/restore round-trips `graph.v1`; diff reports ± nodes and triples by id vs snapshot or last-diff-base | ✓ VERIFIED | `snapshotSave`/`List`/`Restore` under `store/snapshots/` with lock + `confineUnderRoot` + PATH_ESCAPE sanitization; list excludes `.last-diff-base.json`. `diff` resolves named snapshot → last-diff-base → `NO_BASELINE`; ± by id with payload-changed detection. Behavioral: `tests/snapshot.test.ts` round-trip triple ids + PATH_ESCAPE; `tests/diff.test.ts` last-diff-base mutate, named snapshot, NO_BASELINE, changed payload, v1-only SoT. |
| 4 | Repair regenerates projection from v1 only and invents no triples | ✓ VERIFIED | `repair()` loads only `loadGraphV1`, maps via `projectGraph` (edges = triples 1:1), publishes with `writeProjection: true` under `acquireBuildLock`. Behavioral: `tests/repair.test.ts` edges ⊆ v1 triple ids, no invent when projection deleted, SCHEMA_INVALID without v1, lock held during publish. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Plan-level must-have detail (all supporting truths)

| Plan | Truth | Status | Test / code |
| ---- | ----- | ------ | ----------- |
| 03-01 | path multi-hop with predicates | ✓ | `query path` → multi-hop Drought chain |
| 03-01 | term seed-expand id/label/alias | ✓ | `query seed_expand` suite |
| 03-01 | neighborhood undirected hops by id | ✓ | `query neighborhood` suite |
| 03-01 | filter types/predicates/confidenceMin shared ranks | ✓ | `query filter` + `confidenceRank` |
| 03-01 | applyBudget ceil(JSON/4); AMBIGUOUS first | ✓ | `applyBudget` suite |
| 03-01 | query loads only graph.v1 (D-04) | ✓ | `query disk loadGraphV1` |
| 03-02 | invalidateProvenance drop/recompute/empty-drop | ✓ | M1–M5 pure helper suite |
| 03-02 | M1–M5 matrix unit tests | ✓ | 5 dedicated cases green |
| 03-02 | build full:false deleted-source invalidation | ✓ | deleted-source integration |
| 03-02 | maintain alias of build full:false | ✓ | maintain alias suite |
| 03-02 | build writes snapshots/.last-diff-base.json | ✓ | last-diff-base suite + `writeLastDiffBase` |
| 03-02 | writeProjection → projectGraph payload | ✓ | writeProjection suite |
| 03-03 | snapshotSave ISO-name under snapshots/ | ✓ | save/list/restore round-trip |
| 03-03 | snapshotList newest-first, skips last-diff-base | ✓ | round-trip list assertion |
| 03-03 | snapshotRestore under lock, no invent | ✓ | restore recovers triple ids |
| 03-03 | invalid names → PATH_ESCAPE | ✓ | PATH_ESCAPE suite |
| 03-04 | diff ± by id vs snapshot / last-diff-base | ✓ | diff suite (added/removed/changed) |
| 03-04 | no baseline → NO_BASELINE | ✓ | empty store case |
| 03-04 | repair from v1 only via projectGraph | ✓ | repair suite |
| 03-04 | repair holds build lock | ✓ | lock held/released case |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/pipeline/query.ts` | Query IR dispatcher, BFS, applyBudget | ✓ VERIFIED | 492 lines; exports `query`, `applyBudget`, path/seed/neighborhood/filter helpers; pure-TS adjacency |
| `src/pipeline/ids.ts` | exported `confidenceRank` shared ranks | ✓ VERIFIED | single `TIER_RANK` table used by `confidenceRank` and `bestTier` |
| `src/pipeline/maintain.ts` | invalidateProvenance + maintain alias | ✓ VERIFIED | pure invalidation + lazy-require `build({ full: false })` |
| `src/pipeline/project.ts` | projectGraph disposable edges | ✓ VERIFIED | edges 1:1 from triples; no invent |
| `src/pipeline/build.ts` | full:false invalidation, last-diff-base, projection | ✓ VERIFIED | `pathsToDrop = changed∪removed`; `writeLastDiffBase`; `projectGraph` when writeProjection |
| `src/pipeline/snapshot.ts` | save/list/restore | ✓ VERIFIED | lock, confineUnderRoot, sanitize, Ajv validate on restore |
| `src/pipeline/diff.ts` | DiffResult ± by id | ✓ VERIFIED | baseline resolution + payload compare |
| `src/pipeline/repair.ts` | repair from v1 | ✓ VERIFIED | loadGraphV1 → projectGraph → publish under lock |
| `src/index.ts` | public Phase 3 façade | ✓ VERIFIED | exports query, applyBudget, maintain, invalidateProvenance, projectGraph, snapshot*, diff, repair, confidenceRank |
| `tests/query.test.ts` | QRY-01/02 gates | ✓ VERIFIED | path/seed/neighborhood/filter/budget/disk |
| `tests/maintain.test.ts` | M1–M5 + deleted source | ✓ VERIFIED | pure + integration |
| `tests/snapshot.test.ts` | SNAP-01 gates | ✓ VERIFIED | round-trip + PATH_ESCAPE |
| `tests/diff.test.ts` | DIFF-01 gates | ✓ VERIFIED | ± id + NO_BASELINE |
| `tests/repair.test.ts` | REP-01 gates | ✓ VERIFIED | projection ⊆ v1 + lock |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `confidenceRank` | `bestTier` / `TIER_RANK` | single rank table EXTRACTED=2 INFERRED=1 AMBIGUOUS=0 | ✓ WIRED | `ids.ts` L7–18, L52–59 |
| `query` | `loadGraphV1` | disk path when `opts.graph` absent | ✓ WIRED | `query.ts` `loadQueryGraph` L413–422 |
| `applyBudget` | `QueryResult.trimmed` | ceil(JSON/4); drop worst first | ✓ WIRED | L363–411, returned from `query` L483–490 |
| `build` full:false | `invalidateProvenance` | pathsToDrop = changed ∪ removed | ✓ WIRED | `build.ts` L249–258 |
| `build` success | `snapshots/.last-diff-base.json` | write under same lock after publish | ✓ WIRED | L384–385, `writeLastDiffBase` L410–423 |
| writeProjection true | `projectGraph` | publishGraphFiles projection payload | ✓ WIRED | L369–377 |
| snapshotSave/restore | `acquireBuildLock` | mutating ops hold `.build.lock` | ✓ WIRED | `snapshot.ts` L98–117, L203–224 |
| snapshot paths | `confineUnderRoot` | snapshots/ under store only | ✓ WIRED | save/list/restore + `resolveNamedSnapshot` |
| snapshotRestore | `publishGraphFiles` + Ajv validate | valid graph.v1 only | ✓ WIRED | `readAndValidateSnapshot` → publish with projectGraph |
| diff baseline | named snapshot → last-diff-base → NO_BASELINE | DESIGN order | ✓ WIRED | `resolveBaseline` L53–94 |
| repair | loadGraphV1 + projectGraph + publishGraphFiles | v1 sole input | ✓ WIRED | `repair.ts` L24–51 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `query` | nodes/triples/paths | `opts.graph` or `loadGraphV1` → adjacency walk | Yes — real graph.v1 triples | ✓ FLOWING |
| `diff` | DiffResult.nodes/triples | current `loadGraphV1` vs baseline file | Yes — id-set arithmetic on live docs | ✓ FLOWING |
| `repair` | projection.edges | `projectGraph(loadGraphV1(...))` | Yes — edges derived 1:1 from v1 triples | ✓ FLOWING |
| `snapshotRestore` | published graph.v1 | Ajv-validated snapshot body | Yes — full v1 round-trip | ✓ FLOWING |
| `build` last-diff-base | graphV1 copy | post-normalize published document | Yes — full graph.v1 written | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite (includes all Phase 3 tests) | `npm test` | 166 pass / 0 fail; duration ~1.8s | ✓ PASS |
| Production build | `npm run build` | `tsc -p tsconfig.build.json` exit 0; dist artifacts present | ✓ PASS |
| No graphology/ngraph | `rg graphology\|ngraph package.json src/` | none | ✓ PASS |
| Public façade | `tests/repair.test.ts` façade case | exports query, maintain, invalidateProvenance, projectGraph, snapshot*, diff, repair, confidenceRank | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No phase-declared `scripts/*/tests/probe-*.sh` | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| QRY-01 | 03-01 | Query IR term seed-expand, path, neighborhood, filter | ✓ SATISFIED | `query.ts` dispatch + `tests/query.test.ts` path/seed/neighborhood/filter |
| QRY-02 | 03-01 | Confidence budget tier ranks consistent | ✓ SATISFIED | shared `TIER_RANK`; applyBudget order; confidenceRank tests |
| MNT-01 | 03-02 | Incremental maintain M1–M5 provenance invalidation | ✓ SATISFIED | `invalidateProvenance` + build full:false + M1–M5 tests |
| SNAP-01 | 03-03 | Snapshot save/list/restore of graph.v1 | ✓ SATISFIED | `snapshot.ts` + round-trip tests |
| DIFF-01 | 03-04 | Diff vs snapshot / last-diff-base (± by id) | ✓ SATISFIED | `diff.ts` + diff tests including NO_BASELINE |
| REP-01 | 03-04 | Repair regenerates projection from v1 without inventing | ✓ SATISFIED | `repair.ts` + repair tests |

No orphaned Phase 3 requirements. Deferred out-of-scope (QRY-03 NL→IR, pack/answer, CLI, Neo4j) correctly remain outside this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in Phase 3 pipeline sources | — | — |

No stub returns, no hollow projection, no graphology/ngraph dependency.

### Human Verification Required

None. `03-VALIDATION.md` marks all Phase 3 behaviors as automated; full suite green provides runtime proof of state transitions (M1–M5, budget drop order, snapshot round-trip, diff arithmetic, repair projection).

### Gaps Summary

No gaps. All four ROADMAP success criteria and all six Phase 3 requirements (QRY-01, QRY-02, MNT-01, SNAP-01, DIFF-01, REP-01) are observably true in the codebase with behavioral tests.

---

_Verified: 2026-08-03T11:40:14Z_  
_Verifier: Claude (gsd-verifier)_
