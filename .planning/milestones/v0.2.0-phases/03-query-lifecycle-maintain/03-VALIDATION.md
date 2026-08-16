---
phase: 03
slug: query-lifecycle-maintain
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 03-01..03-04.
> Wave 0 test scaffolds are **absorbed into plan tasks** (in-phase TDD) — not a separate Wave 0 plan.
> `workflow.nyquist_validation`: **true**

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node ≥22 built-in) + `node:assert/strict` |
| **Coverage** | `c8` ^12.0.0 — `--check-coverage --lines 80` |
| **Config file** | none required — scripts in `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30–120 seconds after Phase 3 modules land |

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite green + Phase success criteria 1–4 true + M1–M5 + query path tests
- **Max feedback latency:** 120 seconds

---

## Validation targets (goal-backward)

| # | ROADMAP success criterion | Observable truth | Primary automated proof |
|---|---------------------------|------------------|-------------------------|
| 1 | Query IR term/path/neighborhood/filter + budget tier ranks | Structured ops + shared ranks + DESIGN budget | `tests/query.test.ts` |
| 2 | Incremental maintain M1–M5 + deleted sources | invalidateProvenance + build({full:false}) | `tests/maintain.test.ts` |
| 3 | Snapshot save/list/restore; diff by id | Round-trip v1; ± ids vs baseline | `tests/snapshot.test.ts`, `tests/diff.test.ts` |
| 4 | Repair projection from v1 only | graph.json edges ⊆ v1 triples | `tests/repair.test.ts` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | QRY-01, QRY-02 | T-03-01, T-03-02, T-03-SC | Pure-TS path; v1-only; rank export | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 03-01-02 | 01 | 1 | QRY-01, QRY-02 | T-03-01 | seed/neighborhood/filter ranks | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 03-01-03 | 01 | 1 | QRY-02, D-04 | T-03-02 | budget ceil(JSON/4); disk loadGraphV1 | unit/integration | `npm test` | ❌ in-plan | ⬜ pending |
| 03-02-01 | 02 | 2 | MNT-01 | T-03-04, T-03-05 | invalidate + deleted-source strip | unit/integration | `npm test` | ❌ in-plan | ⬜ pending |
| 03-02-02 | 02 | 2 | MNT-01 | T-03-04 | M2–M5 + maintain alias | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 03-02-03 | 02 | 2 | MNT-01, DIFF prep | T-03-06 | projectGraph; last-diff-base; writeProjection | integration | `npm test` | ❌ in-plan | ⬜ pending |
| 03-03-01 | 03 | 3 | SNAP-01 | T-03-07, T-03-08 | save/list/restore under lock | integration | `npm test` | ❌ in-plan | ⬜ pending |
| 03-03-02 | 03 | 3 | SNAP-01 | T-03-07, T-03-09 | PATH_ESCAPE; validate restore | unit/integration | `npm test` | ❌ in-plan | ⬜ pending |
| 03-04-01 | 04 | 4 | DIFF-01 | T-03-10 | ± by id; NO_BASELINE | unit/integration | `npm test` | ❌ in-plan | ⬜ pending |
| 03-04-02 | 04 | 4 | REP-01 | T-03-11, T-03-12 | repair from v1 only; coverage ≥80 | integration | `npm run test:coverage` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed), not pre-existing.*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| QRY-01 path/seed/neighborhood/filter | `npm test` (query) | multi-hop path ≥3 nodes; term expand; neighborhood hops; filter fields |
| QRY-02 budget + ranks | `npm test` (query) | confidenceRank matches bestTier; AMBIGUOUS dropped before EXTRACTED; ceil(JSON/4) |
| D-04 query SoT | `npm test` (query disk case) | query works without graph.json; loadGraphV1 only |
| MNT-01 M1–M5 | `npm test` (maintain) | DESIGN matrix expectations |
| MNT-01 deleted source | `npm test` (maintain integration) | build({full:false}) drops triples for removed files |
| SNAP-01 round-trip | `npm test` (snapshot) | save → mutate → restore restores triple ids |
| SNAP-01 PATH_ESCAPE | `npm test` (snapshot) | bad names → PATH_ESCAPE |
| DIFF-01 ± by id | `npm test` (diff) | added/removed counts; named snapshot + last-diff-base |
| DIFF-01 NO_BASELINE | `npm test` (diff) | reason no_baseline when missing |
| REP-01 repair | `npm test` (repair) | graph.json edges from v1 only; no invent |
| Phase coverage gate | `npm run test:coverage` | c8 lines ≥80 |
| No graph deps | package.json inspect / existing identity tests | no graphology/ngraph |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | All Phase 3 behaviors have automated verification. |

*Optional human sanity (non-blocking):* after Phase 3, REPL `build` → `query({ term })` → `snapshotSave` → `diff` → `repair` on a personal notes folder — library only; CLI is Phase 4.

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/query.test.ts` — plan 03-01 (QRY-01, QRY-02)
- [ ] `tests/maintain.test.ts` — plan 03-02 (MNT-01 M1–M5 + deleted source)
- [ ] `tests/snapshot.test.ts` — plan 03-03 (SNAP-01)
- [ ] `tests/diff.test.ts` — plan 03-04 (DIFF-01)
- [ ] `tests/repair.test.ts` — plan 03-04 (REP-01)
- [ ] Export `confidenceRank` from `ids.ts` — plan 03-01
- [ ] `projectGraph` + build `writeProjection` payload — plan 03-02
- [ ] Write `snapshots/.last-diff-base.json` from build success — plan 03-02
- [ ] Framework install: **none** — `node:test` + c8 already configured; **no new packages**

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

