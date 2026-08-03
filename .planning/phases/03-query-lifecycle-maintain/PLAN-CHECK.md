# Phase 3 Plan Check — Query, lifecycle & maintain

**Checked:** 2026-08-03  
**Plans:** `03-01-PLAN.md` … `03-04-PLAN.md` (4)  
**Artifacts:** CONTEXT.md, RESEARCH.md, `03-VALIDATION.md`  
**Gate type:** Revision (pre-execution)  
**Verdict:** **PASS**

---

## Goal-backward (ROADMAP success criteria)

| # | Success criterion | Plans / tasks | Status |
|---|-------------------|---------------|--------|
| 1 | Query IR: term/path/neighborhood/filter + confidence-budget tier ranks | 03-01 T1–T3 (`query`, `confidenceRank`, `applyBudget`, path/seed/neighborhood/filter tests) | COVERED |
| 2 | Incremental maintain M1–M5 multiset provenance invalidation | 03-02 T1–T2 (`invalidateProvenance`, M1–M5 + deleted-source integration, `maintain` alias) | COVERED |
| 3 | Snapshot save/list/restore; diff ± by id vs snapshot / last-diff-base | 03-03 T1–T2 + 03-02 T3 (`.last-diff-base`) + 03-04 T1 (`diff`, NO_BASELINE) | COVERED |
| 4 | Repair projection from v1 only; invents no triples | 03-02 T3 (`projectGraph`) + 03-04 T2 (`repair`) | COVERED |

Phase goal (“multi-hop query + keep graph correct across edits”) is achievable if these plans execute as written.

---

## Requirement coverage

| ID | Description | Plan `requirements` | Covering tasks | Status |
|----|-------------|---------------------|----------------|--------|
| QRY-01 | term seed-expand, path, neighborhood, filter | 03-01 | 01-T1 path; 01-T2 seed/neighborhood/filter | COVERED |
| QRY-02 | Confidence budget / shared tier ranks | 03-01 | 01-T1 `confidenceRank`; 01-T2 filter ranks; 01-T3 `applyBudget` | COVERED |
| MNT-01 | Incremental maintain M1–M5 | 03-02 | 02-T1 M1 + deleted-source; 02-T2 M2–M5 + alias | COVERED |
| SNAP-01 | Snapshot save/list/restore graph.v1 | 03-03 | 03-T1 round-trip; 03-T2 PATH_ESCAPE / validate | COVERED |
| DIFF-01 | Diff vs snapshot / last-diff-base by id | 03-04 (+ baseline prep 03-02) | 04-T1; last-diff-base write 02-T3 | COVERED |
| REP-01 | Repair projection from v1, no invent | 03-04 (+ project 03-02) | 04-T2; projectGraph 02-T3 | COVERED |

No phase-mapped REQUIREMENTS.md ID is missing from plan frontmatter.

---

## Context compliance (D-01…D-12)

| Decision | Honored in | Status |
|----------|------------|--------|
| D-01 Structured IR only; no NL→IR | 03-01 (explicit ban NL→IR / four ops) | OK |
| D-02 Shared tier ranks with bestTier | 03-01 export `confidenceRank` from same TIER_RANK | OK |
| D-03 Pure-TS adjacency; no graphology/ngraph | 03-01 + threat T-03-SC; no new packages | OK |
| D-04 Query/lifecycle read only graph.v1 / loadGraphV1 | 03-01 T1/T3; 03-04 diff/repair | OK |
| D-05 M1–M5 invalidation | 03-02 T1–T2 | OK |
| D-06 Fingerprints; drop provenance; best_tier; drop empty; **deleted sources** | 03-02 T1 `pathsToDrop = changed ∪ removed` always when !full | OK |
| D-07 Snapshots under `snapshots/` | 03-03 | OK |
| D-08 Diff ± ids; named snapshot or last-diff-base | 03-04 T1 + 03-02 last-diff-base | OK |
| D-09 Repair from v1 only | 03-04 T2 + projectGraph | OK |
| D-10 Build lock on mutating paths | 03-02 (build), 03-03 save/restore, 03-04 repair | OK |
| D-11 Copyright headers | All plans call out D-11 on new sources | OK |
| D-12 node:test + c8; M1–M5; query path tests | Plans + VALIDATION map | OK |

**Deferred (must not ship in Phase 3):** packSubgraph/answer, CLI binary, LLM/MCP, communities, NL→IR, Neo4j.

