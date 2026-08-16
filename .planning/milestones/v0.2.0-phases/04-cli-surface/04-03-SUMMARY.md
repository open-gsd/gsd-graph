---
phase: 04-cli-surface
plan: 03
subsystem: cli
tags: [cli, e2e, spawnSync, k22, exit-codes, package-identity, bin]

requires:
  - phase: 04-cli-surface
    provides: bin/gsd-graph, main(argv), full Phase 4 command surface, mapCliError
  - phase: 02-extract-normalize-build
    provides: build --corpus multi-hop fixture chain
  - phase: 03-query-lifecycle
    provides: query seed_expand + path IR
provides:
  - Process-level E2E happy path init → build → query → path (D-12)
  - K22 exit matrix 0/1/2/3 proven via spawnSync (CLI-02)
  - pack/answer unknown exit 1 at process boundary (D-02)
  - PKG-03 bin invokable via process.execPath spawn gate
affects:
  - Phase 5 pack/answer CLI registration
  - ROADMAP Phase 4 success criteria close-out

actuals:
  tokens: 2831
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - spawnSync(process.execPath, [binPath, ...args], { cwd, encoding utf8, NO_COLOR:1 })
    - JSON.parse(full stdout.trim()) asserts no log leakage (T-04-08)
    - plant .build.lock with live pid for exit 3 (T-04-09)

key-files:
  created:
    - tests/cli.test.ts
  modified:
    - tests/package-identity.test.ts

key-decisions:
  - "Corpus path is fixtures directory (not single jsonl file) matching library discoverSources"
  - "Path endpoints discovered from query seeds/nodes with stable Concept:slug fallbacks"
  - "Exit 2 proven both via diff no_baseline and build corpus_not_found"
  - "Package-identity residual: process spawn of ontology show, not only static shebang checks"

patterns-established:
  - "Process E2E helper: run(args, cwd) → {status, stdout, stderr, json, errorJson}"
  - "Lock plant uses BuildLockPayload shape (pid, started_at, owner, cwd) with process.pid"

requirements-completed: [PKG-03, CLI-01, CLI-02, CLI-03]

coverage:
  - id: D1
    description: Process-spawn happy path init → build → query → path exit 0 with JSON-only stdout
    requirement: CLI-02
    verification:
      - kind: e2e
        ref: tests/cli.test.ts#init → build → query → path exits 0 with JSON-only stdout
        status: pass
    human_judgment: false
  - id: D2
    description: Exit 1 for unknown/pack/answer and build without --corpus
    requirement: CLI-01
    verification:
      - kind: e2e
        ref: tests/cli.test.ts#unknown command and unregistered pack/answer exit 1
        status: pass
    human_judgment: false
  - id: D3
    description: Operational GraphError exits 2 with D-04 stderr shape (no_baseline, corpus_not_found)
    requirement: CLI-02
    verification:
      - kind: e2e
        ref: tests/cli.test.ts#operational failure exits 2 with stderr {ok:false,reason,message}
        status: pass
    human_judgment: false
  - id: D4
    description: build_locked surfaces as exit 3 with reason build_locked
    requirement: CLI-02
    verification:
      - kind: e2e
        ref: tests/cli.test.ts#build_locked surfaces as exit 3 with reason build_locked
        status: pass
    human_judgment: false
  - id: D5
    description: Published bin invokable via package.json bin + process.execPath spawn
    requirement: PKG-03
    verification:
      - kind: e2e
        ref: tests/package-identity.test.ts#bin is invokable via process.execPath spawn
        status: pass
    human_judgment: false
  - id: D6
    description: init creates store + gitignore append at process boundary
    requirement: CLI-03
    verification:
      - kind: e2e
        ref: tests/cli.test.ts#init → build → query → path exits 0 with JSON-only stdout
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-03
status: complete
---

# Phase 4 Plan 03: CLI process E2E Summary

**Process-spawn E2E proves machine CLI contract: init→build→query→path exit 0 JSON, full K22 0/1/2/3 matrix, pack/answer exit 1, PKG-03 bin spawn.**

## Performance

- **Duration:** 3min
- **Started:** 2026-08-03T14:07:25Z
- **Completed:** 2026-08-03T14:09:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Process-level happy path via `spawnSync(process.execPath, [bin/gsd-graph.js, ...])` with `NO_COLOR=1` and tmp cwd (D-11, D-12)
- Full K22 exit matrix: 0 success, 1 usage/unknown/pack/answer, 2 operational (`no_baseline`, `corpus_not_found`), 3 `build_locked`
- JSON-only stdout enforced by `JSON.parse(full stdout.trim())` — fails if logs leak (T-04-08)
- PKG-03 residual process gate: package-identity spawns bin and parses ontology show JSON

## Task Commits

Each task was committed atomically:

1. **Task 1: SpawnSync happy path init → build → query → path** - `e59d20c` (test)
2. **Task 2: Exit code matrix 1/2/3 + pack/answer unknown + bin identity** - `68ec39b` (test)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `tests/cli.test.ts` — process E2E happy path + exit matrix suite
- `tests/package-identity.test.ts` — process-level bin spawn gate (PKG-03 residual)

## Decisions Made

- Corpus argument is the fixtures **directory** (library `discoverSources`), absolute path
- Path `from`/`to` discovered from query seeds/nodes with `Concept:drought` / `Concept:food-shortage` fallbacks
- Exit 2 dual coverage: `diff` after init-only (`no_baseline`) and bad `--corpus` (`corpus_not_found`)
- Lock plant uses live `process.pid` + fresh `started_at` so lock is non-stale

## Deviations from Plan

None - plan executed exactly as written.

Exit matrix tests were co-located in `tests/cli.test.ts` with the happy path (same file listed for both tasks); Task 2 also closed residual PKG-03 via package-identity process spawn.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary schema changes. Tests only assert existing CLI surface under spawn.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: tests/cli.test.ts
- FOUND: tests/package-identity.test.ts (process spawn gate)
- FOUND: e59d20c
- FOUND: 68ec39b
- npm test: 200 pass / 0 fail
- npm run build: ok
