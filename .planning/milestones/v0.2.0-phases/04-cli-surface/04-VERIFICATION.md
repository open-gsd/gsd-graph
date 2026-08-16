---
phase: 04-cli-surface
verified: 2026-08-03T14:13:54Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "CLI-01 full surface includes pack and answer commands"
    addressed_in: "Phase 5"
    evidence: "ROADMAP Phase 4 SC1: 'pack/answer land in Phase 5'; Phase 5 SC1: 'CLI pack/answer are available'"
---

# Phase 4: CLI surface Verification Report

**Phase Goal:** Agents and operators can drive the full library surface through a stable `gsd-graph` JSON contract  
**Verified:** 2026-08-03T14:13:54Z  
**Status:** passed  
**Re-verification:** No — initial verification  

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | After install, `gsd-graph` is on PATH via package `bin` and exposes init, build, query, path, status, diff, snapshot, review, repair, ontology (pack/answer → Phase 5) | ✓ VERIFIED | `package.json` `bin.gsd-graph` → `./bin/gsd-graph.js`; `files` includes `bin`; `src/cli.ts` registers all Phase 4 verbs; pack/answer intentionally unregistered (line 340). Tests: `package identity bin`, `cli-commands`, `cli exit matrix`. Live spawn: `pack` → exit 1 `reason:usage`. |
| 2 | Successful commands emit JSON on stdout; diagnostics/errors on stderr; exits use 0/1/2/3 (K22) | ✓ VERIFIED | `writeOk` → stdout JSON; `writeErrorJson` → stderr `{ok:false,reason,message}`; `mapCliError`: `build_locked`→3, other `GraphError`→2, usage/`CommanderError`→1. Live: init/build/query/path exit 0 JSON; pack→1; diff no baseline→2 `no_baseline`; planted lock→3 `build_locked`. Tests: `init CLI main`, `cli exit matrix` all pass. |
| 3 | `init` creates store layout and appends store dir to `.gitignore` when a gitignore exists (never creates one); idempotent | ✓ VERIFIED | `src/pipeline/init.ts`: `ensureStoreRoot`, `config.json`, `snapshots/`, `appendGitignoreIfNeeded` (exists check, no create, dedupe). Live cwd=tmp: `.gsd-graph/` + `config.json` + `snapshots/`; `.gitignore` gains `.gsd-graph/` once. Tests: `init library (CLI-03)` 6/6 pass. |
| 4 | Happy path init → build → query → path returns structured JSON without a TTY | ✓ VERIFIED | `tests/cli.test.ts` spawnSync `process.execPath` + bin, `NO_COLOR=1`, cwd=tmpdir: init→build→query→path exit 0, `JSON.parse(stdout)` each step. Live re-run same path: exit 0, non-empty node/triple counts and path nodes. |
| 5 | `bin/gsd-graph.js` has node shebang and always invokes `main(process.argv)` from `dist/cli.js` (PKG-03) | ✓ VERIFIED | File content: `#!/usr/bin/env node` + `const { main } = require('../dist/cli.js'); process.exitCode = main(process.argv);` — does not rely on `require.main` alone. package-identity bin tests + process spawn gate pass. |
| 6 | Nested verbs: snapshot save\|list\|restore; review list\|accept\|reject; ontology show\|validate | ✓ VERIFIED | `src/cli.ts` parent `.command('snapshot'|'review'|'ontology')` with nested children. Tests: snapshot save/list/restore, review list + accept/reject unknown id→2, ontology show/validate — all pass. |
| 7 | Each registered command is a thin adapter over library exports; build offline-only (no `--llm`) | ✓ VERIFIED | Imports only library ops (`build`, `query`, `status`, `diff`, `repair`, `snapshot*`, `reviewResolve`, `loadOntologyPack`, `init`). `build` has `--corpus` + `--full` only; `rg llm src/cli.ts` empty. path → `query({ path: { from, to, maxDepth } })`; review accept/reject → `resolveStoreRoot` then `reviewResolve`. |
| 8 | Usage / unknown command (including pack and answer) exits 1 with stderr JSON | ✓ VERIFIED | Commander `exitOverride` + catch → `reason:usage` exit 1. Tests: unknown/pack/answer exit 1; build without `--corpus` exit 1. Live: pack stderr `{"ok":false,"reason":"usage",...}`. |
| 9 | Operational `GraphError` exits 2; `build_locked` exits 3 with stderr D-04 shape | ✓ VERIFIED | Live: `diff` on init-only store → exit 2 `no_baseline`; lock file → exit 3 `build_locked`. Tests: `cli exit matrix` operational + lock cases; `mapCliError` unit mapping. |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | CLI-01 full surface includes `pack` and `answer` | Phase 5 | ROADMAP Phase 4 SC1 defers pack/answer; Phase 5 SC1: “CLI pack/answer are available” |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `bin/gsd-graph.js` | npm bin shebang wrapper → `dist/cli.js` `main(process.argv)` | ✓ VERIFIED | 6 lines; shebang + explicit main call; wired by package.json bin |
| `src/cli.ts` | commander program, `main(argv)→exitCode`, K22 I/O, full Phase 4 surface | ✓ VERIFIED | 383 lines; all commands + mapCliError + writeOk/writeErrorJson; exported `main` |
| `src/pipeline/init.ts` | library `init()` store layout + gitignore append | ✓ VERIFIED | 144 lines; create layout, append-only gitignore, idempotent |
| `src/index.ts` | exports `init` | ✓ VERIFIED | `export { init } from './pipeline/init';` |
| `package.json` | `bin`, `files`, commander^14, picocolors | ✓ VERIFIED | bin + files include bin; commander `^14.0.3`; picocolors `^1.1.1` |
| `dist/cli.js` | build output of cli | ✓ VERIFIED | Present after `npm run build` (exit 0) |
| `tests/init.test.ts` | CLI-03 + K22 init path | ✓ VERIFIED | 294 lines; library + main exit mapping — all pass |
| `tests/cli-commands.test.ts` | Per-command registration + thin mapping | ✓ VERIFIED | 353 lines; core + nested + pack/answer absent — all pass |
| `tests/cli.test.ts` | Process-level E2E happy path + exit matrix | ✓ VERIFIED | 302 lines; spawnSync happy path + exits 1/2/3 — all pass |
| `tests/package-identity.test.ts` | bin field + shebang + commander pin + spawn | ✓ VERIFIED | bin describe block 4/4 pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `bin/gsd-graph.js` | `dist/cli.js` `main` | `require` + `main(process.argv)` | ✓ WIRED | Exact call; process.exitCode assigned |
| cli `init` action | `init()` | thin adapter `--dir`/`--ontology` | ✓ WIRED | `src/cli.ts` L92–110 |
| `main` catch | `GraphError` / `CommanderError` | exit 3 iff `build_locked` else 2; usage→1 | ✓ WIRED | `mapCliError` + catch block L349–377 |
| `build` action | `build()` | `{ corpus, full?, dir? }` | ✓ WIRED | L114–130 |
| `path` action | `query()` | `path: { from, to, maxDepth }` | ✓ WIRED | L158–178 |
| `review` accept/reject | `reviewResolve()` | `storeRoot = resolveStoreRoot` first | ✓ WIRED | L265–299 |
| snapshot/review/ontology parents | nested commander commands | `.command(...)` without executable string | ✓ WIRED | L213–337 |
| spawnSync tests | `bin/gsd-graph.js` | `process.execPath` + bin path | ✓ WIRED | `tests/cli.test.ts` |
| happy path build | `tests/fixtures/corpus` | multi-hop / corpus root | ✓ WIRED | fixture used in cli.test + live check |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| CLI `build` stdout | build result | library `build()` → graph pipeline | Yes — live `node_count:27`, `triple_count:15` | ✓ FLOWING |
| CLI `query`/`path` stdout | query result | library `query()` → `loadGraphV1` | Yes — Drought→Crop Failure→Food Shortage nodes | ✓ FLOWING |
| CLI `init` stdout | `InitResult` | `init()` mkdir/config/gitignore | Yes — real `store_dir`, flags | ✓ FLOWING |
| CLI error stderr | `CliErrorBody` | caught `GraphError`/`CommanderError` | Yes — live reason codes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite | `npm test` | 200 pass / 0 fail | ✓ PASS |
| Build | `npm run build` | tsc exit 0 | ✓ PASS |
| Live happy path | `node bin/gsd-graph.js` init→build→query→path (cwd=tmp) | exit 0 JSON each step | ✓ PASS |
| Live exit 1 | `node bin … pack` | exit 1, stderr usage JSON | ✓ PASS |
| Live exit 2 | `diff` on empty store | exit 2, `no_baseline` | ✓ PASS |
| Live exit 3 | plant `.build.lock` then `build` | exit 3, `build_locked` | ✓ PASS |
| Live gitignore | init with existing `.gitignore` | appends `.gsd-graph/` once | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No phase-declared `scripts/**/probe-*.sh` | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PKG-03 | 04-01, 04-03 | CLI binary `gsd-graph` published and invokable after install | ✓ SATISFIED | package bin + files + shebang wrapper + spawn process gate |
| CLI-01 | 04-02, 04-03 | Commands: init…ontology (+ pack/answer) | ✓ SATISFIED (Phase 4 subset) | All Phase 4 verbs wired; pack/answer deferred to Phase 5 per ROADMAP SC1 (see deferred) |
| CLI-02 | 04-01, 04-03 | JSON stdout; diagnostics stderr; exit 0/1/2/3 | ✓ SATISFIED | K22 helpers + exit matrix tests + live confirmation |
| CLI-03 | 04-01 | `init` appends store dir to `.gitignore` when present | ✓ SATISFIED | library + CLI tests + live cwd=tmp |

No orphaned Phase 4 requirements outside plan `requirements:` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in phase-modified sources | — | Clean |

Notes (non-blocking):
- Commander help/out streams intentionally suppressed so K22 owns stdout/stderr — by design (D-03/D-04).
- `if (require.main === module)` in `src/cli.ts` is debug-only; published bin always calls `main` explicitly.

### Human Verification Required

None. Phase 4 VALIDATION.md lists all behaviors as automated; optional post-install PATH UX is non-blocking and out of scope for this verdict.

### Gaps Summary

No gaps. All four ROADMAP success criteria hold in the codebase with behavioral proof (`npm test` 200/200, `npm run build` clean, live bin spot-checks for exits 0/1/2/3 and happy path).

`pack`/`answer` absence is intentional Phase 4 scope (ROADMAP SC1 / CONTEXT D-02) and is covered by Phase 5 — recorded under deferred, not as a failure.

---

_Verified: 2026-08-03T14:13:54Z_  
_Verifier: Claude (gsd-verifier)_
