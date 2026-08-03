# Phase 5: Ground & prove 0.1.0 — Context

**Phase:** 05  
**Goal:** Users get relationship answers with triple citations, proven offline by goldens, and the package is releasable as 0.1.0  
**Requirements:** PACK-01, ANS-01, ANS-02, GOLD-01, GOLD-02, GOLD-03  
**Depends on:** Phases 1–4 complete (query IR, build, CLI without pack/answer)

## Decisions

Locked (non-negotiable):

- **D-01** `packSubgraph` is composition of **public** query ops only (K21) — no private graph walk that bypasses `query` (PACK-01)
- **D-02** Algorithm: tokenize question → score seeds (top 5) → seed_expand union → path among top seeds → applyBudget → citations from remaining triples (DESIGN § Grounded answer)
- **D-03** Deterministic `answer()` default: markdown Seeds / Relationships / Paths / Citations; citations ⊆ pack triples (ANS-01)
- **D-04** Empty pack → `abstained: true`, mode `abstain`, no fabricated relationships (ANS-02)
- **D-05** No LLM required for Phase 5 GA; optional LLM answer deferred to Phase 6
- **D-06** CLI registers `pack` and `answer` commands (K22 JSON) wiring library APIs
- **D-07** Golden G0: free-prose corpus offline → answer/pack abstains (or no typed multi-hop path) (GOLD-01)
- **D-08** Golden G1+: structured MD/JSONL with explicit chain (e.g. `causes`) → paths ≥1 with ≥3 nodes and required predicate (GOLD-02)
- **D-09** GOLD-03: suite green including M1–M5 (already Phase 3), core CLI, pack/answer goldens; package remains version `0.1.0` (already) with release notes / CHANGELOG readiness
- **D-10** loadGraphV1 only for pack/answer store reads
- **D-11** Copyright headers on all new source
- **D-12** Tests: node:test; fixtures under `tests/fixtures/golden/` and/or existing corpus

## Claude's Discretion

- Exact stopword list (must include DESIGN set)
- Whether pack accepts in-memory graph vs only on-disk store (prefer both: graph in opts or load from --dir)
- CHANGELOG.md format for 0.1.0
- G2–G4 if DESIGN mentions them — implement if cheap; G0–G1 are required

## Deferred Ideas (OUT OF SCOPE for Phase 5)

- LLM `prompt`/`http` answer apply — Phase 6  
- MCP tools — Phase 6  
- Communities — Phase 7  
- Example domain packs — Phase 6  
- GRAPH_REPORT — Phase 6  

## Library to reuse

- `query` (seed_expand, path, neighborhood, filter, applyBudget, confidenceRank)
- `build`, `loadGraphV1`, CLI `main`/commander structure

## Success criteria (from ROADMAP)

1. packSubgraph composition + CLI pack/answer  
2. Deterministic cited answer; empty abstains  
3. G0 free-prose abstain offline  
4. G1 multi-hop path assertions  
5. 0.1.0 releasable when goldens + M1–M5 + core CLI green  

## Research fold-in

- DESIGN K8, K21, G0–G4 tables  
- Existing fixtures: free-prose.md, multi-hop.jsonl, structured-edges.md  
- Phase 3 query API  
