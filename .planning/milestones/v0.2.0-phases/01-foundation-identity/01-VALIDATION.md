---
phase: 01
slug: foundation-identity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-02
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 01-01..01-03.
> Wave 0 test scaffolds are **absorbed into plan tasks** (in-phase TDD) — not a separate Wave 0 plan.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node ≥22 built-in) + `node:assert/strict` |
| **Coverage** | `c8` ^12.0.0 |
| **Config file** | none required — scripts live in `package.json` (plan 01-01) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30–90 seconds after bootstrap |

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
| 1 | CJS+`.d.ts`; GE toolkit docs; no gsd-core runtime | build artifacts + package identity | `npm run build` + `tests/package-identity.test.ts` |
| 2 | general pack; replace-only; policy matrix | load + policy unit results | `tests/ontology-load.test.ts`, `tests/ontology-policy.test.ts`, `tests/schema-validate.test.ts` |
| 3 | `.gsd-graph/` default; realpath; `.build.lock` | path + lock unit results | `tests/paths-confine.test.ts`, `tests/lock.test.ts` |
| 4 | Dual-write v1-first; projection never SoT | publish/load unit results | `tests/publish-dual-write.test.ts` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PKG-01, PKG-02 | T-01-01, T-01-02 | No unapproved/slop deps; identity honest | smoke + unit | `npm run build && test -f dist/index.js && test -f dist/index.d.ts && npm test` | ❌ in-plan | ⬜ pending |
| 01-01-02 | 01 | 1 | PKG-02 | T-01-02 | README denies gsd-core runtime coupling | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 01-01-03 | 01 | 1 | PKG-01 | T-01-01 | CI runs build+test on Node ≥22 | smoke | `npm test && test -f .github/workflows/ci.yml` | ❌ in-plan | ⬜ pending |
| 01-02-01 | 02 | 2 | ONT-01, ONT-03 | T-01-04, T-01-05 | Ajv fail-closed on invalid pack/graph | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 01-02-02 | 02 | 2 | ONT-02 | T-01-06 | review does not allow unknown write; coerce/drop correct | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 01-02-03 | 02 | 2 | ONT-03 | T-01-06 | extends rejected (replace-only) | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 01-03-01 | 03 | 3 | STORE-01, STORE-02, STORE-03, STORE-05 | T-01-08, T-01-09 | PATH_ESCAPE; v1-first publish; load ignores projection | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 01-03-02 | 03 | 3 | STORE-04 | T-01-10, T-01-11 | exclusive lock; BUILD_LOCKED; stale steal | unit | `npm test` | ❌ in-plan | ⬜ pending |
| 01-03-03 | 03 | 3 | STORE-02, STORE-03, STORE-04 | T-01-09, T-01-10 | publish under lock; projection disposable | unit | `npm test` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed), not pre-existing.*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| PKG-01 build emit | `npm run build && test -f dist/index.js && test -f dist/index.d.ts` | exit 0; both files exist |
| PKG-01/02 identity | `npm test` (includes `package-identity`) | name `@opengsd/gsd-graph`; engines ≥22; description has Graph Engineering toolkit; no gsd-core in any dependency class; `GSD_GRAPH_REASON` exports |
| ONT-01 general pack | `npm test` (includes `ontology-load`) | `loadOntologyPack` returns closed typeSet/predicateSet for general |
| ONT-02 policy matrix | `npm test` (includes `ontology-policy`) | allow / review / coerce(Concept\|related_to) / drop behaviors |
| ONT-03 replace-only | `npm test` (includes `ontology-load` extends fixture) | pack with `extends` → `ontology_invalid` |
| STORE-01 default/override | `npm test` (includes `paths-confine`) | default `.gsd-graph`; dir + `GSD_GRAPH_DIR` override |
| STORE-05 confinement | same | `..` / symlink escape → `path_escape` |
| STORE-04 lock | `npm test` (includes `lock`) | second lock → `build_locked`; stale/dead PID steal works |
| STORE-02 SoT | `npm test` (includes `publish-dual-write`) | load fails if only `graph.json` present |
| STORE-03 dual-write order | same | v1 renamed before projection; mid-protocol / ordered-rename assertion leaves v1 authoritative |
| Phase coverage gate | `npm run test:coverage` | c8 lines ≥80 on exercised modules (or documented exclude) |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | All Phase 1 behaviors have automated verification. |

*Optional human sanity (non-blocking):* after Phase 1, skim README for Graph Engineering wording — already gated by unit test.

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/package-identity.test.ts` — plan 01-01 Task 1 (PKG-01/02)
- [ ] `tests/ontology-load.test.ts` — plan 01-02 Task 1 (ONT-01/03)
- [ ] `tests/ontology-policy.test.ts` — plan 01-02 Task 2 (ONT-02)
- [ ] `tests/schema-validate.test.ts` — plan 01-02 Task 1
- [ ] `tests/paths-confine.test.ts` — plan 01-03 Task 1 (STORE-01/05)
- [ ] `tests/lock.test.ts` — plan 01-03 Task 2 (STORE-04)
- [ ] `tests/publish-dual-write.test.ts` — plan 01-03 Tasks 1/3 (STORE-02/03)
- [ ] `schemas/*.schema.json`, `ontology-packs/general/*` — plan 01-02 Task 1
- [ ] Framework install + tsconfig + scripts — plan 01-01 Task 1

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

### 01-01

| must_have truth | Automated check |
|-----------------|-----------------|
| build emits `dist/index.js` + `.d.ts` | `npm run build && test -f …` |
| name + Graph Engineering description | package-identity test |
| zero gsd-core runtime dep | package-identity dependency scan |
| reason codes export | require dist + assert PATH_ESCAPE / BUILD_LOCKED |

### 01-02

| must_have truth | Automated check |
|-----------------|-----------------|
| general closed allowlists | ontology-load test |
| policy review/coerce/drop | ontology-policy test |
| extends rejected | ontology-load extends fixture |
| Ajv compile-once validators | schema-validate + load path |

### 01-03

| must_have truth | Automated check |
|-----------------|-----------------|
| default `.gsd-graph` + overrides | paths-confine |
| PATH_ESCAPE on escape | paths-confine |
| BUILD_LOCKED + stale steal | lock |
| v1-first rename; projection not SoT | publish-dual-write |
| DEFAULT_WRITE_PROJECTION false | publish-dual-write / export assert |

---

## Phase exit criteria

Phase 1 validation is complete when:

1. All Per-Task Verification Map rows Status ✅
2. `npm test` green
3. `npm run test:coverage` green (or coverage exceptions documented in SUMMARY)
4. ROADMAP success criteria 1–4 demonstrably true via the automated checks table
5. Frontmatter updated: `nyquist_compliant: true`, `wave_0_complete: true`, `status: validated`

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (absorbed into 01-01..01-03)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter after execute/verify

**Approval:** pending
