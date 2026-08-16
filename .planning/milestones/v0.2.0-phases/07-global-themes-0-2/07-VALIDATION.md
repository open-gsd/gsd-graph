---
phase: 07
slug: global-themes-0-2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 07-01..07-03.
> Wave 0 test scaffolds are **absorbed into plan tasks** (in-phase TDD) — not a separate Wave 0 plan.
> `workflow.nyquist_validation`: **true**

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node ≥22 built-in) + `node:assert/strict` |
| **Coverage** | `c8` — `--check-coverage --lines 80` |
| **Config file** | none required — scripts in `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30–120 seconds after communities land |

---

## Sampling Rate

- **After every task commit:** targeted `node --test dist-test/communities.test.js` (or cli-commands) after `npm run build:test`, or `npm test`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green + package version `0.2.0` + CHANGELOG 0.2.0 section; offline only
- **Max feedback latency:** 120 seconds

---

## Validation targets (goal-backward)

| # | ROADMAP success criterion | Observable truth | Primary automated proof |
|---|---------------------------|------------------|-------------------------|
| 1 | Pure-TS LP communities; artifacts not SoT | two-clique partition; communities/ sidecars; graph.v1 triples unchanged | `tests/communities.test.ts` |
| 2 | Theme reports summarize clusters; LLM opt-in only | deterministic markdown + non-authoritative header; no LLM default path | `tests/communities.test.ts` |
| 3 | Package shippable as 0.2.0 with docs | version + CHANGELOG + README + CLI | `package.json`, CHANGELOG, README, `tests/cli-commands.test.ts` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | COM-01 | T-07-01, T-07-02 | Pure LPA; clamped iters; injected graph | unit | `node --test dist-test/communities.test.js` | ❌ in-plan | ⬜ pending |
| 07-01-02 | 01 | 1 | COM-01 | T-07-01 | AMBIGUOUS excluded; min-size; determinism | unit | `node --test dist-test/communities.test.js` | ❌ in-plan | ⬜ pending |
| 07-02-01 | 02 | 2 | COM-01 | T-07-04, T-07-05 | loadGraphV1; confined communities/; SoT stable | unit | `node --test dist-test/communities.test.js` | ❌ in-plan | ⬜ pending |
| 07-02-02 | 02 | 2 | COM-01 | T-07-05 | writeCommunityReports; missing index fails closed | unit | `node --test dist-test/communities.test.js` | ❌ in-plan | ⬜ pending |
| 07-03-01 | 03 | 3 | COM-01 | T-07-07 | CLI detect K22 JSON | integration | `node --test dist-test/cli-commands.test.js` | ❌ in-plan | ⬜ pending |
| 07-03-02 | 03 | 3 | COM-01 | T-07-08, T-07-SC | CLI report + version 0.2.0 docs | integration | `npm test` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed).*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| COM-01 two-clique | `node --test dist-test/communities.test.js` | 2 communities; correct partition; size ≥3 |
| COM-01 AMBIGUOUS bridge | same | cliques not merged |
| COM-01 min-size / max-iter | same | dropped_small_count; stopped_reason set |
| COM-01 determinism | same | two detects deep-equal |
| COM-01 SoT stable | same | graph.v1 triples unchanged after detect write |
| COM-01 loadGraphV1 only | same | missing v1 → SCHEMA_INVALID |
| COM-01 CLI detect/report | `node --test dist-test/cli-commands.test.js` | exit 0 JSON; missing index non-zero |
| D-07 version | `node -e "assert.equal(require('./package.json').version,'0.2.0')"` or package-identity | version 0.2.0 |
| Full suite | `npm test` | all green offline |
| Coverage gate | `npm run test:coverage` | c8 lines ≥80 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Optional visual read of community-*.md | COM-01 / D-05 | Human prose polish | After detect on a real corpus, open `.gsd-graph/communities/community-c_0001.md` and confirm header + member lists look right — non-blocking |

*All required Phase 7 behaviors have automated verification. No network or LLM required (D-05, D-10).*

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/communities.test.ts` — plans 07-01, 07-02
- [ ] Optional `tests/fixtures/communities/two-cliques.json` — only if executor prefers fixture file over inline GraphV1Document
- [ ] Extend `tests/cli-commands.test.ts` — plan 07-03
- [ ] Framework install: none (existing `node:test`)

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

| Plan | must_have truth (summary) | Test file |
|------|---------------------------|-----------|
| 07-01 | Pure-TS LPA; two-clique; AMBIGUOUS filter; min-size; determinism | communities.test.ts |
| 07-02 | loadGraphV1; communities/ sidecars; SoT unchanged; report rewrite | communities.test.ts |
| 07-03 | CLI detect\|report K22; package 0.2.0; CHANGELOG; README | cli-commands, package.json, docs |

---

## Phase success criteria mapping

| ROADMAP criterion | Plans | Automated gate |
|-------------------|-------|----------------|
| 1. Pure-TS LP; artifacts not SoT | 07-01, 07-02 | communities.test.js |
| 2. Theme reports; LLM opt-in only | 07-02 | communities.test.js (deterministic header) |
| 3. Ship 0.2.0 with docs | 07-03 | package.json + CHANGELOG + README + npm test |
