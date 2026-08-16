# Phase 6: Optional agents — Context

**Phase:** 06  
**Goal:** Optional LLM assist, MCP read tools, example packs, and minimal report improve agent hosts without blocking 0.1  
**Requirements:** LLM-01, MCP-01, RPT-01, ONT-04  
**Depends on:** Phase 5 complete (pack/answer exist); ontology loader from Phase 1

## Decisions

Locked (non-negotiable):

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

## Claude's Discretion

- Exact MCP tool names (`graph_*` vs shorter)
- Whether MCP SDK is runtime dep vs optional peer
- How deep LLM extract hooks into `build()` (flag `--llm` / config only)
- Whether `prompt apply` CLI commands ship in this phase or library-only apply first
- Report trigger: auto on build vs explicit `gsd-graph report`

## Deferred Ideas (OUT OF SCOPE for Phase 6)

- Communities / label propagation — Phase 7  
- NL→Query IR application  
- Neo4j export  
- Pack extends inheritance  
- gsd-core integration  

## Reuse

- `packSubgraph`, `answer`, `query`, `build`, `status`, `loadOntologyPack`, CLI K22 patterns
- general ontology pack as template for examples

## Success criteria (from ROADMAP)

1. LLM providers fail-closed; no ambient network  
2. MCP read tools; write/build off by default  
3. Example research + engineering packs load  
4. Minimal GRAPH_REPORT from v1  

## Research fold-in

- DESIGN LLM + MCP + prompts + GRAPH_REPORT  
- STACK MCP SDK recommendation  
- Phase 5 pack/answer APIs  
