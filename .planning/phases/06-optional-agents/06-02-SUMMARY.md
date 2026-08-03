---
phase: 06-optional-agents
plan: 02
subsystem: mcp
tags: [mcp, stdio, modelcontextprotocol, zod, tools, default-off-writes, offline]

requires:
  - phase: 05-grounded-answer
    provides: packSubgraph + answer + query public APIs
  - phase: 06-optional-agents
    provides: Phase 6 CONTEXT/RESEARCH MCP tool matrix (D-06/D-07)
provides:
  - Optional MCP stdio server bin/gsd-graph-mcp.js
  - createGsdGraphMcpServer / listToolNames / handleToolCall (stdio-free test surface)
  - Default read tools graph_status|query|pack|answer|review_list
  - Privileged graph_build / graph_review_resolve gated by allow flags
  - @modelcontextprotocol/sdk ^1.30.0 + zod as normal dependencies
affects: [agent-hosts, Claude/Cursor MCP config, 06-03-report]

actuals:
  tokens: 22000
  tasks: 3
  commits: 2

tech-stack:
  added:
    - "@modelcontextprotocol/sdk@^1.30.0"
    - "zod@^4.4.3"
  patterns:
    - "Dynamic import of MCP SDK subpaths for CJS emit (RESEARCH Pattern 4)"
    - "listToolNames / handleToolCall without stdio connect (D-12 offline)"
    - "Write tools not registered unless allowBuild / allowReviewWrite (D-06, T-06-07)"
    - "Handlers map only to public library APIs; graph.v1 SoT (D-10)"
    - "No stdout from tool handlers; stderr for process diagnostics (T-06-10)"

key-files:
  created:
    - src/mcp/server.ts
    - src/mcp/tools.ts
    - bin/gsd-graph-mcp.js
    - tests/mcp-tools.test.ts
  modified:
    - package.json
    - package-lock.json
    - tests/package-identity.test.ts

key-decisions:
  - "MCP SDK + zod are normal dependencies (not optionalDependencies) per D-07 / RESEARCH"
  - "Tool names use DESIGN graph_* prefix"
  - "Full default read matrix registered in server create; write tools only when gated"
  - "CLI flags: --allow-build, --allow-review-write, --dir for MCP bin"

patterns-established:
  - "Pattern: createGsdGraphMcpServer returns {server, toolNames} without connect"
  - "Pattern: handleToolCall(name, args, gate) for offline unit tests"
  - "Pattern: parseMcpArgv for privileged gates without stdout"

requirements-completed: [MCP-01]

coverage:
  - id: D1
    description: "Default MCP tool list is exactly the five read tools; excludes build and review-write"
    requirement: MCP-01
    verification:
      - kind: unit
        ref: "tests/mcp-tools.test.ts#default tool list is exactly the five read tools (D-06)"
        status: pass
      - kind: unit
        ref: "tests/mcp-tools.test.ts#default tool names include graph_status and exclude graph_build"
        status: pass
    human_judgment: false
  - id: D2
    description: "allowBuild / allowReviewWrite register privileged write tools only when true"
    requirement: MCP-01
    verification:
      - kind: unit
        ref: "tests/mcp-tools.test.ts#allowBuild registers graph_build; allowReviewWrite registers graph_review_resolve"
        status: pass
      - kind: unit
        ref: "tests/mcp-tools.test.ts#graph_build / graph_review_resolve handlers refuse when gates off"
        status: pass
    human_judgment: false
  - id: D3
    description: "bin gsd-graph-mcp published with shebang; SDK 1.x + zod deps pinned"
    requirement: MCP-01
    verification:
      - kind: unit
        ref: "tests/package-identity.test.ts#publishes bin gsd-graph-mcp"
        status: pass
      - kind: unit
        ref: "tests/package-identity.test.ts#dependencies pin @modelcontextprotocol/sdk 1.x and zod"
        status: pass
    human_judgment: false
  - id: D4
    description: "graph_pack / graph_answer / graph_query / graph_status / graph_review_list offline against store fixture"
    requirement: MCP-01
    verification:
      - kind: unit
        ref: "tests/mcp-tools.test.ts#graph_pack and graph_answer delegate to library on in-memory fixture"
        status: pass
      - kind: unit
        ref: "tests/mcp-tools.test.ts#graph_status handler returns JSON from public status()"
        status: pass
      - kind: unit
        ref: "tests/mcp-tools.test.ts#graph_query term search returns nodes/triples from store"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-08-03
