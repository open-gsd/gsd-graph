# Phase 1: Foundation & identity — Context

**Phase:** 01  
**Goal:** Developers can install the package and rely on a validated ontology + crash-safe store foundation  
**Requirements:** PKG-01, PKG-02, ONT-01, ONT-02, ONT-03, STORE-01, STORE-02, STORE-03, STORE-04, STORE-05  
**Source:** docs/DESIGN.md Key Decisions + research SUMMARY.md

## Decisions

Locked (non-negotiable):

- **D-01** Standalone Graph Engineering product — zero gsd-core runtime dependency (K1, K15, K18)
- **D-02** Package name `@opengsd/gsd-graph`, CLI `gsd-graph`, store default `.gsd-graph/` (K18)
- **D-03** Language: TypeScript → CJS + `.d.ts`, Node ≥22 (K16, STACK research)
- **D-04** File-first SoT `graph.v1.json`; optional `graph.json` projection never read as SoT by native APIs (K3, K4, K17)
- **D-05** Ontology packs: closed allowlist within pack; replace-only in v0.1; `unknown_*_policy` matrix `review|coerce|drop`, default `review` (K5, K9, K19)
- **D-06** Dual-write publish with atomic rename; `.build.lock` for concurrency (K11, K17)
- **D-07** realpath confinement of all store I/O under store root (STORE-05)
- **D-08** Copyright header on source files: Jeremy McSpadden 2026
- **D-09** Schema validation: Ajv + checked-in JSON Schema as authority for graph.v1 / ontology (STACK)
- **D-10** Tests: `node:test` + c8 (STACK)

## Claude's Discretion

- Exact package.json scripts and CI provider (GitHub Actions recommended)
- Whether dual ESM is free to add alongside CJS (default: CJS-only if dual costs)
- Exact file layout under `src/io` and `src/ontology` as long as public contracts match DESIGN
- Lock file format details (PID/stale heuristics) as long as exclusive and tested
- Whether `store.write_projection` defaults true or false in v0.1 config (prefer false until a viewer needs it, or true with docs that projection is disposable)

## Deferred Ideas (OUT OF SCOPE for Phase 1)

- Extract, normalize, query, pack, answer, maintain pipelines
- CLI command surface beyond what bootstrap needs for unit tests
- LLM / MCP
- Communities
- Example domain packs beyond `general`
- NL→IR

## Research Fold-In

Use project research:
- `.planning/research/STACK.md` — stack choices
- `.planning/research/ARCHITECTURE.md` — module layout
- `.planning/research/PITFALLS.md` — dual-write, path traversal, naming

## Phase Success Criteria (from ROADMAP)

1. Package builds CJS+types; GE toolkit docs; no gsd-core dep  
2. general pack + policy matrix  
3. realpath + lock under `.gsd-graph/`  
4. Dual-write v1-first rename  
