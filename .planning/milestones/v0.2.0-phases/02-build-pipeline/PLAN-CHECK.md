# Phase 2 Plan Check — Build pipeline

**Checked:** 2026-08-02  
**Phase:** 02-build-pipeline  
**Plans verified:** 4 (`02-01` … `02-04`)  
**VALIDATION.md:** present (`02-VALIDATION.md`)  
**Verdict:** **PASS**

Plans will achieve the Phase 2 goal if executed as written. No blockers found. Warnings below are non-blocking.

---

## Goal (ROADMAP)

> Users can build a durable graph.v1 from Markdown and JSONL with review gates and honest status

### Success criteria → must_haves coverage

| # | ROADMAP success criterion | Covered by plan must_haves / tasks | Status |
|---|---------------------------|-------------------------------------|--------|
| 1 | Deterministic MD/text extract; JSON/JSONL field map | 02-01 (MD OQ-1 + free-prose); 02-02 (JSONL + extractByPath); 02-04 multi-source wire | Covered |
| 2 | Fingerprints + multiset provenance + best_tier | 02-01 fingerprint; 02-03 normalize multiset/bestTier; 02-04 incremental skip | Covered |
| 3 | Exact same-type merge only; same_as advisory | 02-03 Task 2 + must_haves | Covered |
| 4 | Review stable ids; mutate only on accept | 02-03 Task 3 (rv_, accept/reject under lock) | Covered |
| 5 | Status counts, engine, freshness after offline build | 02-04 status + build tracer + Task 3 freshness | Covered |

---

## Dimension 1: Requirement Coverage

| Requirement | Plans (`requirements` frontmatter) | Implementing tasks | Status |
|-------------|------------------------------------|--------------------|--------|
| EXT-01 | 02-01, 02-04 | 02-01 T1–T2; 02-04 integration | Covered |
| EXT-02 | 02-02, 02-04 | 02-02 T1–T2; 02-04 multi-hop build | Covered |
| EXT-03 | 02-01, 02-04 | 02-01 fingerprint/discover; 02-04 incremental + manifest | Covered |
| NORM-01 | 02-03, 02-04 | 02-03 T1; 02-04 multi-source merge | Covered |
| NORM-02 | 02-03, 02-04 | 02-03 T2 | Covered |
| REV-01 | 02-03, 02-04 | 02-03 T3; 02-04 queue sidecar merge | Covered |
| STAT-01 | 02-04 | 02-04 T1, T3 | Covered |

All ROADMAP Phase 2 requirement IDs appear in plan frontmatter. ONT-02 is Phase 1 complete; D-07 correctly reuses `applyUnknownPolicy` rather than re-scoping ONT-*.

---

## Dimension 2: Task Completeness

| Plan | Tasks | Structure (`verify.plan-structure`) | Notes |
|------|-------|-------------------------------------|-------|
| 02-01 | 3 | valid | tracer+tdd + 2 auto/tdd; files/action/verify/done present |
| 02-02 | 2 | valid | tracer+tdd + auto/tdd |
| 02-03 | 3 | valid | tracer+tdd + 2 auto/tdd |
| 02-04 | 3 | valid | tracer+tdd + 2 auto/tdd |

Actions are specific (grammar rules, API shapes, Phase 1 call sites). `<verify><automated>` present on every task (`npm test` or `npm run test:coverage`).

---

## Dimension 3: Dependency Correctness

```
02-01 (wave 1, depends_on: [])
  └─► 02-02 (wave 2, depends_on: [02-01])
        └─► 02-03 (wave 3, depends_on: [02-01, 02-02])
              └─► 02-04 (wave 4, depends_on: [02-01, 02-02, 02-03])
```

- No cycles  
- References match existing plan ids (`02-01` style consistent with Phase 1)  
- Wave numbers = max(deps)+1  

---

## Dimension 4: Key Links Planned

| Link | Planned in |
|------|------------|
| extract → provenance `content_hash` | 02-01, 02-02 |
| extractByPath → fingerprintFile | 02-02 |
| normalize → applyUnknownPolicy | 02-03 |
| reviewItemId → review-queue items | 02-03 |
| reviewResolve accept → publish under lock | 02-03 |
| build → acquireBuildLock → publishGraphFiles → release | 02-04 |
| build → sources.manifest / review-queue / ontology.lock sidecars | 02-04 |
| status → loadGraphV1 only (never projection SoT) | 02-04 |

Artifacts are not isolated: orchestrator and review explicitly call Phase 1 IO.

---

## Dimension 5: Scope Sanity

