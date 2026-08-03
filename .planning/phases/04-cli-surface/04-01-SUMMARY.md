---
phase: 04-cli-surface
plan: 01
subsystem: cli
tags: [cli, commander, init, k22, bin, gitignore, picocolors]

requires:
  - phase: 01-foundation
    provides: GraphError, GSD_GRAPH_REASON, resolveStoreRoot/ensureStoreRoot/storeFile
  - phase: 03-query-lifecycle
    provides: DEFAULT_WRITE_PROJECTION, snapshots layout conventions
provides:
  - Publishable bin entry gsd-graph → bin/gsd-graph.js (PKG-03)
  - CLI main(argv)→exitCode with K22 JSON stdout / structured stderr (CLI-02)
  - Library init() store layout + gitignore append (CLI-03)
  - mapCliError exit mapping 0/1/2/3 foundation for remaining commands
affects:
  - 04-02 (remaining command wiring)
  - 04-03 (happy-path / packaging polish)

actuals:
  tokens: 6300
  tasks: 3
  commits: 2

tech-stack:
  added: [commander@^14.0.3, picocolors@^1.1.1]
  patterns:
    - thin bin shebang → dist/cli.js main(process.argv)
    - library owns init/gitignore; CLI is thin adapter
    - mapCliError pure function for K22 exits

key-files:
  created:
    - bin/gsd-graph.js
    - src/cli.ts
    - src/pipeline/init.ts
    - tests/init.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/index.ts
    - src/types.ts
    - tests/package-identity.test.ts

key-decisions:
  - "created=true when store root was new OR config.json written this call"
  - "gitignore entry uses operator-facing dir (opts.dir / DEFAULT_STORE_DIR), not realpath, to avoid macOS /var→/private/var relative-path breakage"
  - "commander configureOutput silences human error streams; only K22 JSON is written"
  - "mapCliError exported for unit proof of exit 2/3 without test-only CLI hooks"
  - "commander pinned ^14.0.3 (not 15) for engines >=22.0.0 compatibility"

patterns-established:
  - "Bin contract: require dist/cli.js main and set process.exitCode = main(process.argv)"
  - "CLI actions call library only; no pipeline reimplementation (D-06)"
  - "Success: writeOk JSON on stdout; errors: {ok:false,reason,message} on stderr"

requirements-completed: [PKG-03, CLI-02, CLI-03]

coverage:
  - id: D1
    description: package.json publishes bin gsd-graph and files includes bin
    requirement: PKG-03
    verification:
      - kind: unit
        ref: tests/package-identity.test.ts#publishes bin gsd-graph
        status: pass
    human_judgment: false
  - id: D2
    description: bin/gsd-graph.js shebang invokes main(process.argv) from dist/cli.js
    requirement: PKG-03
    verification:
      - kind: unit
        ref: tests/package-identity.test.ts#bin/gsd-graph.js has node shebang
        status: pass
      - kind: integration
        ref: node bin/gsd-graph.js init --dir /tmp/...
        status: pass
    human_judgment: false
  - id: D3
    description: init creates store layout and appends gitignore when present; idempotent
    requirement: CLI-03
    verification:
      - kind: unit
        ref: tests/init.test.ts#init library
        status: pass
    human_judgment: false
  - id: D4
    description: main returns 0 with JSON stdout; usage→1; GraphError→2; build_locked→3
    requirement: CLI-02
    verification:
      - kind: unit
        ref: tests/init.test.ts#init CLI main
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-08-03
status: complete
---

# Phase 4 Plan 01: CLI bin + init Summary

