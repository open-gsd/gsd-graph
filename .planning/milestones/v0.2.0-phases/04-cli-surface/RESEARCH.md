# Phase 4: CLI surface - Research

**Researched:** 2026-08-03  
**Domain:** Node.js CLI adapter (commander) over existing `@opengsd/gsd-graph` library  
**Confidence:** HIGH

## Summary

Phase 4 ships the `gsd-graph` binary as a **thin argv → library adapter** with the K22 machine contract: JSON on stdout, diagnostics/errors on stderr, exit codes `0|1|2|3`. The library already exposes `build`, `query`, `status`, `diff`, `repair`, snapshot ops, `reviewResolve`, and ontology load. Gaps to close in this phase: **`init` (library + CLI)**, a thin **`reviewList` (or CLI wrap of `loadReviewQueue`)**, **`src/cli.ts` → `dist/cli.js`**, **`bin/gsd-graph.js` shebang wrapper**, and **`package.json` `bin` + `files`**.

Stack is locked: **commander `^14.0.3`** (not 15.x — engines `>=22.12.0` would tighten package engines) and optional **picocolors `^1.1.1`** for stderr-only TTY color. Nested commander subcommands match DESIGN (`snapshot save|list|restore`, `review list|accept|reject`, `ontology show|validate`). **Do not implement pack/answer** — leave unregistered so unknown command → exit 1.

**Primary recommendation:** Implement `src/cli.ts` as a pure adapter (`main(argv) → exitCode`) with nested commander layout, map `GraphError.reason === 'build_locked'` → exit 3 and all other `GraphError` → exit 2 with structured stderr JSON, implement library `init()` that creates the store layout and appends gitignore (CLI-03/K26), and prove the happy path with `node:test` + `spawnSync` (or direct `main` invocation).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Publish `bin` entry `gsd-graph` → `bin/gsd-graph.js` (shebang wrapper) on npm (PKG-03)
- **D-02** Phase 4 commands: `init`, `build`, `query`, `path`, `status`, `diff`, `snapshot`, `review`, `repair`, `ontology` — **pack/answer deferred to Phase 5** (CLI-01 subset per ROADMAP success criteria; DESIGN PR-10)
- **D-03** Machine contract K22: JSON on stdout; diagnostics/errors on stderr; exit `0` ok, `1` usage, `2` operational (reason code), `3` locked (CLI-02)
- **D-04** Structured error shape on stderr/failure: `{ "ok": false, "reason": "<code>", "message": "..." }`
- **D-05** `init` creates store layout (`.gsd-graph/` or `--dir`) and appends store dir to `.gitignore` when a `.gitignore` exists (CLI-03, K26)
- **D-06** CLI is a thin adapter over existing library exports — no reimplementation of pipeline logic
- **D-07** Global flags: `--dir` / store root override; corpus path for build as DESIGN
- **D-08** No LLM flags required in Phase 4 (LLM is Phase 6); build offline only
- **D-09** commander for argv parsing (STACK); optional picocolors on stderr only when TTY
- **D-10** Copyright headers on all new source files
- **D-11** Tests via `node:test` spawning CLI process or invoking cli main with argv (no TTY required)
- **D-12** Happy path: `init` → `build --corpus …` → `query` → `path` returns structured JSON exit 0

### Claude's Discretion
- Exact commander subcommand layout (nested `snapshot save` vs `snapshot-save`)
- Whether CLI lives in `src/cli.ts` compiled to `dist/cli.js` with `bin/gsd-graph.js` requiring dist
- Progress/verbose flags (must not corrupt stdout JSON)
- How pack/answer stubs behave if invoked early (prefer unknown command exit 1, or explicit “not in this version” exit 1 with reason)