### 03-01

| must_have truth | Automated check |
|-----------------|-----------------|
| Path multi-hop with predicates | `tests/query.test.ts` path case |
| Term seed-expand | `tests/query.test.ts` term case |
| Neighborhood by id | `tests/query.test.ts` neighborhood case |
| Filter + shared ranks | `tests/query.test.ts` filter/confidenceMin |
| Budget drop order + ceil(JSON/4) | `tests/query.test.ts` budget case |
| v1-only load | `tests/query.test.ts` disk case |

### 03-02

| must_have truth | Automated check |
|-----------------|-----------------|
| invalidateProvenance M1–M5 | `tests/maintain.test.ts` |
| Deleted source incremental | `tests/maintain.test.ts` integration |
| maintain alias | `tests/maintain.test.ts` alias |
| last-diff-base + projectGraph | `tests/maintain.test.ts` / `tests/build-pipeline.test.ts` |

### 03-03

| must_have truth | Automated check |
|-----------------|-----------------|
| save/list/restore round-trip | `tests/snapshot.test.ts` |
| PATH_ESCAPE names | `tests/snapshot.test.ts` |

### 03-04

| must_have truth | Automated check |
|-----------------|-----------------|
| diff ± by id + NO_BASELINE | `tests/diff.test.ts` |
| repair projection from v1 | `tests/repair.test.ts` |

---

## Phase gate checklist

Before marking Phase 3 complete / running `/gsd-verify-work`:

- [ ] All four plans have SUMMARYs
- [ ] `npm test` green
- [ ] `npm run test:coverage` lines ≥80
- [ ] Public exports: `query`, `applyBudget`, `maintain`, `invalidateProvenance`, `projectGraph`, `snapshotSave`, `snapshotList`, `snapshotRestore`, `diff`, `repair`, `confidenceRank`
- [ ] M1–M5 dedicated tests green
- [ ] Query path tests green
- [ ] ROADMAP Phase 3 success criteria 1–4 observably true
- [ ] No graphology/ngraph dependency

---

## Source coverage (planning audit)

| SOURCE | ID | Feature | Plan | Status |
|--------|-----|---------|------|--------|
| GOAL | — | Multi-hop query + keep graph correct across edits | 01–04 | COVERED |
| REQ | QRY-01 | Query IR term/path/neighborhood/filter | 03-01 | COVERED |
| REQ | QRY-02 | Confidence budget tier ranks | 03-01 | COVERED |
| REQ | MNT-01 | Incremental maintain M1–M5 | 03-02 | COVERED |
| REQ | SNAP-01 | Snapshot save/list/restore | 03-03 | COVERED |
| REQ | DIFF-01 | Diff vs snapshot / last-diff-base | 03-04 | COVERED |
| REQ | REP-01 | Repair projection from v1 | 03-04 | COVERED |
| CONTEXT | D-01 | Structured Query IR only | 03-01 | COVERED |
| CONTEXT | D-02 | Shared tier ranks | 03-01 | COVERED |
| CONTEXT | D-03 | Pure-TS adjacency | 03-01 | COVERED |
| CONTEXT | D-04 | loadGraphV1 only | 03-01, 03-04 | COVERED |
| CONTEXT | D-05 | M1–M5 invalidation | 03-02 | COVERED |
| CONTEXT | D-06 | Fingerprints + drop empty provenance | 03-02 | COVERED |
| CONTEXT | D-07 | Snapshots under snapshots/ | 03-03 | COVERED |
| CONTEXT | D-08 | Diff by id | 03-04 | COVERED |
| CONTEXT | D-09 | Repair from v1 | 03-04 | COVERED |
| CONTEXT | D-10 | Build lock on writers | 03-02..04 | COVERED |
| CONTEXT | D-11 | Copyright headers | all plans | COVERED |
| CONTEXT | D-12 | node:test + c8; M1–M5; query paths | all plans | COVERED |
| RESEARCH | OQ-1 | Normative build({full:false}) + invalidateProvenance | 03-02 | COVERED |
| RESEARCH | OQ-2 | Budget ceil(JSON/4) | 03-01 | COVERED |
| RESEARCH | OQ-3 | snapshots/ + last-diff-base | 03-02, 03-03 | COVERED |
| RESEARCH | OQ-4 | Undirected path/neighborhood | 03-01 | COVERED |
| RESEARCH | Pitfall 1 | Deleted-source invalidation | 03-02 | COVERED |
| RESEARCH | Pitfall 7 | writeProjection payload | 03-02 | COVERED |
