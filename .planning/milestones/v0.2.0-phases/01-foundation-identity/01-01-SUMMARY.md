---
phase: 01-foundation-identity
plan: 01
subsystem: package-bootstrap
tags: [typescript, cjs, npm, node22, ajv, c8, node-test, github-actions, reason-codes]

requires: []
provides:
  - Installable @opengsd/gsd-graph CJS+types package scaffold
  - GSD_GRAPH_REASON + GraphError public façade
  - node:test + c8 test harness and package-identity gates
  - Graph Engineering README identity (PKG-02)
  - GitHub Actions CI on Node 22/24
affects:
  - 01-02 schemas-ontology
  - 01-03 store-io
  - later phases consuming package build and reason codes

actuals:
  tokens: 10517
  tasks: 3
  commits: 3

tech-stack:
  added:
    - typescript@^6.0.3
    - "@types/node@^22.19.0"
    - ajv@^8.20.0
    - ajv-formats@^3.0.1
    - c8@^12.0.0
  patterns:
    - CJS-only tsc emit to dist/ with declaration maps
    - Compile tests to dist-test/ then node --test
    - Frozen GSD_GRAPH_REASON + GraphError reason-code surface
    - D-08 two-line copyright headers on all src files

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - tsconfig.build.json
    - tsconfig.test.json
    - .gitignore
    - LICENSE
    - README.md
    - src/index.ts
    - src/errors.ts
    - src/types.ts
    - tests/package-identity.test.ts
    - .github/workflows/ci.yml
  modified: []

key-decisions:
  - "CJS-only package exports (types + require + default); dual ESM deferred"
  - "moduleResolution Node10 + ignoreDeprecations 6.0 for TypeScript 6 deprecation"
  - "CI matrix Node 22 and 24; coverage gate deferred from CI"
  - "ajv + ajv-formats installed now for later schema plans"

patterns-established:
  - "Public façade re-exports from src/index.ts only"
  - "Identity/dependency bans enforced in package-identity.test.ts"

requirements-completed: [PKG-01, PKG-02]

coverage:
  - id: D1
    description: "npm package builds CJS dist/index.js + dist/index.d.ts on Node ≥22"
    requirement: PKG-01
    verification:
      - kind: unit
        ref: tests/package-identity.test.ts#build emits dist/index.js and dist/index.d.ts
        status: pass
      - kind: other
        ref: npm run build
        status: pass
    human_judgment: false
  - id: D2
    description: "Package name/description Graph Engineering toolkit; zero gsd-core deps"
    requirement: PKG-02
    verification:
      - kind: unit
        ref: tests/package-identity.test.ts#package identity
        status: pass
    human_judgment: false
  - id: D3
    description: "GSD_GRAPH_REASON exports PATH_ESCAPE and BUILD_LOCKED via require"
    requirement: PKG-01
    verification:
      - kind: unit
        ref: tests/package-identity.test.ts#exports GSD_GRAPH_REASON
        status: pass
    human_judgment: false
  - id: D4
    description: "README Graph Engineering identity with no gsd-core runtime coupling"
    requirement: PKG-02
    verification:
      - kind: unit
        ref: tests/package-identity.test.ts#README positions Graph Engineering
        status: pass
    human_judgment: false
  - id: D5
    description: "GitHub Actions CI runs build+test on Node 22+"
    requirement: PKG-01
    verification:
      - kind: other
        ref: .github/workflows/ci.yml
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-03
status: complete
---

# Phase 1 Plan 01: Package bootstrap Summary

**Installable `@opengsd/gsd-graph` CJS+types library with Graph Engineering identity, frozen reason codes, and Node 22 CI — zero gsd-core runtime coupling.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-03T02:44:01Z
- **Completed:** 2026-08-03T02:47:14Z
- **Tasks:** 3/3
- **Files modified:** 13 created (source + package + CI)

## Accomplishments

