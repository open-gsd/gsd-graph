---
phase: 06-optional-agents
verified: 2026-08-03T17:23:33Z
status: passed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 6: Optional agents Verification Report

**Phase Goal:** Optional LLM assist, MCP read tools, example packs, and minimal report improve agent hosts without blocking 0.1  
**Verified:** 2026-08-03T17:23:33Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Default `answer()` / `resolveLlmMode` remain none / deterministic with no network or fetch (SC1, D-01, D-05, D-10, LLM-01) | ✓ VERIFIED | `src/llm/provider.ts` returns `'none'` unless flag/config; `answer()` default path formats deterministic markdown only. Tests: `resolveLlmMode` defaults none; API key alone does not enable; `answer() does not call fetchImpl` |
| 2 | Invalid prompt-result JSON fails closed with `prompt_result_invalid` (D-02, LLM-01) | ✓ VERIFIED | `promptApply` / `promptApplyAnswer` use Ajv validators; throw `GraphError` reason `prompt_result_invalid`. Tests reject missing fields, empty markdown/citations, wrong types |
| 3 | Answer apply requires `cited_triple_ids ⊆ pack.triples[].id` before accepting LLM markdown (D-02) | ✓ VERIFIED | `assertCitationsInPack` in `src/llm/apply.ts`; wired in answer apply + `answerHttp`. Schema requires `cited_triple_ids`. Tests reject outsider ids |
| 4 | Prompt request/result basenames resolve under store root via `storeFile` / confine (D-04) | ✓ VERIFIED | `src/llm/prompt-files.ts` uses `storeFile(storeRoot, basename)` only; `assertSafePromptBasename` rejects separators. Covered by `llm-provider` confinement tests |
| 5 | `http` mode only when `resolveLlmMode` is http and uses injectable fetch (mockable offline) (D-05, D-12) | ✓ VERIFIED | `httpChatCompletion` accepts `fetchImpl`; `answerHttp` requires explicit baseUrl (no ambient endpoint). Mock-fetch tests green; no live network in suite |
| 6 | `prompts/*.md` ship extract/normalize/answer/maintain; query reserved docs-only (D-03) | ✓ VERIFIED | All five files under `prompts/`; `package.json` `files` includes `prompts`; query.md states reserved/not applied; `promptApply('query')` throws |
| 7 | Default MCP tool list includes status/query/pack/answer/review_list and excludes build + review_resolve (SC2, D-06, MCP-01) | ✓ VERIFIED | `DEFAULT_READ_TOOL_NAMES` / `listRegisteredToolNames` in `src/mcp/tools.ts`; server registers writes only when gated. `mcp-tools` tests assert matrix |
| 8 | When `allow_build` / `allow_review_write` true, write tools register and call public `build` / `reviewResolve` (D-06) | ✓ VERIFIED | `createGsdGraphMcpServer` + `handleToolCall` gates; handlers refuse when off. Tests for registration + deny paths |
| 9 | MCP bin `gsd-graph-mcp` published with `@modelcontextprotocol/sdk` 1.x + zod (D-07) | ✓ VERIFIED | `bin/gsd-graph-mcp.js` shebang → `dist/mcp/server.js`; deps `@modelcontextprotocol/sdk@1.30.0`, `zod@^4.4.3`; `package-identity` MCP bin tests |
| 10 | MCP handlers call public library APIs only — never projection as SoT (D-10) | ✓ VERIFIED | `handleToolCall` imports `status`/`query`/`packSubgraph`/`answer`/`build`/`reviewResolve` from `../index`; docs state v1-only SoT |
| 11 | `writeGraphReport` loads published graph.v1 only and writes `GRAPH_REPORT.md` with node/triple counts and top predicates (SC4, D-08, RPT-01) | ✓ VERIFIED | `src/pipeline/report.ts` → `loadGraphV1` then confined write; tests assert counts, top predicates, missing v1 throws (no projection fallback) |
| 12 | Report is non-authoritative; CLI `report` emits K22 JSON; `report.write_on_build` defaults false (D-08, D-10) | ✓ VERIFIED | Header `> Non-authoritative summary. Source of truth is graph.v1.json.`; CLI `report` → `writeOk`; build only writes when option/config true; suite proves default false |
| 13 | `loadOntologyPack({ packIdOrPath: 'research'\|'engineering' })` succeeds replace-only with DESIGN domain types/predicates (SC3, D-09, ONT-04) | ✓ VERIFIED | Packs on disk; research has Paper/Author/Method/Dataset + cites/evaluates/uses_method; engineering has Service/Incident/Decision/Change/API + depends_on/owns/mitigates/deploys. Tests load both |
| 14 | Neither pack includes `extends`; each ships README for replace-only domain use (D-09, ONT-03) | ✓ VERIFIED | No `extends` keys in JSON; READMEs document copy workflow and ban extends; tests `assertNoExtendsInRaw` |

