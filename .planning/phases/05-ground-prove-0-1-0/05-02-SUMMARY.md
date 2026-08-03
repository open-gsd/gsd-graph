---
phase: 05-ground-prove-0-1-0
plan: 02
subsystem: grounding
tags: [answer, grounded-answer, deterministic-markdown, abstain, citations, ANS-01, ANS-02]

requires:
  - phase: 05-ground-prove-0-1-0
    provides: "packSubgraph composition + SubgraphPack (PACK-01)"
provides:
  - "deterministic answer() over packSubgraph (ANS-01)"
  - "empty pack abstain with empty_subgraph (ANS-02)"
  - "GroundedAnswer / AnswerOptions types"
  - "pack-answer deterministic + abstain gates"
affects: [05-03-cli-pack-answer, 05-04-goldens]

actuals:
  tokens: 3999
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "answer = packSubgraph then pure markdown formatter (no LLM)"
    - "empty pack → mode abstain / abstained true / GSD_GRAPH_REASON.EMPTY_SUBGRAPH (no throw)"
    - "Relationships/Citations iterate pack.triples only"

key-files:
  created:
    - src/pipeline/answer.ts
  modified:
    - src/types.ts
    - src/index.ts
    - tests/pack-answer.test.ts

key-decisions:
  - "Empty pack answer_markdown is '' (not a fabricated note) for strict no-relationship honesty"
  - "Path rendering uses hyphen -p→ chains; Relationships use em-dash —p→ with triple backticks"
  - "AnswerOptions is PackOptions alias — no LLM flags in Phase 5 (D-05)"

patterns-established:
  - "Grounded answer is a pure formatter over SubgraphPack"
  - "Abstain is a successful return shape, never GraphError(EMPTY_SUBGRAPH)"

requirements-completed: [ANS-01, ANS-02]

coverage:
  - id: D1
    description: "Deterministic multi-hop answer with Seeds/Relationships/Paths/Citations and citations ⊆ pack triples"
    requirement: ANS-01
    verification:
      - kind: unit
        ref: "tests/pack-answer.test.ts#multi-hop question returns mode deterministic, abstained false, causes in markdown"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#Relationships and Citations derive only from pack.triples; citation ids ⊆ triples"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#answer.pack matches packSubgraph for the same options (D-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Empty pack abstains with empty_subgraph and no fabricated relationship arrows"
    requirement: ANS-02
    verification:
      - kind: unit
        ref: "tests/pack-answer.test.ts#stopword / no-match questions abstain with empty_subgraph and do not throw"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#empty pack markdown does not fabricate relationship arrows (ANS-02)"
        status: pass
      - kind: unit
        ref: "tests/pack-answer.test.ts#answer returns (no throw) for empty pack — GraphError not used for abstain"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 02: Deterministic Answer + Abstain Summary

**`answer()` ships as a pure formatter over `packSubgraph`: cited Seeds/Relationships/Paths/Citations markdown for non-empty packs, honest abstain (`empty_subgraph`) with no fabricated edges for empty packs (ANS-01, ANS-02).**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-03T15:27:18Z
- **Completed:** 2026-08-03T15:30:09Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Implemented `answer()` + `formatDeterministicMarkdown` over `packSubgraph` only (D-03, D-10)
- `GroundedAnswer` / `AnswerOptions` types with reserved `prompt_pending` | `http` modes unused in Phase 5 (D-05)
- Multi-hop drought→food-shortage returns `mode: deterministic`, citations ⊆ pack triples, Paths section mirrors `pack.paths`
- Empty / stopword / no-match packs return `mode: abstain`, `abstained: true`, `abstain_reason: empty_subgraph` without throw (ANS-02, D-04)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Deterministic answer tests** - `e172e23` (test)
2. **Task 1 GREEN: answer() implementation** - `8f04a99` (feat)
3. **Task 2: Empty pack abstain gates** - `35e5fbc` (test — behavior already in GREEN per plan “implement empty fully if cheap”)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `src/pipeline/answer.ts` — `answer()`, `formatDeterministicMarkdown`
- `src/types.ts` — `GroundedAnswer`, `AnswerOptions`
- `src/index.ts` — public exports
- `tests/pack-answer.test.ts` — ANS-01 / ANS-02 gates

## Decisions Made

- Empty `answer_markdown` is `''` rather than a prose abstain note — strongest no-relationship guarantee for goldens
- Relationship lines: `s —p→ o (\`triple_id\`)`; path lines: `n0 -p→ n1 -p→ n2` (RESEARCH Pattern 2)
- `AnswerOptions = PackOptions` — no LLM/apply flags this phase

## Deviations from Plan

None - plan executed exactly as written.

_Note: Task 2 abstain implementation landed with Task 1 GREEN (plan allowed “implement empty fully if cheap”); Task 2 commit locks ANS-02 with tests only._

## Issues Encountered

None beyond a test token choice (`foo` substring-matched `Food`) fixed before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for **05-03** CLI `pack` / `answer` adapters (library surface complete)
- Ready for **05-04** goldens G0/G1 using `answer()` + multi-hop / free-prose fixtures

## Self-Check: PASSED

- FOUND: `src/pipeline/answer.ts`
- FOUND: `src/types.ts` (GroundedAnswer / AnswerOptions)
- FOUND: `src/index.ts` (answer export)
- FOUND: `tests/pack-answer.test.ts`
- FOUND: commits `e172e23`, `8f04a99`, `35e5fbc`
- VERIFY: `npm test` 222 pass / 0 fail; `npm run build` green

---
*Phase: 05-ground-prove-0-1-0*
*Completed: 2026-08-03*