- Bootstrapped greenfield npm package `@opengsd/gsd-graph@0.1.0` with TypeScript → CJS + `.d.ts`, engines Node ≥22 / npm ≥10
- Exported DESIGN reason codes (`GSD_GRAPH_REASON`) and `GraphError` from public façade
- Documented standalone Graph Engineering toolkit identity in README; gated with package-identity tests
- Added GitHub Actions CI (Node 22 + 24) running `npm ci` → build → test

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end package bootstrap — build + require reason codes** - `6812952` (feat)
2. **Task 2: README Graph Engineering identity (PKG-02)** - `3a8eaa3` (docs)
3. **Task 3: GitHub Actions CI on Node 22** - `6315e41` (ci)

_Note: Task 1 was TDD-shaped (behavior-first tests + implementation) committed as a single greenfield feat after verify green._

## Files Created/Modified

- `package.json` / `package-lock.json` — package identity, exports, scripts, ajv deps
- `tsconfig.json` / `tsconfig.build.json` / `tsconfig.test.json` — strict TS CJS emit + test compile
- `.gitignore` — node_modules, dist, dist-test, coverage, `.gsd-graph`
- `LICENSE` — MIT, Jeremy McSpadden 2026
- `README.md` — Graph Engineering positioning, store defaults, standalone claim
- `src/errors.ts` — `GSD_GRAPH_REASON` + `GraphError`
- `src/types.ts` — minimal GraphNode/Triple stubs for later plans
- `src/index.ts` — public re-exports
- `tests/package-identity.test.ts` — PKG-01/PKG-02 automated gates
- `.github/workflows/ci.yml` — push/PR matrix Node 22/24

## Decisions Made

- CJS-only `exports` (`types` + `require` + `default`) — dual ESM deferred per research discretion
- TypeScript 6: keep `module: CommonJS` + `moduleResolution: Node10` with `ignoreDeprecations: "6.0"` (TS5107)
- Install ajv + ajv-formats now so plan 01-02 does not fight the lockfile
- CI includes optional Node 24 alongside required 22; no coverage gate in CI yet

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript 6 moduleResolution deprecation**
- **Found during:** Task 1 (build)
- **Issue:** `tsc` failed with TS5107 (`moduleResolution=node10` deprecated in TS 7 without ignore flag)
- **Fix:** Set `moduleResolution: "Node10"` and `ignoreDeprecations: "6.0"` in `tsconfig.json`
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run build` succeeds
- **Committed in:** `6812952`

**2. [Rule 1 - Bug] strict `engines.node` typing under noUncheckedIndexedAccess**
- **Found during:** Task 1 (test compile)
- **Issue:** `engines.node` typed as `string | undefined` broke `assert.match`
- **Fix:** Local narrow + typeof assert before match
- **Files modified:** `tests/package-identity.test.ts`
- **Verification:** `npm test` green
- **Committed in:** `6812952`

**Total deviations:** 2 auto-fixed (1× Rule 3, 1× Rule 1)  
**Impact on plan:** Required for green build/tests; no scope creep.

## Issues Encountered

None beyond the auto-fixed TypeScript 6 / strict typing issues above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan **01-02** can add JSON Schemas, Ajv validators, and the `general` ontology pack on this scaffold
- Plan **01-03** can implement store paths/lock/dual-write using `GraphError` + `PATH_ESCAPE` / `BUILD_LOCKED`
- Public surface intentionally limited to reason codes/types; no extract/query/CLI yet

## Known Stubs

| File | Stub | Reason |
|------|------|--------|
| `src/types.ts` | Minimal `GraphNode` / `Triple` interfaces | Intentional placeholders; full models in plan 01-02 |

These stubs do not block PKG-01/PKG-02 — public façade only requires reason codes for this plan.

## Self-Check: PASSED

- FOUND: package.json, dist/index.js, dist/index.d.ts (via build), README.md, src/errors.ts, tests/package-identity.test.ts, .github/workflows/ci.yml
- FOUND commits: 6812952, 3a8eaa3, 6315e41
- npm test: 6/6 pass