| Deferred | Plans | Status |
|----------|-------|--------|
| packSubgraph / answer | 03-01 explicitly “do not implement packSubgraph”; export helper only | EXCLUDED |
| CLI binary | Library APIs only; “for Phase 4 CLI” is export surface, not CLI | EXCLUDED |
| LLM / MCP / NL→IR | Not present | EXCLUDED |

**No scope-reduction language** inventing “v1 static” substitutes for locked decisions. Full M1–M5 + deleted-source fix is planned, not deferred.

---

## Dimension summary

### 1. Requirement coverage — PASS
All six roadmap requirement IDs appear in plan frontmatter and have concrete tasks.

### 2. Task completeness — PASS
All auto/tdd/tracer tasks include `<files>`, `<action>` (or `<behavior>`+implementation), `<verify>` with `<automated>`, and `<done>`.

| Plan | Tasks | Types |
|------|-------|-------|
| 03-01 | 3 | tracer tdd, auto tdd ×2 |
| 03-02 | 3 | tracer tdd, auto tdd ×2 |
| 03-03 | 2 | tracer tdd, auto tdd |
| 03-04 | 2 | tracer tdd, auto tdd |

### 3. Dependency correctness — PASS

```
03-01 (wave 1, depends_on: [])
  └─► 03-02 (wave 2, depends_on: [03-01])
        ├─► 03-03 (wave 3, depends_on: [03-02])
        └─► 03-04 (wave 4, depends_on: [03-02, 03-03])
```

- Acyclic; no forward-only missing refs.
- Wave numbers match max(deps)+1.
- 03-04 correctly waits for `projectGraph` / last-diff-base (02) and snapshot name resolution (03).

### 4. Key links planned — PASS

| Link | Plan |
|------|------|
| `confidenceRank` ↔ bestTier TIER_RANK | 03-01 |
| `query` → `loadGraphV1` | 03-01 |
| `applyBudget` → QueryResult.trimmed | 03-01 |
| build full:false → `invalidateProvenance` (changed∪removed) | 03-02 |
| build success → `snapshots/.last-diff-base.json` | 03-02 |
| writeProjection → `projectGraph` → publish | 03-02 |
| snapshot save/restore → lock + confineUnderRoot | 03-03 |
| diff baseline: snapshot arg → last-diff-base → NO_BASELINE | 03-04 |
| repair → loadGraphV1 + projectGraph + publish | 03-04 |

### 5. Scope sanity — PASS (warnings only)

| Plan | Tasks | Est. tokens | Notes |
|------|-------|-------------|-------|
| 03-01 | 3 | 60k (confidence: low) | Within 2–3 task target |
| 03-02 | 3 | 65k (low) | Heaviest plan; still ≤3 tasks |
| 03-03 | 2 | 45k (low) | OK |
| 03-04 | 2 | 50k (low) | OK |

**WARNING (non-blocking):** All estimates use `confidence: low` (calibration immature). Prefer task/file counts over token precision. Not over multi-plan task threshold (5+).

### 6. Verification derivation — PASS
`must_haves.truths` are user/library-observable (query returns path, M1–M5 pass, snapshot round-trip, NO_BASELINE, repair edges ⊆ triples). Artifacts and key_links support those truths.

### 7. Context compliance — PASS
See D-01…D-12 table. Discretion areas (IR type shapes, budget unit = DESIGN ceil(JSON/4), maintain alias, snapshot naming) handled per RESEARCH OQs.

### 7b. Scope reduction — PASS
No “static for now / placeholder / skip M5” against locked decisions. Deleted-source gap is explicitly fixed, not postponed.

### 7c. Architectural tier compliance — PASS
RESEARCH responsibility map: query/budget pure library; invalidation + snapshot/diff/repair library write/read over file store; pack/CLI deferred. Plans place capabilities in those tiers (no browser/API tier confusion).

### 8. Nyquist compliance — PASS

- `03-VALIDATION.md` **exists** (gate 8e).
- Every task has `<automated>` (npm test / test-name-pattern / test:coverage).
- Wave 0 absorbed into in-plan TDD (documented in VALIDATION); no dangling `MISSING` automated refs.
- Sampling: each wave has ≤3 tasks with automated verify on all → continuity OK.
- Full-suite `npm test` / `test:coverage` latency noted ~30–120s in VALIDATION — acceptable for phase gate; per-task patterns use name filters where useful.

