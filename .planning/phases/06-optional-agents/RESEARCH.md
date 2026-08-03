# Phase 6: Optional agents - Research

**Researched:** 2026-08-03  
**Domain:** Optional LLM providers, MCP stdio tools, example ontology packs, minimal GRAPH_REPORT  
**Confidence:** HIGH

## Summary

Phase 6 adds **optional** agent surfaces on top of the offline Graph Engineering core already proven in Phases 1–5. Nothing here may break default offline behavior: `llm.mode` defaults to `none`, MCP build/review-write stay off, example packs are replace-only loadable like `general`, and `GRAPH_REPORT.md` is a disposable human summary written only from published `graph.v1.json`.

LLM assist is a three-mode provider (`none` | `prompt` | `http`) with **fail-closed** JSON Schema validation on every apply path. Prompt mode uses package templates under `prompts/*.md` and realpath-confined request/result files in the store. HTTP mode is OpenAI-compatible chat completions via config + explicit flags only—never ambient network. Answer apply additionally requires `cited_triple_ids ⊆ pack.triple ids` so LLM prose cannot invent relationships.

MCP is a same-package stdio server (`bin/gsd-graph-mcp.js`) on `@modelcontextprotocol/sdk` **1.x** + `zod` for tool input schemas. Default tools are read-oriented (`graph_status`, `graph_query`, `graph_pack`, `graph_answer`, `graph_review_list`). `graph_build` and `graph_review_resolve` register only when explicitly enabled. Example packs `research` and `engineering` ship from DESIGN type/predicate tables. Minimal report emits counts + top predicates.

**Primary recommendation:** Implement LLM as a pure provider layer with Ajv-validated apply hooks; MCP as a thin stdio adapter over public library APIs with behavioral gates; example packs + report as small shippable artifacts—keep CI and goldens offline with no live network.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** LLM modes: `none` (default) | `prompt` | `http` — never ambient; requires config and/or explicit flags (LLM-01)
- **D-02** Fail-closed schema validation on all LLM/prompt results → `PROMPT_RESULT_INVALID` / reject; answer apply requires `cited_triple_ids ⊆ pack.triple ids`
- **D-03** Prompt templates under package `prompts/*.md` (extract, normalize, answer, maintain; query reserved/not applied NL→IR)
- **D-04** File-exchange (`prompt` mode): request/result files under store dir, realpath-confined
- **D-05** `http` mode: optional OpenAI-compatible endpoint from config; no keys in repo; off by default
- **D-06** MCP stdio tools: status, query, pack, answer, review list — **build and review-write off by default** (MCP-01)
- **D-07** MCP is optional package surface (`bin/gsd-graph-mcp.js` or similar); may use `@modelcontextprotocol/sdk` as optional/dependency per RESEARCH
- **D-08** Minimal `GRAPH_REPORT.md` writer: counts + top predicates from published v1 only (RPT-01); never becomes SoT
- **D-09** Example ontology packs `research` and `engineering` (or DESIGN-named) — replace-only load like general; with README docs (ONT-04)
- **D-10** Deterministic path remains default; offline goldens still pass without LLM/MCP
- **D-11** Copyright headers on all new source
- **D-12** Tests: node:test; mock/stub HTTP; no live network required for CI

### Claude's Discretion
- Exact MCP tool names (`graph_*` vs shorter)
- Whether MCP SDK is runtime dep vs optional peer
- How deep LLM extract hooks into `build()` (flag `--llm` / config only)
- Whether `prompt apply` CLI commands ship in this phase or library-only apply first
- Report trigger: auto on build vs explicit `gsd-graph report`