**Publishable `gsd-graph` bin with commander adapter, K22 exit mapping, and library `init()` for store layout + gitignore append.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-08-03T13:53:34Z
- **Completed:** 2026-08-03T14:00:30Z
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- Shipped `bin/gsd-graph.js` → `dist/cli.js` `main(process.argv)` contract (PKG-03, D-01)
- Implemented library `init()` creating store root, `config.json`, `snapshots/`, and append-only `.gitignore` (CLI-03, D-05)
- CLI adapter with JSON-only stdout, structured stderr errors, and exits 0/1/2/3 via `mapCliError` (CLI-02, D-03, D-04)
- Pinned commander `^14.0.3` + optional picocolors; package identity gates reject commander 15
- 180 tests green including init + package-identity bin gates; `npm run build` passes

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end init via bin — deps, package bin, CLI skeleton, library init** - `e70b708` (feat)
2. **Task 2: Init edge cases — custom --dir, idempotent gitignore, package bin gates** - `34654e1` (test) + edge cases already in Task 1 `tests/init.test.ts`
3. **Task 3: K22 exit mapper unit coverage for GraphError and usage** - covered in `e70b708` (`mapCliError` + main catch path via live-patched init)

**Plan metadata:** (pending final docs commit)

_Note: Tasks 1–3 were implemented as one vertical slice; Task 3 K22 proofs live in the Task 1 test file rather than a separate commit._

## Files Created/Modified

- `bin/gsd-graph.js` — npm bin shebang wrapper calling `main(process.argv)`
- `src/cli.ts` — commander program, `main()`, `mapCliError`, K22 I/O helpers; only `init` registered
- `src/pipeline/init.ts` — library init store layout + gitignore append
- `src/types.ts` — `InitOptions` / `InitResult`
- `src/index.ts` — export `init` + types
- `package.json` / `package-lock.json` — bin, files, commander, picocolors
- `tests/init.test.ts` — CLI-03 layout/gitignore + K22 exit mapping
- `tests/package-identity.test.ts` — PKG-03 bin + commander 14 pin

## Decisions Made

- **`created` semantics:** true when store root did not exist before this call **or** `config.json` was written this call (documented for SUMMARY)
- **Gitignore entry source:** use operator-facing `opts.dir` / `DEFAULT_STORE_DIR` (not realpath of store) so macOS `/var` → `/private/var` does not produce broken relative entries
- **Commander output:** `configureOutput({ writeOut, writeErr })` no-ops so only K22 JSON leaves the process
- **Exit 2/3 proof:** export `mapCliError` and live-patch `init` export to throw `GraphError` through `main` catch (no test-only CLI command)
- **Remaining commands not wired** — skeleton only per plan (04-02 owns the rest)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gitignore relative path broken under macOS realpath**
- **Found during:** Task 1 verification
- **Issue:** `path.relative(cwd, realpath(storeRoot))` produced wrong entry when cwd was `/var/...` and store was `/private/var/...`; pre-seeded `.gsd-graph/` was not recognized as present
- **Fix:** compute gitignore entry from operator-facing dir string (`opts.dir` / `DEFAULT_STORE_DIR`)
- **Files modified:** `src/pipeline/init.ts`
- **Commit:** `e70b708`

**2. [Rule 2 - Missing critical functionality] Commander polluted stderr with human errors**
- **Found during:** Task 1 verification (usage JSON parse failed on `error: unknown option...`)
- **Issue:** default commander `writeErr` emitted non-JSON before `CommanderError` throw
- **Fix:** silence commander streams via `configureOutput`; only `writeErrorJson` emits stderr
- **Files modified:** `src/cli.ts`
- **Commit:** `e70b708`

## Auth Gates

None.

## Known Stubs

None. Init path is fully wired; remaining CLI commands intentionally unregistered until 04-02.

## Threat Flags

None beyond plan `<threat_model>` (argv → paths mitigated via `resolveStoreRoot`/`ensureStoreRoot`/`storeFile`; stdout JSON-only; gitignore append-only).

## Self-Check: PASSED

- FOUND: `bin/gsd-graph.js`
- FOUND: `src/cli.ts`
- FOUND: `src/pipeline/init.ts`
- FOUND: `tests/init.test.ts`
- FOUND: commit `e70b708`
- FOUND: commit `34654e1`
- `npm test` → 180 pass / 0 fail
- `node bin/gsd-graph.js init --dir /tmp/...` → exit 0 JSON + store layout
