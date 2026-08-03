# Phase 4: CLI surface — Context

**Phase:** 04  
**Goal:** Agents and operators can drive the library surface through a stable `gsd-graph` JSON contract  
**Requirements:** PKG-03, CLI-01, CLI-02, CLI-03  
**Depends on:** Phases 1–3 complete (library APIs for build, query, lifecycle, review, ontology)

## Decisions

Locked (non-negotiable):

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

## Claude's Discretion

- Exact commander subcommand layout (nested `snapshot save` vs `snapshot-save`)
- Whether CLI lives in `src/cli.ts` compiled to `dist/cli.js` with `bin/gsd-graph.js` requiring dist
- Progress/verbose flags (must not corrupt stdout JSON)
- How pack/answer stubs behave if invoked early (prefer unknown command exit 1, or explicit “not in this version” exit 1 with reason)

## Deferred Ideas (OUT OF SCOPE for Phase 4)

- `pack` / `answer` full implementation — Phase 5
- MCP server — Phase 6
- LLM `--llm` providers — Phase 6
- Communities — Phase 7
- NL→IR
- export cypher/jsonl

## Library surface to wrap

From `src/index.ts`: `build`, `status`, `query`, `diff`, `repair`, `snapshotSave/List/Restore`, `reviewResolve`, review list helpers, `loadOntologyPack`, `resolveStoreRoot`, `GraphError` / `GSD_GRAPH_REASON`, etc.

## Success criteria (from ROADMAP)

1. `gsd-graph` on PATH after install; core commands listed above  
2. JSON stdout; stderr diagnostics; exit 0/1/2/3  
3. `init` store layout + gitignore append  
4. Happy path init → build → query → path without TTY  

## Research fold-in

- DESIGN.md CLI + K22  
- STACK.md commander 14 + picocolors  
- Phase 1–3 SUMMARY APIs  