### Deferred Ideas (OUT OF SCOPE)
- Communities / label propagation — Phase 7  
- NL→Query IR application  
- Neo4j export  
- Pack extends inheritance  
- gsd-core integration  
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-01 | Optional LLM providers (`prompt` \| `http`) for extract/normalize/answer with fail-closed schema | Provider architecture, prompt file protocol, Ajv result schemas, answer citation subset gate, apply hooks that leave `llm.mode=none` default |
| MCP-01 | Optional MCP tools for status/query/pack/answer; build/review-write off by default | SDK 1.x + zod tool matrix, default-off write tools, stdio bin layout, open-gsd pattern |
| RPT-01 | Minimal GRAPH_REPORT.md writer | Counts + top predicates from published v1 only; never SoT; explicit report + optional build hook |
| ONT-04 | Example research and engineering ontology packs | DESIGN type/predicate tables; replace-only loader; README docs mirroring `general` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LLM provider modes (`none`/`prompt`/`http`) | API / Backend (library) | CLI | Library owns mode resolution + apply validation; CLI only passes flags/config |
| Prompt file exchange I/O | Database / Storage | API / Backend | Request/result files live under store root; realpath confinement is store-IO |
| Prompt result schema validation | API / Backend | — | Ajv against package JSON Schema; fail-closed before any graph mutation |
| Answer citation honesty gate | API / Backend | — | `cited_triple_ids ⊆ pack.triple ids` before accepting LLM answer markdown |
| LLM extract/normalize apply into build | API / Backend | CLI | Apply merges validated candidates into existing normalize/review path; no ambient call from build default |
| HTTP LLM transport | API / Backend | — | Only when mode=http + explicit flag; fetch/undici; secrets from env not repo |
| MCP stdio server | API / Backend | Browser / Client (host) | Local process; host (Claude/Cursor) is consumer only |
| MCP read tools (status/query/pack/answer/review list) | API / Backend | — | Thin wrappers over public library exports |
| MCP write tools (build/review resolve) | API / Backend | — | Same library paths but **gated off** by default |
| GRAPH_REPORT writer | API / Backend | CDN / Static (file artifact) | Writes markdown under store; never SoT for query |
| Example ontology packs | Database / Storage (shipped assets) | API / Backend | Loaded via existing `loadOntologyPack` replace-only path |
| Offline CI / goldens | API / Backend | — | No network; mock HTTP; default modes leave Phase 5 goldens green |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `1.30.0` (`^1.30.0`) | MCP stdio server (`McpServer` + `StdioServerTransport`) | Official TypeScript MCP SDK v1 line; open-gsd uses `^1.27.1`; npm latest 1.30.0 (2026-07-27) [VERIFIED: npm registry] |
| `zod` | `4.4.3` (`^4.0.0`) | MCP tool `inputSchema` only | Required peer of MCP SDK (`^3.25 \|\| ^4.0`); prefer Zod 4 to match gsd-pi [VERIFIED: npm registry] |
| `ajv` + `ajv-formats` | already `^8.20.0` / `^3.0.1` | Prompt-result + pack JSON Schema validation | Store/prompt contracts stay JSON Schema files; do not re-author in Zod [VERIFIED: package.json] |
| `commander` | already `^14.0.3` | CLI: `prompt apply`, `report`, answer `--apply-prompt-result`, build `--llm` | Existing K22 CLI surface [VERIFIED: package.json] |
| Node built-in `fetch` / undici | Node ≥22 | HTTP LLM client when `llm.mode=http` | No extra HTTP client dep; engines already `>=22` [VERIFIED: package.json engines] |
| `node:test` + `node:assert/strict` | built-in | Tests | D-12; org standard [VERIFIED: package.json scripts] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing pipeline: `packSubgraph`, `answer`, `query`, `build`, `status`, `reviewResolve`, `loadOntologyPack` | in-repo | MCP/LLM call targets | Always — no parallel implementations [VERIFIED: src/index.ts] |
| Package `prompts/*.md` | ship in package | Stage templates | extract, normalize, answer, maintain; query reserved [CITED: docs/DESIGN.md:247-252] |
| JSON Schema files under `schemas/` | ship | Prompt result validation | Add prompt-result schemas; keep Ajv compile-once pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@modelcontextprotocol/sdk` 1.x | `@modelcontextprotocol/server` 2.x | v2 is new split package line (2026-07-28 spec); open-gsd still on v1 — **do not adopt for Phase 6** [VERIFIED: github.com/modelcontextprotocol/typescript-sdk README main vs v1.x] |
| Runtime MCP dep | `optionalDependencies` / peer-only | Install-size win not worth broken bin for local toolkit; gate **behavior** not install [CITED: .planning/research/STACK.md:101] |
| Zod for prompt results | Ajv JSON Schema | Would fork on-disk contract; STACK hard-ban Zod as sole store authority [CITED: STACK.md:142] |
| Dedicated OpenAI SDK | `fetch` + OpenAI-compatible JSON | Extra dep; http mode is thin and optional |
| Vitest for MCP tests | `node:test` | Dual runners forbidden by project stack [CITED: STACK.md:113] |

**Installation:**

```bash
npm install @modelcontextprotocol/sdk@^1.30.0 zod@^4.0.0
```

**Version verification (this session):**
- `@modelcontextprotocol/sdk@1.30.0` — `npm view` OK; peer `zod: ^3.25 || ^4.0`; no malicious postinstall (scripts are lint/test/build only) [VERIFIED: npm registry]
- `zod@4.4.3` [VERIFIED: npm registry]

**package.json updates required:**
- Add deps above
- Add `"gsd-graph-mcp": "./bin/gsd-graph-mcp.js"` to `bin`
- Add `"prompts"` to `"files"` (currently missing: `dist`, `bin`, `schemas`, `ontology-packs`, `LICENSE`, `README.md` only) [VERIFIED: package.json:19-27]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@modelcontextprotocol/sdk` | npm | v1 line; 1.30.0 published 2026-07-27 | ~53M/wk | github.com/modelcontextprotocol/typescript-sdk | [SUS] (seam: too-new on this publish) | **Approved for use** — official MCP package, open-gsd already depends on `^1.27.1`; planner may note human-verify once on first install in a greenfield env |
| `zod` | npm | mature | ~251M/wk | github.com/colinhacks/zod | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** `@modelcontextprotocol/sdk` — seam flags recent publish; not a slopsquat (official org, massive downloads, matches STACK + open-gsd). Proceed with 1.x pin; **do not** install `@modelcontextprotocol/server` / `@modelcontextprotocol/client` 2.x in this phase.

## Architecture Patterns

### System Architecture Diagram

```text
                    ┌─────────────────────────────────────┐
                    │  Host agent (Claude/Cursor/CLI)     │
                    └───────────────┬─────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              v                     v                     v
     gsd-graph CLI          gsd-graph-mcp.js        library import
     (K22 JSON)             (stdio JSON-RPC)        (Node require)
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    v
                    ┌───────────────────────────────────┐
                    │ Public API: status/query/pack/    │
                    │ answer/build/review/promptApply/  │
                    │ writeGraphReport                  │
                    └───────────────┬───────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           v                        v                        v
    ┌──────────────┐      ┌──────────────────┐     ┌─────────────────┐
    │ llm/provider │      │ pipeline/*       │     │ store (.gsd-    │
    │ none|prompt  │─────>│ extract/normalize│────>│ graph/) v1 SoT  │
    │ |http        │      │ pack/answer/...  │     │ prompts I/O     │
    └──────┬───────┘      └──────────────────┘     │ GRAPH_REPORT.md │
           │                                        └─────────────────┘
           │ mode=none: no I/O, no network
           │ mode=prompt: write request → host fills result → apply+Ajv
           │ mode=http: fetch OpenAI-compatible only if flag+config
           v
    Fail-closed: PROMPT_RESULT_INVALID
    Answer: cited_triple_ids ⊆ pack.triples[].id
```

