# Phase 4 Plan Check — CLI surface

**Phase:** 04-cli-surface  
**Plans checked:** 04-01, 04-02, 04-03 (+ 04-VALIDATION.md, CONTEXT, RESEARCH)  
**Date:** 2026-08-03  
**Revision:** re-check after bin→`main()` fix  
**Verdict:** **PASS**

**Issues:** 0 blocker(s), 2 warning(s), 0 info

---

## VERIFICATION PASSED

**Plans verified:** 3  
**Status:** All blocking checks passed; prior bin wiring blocker closed

### Coverage Summary

| Requirement | Plans | Status |
|-------------|-------|--------|
| PKG-03 | 01, 03 | Covered |
| CLI-01 | 02, 03 | Covered (Phase 4 subset; pack/answer → Phase 5) |
| CLI-02 | 01, 03 | Covered |
| CLI-03 | 01, 03 | Covered |

### Goal-backward (ROADMAP success criteria)

| # | Criterion | Plans | Status |
|---|-----------|-------|--------|
| 1 | `gsd-graph` on PATH; init/build/query/path/status/diff/snapshot/review/repair/ontology | 01 bin+init, 02 commands, 03 spawn/identity | Covered |
| 2 | JSON stdout; stderr diagnostics; exit 0/1/2/3 (K22) | 01 mapper + 03 matrix | Covered |
| 3 | `init` store layout + gitignore append when `.gitignore` exists | 01 (CLI-03, D-05) | Covered |
| 4 | Happy path init → build → query → path JSON, no TTY | 03 spawnSync | Covered |

### Plan Summary

| Plan | Tasks | Files | Wave | depends_on | Status |
|------|-------|-------|------|------------|--------|
| 04-01 | 3 | 9 | 1 | [] | Valid |
| 04-02 | 2 | 2 | 2 | ["04-01"] | Valid |
| 04-03 | 2 | 2 | 3 | ["04-01","04-02"] | Valid |

---

## Prior blocker disposition

| Issue | Disposition |
|-------|-------------|
| bin `require('../dist/cli.js')` + `require.main === module` never called `main` under npm bin | **FIXED** in 04-01 |

**Verified wiring (04-01):**

- must_haves truth: shebang + always invokes `main(process.argv)` from `dist/cli.js`
- key_link: `const { main } = require('../dist/cli.js'); process.exitCode = main(process.argv)` — do not rely on `require.main` alone
- Task 1 action: exact bin contract; forbids bare require without calling `main`
- Optional `require.main === module` only for local `node dist/cli.js` debug
- Task 2 package-identity: assert bin source contains `main(process.argv)` (or destructure+call), not bare require alone
- 04-03 must_haves: published bin invokable via shebang wrapper that calls `main`
- 04-VALIDATION: PKG-03 expected includes “bin calls main(process.argv)”

---

## Locked decisions D-01..D-12

| ID | Decision | Coverage |
|----|----------|----------|
| D-01 | bin → `bin/gsd-graph.js` shebang | **Covered** — wrapper calls `main` |
| D-02 | Phase 4 verbs; pack/answer deferred | 02 + 03 exit 1 for pack/answer |
| D-03 | K22 exits 0/1/2/3 | 01 mapper + 03 matrix |
| D-04 | stderr `{ok:false,reason,message}` | 01 writeErrorJson + 03 asserts |
| D-05 | init layout + gitignore append iff exists | 01 init algorithm + tests |
| D-06 | thin adapter over library | 01/02; review uses `resolveStoreRoot` |
| D-07 | global `--dir`; build corpus | 01 program.option; 02 build flags |
| D-08 | no `--llm` | 02 “no --llm option” |
| D-09 | commander 14 + optional picocolors stderr | 01 pin `^14.0.3`, reject 15 |
| D-10 | copyright headers | 01/02/03 actions |
| D-11 | node:test main and/or spawn | 01 unit + 03 spawnSync |
| D-12 | happy path JSON exit 0 | 03-T1 |

### Explicit non-goals

- **pack / answer implementation:** unregistered; exit 1 only — OK (D-02).  
- MCP / LLM / communities — not in plans — OK.

### Commander 14 / K22 / init gitignore

