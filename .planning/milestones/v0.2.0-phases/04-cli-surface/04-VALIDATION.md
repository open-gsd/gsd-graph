---
phase: 04
slug: cli-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 04-01..04-03.
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
| **Estimated runtime** | ~30–120 seconds after CLI modules land |

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite green + Phase success criteria 1–4 true
- **Max feedback latency:** 120 seconds

---

## Validation targets (goal-backward)

| # | ROADMAP success criterion | Observable truth | Primary automated proof |
|---|---------------------------|------------------|-------------------------|
| 1 | `gsd-graph` on PATH after install; core commands | package `bin` + registered verbs | `tests/package-identity.test.ts`, `tests/cli-commands.test.ts` |
| 2 | JSON stdout; stderr diagnostics; exit 0/1/2/3 | K22 machine contract | `tests/cli.test.ts`, `tests/init.test.ts` |
| 3 | `init` store layout + gitignore append | CLI-03 / D-05 | `tests/init.test.ts` |
| 4 | Happy path init → build → query → path | D-12 no TTY | `tests/cli.test.ts` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PKG-03, CLI-02, CLI-03 | T-04-01, T-04-02, T-04-SC | bin shebang; resolveStoreRoot; JSON stdout | unit/integration | `npm test` | ❌ in-plan | ⬜ pending |
| 04-01-02 | 01 | 1 | PKG-03, CLI-03 | T-04-03 | idempotent gitignore; no create | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 04-01-03 | 01 | 1 | CLI-02 | T-04-02 | exit 1/2/3 mapper | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 04-02-01 | 02 | 2 | CLI-01 | T-04-04, T-04-07 | thin build/query/path/status/diff/repair | integration | `npm test` | ❌ in-plan | ⬜ pending |
| 04-02-02 | 02 | 2 | CLI-01 | T-04-04, T-04-05 | nested snapshot/review/ontology; pack/answer absent | integration | `npm test` | ❌ in-plan | ⬜ pending |
| 04-03-01 | 03 | 3 | CLI-01..03, D-12 | T-04-08 | spawnSync happy path JSON | process | `npm test` | ❌ in-plan | ⬜ pending |
| 04-03-02 | 03 | 3 | CLI-02, PKG-03 | T-04-09 | exit matrix 1/2/3 + build_locked | process | `npm test` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed), not pre-existing.*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| PKG-03 bin publish | `npm test` (package identity) | bin.gsd-graph + files includes bin + shebang + bin calls main(process.argv) |
| CLI-03 init gitignore | `npm test` (init) | append iff exists; idempotent; custom --dir |
| CLI-02 K22 exits | `npm test` (init/cli exit) | 0 JSON; 1 usage; 2 GraphError; 3 build_locked |
| CLI-01 command surface | `npm test` (cli-commands) | all Phase 4 verbs; pack/answer exit 1 |
| D-12 happy path | `npm test` (cli.test) | init→build→query→path exit 0 JSON |
| Phase coverage gate | `npm run test:coverage` | c8 lines ≥80 |
| commander 14 pin | package.json / identity | no commander 15 engines bump |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | All Phase 4 behaviors have automated verification. |

*Optional human sanity (non-blocking):* after install from tarball/`npm link`, run `gsd-graph status` in a personal notes repo — confirms PATH install UX beyond unit spawn.

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/init.test.ts` — plan 04-01 (CLI-03 + K22 foundation)
- [ ] `tests/cli-commands.test.ts` — plan 04-02 (CLI-01 command surface)
- [ ] `tests/cli.test.ts` — plan 04-03 (D-12 happy path + exit matrix)
- [ ] Extend `tests/package-identity.test.ts` — plan 04-01/04-03 (bin field)
- [ ] Framework install: `npm install commander@^14.0.3 picocolors@^1.1.1` — plan 04-01

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

| Plan | must_have truth (summary) | Test file |
|------|---------------------------|-----------|
| 04-01 | bin publish + init layout/gitignore + exit mapper | init.test.ts, package-identity.test.ts |
| 04-02 | All Phase 4 commands; pack/answer absent | cli-commands.test.ts |
| 04-03 | Spawn happy path + exit 0/1/2/3 | cli.test.ts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