### Recommended Project Structure

```text
src/
├── llm/
│   ├── provider.ts          # resolveLlmMode; none|prompt|http
│   ├── prompt-files.ts      # request/result paths; realpath confine
│   ├── apply.ts             # promptApply(stage); Ajv + policy + citation gate
│   ├── http-client.ts       # OpenAI-compatible chat completions (opt-in)
│   └── budget.ts            # token/chunk budget helpers (optional thin)
├── mcp/
│   ├── server.ts            # createMcpServer; tool registration + gates
│   └── tools.ts             # handlers mapping to library APIs
├── pipeline/
│   ├── answer.ts            # extend: apply prompt result / http modes
│   ├── build.ts             # optional --llm / apply-prompt hooks only
│   └── report.ts            # writeGraphReport from v1
├── cli.ts                   # prompt apply, report, flags
bin/
├── gsd-graph.js
└── gsd-graph-mcp.js
prompts/
├── extract.md
├── normalize.md
├── query.md                 # reserved — document only; no apply in v0.1
├── answer.md
└── maintain.md
schemas/
├── prompt-extract-result.schema.json
├── prompt-normalize-result.schema.json
├── prompt-answer-result.schema.json
└── prompt-maintain-result.schema.json
ontology-packs/
├── general/                 # exists
├── research/
│   ├── ontology.json
│   └── README.md
└── engineering/
    ├── ontology.json
    └── README.md
```

### Pattern 1: LLM provider modes (never ambient)

**What:** Central `resolveLlmMode(opts, config) → 'none' | 'prompt' | 'http'`. Default `'none'`.  
**When to use:** Every extract/normalize/answer entry that might call an LLM.  
**Rules:**
1. Default path = deterministic only (current Phase 5 behavior) [VERIFIED: src/pipeline/answer.ts:8-9,98-117]
2. `prompt` / `http` require **config and/or explicit CLI/API flag** [CITED: docs/DESIGN.md:707-713]
3. No env var alone should enable network (avoid ambient `OPENAI_API_KEY` auto-call); key may be read only after mode is explicitly `http`

**Mode resolution (prescribe):**

```ts
// Source: docs/DESIGN.md LLM provider model + D-01
// Pseudocode for planner — not yet in repo
export type LlmMode = 'none' | 'prompt' | 'http';

export function resolveLlmMode(input: {
  flagMode?: LlmMode | boolean; // --llm | --llm=http
  configMode?: LlmMode;         // config.llm.mode
}): LlmMode {
  // explicit flag wins; else config; else none
  if (input.flagMode === true) return 'prompt'; // --llm alone → prompt file exchange
  if (input.flagMode === 'prompt' || input.flagMode === 'http') return input.flagMode;
  if (input.configMode === 'prompt' || input.configMode === 'http') return input.configMode;
  return 'none';
}
```

### Pattern 2: Unified prompt file exchange

**What:** Templates in package `prompts/*.md`; runtime I/O under store dir.  
**When to use:** `llm.mode=prompt` or explicit `prompt apply`.

| Stage | Template | Request file | Result file | Apply |
|-------|----------|--------------|-------------|-------|
| extract | `prompts/extract.md` | `.prompt-extract.json` | `.prompt-extract-result.json` | `build --apply-prompt extract` or `prompt apply extract` |
| normalize | `prompts/normalize.md` | `.prompt-normalize.json` | `.prompt-normalize-result.json` | `prompt apply normalize` |
| query | `prompts/query.md` | reserved | reserved | **not applied** (NL→IR deferred) |
| answer | `prompts/answer.md` | `.prompt-answer.json` | `.prompt-answer-result.json` | `answer --apply-prompt-result` |
| maintain | `prompts/maintain.md` | `.prompt-maintain.json` | `.prompt-maintain-result.json` | `prompt apply maintain` (suggestions only) |

[CITED: docs/DESIGN.md:715-727]

**Path safety:** write via `storeFile(storeRoot, basename)` / `confineUnderRoot` — basenames have no `/` or `..` [VERIFIED: src/io/paths.ts:137-150].

### Pattern 3: Fail-closed apply + citation honesty

**What:** All stages Ajv-validate result JSON; unknown types/predicates respect pack policy; answer requires citation subset.  
**Reason code:** `prompt_result_invalid` already defined:

