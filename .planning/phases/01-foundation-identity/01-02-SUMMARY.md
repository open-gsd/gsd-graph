---
phase: 01-foundation-identity
plan: 02
subsystem: ontology-schema
tags: [ontology, ajv, json-schema, allowlist, policy-matrix, closed-world, replace-only]

requires:
  - phase: 01-foundation-identity
    provides: CJS package scaffold, GraphError, GSD_GRAPH_REASON, ajv deps
provides:
  - draft-2020-12 graph.v1 and ontology-pack JSON Schemas (D-09)
  - general ontology pack with closed type/predicate allowlists (ONT-01)
  - loadOntologyPack replace-only loader + packHash (ONT-03)
  - applyUnknownPolicy review|coerce|drop matrix (ONT-02)
  - Ajv compile-once validateGraphV1 / validateOntologyPack
affects:
  - 01-03 store-io publish validation
  - later normalize/extract pipelines consuming allowlists and policy

actuals:
  tokens: 8696
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Schema-as-authority with Ajv 2020 compile-once at module load
    - Closed allowlist Sets on LoadedOntology
    - Replace-only pack load (reject extends before schema)
    - Fail-closed GraphError ONTOLOGY_INVALID / SCHEMA path for later publish

key-files:
  created:
    - schemas/graph-v1.schema.json
    - schemas/ontology-pack.schema.json
    - ontology-packs/general/ontology.json
    - ontology-packs/general/README.md
    - src/schema/validators.ts
    - src/ontology/types.ts
    - src/ontology/load-pack.ts
    - src/ontology/policy.ts
    - tests/ontology-load.test.ts
    - tests/ontology-policy.test.ts
    - tests/schema-validate.test.ts
    - tests/fixtures/ontology/pack-custom.json
    - tests/fixtures/ontology/pack-invalid.json
    - tests/fixtures/ontology/pack-schema-invalid.json
    - tests/fixtures/ontology/pack-with-extends.json
    - tests/fixtures/ontology/pack-with-extends-array.json
  modified:
    - src/types.ts
    - src/index.ts

key-decisions:
  - "packHash = sha256 of raw UTF-8 pack file bytes (not re-serialized JSON)"
  - "extends checked before Ajv so composition errors have a clear ONTOLOGY_INVALID message"
  - "Triple mirror uses s/p/o field names matching graph.v1 schema (not subject/predicate/object stubs)"

patterns-established:
  - "Schemas live in package schemas/ and resolve via package root from dist/schema"
  - "Public ontology surface: loadOntologyPack, applyUnknownPolicy, validateGraphV1, validateOntologyPack"
  - "Policy matrix is pure over LoadedOntology — no lock expansion"

requirements-completed: [ONT-01, ONT-02, ONT-03]

coverage:
  - id: D1
    description: "loadOntologyPack(general) validates and exposes closed typeSet/predicateSet"
    requirement: ONT-01
    verification:
      - kind: unit
        ref: tests/ontology-load.test.ts#loads default general pack with closed allowlists
        status: pass
    human_judgment: false
  - id: D2
    description: "Ajv validateGraphV1 / validateOntologyPack compile-once against checked-in schemas"
    requirement: ONT-01
    verification:
      - kind: unit
        ref: tests/schema-validate.test.ts#accepts ontology-packs/general/ontology.json
        status: pass
      - kind: unit
        ref: tests/schema-validate.test.ts#accepts a minimal DESIGN-shaped graph document
        status: pass
    human_judgment: false
  - id: D3
    description: "Unknown policy matrix review|coerce|drop; default review writes nothing"
    requirement: ONT-02
    verification:
      - kind: unit
        ref: tests/ontology-policy.test.ts#unknown + policy review → review
        status: pass
      - kind: unit
        ref: tests/ontology-policy.test.ts#unknown type + coerce → coerce to Concept
        status: pass
      - kind: unit
        ref: tests/ontology-policy.test.ts#unknown predicate + coerce → coerce to related_to
        status: pass
      - kind: unit
        ref: tests/ontology-policy.test.ts#unknown + drop → drop
        status: pass
    human_judgment: false
  - id: D4
    description: "Packs with extends string or array fail closed; custom path packs load"
    requirement: ONT-03
    verification:
      - kind: unit
        ref: tests/ontology-load.test.ts#rejects pack with extends string
        status: pass
      - kind: unit
        ref: tests/ontology-load.test.ts#rejects pack with extends array
        status: pass
      - kind: unit
        ref: tests/ontology-load.test.ts#loads custom path pack without extends when schema-valid
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-03
status: complete
---