| Plan | Tasks | files_modified (listed) | estimate.tokens | estimate-check |
|------|-------|-------------------------|-----------------|----------------|
| 02-01 | 3 | 11 | 55000 | under budget (ratio ~0.55) |
| 02-02 | 2 | 5 | 40000 | under budget (~0.40) |
| 02-03 | 3 | 8 | 60000 | under budget (~0.60) |
| 02-04 | 3 | 6 | 55000 | under budget (~0.55) |

- Tasks/plan within 2–3 target  
- `estimate.confidence: low` (no prior phase actuals) — treat as advisory only  
- **WARNING:** 02-01 lists 11 files (warning band ≥10); still under 15 blocker threshold; work is coherent (ids + fingerprint + MD extract + fixtures)

---

## Dimension 6: Verification Derivation

must_haves truths are user/library-observable (EXTRACTED edges, free-prose honesty, best_tier, rv_ stability, status fields, lock+publish), not “package installed” fluff. Artifacts and key_links map to truths. VALIDATION.md maps each truth class to automated tests.

---

## Dimension 7: Context Compliance (D-01…D-12)

| Decision | Implementing plan/task evidence | Status |
|----------|----------------------------------|--------|
| D-01 offline deterministic / no LLM | 02-01 T2, 02-02 T2 explicit bans | Honored |
| D-02 MD links/headings/edges | 02-01 T1–T2 OQ-1 grammar | Honored |
| D-03 JSON/JSONL field map | 02-02 | Honored |
| D-04 fingerprints + rebuild use | 02-01 fingerprint; 02-04 incremental | Honored (M1–M5 deferred correctly) |
| D-05 multiset + best_tier | 02-01 ids export; 02-03 normalize | Honored |
| D-06 exact same-type merge; same_as advisory | 02-03 T2; no fuzzy | Honored |
| D-07 unknown via Phase 1 policy | 02-03 T1 policy gate | Honored |
| D-08 review rv_ + accept-only mutate | 02-03 T3 | Honored |
| D-09 lock + publishGraphFiles + loadGraphV1 | 02-03 reviewResolve; 02-04 build/status | Honored |
| D-10 status counts/engine/freshness | 02-04 status | Honored |
| D-11 copyright header | Called out in plan actions | Honored |
| D-12 node:test + c8 + fixtures | All plans TDD + corpus fixtures | Honored |

### Deferred ideas (must not appear as deliverables)

| Deferred | In plans? |
|----------|-----------|
| Full Query IR | Explicitly excluded (02-04) |
| packSubgraph / answer | Not present |
| CLI `gsd-graph` binary | Explicitly excluded |
| Full M1–M5 maintain | Fingerprints only; documented |
| LLM / MCP / communities / NL→IR | Not present |

No scope leakage into Phase 3/4/5/6 surfaces.

### Scope reduction scan

No invented “v1 static labels” style reduction of locked decisions. Incremental path is intentionally Phase-2-scoped (matches CONTEXT deferred M1–M5). Free-prose may emit weak INFERRED `mentions` only — still forbids typed multi-hop EXTRACTED predicates per D-01 honesty.

---

## Dimension 7c: Architectural Tier Compliance

RESEARCH Architectural Responsibility Map: library pipeline + local FS store.

All tasks target `src/sources/*`, `src/pipeline/*`, `src/schema/*`, schemas, tests — library tier. No browser/API/MCP misplacement.  
**PASS**

---

## Dimension 8: Nyquist Compliance

VALIDATION.md exists. Wave 0 absorbed into in-plan TDD (not a separate wave). No `<automated>MISSING</automated>`.

| Task | Plan | Wave | Automated Command | Status |
|------|------|------|-------------------|--------|
| T1–T3 | 02-01 | 1 | `npm test` | ✅ |
| T1–T2 | 02-02 | 2 | `npm test` | ✅ |
| T1–T3 | 02-03 | 3 | `npm test` | ✅ |
| T1–T2 | 02-04 | 4 | `npm test` | ✅ |
| T3 | 02-04 | 4 | `npm run test:coverage` | ✅ |

Sampling: every wave has 100% automated verify → ✅  
Wave 0: test files created by plan tasks → ✅ (absorbed)  
Frontmatter `nyquist_compliant: false` is draft bookkeeping; content of VALIDATION.md is complete for execution.

**Overall Dimension 8: PASS**

---

## Dimension 9: Cross-Plan Data Contracts

| Shared entity | Producer | Consumer | Compatible? |
|---------------|----------|----------|-------------|
| ExtractResult / GraphNode / Triple | 02-01, 02-02 | 02-03 normalize, 02-04 build | Same Phase 1 types + ExtractResult from 02-01 |
| content_hash `sha256:hex` | fingerprint | extract provenance, manifest | Consistent format |
| ReviewItem / ReviewQueueDocument | 02-03 | 02-04 sidecars + mergeReviewItems | Shared schema + helpers |
| GraphV1Document | 02-04 assemble | publishGraphFiles / loadGraphV1 / status | Phase 1 validators |