```8:20:src/errors.ts
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

[VERIFIED: src/errors.ts:8-20]

**Answer apply gate (normative):**

```ts
// Source: docs/DESIGN.md:727 + D-02
// After Ajv validate answer result:
const packIds = new Set(pack.triples.map((t) => t.id));
for (const id of result.cited_triple_ids) {
  if (!packIds.has(id)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `cited_triple_id not in pack: ${id}`,
    );
  }
}
// Only then set mode 'prompt_pending'→applied markdown; never invent triples
```

**GroundedAnswer modes already reserved:**

```455:471:src/types.ts
export interface GroundedAnswer {
  pack: SubgraphPack;
  answer_markdown: string;
  mode: 'deterministic' | 'prompt_pending' | 'http' | 'abstain';
  abstained: boolean;
  abstain_reason?: string;
  prompt_bundle?: object;
}
```

[VERIFIED: src/types.ts:455-471]

Phase 5 only sets `deterministic` | `abstain` [VERIFIED: src/pipeline/answer.ts:106-116]. Phase 6 may set `prompt_pending` (request written, awaiting result) or `http` (after validated HTTP prose) without changing empty-pack abstain.

### Pattern 4: MCP stdio server (SDK 1.x)

**What:** Same package, optional bin, thin adapter.  
**API (v1.x):**

```ts
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'gsd-graph', version: '0.1.0' });
// register tools...
const transport = new StdioServerTransport();
await server.connect(transport);
```

[CITED: github.com/modelcontextprotocol/typescript-sdk v1.x docs/server.md]

**OpenGSD in-repo pattern:** dynamic import of `@modelcontextprotocol/sdk/server/mcp.js` and `server/stdio.js` for TS Node16 subpath issues; `server.tool(name, description, zodShape, handler)` [VERIFIED: gsd-pi/packages/mcp-server/src/server.ts:952-1000] [VERIFIED: gsd-pi/packages/mcp-server/src/cli.ts:13-28].

**CJS note:** this package emits CJS (`main: dist/index.js`). Prefer the same dynamic-import workaround as `@opengsd/mcp-server` rather than static ESM-only imports that break under CJS emit.

### Pattern 5: MCP tool matrix (default-off writes)

| Tool | Maps to | Default |
|------|---------|---------|
| `graph_status` | `status()` | **on** |
| `graph_query` | `query()` term/path/neighborhood/filter | **on** |
| `graph_pack` | `packSubgraph()` | **on** |
| `graph_answer` | `answer()` (deterministic unless LLM configured) | **on** |
| `graph_review_list` | review queue read (`loadReviewQueue` / list pending) | **on** |
| `graph_review_resolve` | `reviewResolve()` | **off** unless `mcp.allow_review_write` or `--allow-review-write` |
| `graph_build` | `build()` | **off** unless `mcp.allow_build` or `--allow-build` |

[CITED: docs/DESIGN.md:845-857] [Locked: D-06]

**Tool naming recommendation (discretion RESOLVED):** use DESIGN `graph_*` prefix — stable, avoids collisions with host tools, matches DESIGN table.

**Dependency style recommendation (discretion RESOLVED):** list `@modelcontextprotocol/sdk` + `zod` as **normal dependencies** (not optionalDependencies). Gate behavior, not install [CITED: STACK.md:101] [D-07].

### Pattern 6: build() LLM hooks without breaking offline defaults

**What:** `build()` stays fully offline unless flags/config opt in.  
**Prescribe:**
- Do **not** call network from `build()` when `llm.mode=none` (default).
- `--llm` / `llm.mode=prompt`: after deterministic extract, optionally write `.prompt-extract.json` bundle; do not block forever in CI. Prefer separate `prompt apply extract` step for file-exchange (host fills result offline).
- `build --apply-prompt extract`: read result file, Ajv validate, merge candidates into normalize path with confidence `INFERRED` unless quote span verified → `EXTRACTED` [CITED: docs/DESIGN.md:523].
- Depth recommendation (discretion RESOLVED): **config + flags only**; no automatic HTTP inside build. Keep extract LLM as apply-step, not silent mid-build network.

### Pattern 7: Minimal GRAPH_REPORT

**What:** Human markdown under store: counts + top predicates from published v1.  
**Never SoT** — query/pack/answer still use `graph.v1.json` only [VERIFIED: load paths; D-08].

**Content (minimal v0.1):**
- engine / engine_version / ontology_pack_id / built_at
- node_count, triple_count
- top N predicates by frequency (e.g. top 10)
- optional: review_queue pending count from queue file

**Trigger recommendation (discretion RESOLVED):**
- Primary: explicit `gsd-graph report` CLI + `writeGraphReport({ dir })` library export
- Optional: `config.report.write_on_build: false` default; if true, write after successful publish (same lock as build)
- Do not make report failure fail the build when optional

### Pattern 8: Example ontology packs

**What:** Shipped replace-only packs loaded by id via existing loader:

```45:46:src/ontology/load-pack.ts
  // Pack id → package-shipped ontology-packs/<id>/ontology.json (not cwd store).
  return join(packageRoot, 'ontology-packs', packIdOrPath, 'ontology.json');
