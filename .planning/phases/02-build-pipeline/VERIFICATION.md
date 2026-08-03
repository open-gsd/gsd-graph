---
phase: 02-build-pipeline
verified: 2026-08-03T03:52:38Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 2: Build pipeline — Verification Report

**Phase Goal:** Users can build a durable graph.v1 from Markdown and JSONL with review gates and honest status  
**Verified:** 2026-08-03T03:52:38Z  
**Status:** PASSED  
**Re-verification:** No — initial verification  
**Score:** 5/5 roadmap success criteria verified  

## Verdict

**PASSED**

Goal-backward verification against live code (not SUMMARY claims). All five ROADMAP success criteria are true in the codebase; EXT-01/02/03, NORM-01/02, REV-01, and STAT-01 have substantive, wired implementations with automated tests that exercise the asserted behaviors. `npm test` → 121/121 pass; `npm run build` → exit 0.

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Deterministic MD/text extract captures links, headings, and explicit edge lines; JSON/JSONL maps fields to EXTRACTED triples | ✓ VERIFIED | `src/sources/markdown.ts` OQ-1 grammar; `src/sources/jsonl.ts` field-map; free-prose honesty (no typed multi-hop EXTRACTED); tests in `extract-markdown.test.ts`, `extract-jsonl.test.ts` |
| 2 | Source fingerprints support incremental rebuild; normalize writes multiset provenance with triple confidence = best_tier | ✓ VERIFIED | `fingerprintFile` → `sha256:` hex; `build()` skips fresh via `sources.manifest.json`; `normalize` unions provenance + `bestTier`; tests in `fingerprint.test.ts`, `normalize.test.ts`, `build-pipeline.test.ts` |
| 3 | Auto-merge is exact same-type id/alias only; `same_as` stays advisory until review accept | ✓ VERIFIED | `mergeExactSameType` in `normalize.ts`; no fuzzy merge; same_as writes edge without id rewrite; unit tests assert both nodes retained |
| 4 | Review queue items have stable ids; accept/reject mutate graph or ontology only on accept | ✓ VERIFIED | `reviewItemId` → `rv_[0-9a-f]{8}`; `reviewResolve` under lock; reject no contested write; accept entity_merge / predicate_unknown paths; `review-queue.test.ts` |
| 5 | Status reports node/triple counts, engine identity, and freshness after a successful offline build | ✓ VERIFIED | `status()` loads `graph.v1` only (never projection as SoT); reports `engine: 'gsd-graph'`, counts, `last_build`, `stale`, `age_hours`; `status.test.ts` + build integration |

