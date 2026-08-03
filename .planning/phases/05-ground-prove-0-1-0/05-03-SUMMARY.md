---
phase: 05-ground-prove-0-1-0
plan: 03
subsystem: cli
tags: [cli, pack, answer, K22, commander, D-06, PACK-01, ANS-01, ANS-02]

requires:
  - phase: 05-ground-prove-0-1-0
    provides: "packSubgraph composition (PACK-01) + deterministic answer/abstain (ANS-01/ANS-02)"
provides:
  - "CLI pack and answer thin K22 adapters (D-06)"
  - "Phase 4 unregistered exit-1 expectations flipped to registered happy path"
  - "Abstain/empty answer still exit 0 with JSON body (ANS-02)"
affects: [05-04-goldens, CLI-01 pack/answer verbs]

actuals:
  tokens: 2810
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "pack/answer CLI = query-style thin adapters: withDir + writeOk only (D-06, D-10)"
    - "Empty/abstain library results are success — never map to exit 2 (D-04, ANS-02)"
    - "Phase 4 unregistered negative tests flipped same wave as registration (pitfall 5)"

key-files:
  created: []
  modified:
    - src/cli.ts
    - tests/cli-commands.test.ts
    - tests/cli.test.ts

key-decisions:
  - "Mirror query adapter shape exactly for pack/answer (argument <question>, optional --budget parseInt)"
  - "Multi-hop-only isolated corpus for CLI smoke — avoid free-prose about noise from full fixturesCorpus"
  - "Process-level spawn tests cover registered success + abstain exit 0 in addition to main()-level cli-commands"

patterns-established:
  - "Grounding CLI verbs stay thin: library owns pack/answer logic; CLI only maps argv → opts → writeOk"
  - "When registering formerly-unregistered verbs, flip all exit-matrix expectations in the same plan wave"

requirements-completed: [PACK-01, ANS-01, ANS-02]

coverage:
  - id: D1
    description: "CLI registers pack and answer with JSON stdout via writeOk (D-06, K22)"
    requirement: PACK-01
    verification:
      - kind: unit
        ref: "tests/cli-commands.test.ts#pack <question> exits 0 with seeds/triples/paths JSON (D-06)"
        status: pass
      - kind: unit
        ref: "tests/cli-commands.test.ts#answer <question> exits 0 with pack, answer_markdown, mode, abstained (D-06, ANS-01)"
        status: pass
      - kind: e2e
        ref: "tests/cli.test.ts#pack and answer registered success exit 0 (D-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Empty/abstain answer still exits 0 with abstained true (not exit 2)"
    requirement: ANS-02
    verification:
      - kind: unit
        ref: "tests/cli-commands.test.ts#answer abstain still exits 0 with abstained true (D-04, ANS-02)"
        status: pass
      - kind: e2e
        ref: "tests/cli.test.ts#answer abstain exits 0 not 2 (ANS-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase 4 unregistered pack/answer exit-1 flipped; true unknown verb still exit 1"
    requirement: ANS-01
    verification:
      - kind: e2e
        ref: "tests/cli.test.ts#unknown command exit 1"
        status: pass
      - kind: unit
        ref: "tests/cli-commands.test.ts#pack/answer missing question argument exit 1 usage (CLI-02)"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 03: CLI pack/answer adapters Summary

**CLI registers pack and answer as thin K22 adapters; Phase 4 unregistered exit-1 tests flipped to registered happy path with abstain exit 0**

## Performance

- **Duration:** 2 min
- **Started:** 2026-08-03T15:32:52Z
- **Completed:** 2026-08-03T15:34:41Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Registered `pack` and `answer` commander commands over `packSubgraph` / `answer` with `--budget` and global `--dir` (D-06, D-10)
- Empty/abstain library results still exit 0 with JSON body — not operational failure exit 2 (D-04, ANS-02)
- Flipped Phase 4 negative tests; true unknown verbs still exit 1 with usage JSON (pitfall 5)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Register pack and answer CLI adapters** - `ac40b80` (test)
2. **Task 1 (GREEN): Register pack and answer CLI adapters** - `081ad2c` (feat)
3. **Task 2: Flip process-level exit matrix for pack/answer** - `d989590` (test)

**Plan metadata:** (pending docs commit)

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `src/cli.ts` — import packSubgraph/answer; register thin pack/answer commands; remove Phase 4 unregistered comment
- `tests/cli-commands.test.ts` — multi-hop store helper; pack/answer happy-path, budget, missing-arg, abstain smoke
- `tests/cli.test.ts` — unknown-command only exit 1; process-level pack/answer success + abstain exit 0

## Decisions Made

- Mirror query adapter pattern exactly (argument + optional budget + withDir + writeOk)
- Use multi-hop-only isolated corpus for CLI grounding smoke (matches library pack-answer fixture strategy)
- Cover abstain exit 0 at both main() and process-spawn levels so ANS-02 is not CLI-layer-regressed

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new trust surface beyond planned argv → library adapters and K22 JSON stdout.

## TDD Gate Compliance

- RED: `ac40b80` test(05-03): add failing pack/answer CLI registration tests
- GREEN: `081ad2c` feat(05-03): register pack and answer CLI adapters
- Task 2 test flip after registration: `d989590`

## Self-Check: PASSED

- FOUND: src/cli.ts (pack/answer commands registered)
- FOUND: tests/cli-commands.test.ts (happy-path pack/answer)
- FOUND: tests/cli.test.ts (unknown-only exit 1 + registered success)
- FOUND: ac40b80, 081ad2c, d989590 commits
- npm test: 228 pass / 0 fail
- npm run build: exit 0