**Score:** 14/14 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/llm/provider.ts` | `resolveLlmMode` none\|prompt\|http | ✓ VERIFIED | Exists, substantive, exported via index, used by CLI + answerHttp |
| `src/llm/apply.ts` | promptApply + citation fail-closed | ✓ VERIFIED | Ajv + assertCitationsInPack; wired into answer + CLI prompt apply |
| `src/llm/prompt-files.ts` | realpath-confined I/O | ✓ VERIFIED | storeFile basenames; CLI prompt apply uses `readPromptResult` |
| `src/llm/http-client.ts` | OpenAI-compatible fetch client | ✓ VERIFIED | Injectable fetch; used by answerHttp |
| `schemas/prompt-*-result.schema.json` | Ajv contracts (4 files) | ✓ VERIFIED | answer/extract/normalize/maintain; validators compiled in `src/schema/validators.ts` |
| `prompts/*.md` | Stage templates | ✓ VERIFIED | 5 templates; package `files` includes `prompts` |
| `src/mcp/server.ts` | create/start with write gates | ✓ VERIFIED | Dynamic SDK import; default-off writes |
| `src/mcp/tools.ts` | tool handlers → library | ✓ VERIFIED | Full matrix + handlers |
| `bin/gsd-graph-mcp.js` | stdio bin entry | ✓ VERIFIED | Shebang + require dist MCP main; package.bin published |
| `src/pipeline/report.ts` | writeGraphReport from v1 | ✓ VERIFIED | loadGraphV1 + storeFile GRAPH_REPORT.md |
| `ontology-packs/research/*` | research pack + README | ✓ VERIFIED | ontology.json + README; replace-only |
| `ontology-packs/engineering/*` | engineering pack + README | ✓ VERIFIED | ontology.json + README; replace-only |
| `tests/llm-*.test.ts` | LLM behavioral gates | ✓ VERIFIED | provider, prompt-apply, http |
| `tests/mcp-tools.test.ts` | MCP registration matrix | ✓ VERIFIED | Default-off writes + allow flags |
| `tests/report.test.ts` | report + write_on_build | ✓ VERIFIED | counts, topN, CLI, build default |
| `tests/ontology-examples.test.ts` | pack load shape gates | ✓ VERIFIED | research + engineering |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `promptApply(answer)` | `validatePromptAnswerResult` + `assertCitationsInPack` | Ajv then set inclusion | ✓ WIRED | apply.ts lines 67–76 |
| `resolveLlmMode` | answer / CLI flags | flag wins over config; default none | ✓ WIRED | provider.ts + cli answer `--llm` + answerHttp |
| `prompt-files` | `storeFile(storeRoot, basename)` | no path separators | ✓ WIRED | write/read/resolve all use storeFile |
| `httpChatCompletion` | `fetchImpl` | injected mock in tests | ✓ WIRED | opts.fetchImpl ?? globalThis.fetch |
| `createGsdGraphMcpServer` | `server.tool graph_*` | write tools only if allow* | ✓ WIRED | server.ts register gates |
| `graph_pack` / `graph_answer` | `packSubgraph` / `answer` | public index exports | ✓ WIRED | tools.ts imports from `../index` |
| `bin/gsd-graph-mcp.js` | dist mcp server start | require + main(argv) | ✓ WIRED | bin → `../dist/mcp/server.js` |
| `writeGraphReport` | `loadGraphV1` | resolveStoreRoot → loadGraphV1 | ✓ WIRED | report.ts never reads projection |
| `writeGraphReport` | `storeFile(..., 'GRAPH_REPORT.md')` | confined basename write | ✓ WIRED | report.ts line 88–89 |
| CLI `report` | `writeGraphReport` | K22 writeOk JSON | ✓ WIRED | cli.ts report command |
| `loadOntologyPack('research')` | `ontology-packs/research/ontology.json` | package-shipped packId | ✓ WIRED | ontology-examples tests green |
| `loadOntologyPack('engineering')` | `ontology-packs/engineering/ontology.json` | package-shipped packId | ✓ WIRED | ontology-examples tests green |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `writeGraphReport` | node/triple counts, top predicates | `loadGraphV1` → graph.nodes/triples | Yes (published v1) | ✓ FLOWING |
| `graph_answer` MCP | answer JSON | public `answer()` → packSubgraph | Yes (v1-backed pack) | ✓ FLOWING |
| `promptApplyAnswer` | answer_markdown | Ajv-validated result + pack ids | Yes (fail-closed on bad data) | ✓ FLOWING |
| ontology example packs | pack allowlists | package `ontology-packs/*/ontology.json` | Yes (file-backed) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite offline (no OPENAI_API_KEY required) | `npm test` | 290 pass / 0 fail; duration ~5.2s | ✓ PASS |
| Production build | `npm run build` (via `npm test`) | `tsc -p tsconfig.build.json` exit 0 | ✓ PASS |
| LLM fail-closed + no ambient | suite: `llm-provider`, `llm-prompt-apply`, `llm-http` | all green including citation reject + fetch spy | ✓ PASS |
| MCP default-off writes | suite: `mcp-tools` | default excludes build/resolve; allow flags register | ✓ PASS |
| Report from v1 | suite: `report` | counts + top predicates + write_on_build false | ✓ PASS |
| Example packs | suite: `ontology-examples` | research + engineering load | ✓ PASS |
| Offline goldens D-10 | suite: `golden-scenarios` G0/G1 | still pass | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No phase-declared `scripts/*/tests/probe-*.sh` | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| LLM-01 | 06-01 | Optional LLM providers (`prompt` \| `http`) with fail-closed schema | ✓ SATISFIED | provider + apply + http-client + schemas + prompts + answer/CLI wiring + llm-* tests |
| MCP-01 | 06-02 | Optional MCP tools status/query/pack/answer; build/review-write off by default | ✓ SATISFIED | mcp server/tools + bin + SDK 1.x + mcp-tools/package-identity tests |
| RPT-01 | 06-03 | Minimal GRAPH_REPORT.md writer | ✓ SATISFIED | report.ts + CLI report + optional write_on_build + report tests |
| ONT-04 | 06-04 | Example research and engineering ontology packs | ✓ SATISFIED | ontology-packs/{research,engineering} + READMEs + ontology-examples tests |

No orphaned Phase 6 requirements — REQUIREMENTS.md maps LLM-01, MCP-01, RPT-01, ONT-04 only.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/TODO debt markers in phase-6 sources | — | — |
| — | — | No stub returns / hollow handlers observed in llm/mcp/report paths | — | — |

### Human Verification Required

None required for phase goal closure.

Optional non-blocking (from VALIDATION.md, not success-criteria blockers):

1. **Live MCP host smoke** — point Claude/Cursor at `gsd-graph-mcp` and call `graph_status` (host-specific).
2. **MCP SDK package legitimacy** — already satisfied for CI via pinned `@modelcontextprotocol/sdk@1.30.0` + package-identity tests; original plan human gate was install-time.

### Gaps Summary

No gaps. All four ROADMAP success criteria and plan must-haves are present, substantive, wired, and exercised by automated tests. Defaults remain offline (`resolveLlmMode` → none; MCP writes off; report write_on_build false; goldens pass without network).

---

_Verified: 2026-08-03T17:23:33Z_  
_Verifier: Claude (gsd-verifier)_