**Score:** 5/5 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sources/fingerprint.ts` | sha256 content_hash | ✓ VERIFIED | `fingerprintFile` raw bytes → `sha256:` + 64 hex |
| `src/sources/markdown.ts` | OQ-1 MD extract | ✓ VERIFIED | Wiki, links, H1/H2, edge lines, defs, tags; free-prose honesty |
| `src/sources/jsonl.ts` | JSON/JSONL field-map | ✓ VERIFIED | Line + array modes; EXTRACTED `jsonl/field-map` |
| `src/sources/discover.ts` | Corpus discover + confine | ✓ VERIFIED | CORPUS_NOT_FOUND, PATH_ESCAPE, FILE_TOO_LARGE, sorted paths |
| `src/sources/redact.ts` | Secret redaction | ✓ VERIFIED | sk-/AKIA/PEM → `[REDACTED]` |
| `src/pipeline/ids.ts` | Id + bestTier helpers | ✓ VERIFIED | slugify, nodeId, tripleId, bestTier, stableStringify, reviewItemId |
| `src/pipeline/extract.ts` | Extension router | ✓ VERIFIED | md/txt → markdown; json/jsonl → jsonl; else diagnostic |
| `src/pipeline/normalize.ts` | Multiset + merge + policy | ✓ VERIFIED | best_tier, exact merge, same_as advisory, policy gate |
| `src/pipeline/review.ts` | accept/reject control plane | ✓ VERIFIED | load/merge/resolve under `acquireBuildLock` + `publishGraphFiles` |
| `src/pipeline/build.ts` | Orchestrator under lock | ✓ VERIFIED | discover→extract→normalize→sidecars→publish; caps; incremental |
| `src/pipeline/status.ts` | STAT-01 read path | ✓ VERIFIED | v1-only SoT; counts, engine, freshness, review_queue_count |
| `schemas/review-queue.schema.json` | Ajv authority | ✓ VERIFIED | rv_ pattern, kinds, decisions; `validateReviewQueue` wired |
| `tests/fixtures/corpus/*` | Golden seeds | ✓ VERIFIED | free-prose.md, structured-edges.md, multi-hop.jsonl present |
| Phase 2 test suite | Automated gates | ✓ VERIFIED | fingerprint, extract-*, normalize, review-queue, build-pipeline, status |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `extractMarkdown` / `extractJsonl` | `ProvenanceEntry.content_hash` | fingerprint stamp on every EXTRACTED entry | ✓ WIRED | `contentHash` arg required; router fingerprints when omitted |
| `extractByPath` | extractors | extension switch | ✓ WIRED | `.md/.txt` → markdown; `.json/.jsonl` → jsonl |
| `normalize` | `applyUnknownPolicy` | review/coerce/drop before write | ✓ WIRED | unknown predicate → reviewItems, no triple write |
| `normalize` | `bestTier` | multiset union on (s,p,o) | ✓ WIRED | EXTRACTED wins over INFERRED |
| `build` | `acquireBuildLock` + `publishGraphFiles` | lock → publish → release | ✓ WIRED | try/finally; dual-write v1-first |
| `build` | `sources.manifest.json` | content_hash per source | ✓ WIRED | incremental skip when hash matches |
| `build` | `normalize` + `mergeReviewItems` | working set → graph.v1 + review-queue | ✓ WIRED | always re-normalize after extract/skip |
| `status` | `loadGraphV1` | never open graph.json as truth | ✓ WIRED | projection used only for `projection_stale` flag |
| `reviewResolve` | graph.v1 / ontology.lock | accept mutates; reject records only | ✓ WIRED | under lock + publish |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `build()` | nodes/triples | discover → extractByPath → normalize | Yes — corpus files → EXTRACTED → policy → graph.v1 | ✓ FLOWING |
| `status()` | node_count / triple_count | loadGraphV1 stats / array lengths | Yes — from published v1 | ✓ FLOWING |
| `sources.manifest.json` | content_hash | fingerprintFile(stat) | Yes — raw file bytes | ✓ FLOWING |
| review-queue items | rv_ ids | reviewItemId(kind, stable payload) | Yes — deterministic hash, no timestamps in hash | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (extract, normalize, review, build, status) | `npm test` | 121 pass, 0 fail | ✓ PASS |
| Package build CJS + d.ts | `npm run build` | `tsc` exit 0 | ✓ PASS |
| Public Phase 2 façade | `node -e require('./dist/index.js')` | all required exports are functions; status.engine=`gsd-graph` | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | No phase-declared `scripts/*/tests/probe-*.sh` | SKIP (N/A) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EXT-01 | 02-01 | Deterministic MD/text extract (links, headings, edge lines) | ✓ SATISFIED | `markdown.ts` + `extract-markdown.test.ts` (OQ-1 + free-prose) |
| EXT-02 | 02-02 | JSON/JSONL field-map → EXTRACTED triples | ✓ SATISFIED | `jsonl.ts` + multi-hop fixture + `extract-jsonl.test.ts` |
| EXT-03 | 02-01, 02-04 | Source fingerprints for incremental rebuild | ✓ SATISFIED | `fingerprintFile`, manifest sidecar, `sources_skipped_fresh` in build |
| NORM-01 | 02-03 | Multiset provenance; confidence = best_tier | ✓ SATISFIED | `normalize.ts` union + bestTier; unit test EXTRACTED wins |
| NORM-02 | 02-03 | Exact same-type merge; same_as advisory | ✓ SATISFIED | mergeExactSameType; same_as test retains both nodes |
| REV-01 | 02-03 | Stable review ids; mutate only on accept | ✓ SATISFIED | `reviewResolve` reject/accept tests under lock |
| STAT-01 | 02-04 | Status: counts, engine, freshness | ✓ SATISFIED | `status.ts` + post-build status tests |

No orphaned Phase 2 requirements in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in `src/` | — | Clean |

Notes (info only, not gaps):
- Free-prose path intentionally emits no weak INFERRED mentions (stricter honesty than optional weak path) — aligns with D-01.
- `status` treats lock file presence as `build_in_progress` even for stale locks (documented Phase 2 choice; steal remains build's job).

### Human Verification Required

None. Phase 2 VALIDATION.md states all behaviors have automated verification. Optional REPL smoke (`build` + `status` on personal notes) is non-blocking.

### Gaps Summary

**No gaps.** Phase goal is achieved:

1. Offline MD/JSONL extract is deterministic and honest (no free-prose typed multi-hop).
2. Fingerprints + multiset best_tier + exact merge + advisory same_as are implemented and tested.
3. Review queue has stable `rv_*` ids; accept mutates under lock; reject does not write contested drafts.
4. `build()` publishes durable `graph.v1.json` (+ sidecars) under `.build.lock`; `status()` reports STAT-01 fields without treating projection as SoT.

---

## Evidence Detail (codebase, not SUMMARY)

### SC-1 — MD/JSONL extract
- Grammar documented in `src/sources/markdown.ts` header; primary edge `[[A]] --p--> [[B]]` plus long/short forms.
- Free-prose fixture narrates causes/supports/contradicts/precedes/depends_on in prose only; test asserts zero EXTRACTED triples with those predicates.
- `multi-hop.jsonl`: Drought → Crop Failure → Food Shortage via `causes` EXTRACTED.

### SC-2 — Fingerprints + multiset best_tier
- `fingerprintFile`: `createHash('sha256').update(bytes)` → `sha256:${hex}`.
- Incremental: `build` compares manifest `content_hash`; increments `sources_skipped_fresh`; strips changed-path provenance; always re-normalizes.
- Multiset key: `source_path\0extractor\0content_hash\0confidence`; confidence = `bestTier`.

### SC-3 — Exact merge / same_as
- Same type + id or exact alias slug match → single keeper; cross-type → `entity_merge` review, no auto-merge.
- `same_as` allowed edge writes without rewriting node ids in normalize.

### SC-4 — Review accept/reject
- Schema + Ajv `validateReviewQueue`; ids `^rv_[0-9a-f]{8}$`.
- reject: decision recorded, no contested triple.
- accept entity_merge: rewrite s/o drop→keep, delete drop, publish under lock.
- accept predicate_unknown without `extendOntology`: coerce to `related_to` (fail-closed).

### SC-5 — build → graph.v1 + status
- `build` → `publishGraphFiles` with `graph.v1`, `sources.manifest.json`, `review-queue.json`, `ontology.lock.json`.
- Caps: 100k nodes / 250k triples → `LIMIT_EXCEEDED`.
- `status`: `exists`, `node_count`, `triple_count`, `engine: 'gsd-graph'`, `last_build`, `stale`, `age_hours`, `review_queue_count`.

### Public exports (Phase 2 surface)
`discoverSources`, `fingerprintFile`, `extractMarkdown`, `extractJsonl`, `extractByPath`, `normalize`, `reviewResolve`, `loadReviewQueue`, `mergeReviewItems`, `build`, `status`, `bestTier`, id helpers, `validateReviewQueue`, `assertGraphCaps` — all present on `dist/index.js`.

---

_Verified: 2026-08-03T03:52:38Z_  
_Verifier: Claude (gsd-verifier)_  
_Method: goal-backward against live `src/` + fixtures + `npm test` / `npm run build` (SUMMARY claims not trusted)_
