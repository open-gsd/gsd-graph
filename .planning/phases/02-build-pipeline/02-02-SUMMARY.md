---
phase: 02-build-pipeline
plan: 02
subsystem: extract-jsonl
tags: [jsonl, field-map, multi-hop, extractByPath, EXT-02]

requires:
  - phase: 02-build-pipeline
    provides: fingerprintFile, extractMarkdown, nodeId/tripleId, ExtractResult types, corpus fixtures
provides:
  - extractJsonl field-map adapter (JSONL + JSON array)
  - extractByPath extension router with content_hash provenance
  - multi-hop.jsonl Drought→Crop Failure→Food Shortage EXTRACTED chain seed
  - EXT-02 unit gates
affects:
  - 02-03 normalize / best_tier consumers
  - 02-04 build orchestrator extract loop
  - Phase 5 multi-hop goldens (G1+)

actuals:
  tokens: 5880
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - Field-map records (type/label/edges) → EXTRACTED triples offline
    - Extension-based extract routing with fingerprint stamp (D-04)

key-files:
  created:
    - src/sources/jsonl.ts
    - src/pipeline/extract.ts
    - tests/fixtures/corpus/multi-hop.jsonl
    - tests/extract-jsonl.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "multi-hop fixture uses Concept--causes-->Concept chain (general-pack allowlisted)"
  - "Invalid JSONL lines → JSON_LINE_INVALID diagnostic and continue (no whole-file throw)"
  - "extractByPath fingerprints unless contentHash provided; never network/LLM"

patterns-established:
  - "JSON array documents and JSONL share extractJsonl field-map path"
  - "extractor string for structured field map is always jsonl/field-map"
  - "Router lives under src/pipeline/extract.ts; adapters under src/sources/*"

requirements-completed: [EXT-02]

coverage:
  - id: D1
    description: "JSONL field-map multi-hop fixture emits ≥3 nodes and A→B→C EXTRACTED causes chain with content_hash provenance"
    requirement: EXT-02
    verification:
      - kind: unit
        ref: tests/extract-jsonl.test.ts#multi-hop.jsonl yields ≥3 nodes and A→B→C EXTRACTED causes chain
        status: pass
    human_judgment: false
  - id: D2
    description: "JSON array file produces same nodes/triples as equivalent JSONL"
    requirement: EXT-02
    verification:
      - kind: unit
        ref: tests/extract-jsonl.test.ts#JSON array file produces same nodes/triples as equivalent JSONL
        status: pass
    human_judgment: false
  - id: D3
    description: "extractByPath routes .json/.jsonl and .md; unsupported extension diagnostic"
    requirement: EXT-02
    verification:
      - kind: unit
        ref: tests/extract-jsonl.test.ts#routes multi-hop.jsonl and matches direct extractJsonl
        status: pass
      - kind: unit
        ref: tests/extract-jsonl.test.ts#routes .md via extractMarkdown
        status: pass
      - kind: unit
        ref: tests/extract-jsonl.test.ts#unsupported extension yields UNSUPPORTED_EXTENSION diagnostic
        status: pass
    human_judgment: false
  - id: D4
    description: "Invalid lines and missing type/label yield diagnostics without aborting whole file"
    requirement: EXT-02
    verification:
      - kind: unit
        ref: tests/extract-jsonl.test.ts#invalid JSON line yields diagnostic and continues
        status: pass
      - kind: unit
        ref: tests/extract-jsonl.test.ts#skips records missing type or label with RECORD_INVALID
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-08-03
status: complete
---

# Phase 2 Plan 02: JSONL Field-Map Extract Summary

**JSON/JSONL field-map adapter and extension router emit EXTRACTED multi-hop chains (Drought→Crop Failure→Food Shortage via `causes`) with fingerprint-bound provenance for honest offline goldens.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-08-03T03:32:32Z
- **Completed:** 2026-08-03T03:34:56Z
- **Tasks:** 2/2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Shipped `extractJsonl` field-map: optional `id`, required `type`+`label`, optional `aliases`/`edges` with string or nested `{type,label,id?}` objects
- Seeded `tests/fixtures/corpus/multi-hop.jsonl` two-hop Concept `causes` chain for Phase 5 goldens
- Added `extractByPath` router: `.md/.markdown/.txt` → markdown, `.json/.jsonl` → field-map, else `UNSUPPORTED_EXTENSION`
- Invalid JSON lines / records produce diagnostics and continue; labels pass through `redactSecrets` (T-02-05)
- Public exports: `extractJsonl`, `extractByPath`

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end JSONL two-hop EXTRACTED chain** - `3f42e6a` (feat)
2. **Task 2: extractByPath router + JSON array file support** - `abe3e08` (feat)

_Note: Task 1 included JSON array parse path in `extractJsonl`; Task 2 added router + array parity / route tests._

## Files Created/Modified

- `src/sources/jsonl.ts` — extractJsonl field-map adapter
- `src/pipeline/extract.ts` — extractByPath extension orchestrator
- `src/index.ts` — public exports
- `tests/fixtures/corpus/multi-hop.jsonl` — EXTRACTED multi-hop seed
- `tests/extract-jsonl.test.ts` — EXT-02 unit gates

## Decisions Made

- **Allowlisted multi-hop predicate:** fixture uses `causes` between Concepts so later normalize can write without forced review
- **Diagnostic codes:** `JSON_LINE_INVALID`, `JSON_INVALID`, `RECORD_INVALID`, `EDGE_INVALID`, `CONTENT_EMPTY`, `UNSUPPORTED_EXTENSION`
- **No normalize/build** — intentionally deferred to 02-03 / 02-04

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript `exactOptionalPropertyTypes` required conditional assignment of optional `aliases` (not `aliases: undefined`)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EXT-02 complete; multi-hop fixture ready for normalize (02-03) and build (02-04)
- Public façade: `extractJsonl`, `extractByPath` alongside prior extract/fingerprint/discover surface
- Do not invent multi-hop from free prose; structured JSONL remains preferred honest path

## Known Stubs

None — field-map extract and router are production-quality offline stages; normalize/build deferred by plan.

## Self-Check: PASSED

- FOUND: src/sources/jsonl.ts, src/pipeline/extract.ts, tests/extract-jsonl.test.ts, tests/fixtures/corpus/multi-hop.jsonl
- FOUND commits: 3f42e6a, abe3e08
- npm test: 88/88 pass; npm run build: pass
- Public exports present for extractJsonl, extractByPath
