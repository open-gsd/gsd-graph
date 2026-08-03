---
phase: 01-foundation-identity
verified: 2026-08-02T22:05:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 1: Foundation & identity — Verification Report

**Phase Goal:** Developers can install the package and rely on a validated ontology + crash-safe store foundation  
**Verified:** 2026-08-02T22:05:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Verdict: PASSED

All four ROADMAP success criteria are true in the live codebase. Automated proof: `npm test` (54/54 pass) and `npm run build` (emits `dist/index.js` + `dist/index.d.ts`). Line coverage 86.15% (≥80% gate). No gaps.

## Success criteria table

| # | ROADMAP success criterion | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | `@opengsd/gsd-graph` builds on Node ≥22 to CJS + `.d.ts` and documents itself as a Graph Engineering toolkit with zero gsd-core runtime dependency | ✓ VERIFIED | `package.json` name/engines/description; `dist/index.js` + `dist/index.d.ts` present after build; README GE positioning + denies gsd-core runtime; no gsd-core in any dependency class; `tests/package-identity.test.ts` green |
| 2 | The `general` ontology pack loads with closed type/predicate allowlists, replace-only semantics, and a `review\|coerce\|drop` policy matrix (default `review` writes nothing) | ✓ VERIFIED | `ontology-packs/general/ontology.json` (10 types, 14 predicates, both policies `review`, no `extends`); `loadOntologyPack` builds `typeSet`/`predicateSet`; extends fixtures throw `ONTOLOGY_INVALID`; `applyUnknownPolicy` matrix tested; Ajv validators compile-once |
| 3 | Store paths resolve under `.gsd-graph/` (overridable), are realpath-confined, and concurrent builds serialize via `.build.lock` | ✓ VERIFIED | `DEFAULT_STORE_DIR='.gsd-graph'`; dir + `GSD_GRAPH_DIR` overrides; `confineUnderRoot` → `PATH_ESCAPE` on `..`/symlink; `acquireBuildLock` wx exclusive, `BUILD_LOCKED` on contention, stale/dead-PID steal |
| 4 | Dual-write publish primitives rename `graph.v1.json` first; projection `graph.json` is never treated as SoT | ✓ VERIFIED | `publishGraphFiles` renames v1 before projection (rename spy + mid-protocol fault tests); `loadGraphV1` only reads `graph.v1.json` and fails `SCHEMA_INVALID` when only projection exists; `DEFAULT_WRITE_PROJECTION === false` |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Package builds CJS+types; GE toolkit docs; no gsd-core dep | ✓ VERIFIED | Build + package-identity tests + README + dep scan |
| 2 | general pack + closed allowlists + replace-only + policy matrix | ✓ VERIFIED | ontology-load / ontology-policy / schema-validate tests |
| 3 | `.gsd-graph` default + realpath confinement + `.build.lock` | ✓ VERIFIED | paths-confine + lock tests |
| 4 | Dual-write v1-first; projection never SoT | ✓ VERIFIED | publish-dual-write tests (order + projection-only load fail) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | CJS identity, engines ≥22, no gsd-core | ✓ VERIFIED | `@opengsd/gsd-graph`, description includes Graph Engineering toolkit, deps only ajv/ajv-formats |
| `dist/index.js` | Built CommonJS entry | ✓ VERIFIED | Present after `npm run build` |
| `dist/index.d.ts` | Public type declarations | ✓ VERIFIED | Present after `npm run build` |
| `README.md` | GE toolkit positioning | ✓ VERIFIED | Explicit no gsd-core runtime dependency |
| `src/errors.ts` | GSD_GRAPH_REASON + GraphError | ✓ VERIFIED | Exports PATH_ESCAPE, BUILD_LOCKED, etc. |
| `schemas/graph-v1.schema.json` | graph.v1 authority | ✓ VERIFIED | Used by Ajv compile-once |
| `schemas/ontology-pack.schema.json` | pack authority | ✓ VERIFIED | Used by Ajv compile-once |
| `ontology-packs/general/ontology.json` | default general pack | ✓ VERIFIED | Closed allowlists, review policies |
| `src/schema/validators.ts` | Ajv compile-once | ✓ VERIFIED | `validateGraphV1` / `validateOntologyPack` |
| `src/ontology/load-pack.ts` | replace-only loader | ✓ VERIFIED | Rejects `extends`; closed Sets |
| `src/ontology/policy.ts` | policy matrix | ✓ VERIFIED | allow/review/coerce/drop |
| `src/io/paths.ts` | resolve + confine | ✓ VERIFIED | DEFAULT_STORE_DIR, PATH_ESCAPE |
| `src/io/lock.ts` | `.build.lock` | ✓ VERIFIED | wx exclusive + stale steal |
| `src/io/atomic-publish.ts` | dual-write v1-first | ✓ VERIFIED | Ordered rename protocol |
| `src/io/load-graph.ts` | v1-only load | ✓ VERIFIED | Never falls back to projection |
| `tests/*.test.ts` (7 suites) | automated gates | ✓ VERIFIED | 54 tests, 0 fail |
| `.github/workflows/ci.yml` | CI Node 22+ | ✓ VERIFIED | matrix 22/24; build + test |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json` exports | `dist/index.js` | main/require | ✓ WIRED | CJS require smoke OK |
| `src/index.ts` | errors/ontology/io | public façade re-exports | ✓ WIRED | All Phase 1 symbols exportable |
| `validators.ts` | `schemas/*.schema.json` | Ajv compile at load | ✓ WIRED | PACKAGE_ROOT relative resolve |
| `load-pack.ts` | `ontology-packs/general/` | pack id → package path | ✓ WIRED | Default `general` loads |
| `policy.ts` | LoadedOntology Sets | allowlist membership | ✓ WIRED | Closed-world checks |
| `publishGraphFiles` | `graph.v1.json` | tmp fsync rename first | ✓ WIRED | Spy + fault injection prove order |
| `loadGraphV1` | `graph.v1.json` only | no projection fallback | ✓ WIRED | Explicit SCHEMA_INVALID if missing |
| `confineUnderRoot` | store realpath root | prefix check | ✓ WIRED | PATH_ESCAPE on escape |
| `acquireBuildLock` | `.build.lock` | open wx exclusive | ✓ WIRED | Contention + steal tested |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `loadOntologyPack` | typeSet/predicateSet | pack JSON node_types/predicates | Yes — file bytes + Ajv | ✓ FLOWING |
| `loadGraphV1` | GraphV1Document | `graph.v1.json` via readJsonFile + Ajv | Yes — disk SoT only | ✓ FLOWING |
| `publishGraphFiles` | plan.graphV1 | caller object validated then written | Yes — validated write path | ✓ FLOWING |
| `applyUnknownPolicy` | PolicyDecision | LoadedOntology allowlists + pack policy fields | Yes — pure over loaded pack | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `npm test` | 54 pass, 0 fail | ✓ PASS |
| Build emit | `npm run build && test -f dist/index.js && test -f dist/index.d.ts` | DIST_OK | ✓ PASS |
| Public require surface | `node -e "require('./dist/index.js')…"` | all Phase 1 exports OK; DEFAULT_WRITE_PROJECTION false; DEFAULT_STORE_DIR `.gsd-graph` | ✓ PASS |
| Coverage gate | `npm run test:coverage` | lines 86.15% (≥80) | ✓ PASS |
| No gsd-core deps | package.json bag scan | no gsd-core | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | Phase 1 has no `scripts/*/tests/probe-*.sh` | SKIP (N/A) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PKG-01 | 01-01 | Installable CJS + `.d.ts`, Node ≥22 | ✓ SATISFIED | build + package-identity |
| PKG-02 | 01-01 | GE toolkit README; no gsd-core runtime dep | ✓ SATISFIED | README + dep scan + tests |
| ONT-01 | 01-02 | Load/validate general pack closed allowlists | ✓ SATISFIED | ontology-load + general pack file |
| ONT-02 | 01-02 | review\|coerce\|drop policy matrix; default review | ✓ SATISFIED | ontology-policy tests |
| ONT-03 | 01-02 | Replace-only (no extends merge) | ✓ SATISFIED | extends fixtures → ONTOLOGY_INVALID |
| STORE-01 | 01-03 | Default store `.gsd-graph/` overridable | ✓ SATISFIED | paths-confine |
| STORE-02 | 01-03 | SoT is graph.v1.json; projection disposable | ✓ SATISFIED | load-graph + publish tests |
| STORE-03 | 01-03 | Dual-write atomic rename; never read projection as SoT | ✓ SATISFIED | rename order + load fail on projection-only |
| STORE-04 | 01-03 | Concurrent builds via `.build.lock` | ✓ SATISFIED | lock tests |
| STORE-05 | 01-03 | realpath confinement under store root | ✓ SATISFIED | PATH_ESCAPE tests |

**Orphaned requirements for Phase 1:** none (PKG-03 is Phase 4).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX` in `src/` | — | None |
| — | — | No stub placeholders in Phase 1 modules | — | None |

