---
phase: 06
slug: optional-agents
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: RESEARCH.md Validation Architecture + plans 06-01..06-04.
> Wave 0 test scaffolds are **absorbed into plan tasks** (in-phase TDD) — not a separate Wave 0 plan.
> `workflow.nyquist_validation`: **true**

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node ≥22 built-in) + `node:assert/strict` |
| **Coverage** | `c8` — `--check-coverage --lines 80` |
| **Config file** | none required — scripts in `package.json` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30–180 seconds after LLM/MCP/report/packs land |

---

## Sampling Rate

- **After every task commit:** targeted `node --test dist-test/<area>.test.js` after `npm run build:test`, or `npm test`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green + Phase success criteria 1–4 true; no live LLM network required
- **Max feedback latency:** 180 seconds

---

## Validation targets (goal-backward)

| # | ROADMAP success criterion | Observable truth | Primary automated proof |
|---|---------------------------|------------------|-------------------------|
| 1 | Optional LLM providers fail closed; no ambient network | mode none default; Ajv + citation subset; mock fetch | `tests/llm-provider.test.ts`, `llm-prompt-apply.test.ts`, `llm-http.test.ts` |
| 2 | MCP read tools; write/build off by default | tool list matrix | `tests/mcp-tools.test.ts` |
| 3 | Example research + engineering packs load | loadOntologyPack by id | `tests/ontology-examples.test.ts` |
| 4 | Minimal GRAPH_REPORT from v1 | counts + top predicates | `tests/report.test.ts` |
| — | Offline goldens still pass (D-10) | G0/G1 unchanged | `tests/golden-scenarios.test.ts` |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | LLM-01 | T-06-01, T-06-02 | Ajv + cited_triple_ids ⊆ pack | unit | `node --test dist-test/llm-prompt-apply.test.js` | ❌ in-plan | ⬜ pending |
| 06-01-02 | 01 | 1 | LLM-01 | T-06-04, T-06-05 | mode none; storeFile confine | unit | `node --test dist-test/llm-provider.test.js dist-test/llm-prompt-apply.test.js` | ❌ in-plan | ⬜ pending |
| 06-01-03 | 01 | 1 | LLM-01 | T-06-03 | mock fetch only; no ambient http | unit | `node --test dist-test/llm-http.test.js` | ❌ in-plan | ⬜ pending |
| 06-02-01 | 02 | 2 | MCP-01 | T-06-SC | human package legitimacy | checkpoint | n/a (blocking-human) | — | ⬜ pending |
| 06-02-02 | 02 | 2 | MCP-01 | T-06-07 | graph_status on; build off | unit | `node --test dist-test/mcp-tools.test.js` | ❌ in-plan | ⬜ pending |
| 06-02-03 | 02 | 2 | MCP-01 | T-06-07, T-06-10 | full matrix; writes gated | unit | `node --test dist-test/mcp-tools.test.js` | ❌ in-plan | ⬜ pending |
| 06-03-01 | 03 | 2 | RPT-01 | T-06-11, T-06-12 | loadGraphV1 → GRAPH_REPORT.md | unit | `node --test dist-test/report.test.js` | ❌ in-plan | ⬜ pending |
| 06-03-02 | 03 | 2 | RPT-01 | T-06-13 | CLI report; write_on_build false | unit/cli | `node --test dist-test/report.test.js dist-test/cli-commands.test.js` | ❌ in-plan | ⬜ pending |
| 06-04-01 | 04 | 1 | ONT-04 | T-06-14 | research pack load | unit | `node --test dist-test/ontology-examples.test.js` | ❌ in-plan | ⬜ pending |
| 06-04-02 | 04 | 1 | ONT-04 | T-06-15 | engineering pack load | unit | `node --test dist-test/ontology-examples.test.js` | ❌ in-plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*  
*File Exists: ❌ in-plan = created by the plan task itself (Wave 0 absorbed).*

---

## Automated checks (requirement → command → expected)

| Criterion / Req | Command | Expected |
|-----------------|---------|----------|
| LLM-01 mode default | `node --test dist-test/llm-provider.test.js` | resolveLlmMode → none; no ambient enable |
| LLM-01 fail-closed apply | `node --test dist-test/llm-prompt-apply.test.js` | invalid schema + bad citation → prompt_result_invalid |
| LLM-01 http mock | `node --test dist-test/llm-http.test.js` | mock fetch only; default answer never fetches |
| MCP-01 default tools | `node --test dist-test/mcp-tools.test.js` | read tools on; graph_build / graph_review_resolve off |
| MCP-01 allow flags | same | write tools register when allowed |
| RPT-01 report | `node --test dist-test/report.test.js` | counts + top predicates from v1; non-authoritative header |
| ONT-04 packs | `node --test dist-test/ontology-examples.test.js` | research + engineering load; no extends |
| D-10 goldens | `node --test dist-test/golden-scenarios.test.js` | G0/G1 still pass offline |
| Full suite | `npm test` | all green without OPENAI_API_KEY |
| Coverage gate | `npm run test:coverage` | c8 lines ≥80 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP SDK package legitimacy | MCP-01 / T-06-SC | [SUS] seam on recent publish | Plan 06-02 Task 1: confirm npmjs.com/@modelcontextprotocol/sdk official 1.x before install |
| Optional live MCP host smoke | MCP-01 | Host-specific (Claude/Cursor) | After green suite, optionally point host at `gsd-graph-mcp` and call graph_status — non-blocking |

*All other Phase 6 behaviors have automated verification. No live LLM endpoint required for CI (D-12).*

---

## Wave 0 Requirements

Wave 0 gaps from RESEARCH are **closed by in-plan tasks**, not a separate pre-plan wave:

- [ ] `tests/llm-provider.test.ts` — plan 06-01
- [ ] `tests/llm-prompt-apply.test.ts` — plan 06-01
- [ ] `tests/llm-http.test.ts` — plan 06-01
- [ ] `tests/mcp-tools.test.ts` — plan 06-02
- [ ] `tests/report.test.ts` — plan 06-03
- [ ] `tests/ontology-examples.test.ts` — plan 06-04
- [ ] `schemas/prompt-*-result.schema.json` — plan 06-01
- [ ] `prompts/*.md` — plan 06-01
- [ ] Framework install: `npm install @modelcontextprotocol/sdk@^1.30.0 zod@^4.0.0` — plan 06-02 (after human legitimacy gate)

When each file lands, flip corresponding Per-Task map **File Exists** to ✅ and Status as tests go green.

---

## must_haves → test mapping (by plan)

| Plan | must_have truth (summary) | Test file |
|------|---------------------------|-----------|
| 06-01 | LLM modes none default; Ajv fail-closed; citations ⊆ pack; confined prompt files; mock http | llm-provider, llm-prompt-apply, llm-http |
| 06-02 | MCP read tools; write tools off by default; bin + sdk 1.x | mcp-tools, package-identity |
| 06-03 | GRAPH_REPORT from v1 counts + top predicates; CLI report | report, cli-commands |
| 06-04 | research + engineering packs load replace-only with READMEs | ontology-examples |

---

## Phase success criteria mapping

| ROADMAP criterion | Plans | Automated gate |
|-------------------|-------|----------------|
| 1. LLM fail-closed; no ambient | 06-01 | llm-* tests + npm test |
| 2. MCP read; write off default | 06-02 | mcp-tools.test.js |
| 3. Example packs load | 06-04 | ontology-examples.test.js |
| 4. Minimal GRAPH_REPORT | 06-03 | report.test.js |
