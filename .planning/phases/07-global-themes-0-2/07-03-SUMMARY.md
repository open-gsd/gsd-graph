---
phase: 07-global-themes-0-2
plan: 03
subsystem: cli
tags: [communities, cli, k22, 0.2.0, CHANGELOG, COM-01, global-themes]

requires:
  - phase: 07-01
    provides: Pure-TS detectCommunities LPA library
  - phase: 07-02
    provides: writeCommunityReports + communities/ store artifacts
provides:
  - Nested CLI communities detect|report (K22 JSON)
  - Package identity 0.2.0
  - CHANGELOG + README global-themes documentation
affects:
  - Phase 7 complete / milestone 0.2.0 ship

actuals:
  tokens: 4405
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Nested commander group communities detect|report matching snapshot/review (D-06)"
    - "CLI detects always write:true; report is rewrite-only over index"
    - "Stdout K22 payload shaped as RESEARCH CLI result (ok + community_count + summary communities)"

key-files:
  created: []
  modified:
    - src/cli.ts
    - package.json
    - package-lock.json
    - CHANGELOG.md
    - README.md
    - tests/cli-commands.test.ts
    - tests/package-identity.test.ts

key-decisions:
  - "communities detect always passes write:true so CLI operators get sidecars by default"
  - "CLI community summaries emit only id/size/label/stable_key (not full members) for machine-readable brevity"
  - "package-lock.json version bumped with package.json for identity consistency"

patterns-established:
  - "Pattern: Phase ship surface = nested CLI + semver bump + CHANGELOG section + README product pitch"
  - "Pattern: two-clique publishGraphFiles fixture reused in CLI smoke (offline D-10)"

requirements-completed: [COM-01]

coverage:
  - id: D1
    description: "gsd-graph communities detect exits 0 with K22 JSON ok, community_count, communities summary, index_path over two-clique store"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/cli-commands.test.ts#communities detect returns K22 JSON with ok, community_count, index_path"
        status: pass
    human_judgment: false
  - id: D2
    description: "communities report after detect exits 0 with paths; missing index exits 2 schema_invalid"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/cli-commands.test.ts#cli-commands communities report (COM-01, D-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "package.json version is 0.2.0; CHANGELOG [0.2.0] documents communities; README documents detect|report and non-SoT honesty"
    requirement: COM-01
    verification:
      - kind: unit
        ref: "tests/package-identity.test.ts#package version is 0.2.0 (global themes milestone, D-07)"
        status: pass
      - kind: other
        ref: "CHANGELOG.md## [0.2.0] + README communities CLI section"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-03
status: complete
---

# Phase 7 Plan 03: CLI + 0.2.0 Ship Surface Summary

**Nested K22 `communities detect|report` CLI plus package 0.2.0 identity, CHANGELOG, and README global-themes docs**

## Performance

- **Duration:** 4min
- **Started:** 2026-08-03T20:17:12Z
- **Completed:** 2026-08-03T20:20:40Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Shipped nested `gsd-graph communities detect` thin adapter over `detectCommunities` with K22 JSON (`ok`, `community_count`, summary communities, `index_path`, `report_paths`)
- Shipped `communities report` rewrite path over `writeCommunityReports`; missing index maps to exit 2 / `schema_invalid`
- Bumped package to **0.2.0** and documented communities as the global-search differentiator (CHANGELOG + README); honesty that `communities/` is disposable not SoT

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 RED: failing communities detect CLI tests** - `9a6c138` (test)
2. **Task 1 GREEN: communities detect CLI** - `3660e52` (feat)
3. **Task 2 RED: report CLI + 0.2.0 version tests** - `afd8ba7` (test)
4. **Task 2 GREEN: report CLI + version/docs** - `7635a5b` (feat)

**Plan metadata:** (pending docs commit)

_Note: TDD tasks used separate RED/GREEN commits_

## Files Created/Modified

- `src/cli.ts` — nested `communities detect|report` commander group
- `package.json` / `package-lock.json` — version `0.2.0` (+ description pitch)
- `CHANGELOG.md` — `[0.2.0]` section for LPA communities + CLI
- `README.md` — CLI examples/table + 0.2.0 product pitch / honesty bar
- `tests/cli-commands.test.ts` — offline two-clique detect/report smoke
- `tests/package-identity.test.ts` — version `0.2.0` gate

## Decisions Made

- CLI `detect` always sets `write: true` so operators get `communities/` artifacts without an extra flag
- JSON community list is a summary (`id`/`size`/`label`/`stable_key`) matching RESEARCH CLI shape — not full member arrays
- Bumped `package-lock.json` root version alongside `package.json` for identity consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 7 plans 07-01..07-03 complete for COM-01 / 0.2.0 ship criteria
- Full `npm test` green (311 tests)
- Ready for phase verification / milestone closeout

## Known Stubs

None.

## Self-Check: PASSED

- `src/cli.ts` communities detect|report present
- `package.json` version `0.2.0`
- Commits `9a6c138`, `3660e52`, `afd8ba7`, `7635a5b` exist
- CLI + package-identity tests pass in full suite

---
*Phase: 07-global-themes-0-2*
*Completed: 2026-08-03*
