---
phase: 02-build-pipeline
plan: 01
subsystem: extract-sources
tags: [markdown, fingerprint, sha256, discover, redact, oq-1, free-prose, ids]

requires:
  - phase: 01-foundation-identity
    provides: GraphError/GSD_GRAPH_REASON, GraphNode/Triple/ProvenanceEntry types, public index façade, PATH_ESCAPE/CORPUS_NOT_FOUND codes
provides:
  - fingerprintFile sha256 content_hash of raw file bytes (EXT-03)
  - extractMarkdown deterministic OQ-1 MD/text grammar (EXT-01)
  - discoverSources realpath-confined corpus walk with size caps
  - pipeline id helpers (slugifyLabel, nodeId, tripleId, bestTier, stableStringify, reviewItemId)
  - free-prose + structured-edges golden corpus fixtures
affects:
  - 02-02 JSONL extract
  - 02-03 normalize / best_tier consumers
  - 02-04 build orchestrator discover+fingerprint loop

actuals:
  tokens: 10414
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - Pure TypeScript line scanners (no remark/mdast)
    - node:crypto sha256 for fingerprints and stable ids
    - realpath prefix confinement on corpus roots
    - Secret redaction before label emission

key-files:
  created:
    - src/pipeline/ids.ts
    - src/sources/fingerprint.ts
    - src/sources/markdown.ts
    - src/sources/redact.ts
    - src/sources/discover.ts
    - tests/fingerprint.test.ts
    - tests/extract-markdown.test.ts
    - tests/fixtures/corpus/structured-edges.md
    - tests/fixtures/corpus/free-prose.md
  modified:
    - src/types.ts
    - src/index.ts

key-decisions:
  - "OQ-1 six-rule MD grammar locked in markdown.ts module header"
  - "discoverSources returns { files, diagnostics } with FILE_TOO_LARGE skips"
  - "redactSecrets applied on all labels/descriptions before node emission"
  - "Free prose yields no EXTRACTED typed multi-hop predicates (D-01 honesty)"

patterns-established:
  - "Sources live under src/sources/*; id helpers under src/pipeline/ids.ts"
  - "Every EXTRACTED provenance entry carries content_hash from fingerprint"
  - "Corpus fixtures under tests/fixtures/corpus/ for offline honesty gates"

requirements-completed: [EXT-01, EXT-03]

coverage:
  - id: D1
    description: "fingerprintFile returns stable sha256:hex for identical raw file bytes"
    requirement: EXT-03
    verification:
      - kind: unit
        ref: tests/fingerprint.test.ts#returns sha256: + 64 lowercase hex of raw file bytes
        status: pass
      - kind: unit
        ref: tests/fingerprint.test.ts#same bytes → same hash (stable)
        status: pass
    human_judgment: false
  - id: D2
    description: "extractMarkdown primary edge line emits EXTRACTED related_to with content_hash provenance"
    requirement: EXT-01
    verification:
      - kind: unit
        ref: tests/extract-markdown.test.ts#primary edge line yields Alpha/Beta nodes + EXTRACTED related_to triple
        status: pass
      - kind: unit
        ref: tests/extract-markdown.test.ts#fixture structured-edges.md fingerprints and extracts primary edge
        status: pass
    human_judgment: false
  - id: D3
    description: "Full OQ-1 grammar (wiki, links, headings, edge forms, definitions, tags)"
    requirement: EXT-01
    verification:
      - kind: unit
        ref: tests/extract-markdown.test.ts#wiki [[Label]] → Concept + mentions from Document context (heading)
        status: pass
      - kind: unit
        ref: tests/extract-markdown.test.ts#markdown link [label](path) → mentions EXTRACTED; path not fetched
        status: pass
      - kind: unit
        ref: tests/extract-markdown.test.ts#H1/H2 → Document + Topic + about EXTRACTED
        status: pass
      - kind: unit
        ref: tests/extract-markdown.test.ts#accepts Subject --predicate--> Object and Subject -predicate-> Object
        status: pass
      - kind: unit
        ref: tests/extract-markdown.test.ts#definition-ish updates Concept description only — no invented causes
        status: pass
      - kind: unit
        ref: tests/extract-markdown.test.ts#topic-token → Topic + mentions EXTRACTED
        status: pass
    human_judgment: false
  - id: D4
    description: "Free-prose fixture emits no EXTRACTED typed multi-hop predicates"
    requirement: EXT-01
    verification:
      - kind: unit
        ref: tests/extract-markdown.test.ts#free-prose.md emits no EXTRACTED typed multi-hop predicates
        status: pass
    human_judgment: false
  - id: D5
    description: "Secret-like tokens redacted to [REDACTED] in labels"
    requirement: EXT-01
    verification:
      - kind: unit
        ref: tests/extract-markdown.test.ts#redacts sk- tokens in wiki labels to [REDACTED]
        status: pass
    human_judgment: false
  - id: D6
    description: "discoverSources confines roots, skips oversized files, stable sort"
    requirement: EXT-03
    verification:
      - kind: unit
        ref: tests/fingerprint.test.ts#returns absolute paths for default extensions under root, sorted
        status: pass
      - kind: unit
        ref: tests/fingerprint.test.ts#missing corpus root throws CORPUS_NOT_FOUND
        status: pass
      - kind: unit
        ref: tests/fingerprint.test.ts#path escape via symlink outside root throws PATH_ESCAPE when OS allows
        status: pass
      - kind: unit
        ref: tests/fingerprint.test.ts#files larger than maxBytes are omitted with FILE_TOO_LARGE diagnostic
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-08-03
status: complete
---

