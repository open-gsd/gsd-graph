---
phase: 05
slug: ground-prove-0-1-0
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 05-01..05-04.
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
| **Estimated runtime** | ~30–180 seconds after pack/answer + goldens land |

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm test` (prefer `npm run test:coverage` before phase verify)
- **Before `/gsd-verify-work`:** Full suite green + Phase success criteria 1–5 true
- **Max feedback latency:** 180 seconds

---

## Validation targets (goal-backward)

| # | ROADMAP success criterion | Observable truth | Primary automated proof |
|---|---------------------------|------------------|-------------------------|
| 1 | packSubgraph composition + CLI pack/answer | public query ops; registered verbs | `tests/pack-answer.test.ts`, `tests/cli-commands.test.ts` |
| 2 | Deterministic cited answer; empty abstains | citations ⊆ triples; mode abstain | `tests/pack-answer.test.ts` |
| 3 | G0 free-prose abstain offline | no typed multi-hop / abstain | `tests/golden-scenarios.test.ts` G0 |
| 4 | G1 multi-hop path assertions | paths ≥3 nodes + causes | `tests/golden-scenarios.test.ts` G1 |
| 5 | 0.1.0 releasable when suite green | version 0.1.0 + CHANGELOG + full npm test | `package.json`, `CHANGELOG.md`, `npm test` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PACK-01 | T-05-01, T-05-02 | public ops; loadGraphV1; citations ⊆ | unit | `npm test -- --test-name-pattern='pack\|packSubgraph\|Pack'` | ❌ in-plan | ⬜ pending |
| 05-01-02 | 01 | 1 | PACK-01 | T-05-01, T-05-03 | scoring/stopwords/budget/empty | unit | `npm test -- --test-name-pattern='pack\|stopword\|budget\|empty'` | ❌ in-plan | ⬜ pending |
| 05-02-01 | 02 | 2 | ANS-01 | T-05-05, T-05-06 | deterministic markdown; citations ⊆ | unit | `npm test -- --test-name-pattern='answer\|deterministic\|citation'` | ❌ in-plan | ⬜ pending |
| 05-02-02 | 02 | 2 | ANS-02 | T-05-05 | abstain no fabricated edges | unit | `npm test -- --test-name-pattern='abstain\|empty\|answer'` | ❌ in-plan | ⬜ pending |
| 05-03-01 | 03 | 3 | PACK-01, ANS-01 | T-05-08 | CLI pack/answer writeOk JSON | integration | `npm test -- --test-name-pattern='cli-commands\|pack\|answer'` | ❌ rewrite | ⬜ pending |
| 05-03-02 | 03 | 3 | ANS-02, D-06 | T-05-08 | flip unregistered tests; exit 0 abstain | integration | `npm test -- --test-name-pattern='cli\|pack\|answer\|unknown'` | ❌ rewrite | ⬜ pending |
| 05-04-01 | 04 | 4 | GOLD-01, GOLD-02 | T-05-11, T-05-12 | G0/G1 offline honesty | integration | `npm test -- --test-name-pattern='golden\|G0\|G1'` | ❌ in-plan | ⬜ pending |
| 05-04-02 | 04 | 4 | GOLD-03 | T-05-13 | G2 + CHANGELOG + full suite | e2e/docs | `npm test` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed); ❌ rewrite = existing Phase 4 tests must change.*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| PACK-01 pack composition | `npm test` (pack-answer) | multi-hop paths + causes; expand-by-id; budget citations ⊆ |
| ANS-01 deterministic answer | `npm test` (pack-answer) | mode deterministic; Seeds/Relationships/Paths/Citations; citations ⊆ |
| ANS-02 empty abstain | `npm test` (pack-answer) | mode abstain; no —causes→ fabrication; no throw |
| CLI D-06 pack/answer | `npm test` (cli-commands, cli) | exit 0 JSON; unknown still exit 1 |
| GOLD-01 G0 | `npm test` (golden-scenarios) | free-prose only corpus; abstain or no typed multi-hop |
| GOLD-02 G1 | `npm test` (golden-scenarios) | multi-hop.jsonl; path ≥3 + causes |
| GOLD-03 suite | `npm test` | maintain M1–M5 + query + cli + pack-answer + goldens green |
| GOLD-03 version/docs | inspect package.json + CHANGELOG.md | version 0.1.0; ## [0.1.0] present |
| Phase coverage gate | `npm run test:coverage` | c8 lines ≥80 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | All Phase 5 behaviors have automated verification. |

*Optional human sanity (non-blocking):* after green suite, skim CHANGELOG [0.1.0] and run `gsd-graph answer "why does drought cause food shortage?"` on a personal multi-hop store — confirms agent UX beyond unit captureIO.

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/pack-answer.test.ts` — plans 05-01, 05-02 (PACK-01, ANS-01, ANS-02)
- [ ] `tests/golden-scenarios.test.ts` — plan 05-04 (GOLD-01, GOLD-02, cheap G2)
- [ ] Rewrite `tests/cli-commands.test.ts` pack/answer expectations — plan 05-03
- [ ] Rewrite `tests/cli.test.ts` unknown-only list — plan 05-03
- [ ] `src/pipeline/pack.ts` / `answer.ts` + types + index exports — plans 05-01, 05-02
- [ ] `CHANGELOG.md` + README CLI touch — plan 05-04
- [ ] Framework install: **none** — existing `npm test` pipeline

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

| Plan | must_have truth (summary) | Test file |
|------|---------------------------|-----------|
| 05-01 | pack public composition; multi-hop paths; citations ⊆ | pack-answer.test.ts |
| 05-02 | deterministic markdown; empty abstain | pack-answer.test.ts |
| 05-03 | CLI pack/answer K22; Phase 4 tests flipped | cli-commands.test.ts, cli.test.ts |
| 05-04 | G0/G1/G2 goldens; CHANGELOG; full suite | golden-scenarios.test.ts, maintain.test.ts, npm test |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