# Phase 1 Plan 02: Schemas & ontology Summary

**Checked-in draft-2020-12 schemas, Ajv compile-once validators, DESIGN general pack with closed allowlists, replace-only load, and review|coerce|drop policy matrix — ONT-01/02/03.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-03T02:50:17Z
- **Completed:** 2026-08-03T02:54:10Z
- **Tasks:** 3/3
- **Files modified:** 18 (16 created, 2 modified)

## Accomplishments

- Shipped `schemas/graph-v1.schema.json` and `schemas/ontology-pack.schema.json` as on-disk authority (D-09)
- Implemented `loadOntologyPack` for package-shipped `general` with `typeSet`/`predicateSet`/`packHash`
- Implemented `applyUnknownPolicy` pure matrix: allow / review / coerce(Concept|related_to) / drop
- Enforced replace-only composition: any `extends` field → `ONTOLOGY_INVALID` (ONT-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end load general ontology pack via Ajv** - `1066ca2` (feat)
2. **Task 2: Unknown type/predicate policy matrix (ONT-02)** - `a938ecc` (feat)
3. **Task 3: Replace-only pack composition gate (ONT-03)** - `c3a902f` (feat)

_Note: Task 1 was TDD-shaped (behavior tests + schemas/loader together) committed green after verify; ONT-03 fixtures included early so load tests covered replace-only from Task 1, with Task 3 hardening array-extends coverage._

## Files Created/Modified

- `schemas/graph-v1.schema.json` — graph.v1 SoT schema (const engine/schema_version, provenance minItems 1)
- `schemas/ontology-pack.schema.json` — pack schema (required allowlists, policy enums)
- `ontology-packs/general/ontology.json` — DESIGN general pack verbatim
- `ontology-packs/general/README.md` — replace-only customize instructions
- `src/schema/validators.ts` — Ajv 2020 + ajv-formats compile-once
- `src/ontology/types.ts` — OntologyPack / LoadedOntology / policy types
- `src/ontology/load-pack.ts` — replace-only loader + sha256 packHash
- `src/ontology/policy.ts` — applyUnknownPolicy matrix
- `src/types.ts` — GraphV1Document / Triple / ProvenanceEntry mirrors
- `src/index.ts` — public re-exports
- `tests/ontology-load.test.ts` — ONT-01 + ONT-03
- `tests/ontology-policy.test.ts` — ONT-02
- `tests/schema-validate.test.ts` — D-09 accept/reject
- `tests/fixtures/ontology/*` — invalid, schema-invalid, extends, custom packs

## Decisions Made

- **packHash** uses raw file bytes (sha256 hex) so the same on-disk pack is stable; reformatting changes the hash intentionally
- **extends** is rejected via own-property check *before* Ajv so authors get a composition-specific message (schema also forbids unknown root props)
- **Triple** public type uses schema field names `s`/`p`/`o` (replacing 01-01 subject/predicate/object stubs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] assert.equal message callback not allowed by @types/node**
- **Found during:** Task 1 (test compile)
- **Issue:** `assert.equal(actual, expected, () => msg)` failed TS2345 under node:assert types
- **Fix:** Pass `JSON.stringify(...)` string as third argument
- **Files modified:** `tests/schema-validate.test.ts`
- **Verification:** `npm test` green
- **Committed in:** `1066ca2`

**Total deviations:** 1 auto-fixed (Rule 1)  
**Impact on plan:** Compile fix only; no scope change.

## Issues Encountered

None beyond the assert typing fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan **01-03** can call `validateGraphV1` on publish candidates and use `GraphError` / reason codes already present
- Ontology lock snapshot can consume `packHash` + allowlist Sets from `LoadedOntology`
- Extract/normalize still out of scope; policy helper is ready for future normalize stage

## Known Stubs

None — 01-01 GraphNode/Triple stubs replaced with full schema mirrors; no placeholder policy or empty allowlists.

## Self-Check: PASSED

- FOUND: schemas/graph-v1.schema.json, schemas/ontology-pack.schema.json, ontology-packs/general/ontology.json
- FOUND: src/schema/validators.ts, src/ontology/load-pack.ts, src/ontology/policy.ts
- FOUND: tests/ontology-load.test.ts, tests/ontology-policy.test.ts, tests/schema-validate.test.ts
- FOUND commits: 1066ca2, a938ecc, c3a902f
- npm test: 29/29 pass; npm run build: pass