| Task | Plan | Wave | Automated | Status |
|------|------|------|-----------|--------|
| 01-01..03 | 01 | 1 | npm test (+ patterns) | ✅ |
| 02-01..03 | 02 | 2 | npm test (+ patterns / full) | ✅ |
| 03-01..02 | 03 | 3 | npm test | ✅ |
| 04-01 | 04 | 4 | npm test pattern | ✅ |
| 04-02 | 04 | 4 | npm run test:coverage | ✅ |

### 9. Cross-plan data contracts — PASS

- graph.v1 is SoT across query/maintain/snapshot/diff/repair.
- `projectGraph` single pure mapper (02) consumed by build writeProjection and repair (04).
- last-diff-base written as full graph.v1 (02), read by diff (04); list excludes it (03).
- No plan sanitizes/strips fields another plan needs intact.

### 10. CLAUDE.md compliance — SKIPPED (no project-root CLAUDE.md)
Home-level working notes do not constrain this package’s plan structure. Plans still require copyright headers (D-11) aligned with contributor practice.

### 11. Research resolution — PASS

RESEARCH.md Open Questions:

| OQ | Status | Plan fold-in |
|----|--------|--------------|
| OQ-1 maintain vs build({full:false}) | RESOLVED | 03-02 normative build + maintain alias |
| OQ-2 Budget unit ceil(JSON/4) | RESOLVED | 03-01 T3 |
| OQ-3 snapshots/ + .last-diff-base | RESOLVED | 03-02 T3, 03-03 |
| OQ-4 Undirected path/neighborhood | RESOLVED | 03-01 T1–T2 |

### 12. Pattern compliance — SKIPPED (no PATTERNS.md for phase)

### Verify command format sanity — PASS
No `pnpm ls | grep ^`, no `2>/dev/null || echo 0` comparison traps in verify blocks. Coverage gate uses project script, not hard-coded test counts.

---

## Targeted checklist (orchestrator)

| Check | Result |
|-------|--------|
| Goal-backward 4 success criteria | PASS |
| QRY-01/02, MNT-01, SNAP-01, DIFF-01, REP-01 | PASS |
| D-01..D-12 | PASS |
| No pack / CLI binary / LLM leakage | PASS |
| VALIDATION.md present | PASS |
| RESEARCH OQs resolved | PASS |
| M1–M5 covered | PASS |
| Deleted-source fix in build({full:false}) | PASS |
| Pure-TS (no graphology/ngraph) | PASS |
| Waves acyclic 1→2→3→4 | PASS |

---

## Issues

### Blockers
*None.*

### Warnings

```yaml
issues:
  - plan: null
    dimension: scope_sanity
    severity: warning
    description: "All four plans set estimate.confidence: low (pre-calibration). Token figures are advisory only."
    fix_hint: "Optional: after Phase 3 execution, record actuals for future estimate-check calibration. Do not block execution."
  - plan: "03-02"
    dimension: scope_sanity
    severity: warning
    description: "Plan 03-02 is the densest slice (invalidation + build rewrite + projectGraph + last-diff-base + M1–M5 tests)."
    fix_hint: "Acceptable at 3 tasks; executor should not expand scope mid-plan. If context pressure appears, finish T1–T2 before T3 rather than splitting mid-execution without replan."
```

### Info
- VALIDATION frontmatter `nyquist_compliant: false` is draft pre-execution state; plan content is Nyquist-ready. Flip after green suite.
- 03-01 T1 allows temporary “not implemented” on non-path ops only because T2 lands in the same plan — keep sequential task order.

---

## Plan summary

| Plan | Wave | Reqs | Tasks | Files (declared) | Status |
|------|------|------|-------|------------------|--------|
| 03-01 | 1 | QRY-01, QRY-02 | 3 | query.ts, ids.ts, types, index, query.test | Valid |
| 03-02 | 2 | MNT-01 | 3 | maintain.ts, project.ts, build.ts, types, index, maintain/build tests | Valid |
| 03-03 | 3 | SNAP-01 | 2 | snapshot.ts, types, index, snapshot.test | Valid |
| 03-04 | 4 | DIFF-01, REP-01 | 2 | diff.ts, repair.ts, project, types, index, diff/repair tests | Valid |

---

## Recommendation

**PASS** — Plans will achieve Phase 3 goal if executed as written. No revision loop required.

Proceed with `/gsd-execute-phase 3` (wave order 03-01 → 03-02 → 03-03 → 03-04).

---

*Plan-checker: goal-backward verification only. Post-execution truth is owned by gsd-verifier / `/gsd-verify-work`.*
