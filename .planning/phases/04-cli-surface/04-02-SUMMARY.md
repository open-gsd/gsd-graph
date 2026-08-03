---
phase: 04-cli-surface
plan: 02
subsystem: cli
tags: [cli, commander, build, query, path, status, diff, snapshot, review, ontology, repair, k22]

requires:
  - phase: 04-cli-surface
    provides: bin/gsd-graph, main(argv), mapCliError, init command, K22 I/O
  - phase: 02-extract-normalize-build
    provides: build, status, reviewResolve, loadReviewQueue
  - phase: 03-query-lifecycle
    provides: query, snapshot*, diff, repair
  - phase: 01-foundation
    provides: loadOntologyPack, resolveStoreRoot, GraphError
provides:
  - Full Phase 4 commander surface (init, build, query, path, status, diff, snapshot, review, repair, ontology)
  - Thin library adapters with JSON stdout only on success (CLI-01, D-06)
  - Nested snapshot/review/ontology verbs without external executable form
  - pack/answer intentionally unregistered (D-02 Phase 5)
affects:
  - 04-03 (happy-path / packaging polish)
  - Phase 5 pack/answer CLI registration

actuals:
  tokens: 5513
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - thin commander action → library export → writeOk only
    - global --dir via optsWithGlobals / withDir helper
    - nested .command('parent') + .command('child') without executable string form
    - review always resolveStoreRoot before reviewResolve/loadReviewQueue

key-files:
  created:
    - tests/cli-commands.test.ts
  modified:
    - src/cli.ts

key-decisions:
  - "path is a top-level verb that maps to query({ path: { from, to, maxDepth } }) — no separate path library"
  - "review list filters status==='pending' and includes decisions_count/pending_count for agent UX"
  - "ontology show emits JSON-safe summary (counts + packHash) — never serializes Sets"
  - "pack/answer left unregistered so commander unknown command → exit 1 (D-02)"

patterns-established:
  - "CLI adapter pattern: withDir + globalDir helpers keep optional dir typing clean"
  - "Nested lifecycle verbs registered as parent Command objects, not program.command('snapshot save')"
  - "Success always writeOk(libraryResult); mutations that return void emit { ok, id, action }"

requirements-completed: [CLI-01]

coverage:
  - id: D1
    description: build --corpus [--full] adapter; no --llm flag
    requirement: CLI-01
    verification:
      - kind: unit
        ref: tests/cli-commands.test.ts#build --corpus writes JSON via library adapter
        status: pass
    human_judgment: false
  - id: D2
    description: query/path/status/diff/repair thin adapters over library
    requirement: CLI-01
    verification:
      - kind: unit
        ref: tests/cli-commands.test.ts#cli-commands core ops
        status: pass
    human_judgment: false
  - id: D3
    description: nested snapshot save|list|restore and review list|accept|reject
    requirement: CLI-01
    verification:
      - kind: unit
        ref: tests/cli-commands.test.ts#cli-commands nested snapshot/review/ontology
        status: pass
    human_judgment: false
  - id: D4
    description: ontology show|validate + pack/answer unregistered exit 1
    requirement: CLI-01
    verification:
      - kind: unit
        ref: tests/cli-commands.test.ts#pack and answer are unregistered
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-03
status: complete
---

# Phase 4 Plan 02: CLI command surface Summary

**Full Phase 4 `gsd-graph` command surface as thin commander adapters over existing library exports — pack/answer deferred.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-08-03T14:03:09Z
- **Completed:** 2026-08-03T14:06:11Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Wired `build`, `query`, `path`, `status`, `diff`, `repair` as thin library adapters with K22 JSON stdout
- Nested `snapshot save|list|restore`, `review list|accept|reject`, `ontology show|validate` without executable-form pitfalls
- `review` always resolves `storeRoot` via `resolveStoreRoot` before queue ops (RESEARCH pitfall 4)
- Confirmed `pack` / `answer` unregistered → exit 1 usage (D-02)
- 194 tests green including `tests/cli-commands.test.ts`; `npm run build` passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire build, query, path, status, diff, repair** - `82151a8` (test RED) + `9d55365` (feat GREEN)
2. **Task 2: Wire nested snapshot, review, ontology; pack/answer unregistered** - `62a2a55` (feat)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `src/cli.ts` — full Phase 4 command registration + helpers (`withDir`, `globalDir`, `parseIntOpt`)
- `tests/cli-commands.test.ts` — per-command smoke via `main(argv)` + fixture corpus store

## Decisions Made

- **path verb:** top-level commander command maps to `query({ path: { from, to, maxDepth: depth } })` per D-06 — no new library API
- **review list shape:** pending-filtered items plus `decisions_count` / `pending_count` (RESEARCH A3 discretion)
- **ontology show:** counts for `node_types` / `predicates` plus `packHash` so stdout is always `JSON.stringify`-safe
- **accept/reject response:** library returns void → CLI emits `{ ok: true, id, action }`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Diff test assumed NO_BASELINE after build**
- **Found during:** Task 1 GREEN verification
- **Issue:** Successful `build()` writes `snapshots/.last-diff-base.json`, so bare `diff` exits 0 with empty delta — not exit 2
- **Fix:** Assert successful last-diff-base diff; prove exit 2 via missing `--snapshot` name instead
- **Files modified:** `tests/cli-commands.test.ts`
- **Commit:** `9d55365`

## Auth Gates

None.

## Known Stubs

None. All Phase 4 commands are fully wired as library adapters; pack/answer intentionally absent until Phase 5.

## Threat Flags

None beyond plan `<threat_model>` (paths/names pass through library sanitize/confine; `--extend-ontology` only when explicit; no new deps).

## Self-Check: PASSED

- FOUND: `src/cli.ts`
- FOUND: `tests/cli-commands.test.ts`
- FOUND: commit `82151a8`
- FOUND: commit `9d55365`
- FOUND: commit `62a2a55`
- `npm test` → 194 pass / 0 fail
- `npm run build` → pass
- Registered: init, build, query, path, status, diff, repair, snapshot, review, ontology
- Unregistered: pack, answer → exit 1