# Phase 2 Plan 01: Build Pipeline Extract + Fingerprint Summary

**Deterministic Markdown OQ-1 extract, sha256 source fingerprints, realpath-confined corpus discovery, and free-prose honesty fixtures with no invented multi-hop edges offline.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-03T03:24:39Z
- **Completed:** 2026-08-03T03:31:01Z
- **Tasks:** 3/3
- **Files modified:** 11 (9 created, 2 modified)

## Accomplishments

- Shipped `fingerprintFile` (`sha256:` + raw-byte hex) and stable id helpers (`nodeId`, `tripleId`, `bestTier`, `reviewItemId`, `stableStringify`)
- Implemented full OQ-1 MD grammar in `extractMarkdown` with provenance-stamped EXTRACTED triples
- Locked free-prose honesty: paragraphs alone never invent `causes`/`depends_on`/etc. EXTRACTED edges
- Added `discoverSources` with PATH_ESCAPE confinement, CORPUS_NOT_FOUND, 8 MiB skip diagnostics, sorted paths
- Secret redaction (`sk-…`, `AKIA…`, PEM blocks → `[REDACTED]`) on labels/descriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end fingerprint one MD edge into ExtractResult** - `13d0d47` (feat)
2. **Task 2: Full OQ-1 MD grammar, free-prose honesty, redaction** - `dbcb3e1` (feat)
3. **Task 3: Corpus discover under roots with path confinement** - `75f2ba3` (feat)

_Note: Task 1 tracer included full OQ-1 scanner + redact helpers so Task 2 could focus on golden fixtures and expanded behavioral gates; Task 3 wired discover + confinement tests._

## Files Created/Modified

- `src/types.ts` — ExtractDiagnostic, ExtractResult
- `src/pipeline/ids.ts` — slugifyLabel, nodeId, tripleId, bestTier, stableStringify, reviewItemId
- `src/sources/fingerprint.ts` — fingerprintFile (raw bytes sha256)
- `src/sources/markdown.ts` — extractMarkdown OQ-1 line scanner
- `src/sources/redact.ts` — redactSecrets
- `src/sources/discover.ts` — discoverSources with confinement + size caps
- `src/index.ts` — public exports for extract/fingerprint/discover/ids
- `tests/fixtures/corpus/structured-edges.md` — golden structured MD
- `tests/fixtures/corpus/free-prose.md` — G0 free-prose honesty seed
- `tests/extract-markdown.test.ts` — EXT-01 + free-prose + id helper gates
- `tests/fingerprint.test.ts` — EXT-03 fingerprint + discover gates

## Decisions Made

- **OQ-1 grammar documented in markdown.ts header** — primary `[[A]] --p--> [[B]]` plus unlinked long/short forms
- **discoverSources return shape `{ files, diagnostics }`** — oversized files are diagnostics, not hard errors
- **redact before emit** — labels never retain sk-/AKIA/PEM patterns
- **No weak free-prose INFERRED causation** — free prose emits no typed multi-hop EXTRACTED edges (D-01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Ship redact.ts with Task 1 tracer**
- **Found during:** Task 1 (markdown extract)
- **Issue:** Plan scheduled redact for Task 2, but markdown labels need redaction at emission boundary (T-02-02)
- **Fix:** Implemented `redactSecrets` and applied it in Task 1 so extract never emits raw secrets
- **Files modified:** `src/sources/redact.ts`, `src/sources/markdown.ts`
- **Verification:** Task 2 redaction unit test passes
- **Committed in:** `13d0d47` (Task 1)

**2. [Rule 2 - Missing Critical] Full OQ-1 scanner in Task 1 tracer**
- **Found during:** Task 1
- **Issue:** Thin primary-edge-only scanner would force a large rewrite in Task 2; threat model + D-01 honesty need complete grammar
- **Fix:** Implemented full six-rule scanner in Task 1; Task 2 added fixtures/tests for each rule
- **Files modified:** `src/sources/markdown.ts`
- **Verification:** OQ-1 suite + free-prose honesty pass
- **Committed in:** `13d0d47` / `dbcb3e1`

---

**Total deviations:** 2 auto-fixed (Rule 2)
**Impact on plan:** Front-loaded correctness/security; no scope beyond plan deliverables. No normalize/build/CLI.

## Issues Encountered

- TypeScript parsed `**/*.{…}` inside a JSDoc comment as end-of-comment (`*/`) — rewrote discover options comment without nested `*/` sequence.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EXT-01 + EXT-03 fingerprint/discovery foundation ready for JSONL extract (02-02) and normalize (02-03)
- Public façade exports: `fingerprintFile`, `discoverSources`, `extractMarkdown`, id helpers
- Do not invent multi-hop from free prose in later extractors either

## Known Stubs

None — extract/discover/fingerprint are production-quality offline stages; normalize/build intentionally deferred to later plans.

## Self-Check: PASSED

- FOUND: src/pipeline/ids.ts, src/sources/fingerprint.ts, src/sources/markdown.ts, src/sources/redact.ts, src/sources/discover.ts
- FOUND: tests/fingerprint.test.ts, tests/extract-markdown.test.ts, tests/fixtures/corpus/structured-edges.md, tests/fixtures/corpus/free-prose.md
- FOUND: .planning/phases/02-build-pipeline/02-01-SUMMARY.md
- FOUND commits: 13d0d47, dbcb3e1, 75f2ba3
- npm test: 77/77 pass; npm run build: pass
- Public exports present for fingerprintFile, discoverSources, extractMarkdown, id helpers