```

[VERIFIED: src/ontology/load-pack.ts:45-46]

**DESIGN example content (use these types/predicates):**

| Pack | Extra types | Extra predicates |
|------|-------------|------------------|
| `research` | Paper, Author, Method, Dataset | cites, evaluates, uses_method |
| `engineering` | Service, Incident, Decision, Change, API | depends_on, owns, mitigates, deploys |

[CITED: docs/DESIGN.md:385-390]

**Prescribe full packs as self-contained replace-only** (no `extends` — loader rejects it) [VERIFIED: src/ontology/load-pack.ts:140-148]. Include a practical baseline of general-ish types/predicates **or** domain-focused closed sets; prefer domain-focused closed allowlists with `strict: true`, `unknown_*_policy: "review"`, matching `general` shape [VERIFIED: ontology-packs/general/ontology.json:1-60].

**Suggested research pack (planner-ready):**

```json
{
  "id": "research",
  "version": "1",
  "title": "Research literature",
  "node_types": [
    "Entity", "Person", "Organization", "Document", "Paper",
    "Author", "Method", "Dataset", "Claim", "Concept", "Topic"
  ],
  "predicates": [
    { "id": "related_to", "domain": ["*"], "range": ["*"] },
    { "id": "authored", "domain": ["Author", "Person", "Organization"], "range": ["Paper", "Document", "Claim"] },
    { "id": "cites", "domain": ["Paper", "Document", "Claim"], "range": ["Paper", "Document", "Claim"] },
    { "id": "evaluates", "domain": ["Paper", "Method"], "range": ["Method", "Dataset", "Claim"] },
    { "id": "uses_method", "domain": ["Paper", "Claim"], "range": ["Method"] },
    { "id": "about", "domain": ["Paper", "Document", "Claim"], "range": ["Topic", "Concept", "Entity"] },
    { "id": "supports", "domain": ["Claim", "Document", "Paper"], "range": ["Claim"] },
    { "id": "contradicts", "domain": ["Claim"], "range": ["Claim"] },
    { "id": "same_as", "domain": ["*"], "range": ["*"] }
  ],
  "strict": true,
  "unknown_predicate_policy": "review",
  "unknown_type_policy": "review"
}
```

**Suggested engineering pack:**

```json
{
  "id": "engineering",
  "version": "1",
  "title": "Engineering systems",
  "node_types": [
    "Entity", "Person", "Organization", "Service", "API",
    "Incident", "Decision", "Change", "Document", "Concept", "Event"
  ],
  "predicates": [
    { "id": "related_to", "domain": ["*"], "range": ["*"] },
    { "id": "depends_on", "domain": ["Service", "API", "Change"], "range": ["Service", "API"] },
    { "id": "owns", "domain": ["Person", "Organization"], "range": ["Service", "API", "Document"] },
    { "id": "mitigates", "domain": ["Change", "Decision", "Service"], "range": ["Incident"] },
    { "id": "deploys", "domain": ["Change", "Person", "Organization"], "range": ["Service", "API"] },
    { "id": "causes", "domain": ["Event", "Change", "Incident"], "range": ["Incident", "Event"] },
    { "id": "about", "domain": ["Document", "Decision", "Incident"], "range": ["Service", "API", "Concept"] },
    { "id": "part_of", "domain": ["*"], "range": ["*"] },
    { "id": "same_as", "domain": ["*"], "range": ["*"] }
  ],
  "strict": true,
  "unknown_predicate_policy": "review",
  "unknown_type_policy": "review"
}
```

Each pack needs `README.md` documenting domain use + replace-only copy workflow (mirror general README) [VERIFIED: ontology-packs/general/README.md].

### Anti-Patterns to Avoid

- **Ambient LLM:** reading `OPENAI_API_KEY` and calling network without mode/flag
- **Trusting model JSON without Ajv:** always fail-closed → `PROMPT_RESULT_INVALID`
- **Accepting answer citations outside pack:** invents relationships; breaks product honesty
- **MCP write tools on by default:** review/build mutations are privileged [CITED: DESIGN security table]
- **Reading `graph.json` in MCP/query paths:** projection is never SoT [CITED: DESIGN invariant]
- **Zod as store schema authority:** MCP inputs only
- **MCP SDK v2 packages for 0.1:** ecosystem not aligned
- **NL→Query IR apply via `prompts/query.md`:** deferred; template may document only
- **Silent maintain graph rewrite from LLM suggestions:** maintain apply is suggestions only [CITED: DESIGN:725]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol / stdio framing | Custom JSON-RPC over stdin | `@modelcontextprotocol/sdk` McpServer + StdioServerTransport | Spec edge cases, capability negotiation |
| MCP tool arg validation | Hand-rolled typeof checks | `zod` inputSchema | SDK peer; consistent errors |
| Prompt/store JSON Schema validation | Ad-hoc parsers | Existing Ajv validators + new prompt-result schemas | Same fail-closed path as graph.v1 |
| Path confinement for prompt files | string startsWith | `confineUnderRoot` / `storeFile` | Symlink escape already handled |
| Query/pack/answer logic in MCP | Duplicate graph walks | Public library exports | Single source of truth; tests already cover |
| HTTP client framework | axios/openai SDK | Node `fetch` | Optional thin path; engines ≥22 |
| Ontology composition | `extends` merge | Replace-only full packs | Loader rejects extends in v0.1 |

**Key insight:** Phase 6 is mostly **adapters and gates**. The hard graph work is done—do not reimplement pack/answer/build inside MCP or LLM layers.

## Common Pitfalls

### Pitfall 1: Ambient network / LLM
**What goes wrong:** CI or offline users hit network; goldens flake; secrets leak.  
**Why it happens:** Defaulting http when API key present; build always tries LLM.  
**How to avoid:** Default `none`; require config mode **and/or** explicit flag; unit tests assert `fetch` never called in default build/answer.  
**Warning signs:** Tests need network; G0/G1 fail without keys.

### Pitfall 2: Citation dishonesty on LLM answer
**What goes wrong:** Model cites triple ids not in pack or invents edges in prose without ids.  
**Why it happens:** Only checking schema shape, not set inclusion.  
**How to avoid:** After Ajv, enforce `cited_triple_ids ⊆ pack.triples[].id`; reject otherwise; deterministic answer remains default.  
**Warning signs:** Answer mode `http`/`prompt` with citations missing from pack.citations/triples.

### Pitfall 3: MCP write footguns
**What goes wrong:** Host agent auto-calls `graph_build` or `graph_review_resolve` and mutates store.  
**Why it happens:** Tools registered by default; agents explore all tools.  
**How to avoid:** Do not register write tools unless flags/config true; document in tool descriptions; tests assert tool list without flags excludes write tools.  
**Warning signs:** Tool list includes `graph_build` in default server.

### Pitfall 4: Stdio JSON mixed with logs
**What goes wrong:** MCP host breaks parsing when server writes to stdout.  
**Why it happens:** `console.log` in library paths.  
**How to avoid:** MCP binary: diagnostics only on stderr; library stays quiet; never print to stdout from tool handlers except SDK transport.  
**Warning signs:** Host "invalid JSON-RPC" errors.

### Pitfall 5: CJS / SDK subpath import failures
**What goes wrong:** Build succeeds but bin crashes on `require('@modelcontextprotocol/sdk/server/mcp.js')`.  
**Why it happens:** Dual package hazard / TS Node16 resolution.  
**How to avoid:** Follow open-gsd dynamic import pattern; smoke-test `node bin/gsd-graph-mcp.js` with a short timeout/handshake test.  
**Warning signs:** ERR_PACKAGE_PATH_NOT_EXPORTED at runtime.

### Pitfall 6: Prompt result applied to wrong stage / stale files
**What goes wrong:** Old `.prompt-*-result.json` applied after corpus change.  
**Why it happens:** No fingerprint check on apply.  
**How to avoid:** Embed request `content_hash` / `built_at` / question in request; apply verifies match or warns+rejects.  
**Warning signs:** Apply succeeds with mismatched source hashes.

### Pitfall 7: Example packs with `extends`
**What goes wrong:** Pack fails load with ONTOLOGY_INVALID.  
**Why it happens:** Authors copy general and add extends.  
**How to avoid:** Full replace-only JSON; README warns; tests load both packs.  
**Warning signs:** `extends` key in ontology.json.

### Pitfall 8: Report treated as SoT
**What goes wrong:** Downstream tools parse GRAPH_REPORT instead of graph.v1.  
**Why it happens:** Convenient markdown.  
**How to avoid:** Docs + status still point at v1; report header says non-authoritative.  
**Warning signs:** MCP tool that reads only report.

## Code Examples

### MCP server bootstrap (stdio)

```ts
// Source: MCP typescript-sdk v1.x docs/server.md + open-gsd mcp-server pattern
// gsd-graph — MCP stdio entry (illustrative)
import { z } from 'zod';

