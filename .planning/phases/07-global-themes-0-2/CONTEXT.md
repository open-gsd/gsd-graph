# Phase 7: Global themes 0.2 — Context

**Phase:** 07  
**Goal:** Users can discover corpus-level themes via community detection (v0.2.0)  
**Requirements:** COM-01  
**Depends on:** Phase 2+ store (graph.v1); Phase 5+ pack optional for global themes UX

## Decisions

Locked (non-negotiable):

- **D-01** Pure TypeScript **label propagation** only — no graphology/ngraph/native deps (K12, COM-01)
- **D-02** Algorithm params: max **20** iterations, min community size **3**
- **D-03** Undirected projection of edges with confidence EXTRACTED or INFERRED (exclude AMBIGUOUS by default)
- **D-04** Community artifacts under store `communities/` (e.g. `community-*.md` / JSON summary); **never** replace `graph.v1.json` as SoT
- **D-05** Deterministic community/theme reports by default; LLM prose opt-in only (reuse Phase 6 LLM modes if present, not required)
- **D-06** CLI surface: `gsd-graph communities` (or `community detect|report`) wiring library API; K22 JSON stdout
- **D-07** Package version bump to **0.2.0** with CHANGELOG entry documenting communities as global-search differentiator
- **D-08** Load graph only via `loadGraphV1`
- **D-09** Copyright headers on all new source
- **D-10** Tests: node:test; synthetic graph with known community structure; offline

## Claude's Discretion

- Exact label-propagation tie-breaking for determinism
- Whether to store communities array in graph.v1 optional field or only sidecar files (prefer sidecars + optional non-authoritative index; do not require graph schema bump if avoidable)
- Report markdown template details
- Whether pack/answer can optionally seed from community themes (nice-to-have, not required)

## Deferred Ideas (OUT OF SCOPE for Phase 7)

- NL→Query IR (QRY-03)
- Neo4j export (EXP-01)
- Pack extends (ONT-05)
- Louvain/Leiden algorithms
- Embedding-based clustering

## Reuse

- `loadGraphV1`, adjacency helpers from `query.ts` if exported
- `projectGraph` patterns
- CLI `main` / K22 / report writer patterns from Phase 6

## Success criteria (from ROADMAP)

1. Pure-TS LP communities; artifacts not SoT  
2. Theme reports summarize clusters; LLM prose opt-in only  
3. Package shippable as 0.2.0 with docs  

## Research fold-in

- DESIGN § Communities v0.2  
- STACK pure-TS decision vs graphology  
- Phase 3 query adjacency  
