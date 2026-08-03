# Phase 6 Plan Check — Optional agents

**Checked:** 2026-08-03  
**Plans:** 06-01, 06-02, 06-03, 06-04  
**VALIDATION:** `06-VALIDATION.md` present  
**Verdict:** **PASS**

Goal-backward verification against ROADMAP Phase 6, REQUIREMENTS LLM-01 / MCP-01 / RPT-01 / ONT-04, and CONTEXT.md D-01..D-12. Plans describe intent that **will** deliver the phase goal if executed as written. No blockers.

---

## Phase goal (from ROADMAP)

Optional LLM assist, MCP read tools, example packs, and minimal report improve agent hosts without blocking 0.1.

**Success criteria must be TRUE:**

1. Optional LLM providers (`prompt` | `http`) fail closed on schema; no ambient network/LLM by default  
2. MCP tools expose status/query/pack/answer; build and review-write off by default  
3. Example research + engineering packs load replace-only with docs  
4. Minimal `GRAPH_REPORT.md` from published v1 (counts + top predicates)

---

## Coverage map

| Requirement | Plan | Tasks | Coverage |
|-------------|------|-------|----------|
| LLM-01 | 06-01 | 1–3 | **COVERED** — modes none\|prompt\|http; Ajv apply; citation subset; confined prompt I/O; mock HTTP; default none; offline suite |
| MCP-01 | 06-02 | 1–3 | **COVERED** — stdio bin; default read tools; write tools gated; human legitimacy gate before install |
| RPT-01 | 06-03 | 1–2 | **COVERED** — `writeGraphReport` from `loadGraphV1` only; CLI `report`; non-authoritative header; write_on_build default false |
| ONT-04 | 06-04 | 1–2 | **COVERED** — research + engineering packs + READMEs; load by pack id; no `extends` |

