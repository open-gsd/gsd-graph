---
phase: 05-ground-prove-0-1-0
plan: 04
subsystem: testing
tags: [goldens, G0, G1, G2, changelog, release, GOLD-01, GOLD-02, GOLD-03]

requires:
  - phase: 05-01
    provides: packSubgraph public query composition
  - phase: 05-02
    provides: deterministic answer + abstain honesty
  - phase: 05-03
    provides: CLI pack/answer adapters (K22)
provides:
  - Offline G0 free-prose honesty golden (GOLD-01)
  - Offline G1 multi-hop causes path golden (GOLD-02)
  - Cheap G2 drought→food-shortage path assert
  - CHANGELOG Keep a Changelog [0.1.0] release notes
  - README CLI docs for pack/answer
  - Full npm test green gate for 0.1.0 (GOLD-03)
affects: [ship, verify-work, phase-6]

actuals:
  tokens: 3500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Isolated single-fixture corpus mkdtemp harness (pitfall 6)"
    - "G0 honesty = abstain OR no typed multi-hop path (about edges allowed)"
    - "G3/G4 documented as covered by query applyBudget + maintain M1–M5"

key-files:
  created:
    - tests/golden-scenarios.test.ts
    - CHANGELOG.md
  modified:
    - README.md

key-decisions:
  - "G0 pass criteria is abstain OR no typed multi-hop path — not zero triples"
  - "G3/G4 not reimplemented; comments point at query.test + maintain M1–M5"
  - "package.json version remains 0.1.0; no npm publish or git tag in-plan"

patterns-established:
  - "Golden harness: mkdtemp store + copy one fixture + init + build({full:true}) + pack/answer"
  - "TYPED_MULTI_HOP set: causes|supports|contradicts|precedes|depends_on"

requirements-completed: [GOLD-01, GOLD-02, GOLD-03]

coverage:
  - id: D1
    description: "G0 free-prose isolated corpus offline pack/answer abstains or has no typed multi-hop path"
    requirement: GOLD-01
    verification:
      - kind: integration
        ref: "tests/golden-scenarios.test.ts#G0 free-prose honesty"
        status: pass
    human_judgment: false
  - id: D2
    description: "G1 multi-hop.jsonl pack paths ≥1 with ≥3 nodes and causes; citations + deterministic answer"
    requirement: GOLD-02
    verification:
      - kind: integration
        ref: "tests/golden-scenarios.test.ts#G1 multi-hop causes path"
        status: pass
    human_judgment: false
  - id: D3
    description: "0.1.0 release readiness: CHANGELOG [0.1.0], version 0.1.0, full npm test green"
    requirement: GOLD-03
    verification:
      - kind: unit
        ref: "npm test (233 tests incl. maintain M1–M5, cli, pack-answer, golden-scenarios)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 04: Offline goldens G0/G1 + 0.1.0 release readiness Summary

**Offline G0 free-prose abstains (no typed multi-hop) and G1 multi-hop.jsonl yields cited ≥3-node causes paths; CHANGELOG/README mark 0.1.0 releasable with full suite green (233 tests).**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-03T15:36:19Z
- **Completed:** 2026-08-03T15:38:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- G0 golden: isolated `free-prose.md` only → extract has zero typed multi-hop predicates; pack/answer abstains for drought/food multi-hop question (GOLD-01, D-07)
- G1 golden: isolated `multi-hop.jsonl` → pack paths with ≥3 nodes and `causes`, citations include `causes`, answer mode deterministic (GOLD-02, D-08)
- G2 cheap: `query({path: Drought→Food Shortage})` non-empty typed causes chain on multi-hop store
- CHANGELOG Keep a Changelog `## [0.1.0] - 2026-08-03` lists pack/answer, goldens, foundation; Notes defer LLM/MCP/communities
- README documents CLI pack/answer (+ init/build/query/path) with K22 JSON examples; package version stays **0.1.0**
- Full `npm test` green: 233 pass (GOLD-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Golden G0 free-prose abstain + G1 multi-hop path** - `31caf94` (test)
2. **Task 2: Cheap G2 + CHANGELOG 0.1.0 + release suite gate** - `a7212bc` (docs)

**Plan metadata:** (final docs commit after state update)

## Files Created/Modified

- `tests/golden-scenarios.test.ts` — G0/G1/G2 offline honesty gates with isolated corpus harness
- `CHANGELOG.md` — Keep a Changelog 0.1.0 release notes (D-09)
- `README.md` — CLI surface including pack/answer; honesty bar section

## Decisions Made

- G0 honesty uses D-07 wording (abstain OR no typed multi-hop path); about edges allowed — not `triples.length === 0`
- G3/G4 documented in golden comments as covered by existing query budget + maintain M1–M5 suites (no full reimplementation)
- No npm publish / git tag in-plan — gate is green suite + docs only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Goldens are offline (D-05, D-12).

## Next Phase Readiness

Phase 5 plans 05-01..05-04 complete. Package is releasable as 0.1.0 when operator chooses to tag/publish. Deferred to later phases: LLM answer apply, MCP tools, communities, GRAPH_REPORT.

## Self-Check: PASSED

- FOUND: `tests/golden-scenarios.test.ts`
- FOUND: `CHANGELOG.md`
- FOUND: `README.md`
- FOUND: commit `31caf94`
- FOUND: commit `a7212bc`
- FOUND: package.json version `0.1.0`
- FOUND: npm test 233 pass / 0 fail
