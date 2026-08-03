---
phase: 02
slug: build-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 02-01..02-04.
> Wave 0 test scaffolds are **absorbed into plan tasks** (in-phase TDD) — not a separate Wave 0 plan.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node ≥22 built-in) + `node:assert/strict` |
| **Coverage** | `c8` ^12.0.0 — `--check-coverage --lines 80` |
| **Config file** | none required — scripts in `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30–120 seconds after Phase 2 modules land |

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite green + Phase success criteria 1–5 true
- **Max feedback latency:** 120 seconds

---

## Validation targets (goal-backward)

| # | ROADMAP success criterion | Observable truth | Primary automated proof |
|---|---------------------------|------------------|-------------------------|
| 1 | Deterministic MD/text extract; JSON/JSONL field map | EXTRACTED nodes/triples from grammar + JSONL | `tests/extract-markdown.test.ts`, `tests/extract-jsonl.test.ts` |
| 2 | Fingerprints + multiset provenance + best_tier | stable `sha256:`; union + EXTRACTED wins | `tests/fingerprint.test.ts`, `tests/normalize.test.ts`, build incremental |
| 3 | Exact same-type merge only; same_as advisory | merge/cross-type/same_as unit results | `tests/normalize.test.ts` |
| 4 | Review stable ids; mutate only on accept | rv_ stability; accept/reject effects | `tests/review-queue.test.ts` |
| 5 | Status counts, engine, freshness after build | status fields post-build | `tests/status.test.ts`, `tests/build-pipeline.test.ts` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | EXT-01, EXT-03 | T-02-01, T-02-SC | Offline extract; sha256 raw bytes | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-01-02 | 01 | 1 | EXT-01 | T-02-02, T-02-03 | Free-prose honesty; secret redaction | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-01-03 | 01 | 1 | EXT-03 | T-02-01 | Corpus realpath confine; 8 MiB skip | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-02-01 | 02 | 2 | EXT-02 | T-02-04, T-02-05 | JSONL field-map EXTRACTED chain | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-02-02 | 02 | 2 | EXT-02 | T-02-04 | Extension router; JSON array | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-03-01 | 03 | 3 | NORM-01 | T-02-07 | Multiset + best_tier; policy review gate | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-03-02 | 03 | 3 | NORM-02 | T-02-06 | Exact same-type merge; same_as no id rewrite | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-03-03 | 03 | 3 | REV-01 | T-02-08, T-02-09 | Stable rv_; accept/reject under lock | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 02-04-01 | 04 | 4 | STAT-01, D-09 | T-02-10, T-02-11 | build lock+publish; status from v1 | integration | `npm test` | ❌ in-plan | ⬜ pending |
| 02-04-02 | 04 | 4 | EXT-03 | T-02-12, T-02-13 | Incremental skip; caps; sidecars | integration | `npm test` | ❌ in-plan | ⬜ pending |
| 02-04-03 | 04 | 4 | STAT-01 | T-02-11 | Freshness fields; exports; coverage ≥80 | integration | `npm run test:coverage` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed), not pre-existing.*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| EXT-01 MD grammar | `npm test` (extract-markdown) | wiki/heading/edge-line EXTRACTED; free-prose no typed multi-hop EXTRACTED causes |
| EXT-02 JSONL | `npm test` (extract-jsonl) | multi-hop.jsonl → EXTRACTED chain |
| EXT-03 fingerprint | `npm test` (fingerprint + build-pipeline) | stable `sha256:`; rebuild skips fresh |
| NORM-01 best_tier | `npm test` (normalize) | multiset union; EXTRACTED wins |
| NORM-02 exact merge | `npm test` (normalize) | same-type merge; cross-type no merge; same_as advisory |
| REV-01 review | `npm test` (review-queue) | stable `rv_`; reject no write; accept mutates under lock |
| STAT-01 status | `npm test` (status + build-pipeline) | counts + engine `gsd-graph` + last_build after build |
| D-09 SoT | `npm test` (build-pipeline) | loadGraphV1 after build; no projection required |
| Caps / corpus errors | `npm test` (build-pipeline) | LIMIT_EXCEEDED / CORPUS_NOT_FOUND |
| Phase coverage gate | `npm run test:coverage` | c8 lines ≥80 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | All Phase 2 behaviors have automated verification. |

*Optional human sanity (non-blocking):* after Phase 2, call `build` + `status` from a Node REPL on a personal notes folder — library only; CLI is Phase 4.

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/extract-markdown.test.ts` — plan 02-01 Tasks 1–2 (EXT-01)
- [ ] `tests/fingerprint.test.ts` — plan 02-01 Task 1 (EXT-03)
- [ ] `tests/extract-jsonl.test.ts` — plan 02-02 (EXT-02)
- [ ] `tests/normalize.test.ts` — plan 02-03 Tasks 1–2 (NORM-01/02)
- [ ] `tests/review-queue.test.ts` — plan 02-03 Task 3 (REV-01)
- [ ] `tests/build-pipeline.test.ts` — plan 02-04 (D-09, EXT-03)
- [ ] `tests/status.test.ts` — plan 02-04 (STAT-01)
- [ ] `tests/fixtures/corpus/free-prose.md` — plan 02-01 Task 2
- [ ] `tests/fixtures/corpus/structured-edges.md` — plan 02-01 Task 1
- [ ] `tests/fixtures/corpus/multi-hop.jsonl` — plan 02-02 Task 1
- [ ] `schemas/review-queue.schema.json` — plan 02-03 Task 3
- [ ] Framework install: **none** — `node:test` + c8 already configured

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

### 02-01

| must_have truth | Automated check |
|-----------------|-----------------|
| Stable sha256 fingerprint | `tests/fingerprint.test.ts` |
| MD OQ-1 EXTRACTED edges | `tests/extract-markdown.test.ts` |
| Free-prose no typed multi-hop | `tests/extract-markdown.test.ts` free-prose case |
| Secret redaction | `tests/extract-markdown.test.ts` redaction case |

### 02-02

| must_have truth | Automated check |
|-----------------|-----------------|
| JSONL EXTRACTED multi-hop | `tests/extract-jsonl.test.ts` |
| extractByPath routing | `tests/extract-jsonl.test.ts` router cases |

### 02-03

| must_have truth | Automated check |
|-----------------|-----------------|
| Multiset + best_tier | `tests/normalize.test.ts` |
| Exact merge / same_as | `tests/normalize.test.ts` |
| Stable rv_ + accept/reject | `tests/review-queue.test.ts` |

### 02-04

| must_have truth | Automated check |
|-----------------|-----------------|
| build lock + publish v1 | `tests/build-pipeline.test.ts` |
| Incremental fingerprint skip | `tests/build-pipeline.test.ts` |
| status STAT-01 fields | `tests/status.test.ts` |

---

## Phase gate checklist

Before marking Phase 2 complete / running `/gsd-verify-work`:

- [ ] All four plans have SUMMARYs
- [ ] `npm test` green
- [ ] `npm run test:coverage` lines ≥80
- [ ] Fixtures present under `tests/fixtures/corpus/`
- [ ] Public exports: `build`, `status`, `normalize`, `reviewResolve`, extract stages
- [ ] ROADMAP Phase 2 success criteria 1–5 observably true