status: complete
---

# Phase 6 Plan 02: Optional MCP stdio server Summary

**MCP stdio server with default-on read tools (status/query/pack/answer/review list) and default-off build/review-write, using `@modelcontextprotocol/sdk` 1.x + zod.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-03T17:13:26Z
- **Completed:** 2026-08-03T17:18:47Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Shipped `bin/gsd-graph-mcp.js` stdio entry with dynamic-import MCP SDK bootstrap (CJS-safe)
- Default registration: `graph_status`, `graph_query`, `graph_pack`, `graph_answer`, `graph_review_list`
- Privileged `graph_build` / `graph_review_resolve` only when `--allow-build` / `--allow-review-write` (or create opts)
- Offline unit surface: `listToolNames`, `handleToolCall`, `createGsdGraphMcpServer` without hanging on stdin
- Full `npm test` green (284 tests) with no live MCP host required

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm @modelcontextprotocol/sdk 1.x package legitimacy** - checkpoint satisfied (orchestrator-approved; no code commit)
2. **Task 2: End-to-end MCP graph_status tool + bin scaffold** - `bb156f6` (feat)
3. **Task 3: Full read tool matrix + default-off write tools** - `6362c67` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `src/mcp/server.ts` — create/start MCP server, parse argv, listToolNames
- `src/mcp/tools.ts` — tool schemas, handlers, gate-aware registration names
- `bin/gsd-graph-mcp.js` — shebang entry requiring dist MCP main
- `package.json` / `package-lock.json` — bin + `@modelcontextprotocol/sdk` + `zod` deps
- `tests/mcp-tools.test.ts` — registration matrix, gates, offline pack/answer/query
- `tests/package-identity.test.ts` — MCP bin + dep pin gates

## Decisions Made

- MCP SDK + zod as **normal dependencies** (gate behavior, not install) — D-07 / RESEARCH
- DESIGN `graph_*` tool names
- Full default read matrix in initial server create (Task 2 scaffold already registered all reads; Task 3 locked exact set + write gates in tests)
- CLI: `--allow-build`, `--allow-review-write`, `--dir`

## Checkpoint: Package legitimacy (Task 1)

**Status:** Satisfied by orchestrator (blocking-human auto-approved with evidence).

Evidence recorded:
- `gsd-tools package-legitimacy check --ecosystem npm @modelcontextprotocol/sdk` → verdict SUS **only** for reason `too-new` (published 2026-07-27); exists, not deprecated, no postinstall, official repo `modelcontextprotocol/typescript-sdk`, ~53M weekly downloads
- `zod` → verdict **OK**
- RESEARCH disposition: Approved for use; open-gsd already depends on `@modelcontextprotocol/sdk` ^1.27.1
- Pin used: `@modelcontextprotocol/sdk@^1.30.0`, `zod@^4` (resolved `zod@^4.4.3`)

Did **not** re-pause for human-verify after orchestrator approval.

## Deviations from Plan

### Ahead-of-plan implementation

**1. [Rule 2 - Missing critical functionality] Full read tool handlers in Task 2 scaffold**
- **Found during:** Task 2
- **Issue:** Plan Task 2 only required `graph_status`; Task 3 required remaining reads + write gates.
- **Fix:** Registered full default read matrix and write-gate scaffolding in Task 2 so Task 3 focused on exact-set tests, offline pack/answer/query integration, and gate refusal coverage without a second registration rewrite.
- **Files modified:** `src/mcp/server.ts`, `src/mcp/tools.ts`
- **Commit:** `bb156f6`

### Auto-fixed Issues

None beyond the ahead-of-plan completeness above.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None new beyond plan `<threat_model>` (T-06-07 write elevation mitigated by non-registration; T-06-10 stdout pollution covered by smoke test; T-06-SC legitimacy checkpoint completed).

## Verification Results

```text
npm run build:test && node --test dist-test/mcp-tools.test.js dist-test/package-identity.test.js
→ 17 pass (Task 2 scope)

npm test
→ 284 pass / 0 fail (full suite offline)
```

## Self-Check: PASSED

- FOUND: `src/mcp/server.ts`, `src/mcp/tools.ts`, `bin/gsd-graph-mcp.js`, `tests/mcp-tools.test.ts`
- FOUND: commits `bb156f6`, `6362c67`
- FOUND: package.json `bin.gsd-graph-mcp` and deps `@modelcontextprotocol/sdk`, `zod`
