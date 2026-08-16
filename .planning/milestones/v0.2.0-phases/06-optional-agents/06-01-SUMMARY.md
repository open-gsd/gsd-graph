---
phase: 06-optional-agents
plan: 01
subsystem: llm
tags: [llm, prompt-apply, ajv, http, citations, offline]

requires:
  - phase: 05-grounded-answer
    provides: packSubgraph + deterministic answer + GroundedAnswer modes
provides:
  - resolveLlmMode none|prompt|http (never ambient)
  - promptApply with Ajv fail-closed + answer citation subset gate
  - realpath-confined prompt request/result file I/O
  - prompts/*.md templates shipped in package
  - httpChatCompletion + answerHttp with injectable fetch
  - CLI prompt apply + answer --apply-prompt-result
affects: [06-02-mcp, agent-hosts, CLI]

actuals:
  tokens: 28000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "resolveLlmMode: flag wins over config; default none (D-01)"
    - "Fail-closed Ajv prompt-result schemas → PROMPT_RESULT_INVALID (D-02)"
    - "assertCitationsInPack before accepting LLM answer markdown (D-02)"
    - "storeFile basenames for prompt exchange (D-04)"
    - "Injectable fetch for OpenAI-compatible chat; no SDK (D-05, D-12)"

key-files:
  created:
    - src/llm/provider.ts
    - src/llm/prompt-files.ts
    - src/llm/apply.ts
    - src/llm/http-client.ts
    - schemas/prompt-answer-result.schema.json
    - schemas/prompt-extract-result.schema.json
    - schemas/prompt-normalize-result.schema.json
    - schemas/prompt-maintain-result.schema.json
    - prompts/extract.md
    - prompts/normalize.md
    - prompts/query.md
    - prompts/answer.md
    - prompts/maintain.md
    - tests/llm-prompt-apply.test.ts
    - tests/llm-provider.test.ts
    - tests/llm-http.test.ts
  modified:
    - src/pipeline/answer.ts
    - src/schema/validators.ts
    - src/types.ts
    - src/cli.ts
    - src/index.ts
    - package.json

key-decisions:
  - "Answer prompt-result fields: answer_markdown + cited_triple_ids (schema authority)"
  - "Applied prompt answers use mode prompt_pending; HTTP path uses mode http"
  - "answer() stays sync; live network is answerHttp() async to preserve offline call sites"
  - "Maintain apply returns suggestions only — never rewrites graph.v1"
  - "query stage has no apply path (NL→IR deferred; D-03)"

patterns-established:
  - "Pattern: promptApply({ stage, result, pack? }) unified fail-closed entry"
  - "Pattern: resolveLlmMode never enables from OPENAI_API_KEY alone"
  - "Pattern: httpChatCompletion(fetchImpl) for offline CI mocks"

requirements-completed: [LLM-01]

coverage:
  - id: D1
    description: "Default answer/resolveLlmMode remain none/deterministic with no network"
    requirement: LLM-01
    verification:
      - kind: unit
        ref: "tests/llm-prompt-apply.test.ts#default answer() without apply flags remains deterministic"
        status: pass
      - kind: unit
        ref: "tests/llm-http.test.ts#answer() does not call fetchImpl / network"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invalid prompt-result JSON and bad citations fail closed with PROMPT_RESULT_INVALID"
    requirement: LLM-01
    verification:
      - kind: unit
        ref: "tests/llm-prompt-apply.test.ts#rejects cited_triple_id not in pack"
        status: pass
      - kind: unit
        ref: "tests/llm-prompt-apply.test.ts#rejects JSON failing Ajv answer schema"
        status: pass
    human_judgment: false
  - id: D3
    description: "Prompt templates ship; package.json files includes prompts/"
    requirement: LLM-01
    verification:
      - kind: unit
        ref: "tests/llm-provider.test.ts#ships extract, normalize, answer, maintain, query under prompts/"
        status: pass
    human_judgment: false
  - id: D4
    description: "Prompt request/result I/O confined via storeFile basenames"
    requirement: LLM-01
    verification:
      - kind: unit
        ref: "tests/llm-provider.test.ts#writePromptRequest / readPromptResult use store basenames"
        status: pass
    human_judgment: false
  - id: D5
    description: "HTTP client mockable; errors map to PROMPT_RESULT_INVALID"
    requirement: LLM-01
    verification:
      - kind: unit
        ref: "tests/llm-http.test.ts#httpChatCompletion"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-03
status: complete
---

# Phase 6 Plan 01: Optional LLM providers Summary

**Optional `none|prompt|http` LLM providers with Ajv fail-closed apply, citation honesty on answers, confined prompt file exchange, and mockable OpenAI-compatible HTTP — default path stays deterministic offline.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-03T16:59:36Z
- **Completed:** 2026-08-03
- **Tasks:** 3/3
- **Commits:** 3

## Accomplishments

- Shipped `resolveLlmMode` (flag > config > none); never ambient from API key (D-01, T-06-04)
- Answer apply: Ajv `prompt-answer-result` then `cited_triple_ids ⊆ pack.triples[].id` (D-02, T-06-01/02)
- Multi-stage `promptApply` for extract|normalize|answer|maintain; query rejected (D-03)
- Prompt templates under `prompts/*.md` + `package.json` `files` includes `prompts` (D-03)
- Request/result I/O via `storeFile` basenames under store root (D-04, T-06-05)
- `httpChatCompletion` + `answerHttp` with injectable `fetchImpl`; no openai SDK (D-05, D-12)
- CLI: `prompt apply <stage>`, `answer --apply-prompt-result`, optional `--llm`
- Full offline suite green: 265 tests, including goldens (D-10)

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | End-to-end answer prompt-apply with citation honesty | f90f6c5 | feat (tracer) |
| 2 | Provider modes, prompt file I/O, templates, multi-stage apply + CLI | 8aa3622 | feat |
| 3 | HTTP client (mock fetch) + answerHttp + public exports | 3f7153a | feat |

## Field names (answer prompt result)

Chosen schema fields (document for hosts):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `answer_markdown` | string (minLength 1) | yes | Grounded prose |
| `cited_triple_ids` | string[] (minItems 1) | yes | Subset-checked against pack |
| `question` | string | no | Fingerprint |
| `content_hash` | string | no | Fingerprint |
| `built_at` | string | no | Fingerprint |

## Decisions Made

1. **Sync `answer()` preserved** — live HTTP is `answerHttp()` async so Phase 5 call sites and goldens stay sync/offline.
2. **Mode mapping** — applied prompt results → `prompt_pending`; HTTP path → `http` (types reserved in Phase 5).
3. **Maintain suggestions only** — `promptApply({ stage: 'maintain' })` returns suggestions; never mutates graph.v1.
4. **No new npm dependencies** — fetch is Node built-in; Ajv already present (T-06-SC).

## Deviations from Plan

### Auto-fixed Issues

None - plan executed as written with one design clarification:

**1. [Rule 2 - Missing critical functionality] Split sync answer vs async answerHttp**
- **Found during:** Task 3
- **Issue:** `answer()` is sync throughout Phase 5; making it always-async would break call sites.
- **Fix:** Keep `answer()` sync (prompt apply + deterministic); add `answerHttp()` for network with same gates.
- **Files modified:** `src/pipeline/answer.ts`, `src/index.ts`, `tests/llm-http.test.ts`
- **Commit:** 3f7153a

## Auth Gates

None.

## Known Stubs

None — no TODO/FIXME placeholders in shipped LLM paths; query template is intentionally docs-only (D-03 deferred NL→IR).

## Threat Flags

None beyond plan `<threat_model>` mitigations (T-06-01..05 implemented).

## Verification

```text
npm run build:test && node --test dist-test/llm-*.test.js  # 29 pass
npm test  # 265 pass, 0 fail (offline, no OPENAI_API_KEY)
```

## Self-Check: PASSED

- Created files present under `src/llm/`, `schemas/prompt-*-result.schema.json`, `prompts/*.md`, tests
- Commits f90f6c5, 8aa3622, 3f7153a on main
- `npm test` green offline