### Deferred Ideas (OUT OF SCOPE for Phase 4)
- `pack` / `answer` full implementation — Phase 5
- MCP server — Phase 6
- LLM `--llm` providers — Phase 6
- Communities — Phase 7
- NL→IR
- export cypher/jsonl
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-03 | CLI binary `gsd-graph` is published and invokable after install | `package.json` `bin` + `files` includes `bin/`; shebang wrapper → `dist/cli.js` |
| CLI-01 | Commands: init, build, query, path, status, diff, snapshot, review, repair, ontology (pack/answer Phase 5) | Nested commander layout; argv → existing library map below |
| CLI-02 | Machine contract: JSON stdout; diagnostics stderr; exit 0/1/2/3 | K22 exit map: usage→1, GraphError→2, `build_locked`→3; error JSON shape D-04 |
| CLI-03 | `init` appends store dir to `.gitignore` when a gitignore exists | Init gitignore algorithm (K26); create store layout via `ensureStoreRoot` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Argv parsing / help / usage exit 1 | CLI process | — | commander owns UX + usage errors |
| Exit code + stderr error JSON (K22) | CLI process | — | Adapter maps `GraphError` / CommanderError → process exit |
| Store path resolve / confinement | Library (`io/paths`) | CLI `--dir` | STORE-01/05 already implemented; CLI only passes `dir` |
| `init` store layout + gitignore | Library (`init`) | CLI thin call | D-06: logic in library so tests/MCP can reuse |
| `build` / `query` / lifecycle | Library (`pipeline/*`) | CLI | Already shipped Phases 2–3 |
| Review accept/reject | Library (`reviewResolve`) | CLI | Privileged write under lock; CLI maps flags |
| Ontology show/validate | Library (`loadOntologyPack`) | CLI | Load + Ajv already fail-closed |
| pack/answer | — (Phase 5) | — | Unregistered in Phase 4 |
| MCP | — (Phase 6) | — | Out of scope |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | `14.0.3` (`^14.0.3`) | Argv / subcommands / help | STACK + D-09; engines `node: '>=20'` fit package `>=22.0.0`. **Do not install commander 15** (engines `>=22.12.0`). [VERIFIED: npm registry `npm view commander@14.0.3`] |
| Node.js | `>=22.0.0` | Runtime | package.json engines [VERIFIED: package.json:24-26] |
| TypeScript / `tsc` | existing `^6.0.3` | Emit CJS `dist/cli.js` | Existing build; no bundler [VERIFIED: package.json] |
| `node:test` + `node:assert/strict` | built-in | CLI tests | D-11; org standard [VERIFIED: package.json scripts + STACK] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `picocolors` | `1.1.1` (`^1.1.1`) | Color human diagnostics | Optional; **only** when `process.stderr.isTTY` — never color stdout JSON [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander 14 | commander 15 | 15 forces engines `>=22.12.0`; package is `>=22.0.0` — reject for 0.1 |
| commander | hand-rolled argv | Forbidden by D-09; worse help/nesting |
| commander | yargs / cac | Not STACK; extra surface for agents |
| spawn process tests | only unit `main(argv)` | Prefer both: unit for mapping, spawn for bin shebang/PKG-03 |

**Installation:**

```bash
npm install commander@^14.0.3 picocolors@^1.1.1
```

**Version verification (this session):**

| Package | `npm view` version | engines | postinstall | Legitimacy |
|---------|-------------------|---------|-------------|------------|
| commander@14.0.3 | 14.0.3 | `node: '>=20'` | none | OK |
| commander (latest) | 15.0.0 | `node: '>=22.12.0'` | — | **Do not use** |
| picocolors | 1.1.1 | — | none | OK |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| commander | npm | since 2011 (14.0.3 modified 2026-05-29) | ~476M/wk | github.com/tj/commander.js | OK | Approved — pin `^14.0.3` |
| picocolors | npm | modified 2024-10-16 | ~219M/wk | github.com/alexeyraspopov/picocolors | OK | Approved — pin `^1.1.1` |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
                    argv / npm bin
                          │
                          ▼
              ┌───────────────────────┐
              │  bin/gsd-graph.js     │  #!/usr/bin/env node
              │  require dist/cli.js  │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  dist/cli.js (CJS)    │
              │  commander program    │
              │  main(argv)→exitCode  │
              └───────────┬───────────┘
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
   resolve global     map command      catch errors
   --dir / env        → library fn     GraphError /
                                       CommanderError
          │               │                │
          ▼               ▼                ▼
   resolveStoreRoot   build/query/…    stderr JSON
   ensureStoreRoot    init/status/…    exit 0/1/2/3
          │               │            stdout JSON (ok)
          └───────┬───────┘
                  ▼
         existing library
         (Phases 1–3 APIs)
                  │
                  ▼
            .gsd-graph/ store
```

### Recommended Project Structure

```text
bin/
└── gsd-graph.js          # shebang wrapper → ../dist/cli.js (CJS require)
src/
├── cli.ts                # commander program + main(argv); K22 I/O
├── pipeline/
│   └── init.ts           # NEW: init() store layout + gitignore (CLI-03)
├── index.ts              # export init (+ optional reviewList)
└── …existing…
tests/
├── cli.test.ts           # spawnSync bin and/or main(argv) — exit codes, JSON
└── init.test.ts          # layout + gitignore append idempotency
```

**package.json deltas (required for PKG-03):**

```json
{
  "bin": {
    "gsd-graph": "./bin/gsd-graph.js"
  },
  "files": ["dist", "bin", "schemas", "ontology-packs", "LICENSE", "README.md"]
}
```

Note: current `files` omits `bin` [VERIFIED: package.json:17-22]. Current package has **no** `bin` field [VERIFIED: package.json].

### Pattern 1: Thin bin wrapper → dist/cli.js

**What:** Published bin is a tiny shebang script that requires compiled CLI.  
**When to use:** Always for CJS packages (DESIGN layout + STACK).  
**Example:**

```js
#!/usr/bin/env node
// gsd-graph — npm bin entry (PKG-03)
'use strict';
require('../dist/cli.js');
```

[CITED: docs/DESIGN.md layout `bin/gsd-graph.js`; open-gsd bin pattern]

**Recommendation (discretion):** Put CLI logic in `src/cli.ts` compiled to `dist/cli.js`; bin only requires it. Export `main(argv: string[]): number` for unit tests without spawn.

### Pattern 2: Nested commander subcommands

**What:** `snapshot save|list|restore`, `review list|accept|reject`, `ontology show|validate` as nested commands.  
**When to use:** Matches DESIGN CLI synopsis; first-class in commander 14.  
**Example:**

```js
// Source: commander.js v14.0.3 examples/nestedCommands.js
const { Command } = require('commander');
const program = new Command();
const snapshot = program.command('snapshot');
snapshot.command('save').argument('<name>').action((name, opts) => { /* … */ });
snapshot.command('list').action(() => { /* … */ });
snapshot.command('restore').argument('<name>').action((name) => { /* … */ });
```

[VERIFIED: github.com/tj/commander.js v14.0.3 nestedCommands example]

**Recommendation (discretion):** Prefer nested (`snapshot save`) over flat (`snapshot-save`) — matches DESIGN lines 743–747.

### Pattern 3: exitOverride + GraphError mapping

**What:** Use `program.exitOverride()` so usage errors are catchable; map library errors to K22 exits.  
**When to use:** Always for testable CLI and structured stderr.  
**Example:**

```ts
// Source pattern: commander Readme "Override exit and output handling"
program.exitOverride();
try {
  program.parse(argv);
  return 0;
} catch (err) {
  if (err instanceof GraphError) {
    writeErrorJson({ ok: false, reason: err.reason, message: err.message });
    return err.reason === GSD_GRAPH_REASON.BUILD_LOCKED ? 3 : 2;
  }
  // CommanderError → usage exit 1
  return 1;
}
```

[CITED: https://github.com/tj/commander.js/blob/v14.0.3/Readme.md — exitOverride, program.error]

### Pattern 4: Success JSON on stdout only

```ts
function writeOk(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n');
}
function writeErrorJson(body: { ok: false; reason: string; message: string }): void {
  process.stderr.write(JSON.stringify(body) + '\n');
}
// Never write human progress to stdout. Optional --verbose → stderr only if isTTY.
```

[VERIFIED: docs/DESIGN.md Machine contract K22 — "stdout: JSON only"; "stderr: human diagnostics / progress when TTY"]

### Anti-Patterns to Avoid

- **Reimplementing query/build in CLI:** Violates D-06; bugs diverge from library tests.
- **Pretty-printing or logging on stdout:** Breaks agent JSON parse (K22).
- **Registering pack/answer stubs that call missing APIs:** Phase 5 only; unknown command is cleaner.
- **Using commander 15:** Engines mismatch with `>=22.0.0`.
- **Passing `dir` into `reviewResolve` without resolving store root:** API wants `storeRoot` absolute [VERIFIED: src/pipeline/review.ts:114-122].
- **Colorizing stdout:** picocolors only on stderr when TTY (D-09).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argv / help / nested commands | Custom parser | `commander` 14 | Nested, suggestions, exitOverride tested ecosystem-wide |
| Store path resolve | CLI-local path join | `resolveStoreRoot` / `ensureStoreRoot` | STORE-01/05 realpath confinement |
| Build / query / diff / snapshot | Duplicate pipeline | Existing exports from `src/index.ts` | Phase 2–3 already green |
| Ontology validate | Hand schema check | `loadOntologyPack` | Ajv + ONTOLOGY_INVALID |
| Lock contention | CLI sleep loops | Library `acquireBuildLock` (optional wait later) | BUILD_LOCKED → exit 3 |
| Review accept effects | CLI graph edits | `reviewResolve` | Lock + accept matrix |

**Key insight:** The CLI's only novel product logic is **`init` (+ gitignore)** and the **K22 I/O/exit adapter**. Everything else is mapping.

## Argv → Library Mapping

| CLI command | Library call | Notes |
|-------------|--------------|-------|
| `init [--dir] [--ontology]` | **`init({ dir?, ontology? })` NEW** | Create layout + config + gitignore |
| `build --corpus <path> [--full] [--dir]` | `build({ corpus, full?, dir? })` | Offline only (D-08); no `--llm` |
| `query <term> [--hops N] [--budget N] [--dir]` | `query({ term, hops?, budget?, dir? })` | seed_expand |
| `path <from> <to> [--depth N] [--dir]` | `query({ path: { from, to, maxDepth: depth }, dir? })` | DESIGN path command |
| `status [--dir]` | `status({ dir? })` | |
| `diff [--snapshot <name>] [--dir]` | `diff({ dir?, snapshot? })` | NO_BASELINE → exit 2 |
| `snapshot save <name> [--dir]` | `snapshotSave({ name, dir? })` | name sanitized in library |
| `snapshot list [--dir]` | `snapshotList({ dir? })` | |
| `snapshot restore <name> [--dir]` | `snapshotRestore({ name, dir? })` | |
| `review list [--dir]` | `loadReviewQueue(storeRoot)` or thin `reviewList({ dir? })` | Prefer filter pending for UX |
| `review accept <id> [--extend-ontology] [--dir]` | `reviewResolve({ storeRoot, id, action: 'accept', extendOntology? })` | Resolve dir → storeRoot first |
| `review reject <id> [--dir]` | `reviewResolve({ storeRoot, id, action: 'reject' })` | |
| `ontology show\|validate [--pack path]` | `loadOntologyPack({ packIdOrPath })` | validate = load success JSON |
| `repair [--dir]` | `repair({ dir? })` | |
| `pack` / `answer` | **not registered** | Commander unknown → exit 1 |

### Public APIs already exported (Phase 3 façade)

From `src/index.ts` [VERIFIED: src/index.ts]:  
`build`, `status`, `query`, `diff`, `repair`, `snapshotSave`, `snapshotList`, `snapshotRestore`, `reviewResolve`, `loadReviewQueue`, `loadOntologyPack`, `resolveStoreRoot`, `ensureStoreRoot`, `GraphError`, `GSD_GRAPH_REASON`, …

### Library gaps for Phase 4

| Gap | Action |
|-----|--------|
| `init` / `InitOptions` | DESIGN exports `init` but **not implemented** in `src/` [VERIFIED: only DESIGN.md:784 mentions `export function init`] |
| `reviewList` | DESIGN lists it; use `loadReviewQueue` or add thin helper returning `items` |
| CLI entry | No `src/cli.ts`, no `bin/` |

### Exit code mapping (normative for planner)

| Condition | Exit | stderr | stdout |
|-----------|------|--------|--------|
| Success | `0` | optional human diagnostics | JSON result |
| Usage / unknown command / missing required arg | `1` | commander message and/or `{ok:false,reason:"usage",message}` | empty or help |
| `GraphError` with `reason !== 'build_locked'` | `2` | `{ok:false,reason,message}` | empty |
| `GraphError` with `reason === 'build_locked'` | `3` | `{ok:false,reason:"build_locked",message}` | empty |

Reason codes already frozen [VERIFIED: src/errors.ts:8-20]:

```ts
// verbatim from src/errors.ts:8-20
export const GSD_GRAPH_REASON = Object.freeze({
  OK: 'ok',
  BUILD_LOCKED: 'build_locked',
  BUILD_FAILED: 'build_failed',
  SCHEMA_INVALID: 'schema_invalid',
  ONTOLOGY_INVALID: 'ontology_invalid',
  EMPTY_SUBGRAPH: 'empty_subgraph',
  PROMPT_RESULT_INVALID: 'prompt_result_invalid',
  CORPUS_NOT_FOUND: 'corpus_not_found',
  PATH_ESCAPE: 'path_escape',
  LIMIT_EXCEEDED: 'limit_exceeded',
  NO_BASELINE: 'no_baseline',
} as const);
```

Do **not** invent new reason codes in Phase 4 for pack/answer. Usage failures may use a CLI-local `reason: "usage"` string in the D-04 shape without adding to `GSD_GRAPH_REASON` [ASSUMED: acceptable for exit 1 only; confirm in plan if preferred to omit JSON on pure commander help errors].

### Init + gitignore algorithm (CLI-03 / K26)

Recommended library `init(opts: { dir?: string; ontology?: string; cwd?: string }): InitResult`:

1. `storeRoot = resolveStoreRoot({ dir: opts.dir, cwd })` then `ensureStoreRoot(storeRoot)`.
2. Write minimal `config.json` under store if missing (ontology pack id/path from `--ontology`, default `general`; `store.write_projection` can follow DESIGN defaults). Use confined path via `confineUnderRoot` / `storeFile` pattern for basenames.
3. Ensure optional empty layout pieces that make first `status` honest:
   - `snapshots/` directory (empty)
   - optional empty `review-queue.json` via `emptyReviewQueue()` **or** leave absent (loadReviewQueue already returns empty) [VERIFIED: src/pipeline/review.ts:40-54]
4. **Gitignore (only if `.gitignore` exists in project cwd):**
   - `gitignorePath = path.join(cwd, '.gitignore')`
   - If `!existsSync(gitignorePath)` → skip (do not create `.gitignore`)
   - Compute entry: relative store path from cwd with trailing `/` (default `.gsd-graph/`; if `--dir foo` → `foo/`)
   - Read file as utf8; treat as already present if any line trims to entry, entry without slash, or `**/entry` variants for the same basename — **minimum required:** exact line match for `.gsd-graph/` or chosen relative dir
   - If missing: append `\n` if file non-empty and does not end with `\n`, then append entry + `\n`
   - Idempotent: second `init` does not duplicate
5. Return JSON-serializable result e.g. `{ store_dir, created: true, gitignore_appended: boolean, ontology: "general" }` for stdout.

[VERIFIED: docs/DESIGN.md:734,1071 — init writes config; adds store dir to `.gitignore` if present; K26]

## Common Pitfalls

### Pitfall 1: Corrupting stdout JSON
**What goes wrong:** Progress bars, `console.log`, colors on stdout break agents.  
**Why:** Habit from human CLIs.  
**How to avoid:** Single `JSON.stringify` write to stdout on success; all human text → stderr.  
**Warning signs:** Tests that `JSON.parse(stdout)` fail intermittently.

### Pitfall 2: Exit 2 vs 3 confusion
**What goes wrong:** `build_locked` returns 2; agents cannot distinguish lock.  
**Why:** Treating all GraphError equally.  
**How to avoid:** Explicit check `err.reason === GSD_GRAPH_REASON.BUILD_LOCKED` → 3.  
**Warning signs:** Lock contention tests expect 3.

### Pitfall 3: Commander nested vs executable form
**What goes wrong:** `.command('snapshot', 'desc')` spawns external binary.  
**Why:** Second string arg means stand-alone executable subcommand.  
**How to avoid:** Use `.command('snapshot')` + nested `.command('save')` with `.action()`.  
**Warning signs:** CLI tries to exec `gsd-graph-snapshot`.

### Pitfall 4: reviewResolve storeRoot
**What goes wrong:** Pass `{ dir }` into `reviewResolve` — type expects `storeRoot`.  
**How to avoid:** `const storeRoot = resolveStoreRoot({ dir }); reviewResolve({ storeRoot, … })`.

### Pitfall 5: Gitignore false positives / duplicates
**What goes wrong:** Append every run; or create `.gitignore` when absent.  
**How to avoid:** Only append when file exists; line-level membership check; no create.

### Pitfall 6: Missing `bin` in npm `files`
**What goes wrong:** Local works; published tarball has no binary.  
**How to avoid:** Add `"bin"` to `package.json` **and** `"bin"` to `"files"`.

### Pitfall 7: Testing only with TTY assumptions
**What goes wrong:** Colors or isTTY branches untested.  
**How to avoid:** D-11 — spawn with pipes (no TTY); assert JSON still clean.

## Code Examples

### Bin wrapper (CJS)

```js
#!/usr/bin/env node
// gsd-graph — CLI bin entry
'use strict';
require('../dist/cli.js');
```

### CLI main skeleton

```ts
// gsd-graph — CLI entry (K22 machine contract)
import { Command } from 'commander';
import {
  GraphError,
  GSD_GRAPH_REASON,
  build,
  query,
  status,
  // …
} from './index';

export function main(argv: string[]): number {
  const program = new Command();
  program.name('gsd-graph').showSuggestionAfterError();
  program.option('--dir <path>', 'store directory override');
  program.exitOverride();

  program
    .command('query')
    .argument('<term>')
    .option('--hops <n>', 'hop count', (v) => parseInt(v, 10))
    .option('--budget <n>', 'token budget', (v) => parseInt(v, 10))
    .action((term, opts, cmd) => {
      const global = cmd.optsWithGlobals();
      const result = query({
        term,
        hops: opts.hops,
        budget: opts.budget,
        dir: global.dir,
      });
      process.stdout.write(JSON.stringify(result) + '\n');
    });

  // … other commands …

  try {
    program.parse(argv);
    return 0;
  } catch (err) {
    if (err instanceof GraphError) {
      process.stderr.write(
        JSON.stringify({
          ok: false,
          reason: err.reason,
          message: err.message,
        }) + '\n',
      );
      return err.reason === GSD_GRAPH_REASON.BUILD_LOCKED ? 3 : 2;
    }
    // CommanderError or usage
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}
```

### Spawn integration test (node:test)

```ts
// Pattern: open-gsd gsd-core bin tests + D-11
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const bin = path.join(__dirname, '..', 'bin', 'gsd-graph.js');

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('cli happy path', () => {
  it('init → build → query → path exit 0 with JSON stdout', () => {
    // use tmp cwd with fixtures corpus…
    const init = run(['init'], tmp);
    assert.equal(init.status, 0);
    JSON.parse(init.stdout);
    // …
  });
});
```

[CITED: open-gsd gsd-core tests using `spawnSync(process.execPath, [shim, …])`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled argv | commander 14 nested commands | STACK 2026-08-02 | Stable help + testability |
| commander 15 default npm tag | Stay on 14.x for engines | 15.0.0 engines bump | Pin ^14.0.3 |
| Human-first CLIs | K22 JSON-first agent contract | DESIGN K22 | stdout pure JSON |

**Deprecated/outdated:**
- Flat `snapshot-save` style — DESIGN uses nested verbs
- Implementing pack/answer in Phase 4 — deferred Phase 5

## Open Questions — RESOLVED

1. **commander vs manual argv?**  
   - **RESOLVED (D-09 locked):** Use commander 14. No hand-roll.

2. **Nested subcommands vs flat names?**  
   - **RESOLVED (recommendation):** Nested — `snapshot save|list|restore`, `review list|accept|reject`, `ontology show|validate` per DESIGN CLI synopsis and commander nested example.

3. **pack/answer handling in Phase 4?**  
   - **RESOLVED (recommendation):** Do **not** register `pack` or `answer`. Unknown command → commander usage path → **exit 1**. Avoid inventing `not_implemented` reason codes outside `GSD_GRAPH_REASON`. Phase 5 registers real commands.

4. **CLI file location?**  
   - **RESOLVED (recommendation):** `src/cli.ts` → `dist/cli.js`; `bin/gsd-graph.js` requires dist. Matches DESIGN layout + STACK.

5. **Progress/verbose?**  
   - **RESOLVED (recommendation):** Optional `--verbose` writes to **stderr only** when `stderr.isTTY`; default silent enough for agents. Never touch stdout except final JSON.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Usage errors may use `reason: "usage"` in D-04 JSON without adding to `GSD_GRAPH_REASON` | Exit mapping | Planner may prefer commander text-only stderr for exit 1 |
| A2 | `init` should write minimal `config.json` (ontology preference) not only mkdir | Init algorithm | User may want mkdir-only; still must gitignore |
| A3 | `review list` may return full queue document or pending-only filter | Mapping | UX difference only |
| A4 | Global `--dir` via commander + `optsWithGlobals()` is preferred over repeating per-command | Architecture | Equivalent if each command redeclares `--dir` |

**If wrong:** Confirm A1–A3 at plan time; none block research.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | CLI runtime | ✓ | v25.6.1 | — (engines ≥22) |
| npm | install deps | ✓ | 11.9.0 | — |
| commander | argv | ✗ (not in package.json yet) | install 14.0.3 | must add dependency |
| picocolors | stderr color | ✗ optional | install 1.1.1 | skip colors; no fallback needed |
| tsc build | dist/cli.js | ✓ | existing scripts | — |

**Missing dependencies with no fallback:**
- `commander` must be added to `dependencies` before CLI runs

**Missing dependencies with fallback:**
- `picocolors` — optional; gate on TTY and try/require

## Validation Architecture

> `workflow.nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `node:assert/strict` |
| Config file | `tsconfig.test.json` (emit `dist-test/`) |
| Quick run command | `node --test dist-test/cli.test.js dist-test/init.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-03 | `package.json` has `bin.gsd-graph`; bin file exists + shebang | unit | `node --test dist-test/package-identity.test.js` (extend) | ⚠️ extend existing |
| CLI-01 | Each Phase 4 command registered; pack/answer unknown exit 1 | integration | `node --test dist-test/cli.test.js` | ❌ Wave 0 |
| CLI-02 | exit 0 JSON; usage→1; GraphError→2; build_locked→3; stderr error shape | integration | `node --test dist-test/cli.test.js` | ❌ Wave 0 |
| CLI-03 | init creates store; appends gitignore iff exists; idempotent | unit/integration | `node --test dist-test/init.test.js` | ❌ Wave 0 |
| D-12 | Happy path init→build→query→path exit 0 | integration | `node --test dist-test/cli.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** targeted `node --test dist-test/cli.test.js dist-test/init.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/cli.test.ts` — covers CLI-01, CLI-02, D-12 (spawn or main)
- [ ] `tests/init.test.ts` — covers CLI-03 gitignore + layout
- [ ] Extend `tests/package-identity.test.ts` — assert `bin` field + files includes `bin`
- [ ] Framework install: `npm install commander@^14.0.3 picocolors@^1.1.1`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local CLI; no auth |
| V3 Session Management | no | — |
| V4 Access Control | no | Same OS user as shell |
| V5 Input Validation | yes | commander arg types; library path confinement / snapshot name sanitize |
| V6 Cryptography | no | No new crypto in CLI |

### Known Threat Patterns for Node CLI + file store

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `--dir` / corpus / snapshot name | Tampering | `resolveStoreRoot` + `confineUnderRoot` + `sanitizeSnapshotName` (existing) |
| stdout injection / log forging into agent parsers | Tampering | K22: only JSON on stdout; no interleaved logs |
| Lock DoS / concurrent writers | Denial of service | `.build.lock` + exit 3 on `build_locked` |
| Command injection via snapshot/ontology strings | Elevation | No shell exec of user strings; pure library calls |
| Secrets in corpus emitted to graph | Information disclosure | Existing extract redaction; CLI does not add network |

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` — CLI synopsis, K22, K26, library API, reason codes (read this session)
- `src/index.ts`, `src/errors.ts`, `src/types.ts`, `src/pipeline/*` — live public API (read this session)
- `.planning/research/STACK.md` — commander 14 + picocolors
- `.planning/phases/04-cli-surface/CONTEXT.md` — D-01..D-12
- `npm view commander@14.0.3` / `picocolors@1.1.1` + `gsd-tools package-legitimacy check` → OK
- commander.js v14.0.3 README + `examples/nestedCommands.js` (webfetch)

### Secondary (MEDIUM confidence)

- open-gsd bin wrappers (`gsd-pi` / `gsd-core`) for shebang + spawnSync test style
- Phase 3 SUMMARYs for API availability to CLI

### Tertiary (LOW confidence)

- Exact `config.json` fields written by `init` beyond ontology preference (DESIGN sample config is broader than CLI-03 minimum)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — npm view + legitimacy OK + STACK alignment
- Architecture: **HIGH** — DESIGN + existing library surface + commander nested docs
- Pitfalls: **HIGH** — K22/lock/gitignore issues are well-specified; implementation traps from codebase API shapes

**Research date:** 2026-08-03  
**Valid until:** 2026-09-02 (30 days; commander 14 line stable)