Test-only hooks `_renameSync` / `_afterV1Rename` / `_resetTmpCounterForTests` are intentional STORE-03 order-proof surfaces, not product stubs.

### Human Verification Required

None. Phase 1 validation strategy marks all success criteria as automated; no UI/real-time/external-service checks.

### Gaps Summary

No gaps. Phase goal achieved.

---

## Evidence (commands/files)

### Commands run (verifier process)

```text
npm test
# → 54 pass, 0 fail, exit 0

npm run build
# → exit 0; dist/index.js + dist/index.d.ts present

npm run test:coverage
# → 54 pass; All files lines 86.15% (c8 --lines 80)

node -e "require('./dist/index.js')"  # public façade smoke — all Phase 1 exports present
```

### Key source files inspected

- [`package.json`](/Users/jeremy/github/open-gsd/gsd-graph/package.json)
- [`README.md`](/Users/jeremy/github/open-gsd/gsd-graph/README.md)
- [`src/index.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/index.ts)
- [`src/ontology/load-pack.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/ontology/load-pack.ts)
- [`src/ontology/policy.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/ontology/policy.ts)
- [`src/io/paths.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/io/paths.ts)
- [`src/io/lock.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/io/lock.ts)
- [`src/io/atomic-publish.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/io/atomic-publish.ts)
- [`src/io/load-graph.ts`](/Users/jeremy/github/open-gsd/gsd-graph/src/io/load-graph.ts)
- [`ontology-packs/general/ontology.json`](/Users/jeremy/github/open-gsd/gsd-graph/ontology-packs/general/ontology.json)
- Tests: `tests/package-identity.test.ts`, `ontology-load.test.ts`, `ontology-policy.test.ts`, `schema-validate.test.ts`, `paths-confine.test.ts`, `lock.test.ts`, `publish-dual-write.test.ts`

### Implementation notes confirmed (not SUMMARY claims)

1. **Publish order:** `atomic-publish.ts` renames v1 at lines 136–137 before projection (146–151); tests prove with rename spy and mid-protocol fault.
2. **SoT load:** `load-graph.ts` resolves only `graph.v1.json`; missing → `SCHEMA_INVALID` with message that projection is not SoT.
3. **Replace-only:** `load-pack.ts` rejects own-property `extends` before Ajv.
4. **Policy default:** general pack both unknown policies are `review`; coerce maps type→`Concept`, predicate→`related_to`.
5. **Lock:** `openSync(..., 'wx')` exclusive; STALE_MS = 15 minutes; dead PID / age steal implemented and tested.

---

_Verified: 2026-08-02T22:05:00Z_  
_Verifier: Claude (gsd-verifier)_