| Locked decision | Implementing plan/task | Status |
|-----------------|------------------------|--------|
| D-01 mode none default; flag/config only | 06-01 T2–T3 | OK |
| D-02 fail-closed Ajv + citation subset | 06-01 T1–T3 | OK |
| D-03 prompts/*.md; query reserved | 06-01 T2 | OK |
| D-04 realpath-confined prompt files | 06-01 T2 | OK |
| D-05 http opt-in; no keys in repo; injectable fetch | 06-01 T3 | OK |
| D-06 MCP read on; build/review-write off | 06-02 T2–T3 | OK |
| D-07 MCP bin + SDK | 06-02 T1–T2 | OK |
| D-08 GRAPH_REPORT from v1; never SoT | 06-03 T1–T2 | OK |
| D-09 example packs + README | 06-04 T1–T2 | OK |
| D-10 deterministic default; goldens offline | 06-01 T1/T3; 06-02; 06-03; 06-04 | OK |
| D-11 copyright headers | all plans (actions) | OK |
| D-12 node:test; mock HTTP; no live network CI | all plans + VALIDATION | OK |

**Deferred excluded:** communities / label propagation, NL→IR apply, Neo4j, pack extends, gsd-core — not in any plan task. 06-04 explicitly forbids communities and extends.

---

## Special checks (orchestrator)

| Check | Result | Evidence |
|-------|--------|----------|
| LLM fail-closed; `none` default; no ambient network | **PASS** | 06-01 must_haves + T1–T3 behaviors; resolveLlmMode never enables from API key alone; default answer fetch spy zero calls |
| MCP read tools; build/review-write off | **PASS** | 06-02 default list excludes `graph_build` / `graph_review_resolve`; register only when allow flags |
| GRAPH_REPORT never SoT | **PASS** | 06-03 loads `loadGraphV1` only; non-authoritative header; query/pack/answer unchanged |
| Example packs load | **PASS** | 06-04 `loadOntologyPack('research'\|'engineering')` + tests |
| No communities | **PASS** | Deferred Phase 7; 06-04 action forbids |
| VALIDATION present | **PASS** | `06-VALIDATION.md` maps criteria → automated commands |
| Waves/deps; 06-02 human-verify legitimacy OK | **PASS** | Wave 1: 01+04 parallel; Wave 2: 02+03 after 01; 06-02 Task 1 `checkpoint:human-verify` for MCP SDK [SUS] seam before `npm install` |
| Offline CI | **PASS** | D-12 throughout; mock fetch; `npm test` without OPENAI_API_KEY; goldens in 06-01 T3 / VALIDATION |

---

## Dimension results

### 1. Requirement coverage — PASS

All four roadmap IDs appear in plan frontmatter `requirements` and have concrete tasks.

### 2. Task completeness — PASS

| Plan | Tasks | Structure |
|------|-------|-----------|
| 06-01 | 3 auto/tdd | files, action, behavior, automated verify, done |
| 06-02 | 1 checkpoint + 2 tdd | checkpoint fields complete; auto tasks complete |
| 06-03 | 2 tdd | complete |
| 06-04 | 2 tdd | complete |

### 3. Dependency correctness — PASS

```
06-01  wave 1  depends_on: []
06-04  wave 1  depends_on: []
06-02  wave 2  depends_on: [06-01]
06-03  wave 2  depends_on: [06-01]
```

Acyclic. 02 after 01 is justified (answer API surface + package.json `files`/`bin` coordination). 03 after 01 serializes shared `src/cli.ts` / `src/index.ts` edits (merge-safe). No forward refs.

### 4. Key links planned — PASS

- promptApply → Ajv + `assertCitationsInPack`  
- resolveLlmMode → answer/CLI (default none)  
- prompt-files → `storeFile` basenames  
- httpChatCompletion → injected fetch  
- MCP tools → public library APIs (not projection SoT)  
- write tools → allow flags only  
- writeGraphReport → loadGraphV1 → `GRAPH_REPORT.md`  
- pack ids → shipped ontology JSON  

### 5. Scope sanity — PASS with WARNING

| Plan | Tasks | Files (listed) | Estimate tokens | Notes |
|------|-------|----------------|-----------------|-------|
| 06-01 | 3 | ~22 | 90k (confidence low) | High file count; many are thin schemas/prompts |
| 06-02 | 3 (1 human) | ~7 | 75k low | OK |
| 06-03 | 2 | ~6 | 45k low | OK |
| 06-04 | 2 | ~5 | 35k low | OK |

Task counts within 2–3 target. 06-01 file list exceeds the 15+ heuristic **on paper**, but ~9 entries are static `schemas/*.json` + `prompts/*.md` (low context cost). **No split required** for goal achievement. Treat estimate as uncalibrated (low confidence).

### 6. Verification derivation — PASS

must_haves are user/operator-observable (default offline behavior, fail-closed errors, tool matrix, pack load, report from v1). Artifacts and key_links support truths.

### 7. Context compliance — PASS

Locked decisions mapped. Deferred ideas absent. Discretion exercised appropriately (CLI prompt apply ships; report write_on_build default false; `graph_*` names; MCP SDK as normal deps).

### 7b. Scope reduction — PASS

No invented v1/static stubs for locked decisions. Maintain “suggestions only” matches DESIGN (not reduction). Query template reserved matches deferred NL→IR.

### 7c. Architectural tier compliance — PASS

LLM/MCP/report in library (API tier); prompt files under store confinement; packs as shipped assets via existing loader. No client-tier auth/validation misplacement.

### 8. Nyquist compliance — PASS

VALIDATION.md exists. Wave 0 absorbed into in-plan TDD (documented). All implementation tasks have `<automated>` commands (build:test + node:test). Checkpoint 06-02-01 is human-only (documented in Manual-Only). Sampling: no 3 consecutive implementation tasks without automated verify. No watch-mode flags.

| Task | Plan | Wave | Automated | Status |
|------|------|------|-----------|--------|
| 01-01 | 01 | 1 | llm-prompt-apply | ✅ |
| 01-02 | 01 | 1 | llm-provider + apply | ✅ |
| 01-03 | 01 | 1 | llm-http + suite | ✅ |
| 02-01 | 02 | 2 | human checkpoint | ✅ n/a |
| 02-02 | 02 | 2 | mcp-tools + package-identity | ✅ |
| 02-03 | 02 | 2 | mcp-tools + npm test | ✅ |
| 03-01 | 03 | 2 | report.test | ✅ |
| 03-02 | 03 | 2 | report + cli-commands | ✅ |
| 04-01 | 04 | 1 | ontology-examples | ✅ |
| 04-02 | 04 | 1 | ontology-examples + suite | ✅ |

### 9. Cross-plan data contracts — PASS

No conflicting transforms. Shared surfaces (cli, index, package.json) ordered by depends_on. Report and MCP consume v1/public APIs; LLM apply validates before accept.

### 10. CLAUDE.md / project conventions — PASS (project-level)

Plans require copyright headers (D-11), node:test (not Jest/Vitest), offline CI. Aligns with repo Graph Engineering constraints in RESEARCH/STACK (Ajv for store contracts; Zod only for MCP tool schemas).

### 11. Research resolution — PASS with WARNING

Major OQs resolved (SDK 1.x, tool names, deps, prompt CLI, report trigger, AnswerOptions, query reserved).  
**Remaining (low risk):** exact extract/normalize schema field names; HTTP auth header variants — both have recommendations; 06-01 documents “names per RESEARCH/DESIGN; document in SUMMARY.” Not blocking execution.

### 12. Pattern compliance — SKIPPED

No `PATTERNS.md` for this phase.

### Verify command format — PASS

Automated blocks use `npm run build:test && node --test dist-test/...` without swallowed-error defaults or broken `pnpm ls | grep ^` anchors.

---

## Threat model coverage (plans)

| Threat | Plan mitigation | Status |
|--------|-----------------|--------|
| T-06-01 citation spoofing | assertCitationsInPack | planned |
| T-06-02 prompt tampering | Ajv fail-closed | planned |
| T-06-03/04 ambient LLM | mode none; no key-alone enable | planned |
| T-06-05 path escape | storeFile confine | planned |
| T-06-07 MCP write elevation | default unregistered | planned |
| T-06-10 stdio pollution | no stdout diagnostics | planned |
| T-06-11 report as SoT | header + loadGraphV1 only | planned |
| T-06-SC MCP npm | blocking-human verify | planned |

---

## Warnings (non-blocking)

```yaml
issues:
  - plan: "06-01"
    dimension: scope_sanity
    severity: warning
    description: >
      files_modified lists ~22 paths (heuristic 15+). Majority are thin
      schemas/prompts; task count is 3. Quality risk is moderate, not a goal miss.
    fix_hint: >
      Optional: keep prompt templates short; if executor context tight, split
      Task 3 (HTTP) into a follow-on plan after prompt/apply lands. No mandatory split.
  - plan: null
    dimension: research_resolution
    severity: warning
    description: >
      RESEARCH.md Open Questions still has "Remaining (low risk)" schema field
      names and HTTP auth variants not marked fully RESOLVED.
    fix_hint: >
      Mark those items RESOLVED with the plan’s chosen field names after 06-01
      SUMMARY, or rename section to Open Questions (RESOLVED) once SUMMARY lands.
  - plan: "06-03"
    dimension: dependency_correctness
    severity: info
    description: >
      depends_on 06-01 is not strictly required for RPT-01 (report needs Phase 1–2
      store only) but correctly serializes shared cli.ts/index.ts edits with 06-01.
    fix_hint: Keep as-is for merge safety.
```

**Blockers:** none.

---

## Plan summary

| Plan | Wave | Deps | Tasks | Req | Status |
|------|------|------|-------|-----|--------|
| 06-01 | 1 | — | 3 | LLM-01 | Valid |
| 06-02 | 2 | 06-01 | 3 (1 human) | MCP-01 | Valid |
| 06-03 | 2 | 06-01 | 2 | RPT-01 | Valid |
| 06-04 | 1 | — | 2 | ONT-04 | Valid |

---

## Verdict

## VERIFICATION PASSED

**Phase:** 06-optional-agents  
**Plans verified:** 4  
**Status:** All goal-critical checks passed (0 blockers, 2 warnings, 1 info)

Plans are ready for `/gsd-execute-phase 6`. Start Wave 1 with 06-01 and 06-04 in parallel; pause 06-02 on human MCP SDK legitimacy before install; run 06-03 after 06-01 for CLI merge safety.

---

*Plan-check: goal-backward, adversarial stance; credit only verifiable task coverage.*