No strip/sanitize vs re-parse conflict on the same stream.  
**PASS**

---

## Dimension 10: CLAUDE.md Compliance

**SKIPPED** (no `./CLAUDE.md` in project root). Workspace copyright/test norms mirrored via D-11/D-12 in CONTEXT and plans.

---

## Dimension 11: Research Resolution

RESEARCH.md Open Questions:

| OQ | Status in RESEARCH |
|----|--------------------|
| OQ-1 MD edge grammar | **RESOLVED** |
| OQ-2 build API shape | **RESOLVED** |
| OQ-3 Fingerprint algorithm | **RESOLVED** |
| OQ-4 Review-queue schema | **RESOLVED** |

Plans cite OQ resolutions (grammar, sha256 raw bytes, stages+build, review schema).  
**PASS**

---

## Dimension 12: Pattern Compliance

**SKIPPED** (no `PATTERNS.md` for this phase). Plans reference RESEARCH code examples and Phase 1 analogs (validators, publish, policy).

---

## Integration: Phase 1 APIs

| API | Exists (verified) | Used by plans |
|-----|-------------------|---------------|
| `loadOntologyPack` / `applyUnknownPolicy` | `src/index.ts` | 02-03, 02-04 |
| `resolveStoreRoot` / `ensureStoreRoot` | exported | 02-04 |
| `acquireBuildLock` / `STALE_MS` | exported | 02-03, 02-04 |
| `publishGraphFiles` / `DEFAULT_WRITE_PROJECTION` | exported; writes `.last-build-status.json` | 02-03, 02-04 |
| `loadGraphV1` | exported | 02-03, 02-04 |
| `validateGraphV1` | exported | 02-04 |
| `GSD_GRAPH_REASON` (CORPUS_NOT_FOUND, PATH_ESCAPE, LIMIT_EXCEEDED) | `src/errors.ts` | 02-01, 02-04 |
| Ajv compile-once pattern | `src/schema/validators.ts` | 02-03 review-queue validator |

Plans correctly treat projection as non-SoT and compose STAT-01 from v1 + minimal last-build-status + lock + queue (matches RESEARCH Phase 1 publish note).

---

## Warnings (non-blocking)

```yaml
issues:
  - plan: "02-01"
    dimension: scope_sanity
    severity: warning
    description: "Plan 02-01 lists 11 files_modified (warning band ≥10). Coherent extract slice; monitor context during execution."
    fix_hint: "If execution struggles, split discover/redact into a thin follow-on plan — not required before execute."

  - plan: null
    dimension: scope_sanity
    severity: info
    description: "All estimate.confidence values are low (sample_count 0). Token figures are uncalibrated advisory only."
    fix_hint: "No action; smart-zone checks report under budget."

  - plan: null
    dimension: nyquist_compliance
    severity: info
    description: "02-VALIDATION.md frontmatter nyquist_compliant: false / wave_0_complete: false while content is ready for execution."
    fix_hint: "Flip flags as tests land during execute; not a plan-content defect."

  - plan: null
    dimension: verification_derivation
    severity: info
    description: "Most tasks run full npm test rather than file-filtered node:test; latency may grow as suite expands (still within VALIDATION 120s budget)."
    fix_hint: "Optional: add targeted node --test paths in verify for faster task loops."
```

---

## Coverage Summary

| Requirement | Plans | Status |
|-------------|-------|--------|
| EXT-01 | 01, 04 | Covered |
| EXT-02 | 02, 04 | Covered |
| EXT-03 | 01, 04 | Covered |
| NORM-01 | 03, 04 | Covered |
| NORM-02 | 03, 04 | Covered |
| REV-01 | 03, 04 | Covered |
| STAT-01 | 04 | Covered |

### Plan Summary

| Plan | Tasks | Wave | depends_on | Status |
|------|-------|------|------------|--------|
| 02-01 | 3 | 1 | [] | Valid |
| 02-02 | 2 | 2 | [02-01] | Valid |
| 02-03 | 3 | 3 | [02-01, 02-02] | Valid |
| 02-04 | 3 | 4 | [02-01, 02-02, 02-03] | Valid |

---

## Verdict

**PASS** — 0 blockers, 1 warning, 3 info.

Plans verified. Safe to run `/gsd-execute-phase 2` (or plan-phase proceed-to-execute).

### Blockers

None.