const MCP_PKG = '@modelcontextprotocol/sdk';

export async function startGsdGraphMcp(opts: {
  allowBuild?: boolean;
  allowReviewWrite?: boolean;
  dir?: string;
}): Promise<void> {
  const { McpServer } = await import(`${MCP_PKG}/server/mcp.js`);
  const { StdioServerTransport } = await import(`${MCP_PKG}/server/stdio.js`);
  const server = new McpServer({ name: 'gsd-graph', version: '0.1.0' });

  server.tool(
    'graph_status',
    'Read graph store status (counts, freshness). Never reads projection as SoT.',
    { dir: z.string().optional() },
    async ({ dir }) => {
      const { status } = await import('../index.js');
      const result = status(dir ? { dir } : undefined);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  // graph_query, graph_pack, graph_answer, graph_review_list similarly...

  if (opts.allowBuild) {
    server.tool(
      'graph_build',
      'Build graph from corpus (privileged).',
      {
        corpus: z.string(),
        dir: z.string().optional(),
        full: z.boolean().optional(),
      },
      async (args) => {
        const { build } = await import('../index.js');
        const result = build({
          corpus: args.corpus,
          dir: args.dir,
          full: args.full,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### Answer apply with citation subset

```ts
// Source: D-02 + DESIGN prompt result validation
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import type { SubgraphPack } from '../types';

export function assertCitationsInPack(
  pack: SubgraphPack,
  cited_triple_ids: string[],
): void {
  const ids = new Set(pack.triples.map((t) => t.id));
  for (const id of cited_triple_ids) {
    if (!ids.has(id)) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `cited_triple_id not in pack: ${id}`,
        { cited_triple_id: id },
      );
    }
  }
}
```

### Deterministic answer remains default

```98:117:src/pipeline/answer.ts
export function answer(opts: AnswerOptions): GroundedAnswer {
  const pack = packSubgraph(opts);

  if (pack.triples.length === 0) {
    return {
      pack,
      answer_markdown: '',
      mode: 'abstain',
      abstained: true,
      abstain_reason: GSD_GRAPH_REASON.EMPTY_SUBGRAPH,
    };
  }

  return {
    pack,
    answer_markdown: formatDeterministicMarkdown(pack),
    mode: 'deterministic',
    abstained: false,
  };
}
```

[VERIFIED: src/pipeline/answer.ts:98-117]

### HTTP client skeleton (opt-in only)

```ts
// Source: OpenAI-compatible chat completions shape [ASSUMED shape; widely documented]
// Only call when resolveLlmMode === 'http'
export async function httpChatCompletion(opts: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: 0,
    }),
  });
  if (!res.ok) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `http llm failed: ${res.status}`,
    );
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'http llm empty content',
    );
  }
  return content;
}
```

### GRAPH_REPORT writer

```ts
// Source: RPT-01 / DESIGN store layout GRAPH_REPORT.md
import fs from 'node:fs';
import { loadGraphV1 } from '../io/load-graph';
import { resolveStoreRoot, storeFile } from '../io/paths';

export function writeGraphReport(opts?: { dir?: string; topN?: number }): {
  path: string;
  node_count: number;
  triple_count: number;
} {
  const root = resolveStoreRoot(opts?.dir ? { dir: opts.dir } : {});
  const graph = loadGraphV1(root); // never projection
  const topN = opts?.topN ?? 10;
  const counts = new Map<string, number>();
  for (const t of graph.triples) {
    counts.set(t.p, (counts.get(t.p) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN);

  const md = [
    '# GRAPH_REPORT',
    '',
    '> Non-authoritative summary. Source of truth is graph.v1.json.',
    '',
    `- engine: ${graph.engine} ${graph.engine_version}`,
    `- ontology: ${graph.ontology_pack_id}@${graph.ontology_version}`,
    `- built_at: ${graph.built_at}`,
    `- nodes: ${graph.nodes.length}`,
    `- triples: ${graph.triples.length}`,
    '',
    '## Top predicates',
    ...top.map(([p, n]) => `- ${p}: ${n}`),
    '',
  ].join('\n');

  const out = storeFile(root, 'GRAPH_REPORT.md');
  fs.writeFileSync(out, md, 'utf8');
  return {
    path: out,
    node_count: graph.nodes.length,
    triple_count: graph.triples.length,
  };
}
```

### Config shape (extend DESIGN)

```json
{
  "llm": {
    "mode": "none",
    "http": { "base_url": "", "model": "", "api_key_env": "OPENAI_API_KEY" }
  },
  "mcp": { "allow_review_write": false, "allow_build": false },
  "report": { "write_on_build": false }
}
```

[CITED: docs/DESIGN.md:868-882 for llm/mcp; report key is phase prescription]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP SDK monorepo main = v1 | main = v2 (`@modelcontextprotocol/server`); v1 on `v1.x` + `@modelcontextprotocol/sdk` | 2026-07-28 spec | Pin **1.x** for open-gsd parity |
| Free-prose LLM extract as GA | Deterministic + link/JSONL goldens; LLM opt-in | DESIGN K24 | Offline honesty |
| MCP writes always on | build/review-write off by default | DESIGN K14 | Agent safety |
| Report as graph DB | Minimal markdown from v1 | DESIGN PR-13 | Disposable artifact |

**Deprecated/outdated:**
- MCP SDK v2 packages for this phase
- Ambient LLM extract as release gate
- NL→Query IR application (template reserved only)

## Discretion Resolutions (for planner)

| Discretion item | Resolution | Rationale |
|-----------------|------------|-----------|
| MCP tool names | `graph_*` per DESIGN | Stable, documented, collision-resistant |
| MCP SDK dep style | Normal `dependencies` | STACK + D-07; gate behavior not install |
| LLM extract depth in build | Flags/config only; prefer `prompt apply` step over mid-build HTTP | Offline default; CI safe |
| `prompt apply` CLI | **Ship in this phase** (library + CLI) | DESIGN CLI lists `prompt apply` and `answer --apply-prompt-result` |
| Report trigger | Explicit `gsd-graph report` primary; `report.write_on_build` default **false** | Keeps build critical path pure; still easy to enable |

## Open Questions

### RESOLVED

1. **MCP SDK 1.x vs 2.x** — Use `@modelcontextprotocol/sdk@^1.30.0` (1.x). Do not use v2 split packages in Phase 6.  
2. **MCP tool names** — `graph_status`, `graph_query`, `graph_pack`, `graph_answer`, `graph_review_list`, optional `graph_build` / `graph_review_resolve`.  
3. **Dependency vs optional** — Normal dependencies for sdk + zod.  
4. **prompt apply surface** — Library `promptApply` + CLI this phase.  
5. **Report trigger** — Explicit command default; optional write_on_build.  
6. **AnswerOptions extension** — Extend beyond `PackOptions` with optional `applyPromptResult?: boolean`, `llmMode?: LlmMode`, `promptResultPath?` without breaking existing `answer(opts)` call sites (additive fields).  
7. **query prompt** — Ship `prompts/query.md` as documentation-only; no apply path (deferred NL→IR).

### Remaining (low risk)

1. **Exact prompt-result JSON Schema field names for extract/normalize**  
   - What we know: answer needs `cited_triple_ids` + markdown/prose; extract returns nodes/triples constrained to ontology  
   - What's unclear: whether extract result reuses `ExtractResult` shape 1:1  
   - Recommendation: mirror `ExtractResult` / candidate triple drafts; validate types/predicates against active pack allowlists

2. **HTTP auth header variants**  
   - Some local servers need no auth; some use Bearer  
   - Recommendation: optional `api_key_env`; omit Authorization when unset

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ | v25.6.1 (engines ≥22) | — |
| npm | install | ✓ | 11.9.0 | — |
| `@modelcontextprotocol/sdk` | MCP bin | ✗ (not yet in package.json) | install `^1.30.0` | — |
| `zod` | MCP tool schemas | ✗ (not yet) | install `^4.0.0` | — |
| Live LLM endpoint | http mode | not required | — | prompt mode / none |
| Network in CI | tests | must not require | — | mock `fetch`; default none |

**Missing dependencies with no fallback:** none for offline path (MCP/LLM packages install at phase start).  
**Missing dependencies with fallback:** live LLM — always mockable; default mode none.

Step 2.6: external tools identified (Node, npm, optional network). No blocking missing tools.

## Validation Architecture

> `workflow.nyquist_validation` is enabled (true) in `.planning/config.json` [VERIFIED: .planning/config.json:25].

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node ≥22) |
| Config file | none — compile via `tsc -p tsconfig.test.json` then `node --test` |
| Quick run command | `npm test` (builds then runs all dist-test) |
| Full suite command | `npm test` / `npm run test:coverage` |
| CI | `.github/workflows/ci.yml` — Node 22/24, `npm ci`, build, test (no network secrets) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-01 | default answer/build does not call fetch | unit | `node --test dist-test/llm-provider.test.js` | ❌ Wave 0 |
| LLM-01 | invalid prompt result → `prompt_result_invalid` | unit | same | ❌ Wave 0 |
| LLM-01 | answer apply rejects citation outside pack | unit | `node --test dist-test/llm-answer-apply.test.js` | ❌ Wave 0 |
| LLM-01 | prompt file paths confined under store | unit | `node --test dist-test/llm-prompt-files.test.js` | ❌ Wave 0 |
| LLM-01 | http client uses injected fetch mock only | unit | `node --test dist-test/llm-http.test.js` | ❌ Wave 0 |
| MCP-01 | default tool list excludes build/review_resolve | unit | `node --test dist-test/mcp-tools.test.js` | ❌ Wave 0 |
| MCP-01 | allow-build registers graph_build | unit | same | ❌ Wave 0 |
| MCP-01 | graph_status/pack/answer delegate to library | unit/integration | same | ❌ Wave 0 |
| RPT-01 | report from v1 counts + top predicates | unit | `node --test dist-test/report.test.js` | ❌ Wave 0 |
| RPT-01 | report never read as SoT by query | unit (existing query load path) | existing query tests remain green | ✅ |
| ONT-04 | research + engineering packs load replace-only | unit | `node --test dist-test/ontology-examples.test.js` | ❌ Wave 0 |
| ONT-04 | extends still rejected | unit | existing ontology-load + new packs | ✅ partial |
| D-10 / GOLD | G0/G1 still pass offline without LLM deps behavior | golden | `node --test dist-test/golden-scenarios.test.js` | ✅ |
| D-12 | CI has no live network LLM calls | policy | suite green without env keys | ✅ process |

### Sampling Rate

- **Per task commit:** targeted `node --test dist-test/<area>.test.js` after build:test  
- **Per wave merge:** `npm test`  
- **Phase gate:** `npm test` green; goldens green; no `OPENAI_API_KEY` required

### Wave 0 Gaps

- [ ] `tests/llm-provider.test.ts` — mode resolution; default none; no ambient fetch  
- [ ] `tests/llm-prompt-apply.test.ts` — Ajv fail-closed; citation subset  
- [ ] `tests/llm-http.test.ts` — mock fetch; error mapping to PROMPT_RESULT_INVALID  
- [ ] `tests/mcp-tools.test.ts` — tool registration matrix + default-off writes  
- [ ] `tests/report.test.ts` — GRAPH_REPORT content from fixture v1  
- [ ] `tests/ontology-examples.test.ts` — load research + engineering packs  
- [ ] `schemas/prompt-*-result.schema.json` — before apply implementation  
- [ ] `prompts/*.md` templates shipped and listed in package `files`  
- [ ] Framework install: `npm install @modelcontextprotocol/sdk@^1.30.0 zod@^4.0.0`

## Security Domain

> `security_enforcement` enabled; ASVS level 1 [VERIFIED: .planning/config.json:48-49].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial (http LLM) | API key from env name in config only; never commit keys |
| V3 Session Management | no | Local stdio MCP; no remote sessions in v0.1 |
| V4 Access Control | yes (MCP writes) | build/review-write off by default; explicit flags |
| V5 Input Validation | yes | Ajv prompt results; zod MCP tool inputs; pack citation subset |
| V6 Cryptography | no new | No hand-rolled crypto; existing sha256 ids only |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via corpus → LLM | Tampering / Info disclosure | LLM opt-in; schema-validate outputs; never execute model output [CITED: DESIGN:906-907] |
| MCP agent triggers build/review | Elevation of privilege | Tools off by default [CITED: DESIGN:908] |
| Path traversal on prompt/report paths | Tampering | realpath + `storeFile` / `confineUnderRoot` [VERIFIED: paths.ts] |
| Secrets in corpus sent to http LLM | Info disclosure | Redaction patterns on extract; user-enabled http only [CITED: DESIGN:912] |
| MCP read exfiltration | Info disclosure | Local stdio trust boundary = reading store files [CITED: DESIGN:911] |
| Citation laundering (fake triple ids) | Spoofing | `cited_triple_ids ⊆ pack` gate (D-02) |
| Supply-chain (wrong MCP package) | Tampering | Pin official `@modelcontextprotocol/sdk` 1.x; avoid v2 name confusion |

## Project Constraints (from CLAUDE.md)

No project-local `./CLAUDE.md` or `.claude/CLAUDE.md` found in gsd-graph. Applicable user-level constraints observed:

- Copyright header on all new source (matches D-11 / DESIGN)  
- Prefer read-before-edit; keep changes minimal  
- Build/test after major changes  

Treat CONTEXT locked decisions as authoritative for this phase.

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` — LLM modes, prompt exchange table, MCP tool table, GRAPH_REPORT, example packs, security [CITED]  
- `src/pipeline/answer.ts`, `pack.ts`, `build.ts`, `errors.ts`, `types.ts`, `ontology/load-pack.ts`, `io/paths.ts`, `index.ts` — current APIs [VERIFIED: Read this session]  
- `ontology-packs/general/ontology.json` + README — pack template [VERIFIED]  
- `package.json` — deps, files, scripts, engines [VERIFIED]  
- `npm view @modelcontextprotocol/sdk@1.30.0` / `zod@4.4.3` — versions, peers [VERIFIED: npm registry]  
- MCP SDK v1.x `docs/server.md` — McpServer + StdioServerTransport [CITED: github.com/modelcontextprotocol/typescript-sdk/v1.x]  
- `@opengsd/mcp-server` — dynamic import + `server.tool` pattern [VERIFIED: gsd-pi packages]  
- `.planning/research/STACK.md` — MCP 1.x recommendation, dep style [CITED]  
- Phase CONTEXT.md D-01…D-12 [VERIFIED: Read]

### Secondary (MEDIUM confidence)

- OpenAI-compatible `/v1/chat/completions` request shape for local servers [ASSUMED / common convention]  
- Seam package-legitimacy SUS on sdk due to “too-new” publish date despite official package [VERIFIED: gsd-tools package-legitimacy]

### Tertiary (LOW confidence)

- Exact extract/normalize prompt-result field ergonomics beyond DESIGN sketches [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenAI-compatible HTTP body uses `messages` + `choices[0].message.content` | Code Examples / HTTP | Need adapter per provider; keep injectable parse |
| A2 | `--llm` alone maps to `prompt` mode (not http) | Pattern 1 | User may expect http; document flag `--llm=http` |
| A3 | Research/engineering packs should include a few general predicates (`related_to`, `same_as`) not only DESIGN “extra” rows | Pattern 8 | Packs too sparse for usable extract; adjust types |
| A4 | `report.write_on_build` default false is preferred over always-on | Discretion | Users may want auto report; config flip is enough |

**If wrong:** planner should confirm A2/A3 with user only if discuss-phase reopens; otherwise proceed with documented defaults.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — npm view + STACK + open-gsd usage  
- Architecture: **HIGH** — DESIGN + existing pipeline types/APIs  
- Pitfalls: **HIGH** — DESIGN security + known MCP stdio issues  
- Prompt JSON field-level schemas: **MEDIUM** — shape guided by DESIGN, not yet checked-in schemas  

**Research date:** 2026-08-03  
**Valid until:** 2026-09-02 (30 days; re-check MCP SDK major line if planning slips)