- commander **`^14.0.3`**, identity reject 15.x — OK.  
- K22: GraphError→2, `build_locked`→3, usage→1 — OK.  
- init: `ensureStoreRoot` + append relative store with trailing `/` only when `.gitignore` exists; idempotent — OK.

---

## Dimension results

### 1. Requirement coverage — PASS

All phase requirement IDs in plan frontmatter with covering tasks. CLI-01 pack/answer full REQUIREMENTS text deferred to Phase 5 per ROADMAP SC1 / D-02 (not a gap).

### 2. Task completeness — PASS

All 7 tasks: files + action + verify (`<automated>`) + done.

### 3. Dependency correctness — PASS

01 → 02 → 03; acyclic; waves consistent.

### 4. Key links planned — PASS

| Link | Via | OK |
|------|-----|----|
| bin → dist/cli.js `main` | destructure + `process.exitCode = main(process.argv)` | YES |
| cli init → `init()` | thin adapter | YES |
| main catch → GraphError / CommanderError | exit 3 iff build_locked else 2; usage 1 | YES |
| build/query/path/… → library | 02 key_links | YES |
| spawnSync → bin | 03 | YES |
| lock plant → exit 3 | 03 | YES |

### 5. Scope sanity — PASS (warnings only)

| Plan | tasks | estimate tokens | smart-zone |
|------|-------|-----------------|------------|
| 01 | 3 | 55k | within budget (confidence low) |
| 02 | 2 | 60k | within budget (confidence low) |
| 03 | 2 | 45k | within budget (confidence low) |

### 6. Verification derivation — PASS

must_haves user/agent-observable; artifacts and key_links support SC1–4.

### 7. Context compliance — PASS

Locked decisions implemented; deferred pack/answer not built; nested commander discretion OK. No silent scope reduction.

### 7c. Architectural tier compliance — PASS

Matches RESEARCH map: CLI argv/K22; library init/build/query/…; pack/answer unregistered.

### 8. Nyquist compliance — PASS

- `04-VALIDATION.md` present  
- Every task has `<automated>`  
- Wave 0 absorbed into in-plan TDD  
- No watch-mode flags  
- Sampling continuous  

| Task | Plan | Wave | Automated | Status |
|------|------|------|-----------|--------|
| 01-01..03 | 01 | 1 | npm test patterns | ✅ |
| 02-01..02 | 02 | 2 | npm test patterns | ✅ |
| 03-01..02 | 03 | 3 | npm test patterns | ✅ |

### 9. Cross-plan data contracts — PASS

Shared store + JSON stdout; no conflicting transforms.

### 10. CLAUDE.md compliance — SKIPPED / N/A at repo root

User copyright convention reflected via D-10.

### 11. Research resolution — PASS

`## Open Questions — RESOLVED` with inline RESOLVED markers.

### 12. Pattern compliance — SKIPPED

No phase PATTERNS.md.

### Verify command format — PASS

No package-manager `grep ^` anchors; no swallowed-error compare traps.

---

## Warnings (non-blocking)

### 1. [scope_sanity] Plan 01 Task 1 is a large tracer

- Plan: 04-01 Task 1  
- Severity: warning  
- Description: Single task ships deps, package bin/files, bin, cli.ts, init.ts, types, index export, init tests (~8 files). Within plan task count; execution discipline recommended.  
- Fix: Optional split only if execute context pressure appears.

### 2. [scope_sanity] Estimate confidence low

- Plans: 01–03  
- Severity: warning  
- Description: `estimate.confidence: low` (uncalibrated). Figures still under smart-zone budget.  
- Fix: None pre-execution.

---

## Structured issues

```yaml
issues:
  - plan: "04-01"
    dimension: scope_sanity
    severity: warning
    description: "Task 1 touches ~8 files (heavy tracer)"
    task: 1
    fix_hint: "Optional split if execute burns context"
  - plan: null
    dimension: scope_sanity
    severity: warning
    description: "All plan estimates confidence=low (uncalibrated)"
    fix_hint: "Proceed; monitor execute context"
```

---

## Recommendation

**PASS.** Plans will achieve Phase 4 goal if executed as written.

Run `/gsd-execute-phase 4` to proceed.
