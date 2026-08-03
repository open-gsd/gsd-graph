# Phase 2: Build pipeline — Context

**Phase:** 02  
**Goal:** Users can build a durable graph.v1 from Markdown and JSONL with review gates and honest status  
**Requirements:** EXT-01, EXT-02, EXT-03, NORM-01, NORM-02, REV-01, STAT-01  
**Depends on:** Phase 1 (complete) — package, ontology pack loader, store IO primitives  

## Decisions

Locked (non-negotiable):

- **D-01** Offline deterministic extract only in this phase — no LLM extract provider (LLM is Phase 6)
- **D-02** Markdown/text: links (wiki-style + markdown), headings, explicit edge lines → EXTRACTED triples/nodes (EXT-01)
- **D-03** JSON/JSONL field-map adapter → EXTRACTED triples for multi-hop fixtures (EXT-02)
- **D-04** Source fingerprints (`content_hash` / path) for incremental rebuild identity (EXT-03) — full M1–M5 maintain is Phase 3; Phase 2 stores fingerprints and uses them on rebuild
- **D-05** Multiset provenance per triple; per-entry confidence; triple confidence = `best_tier(entries)` (NORM-01, K6/K9)
- **D-06** Auto-merge exact same-type id/alias only; `same_as` advisory until review accept (NORM-02, K23)
- **D-07** Unknown type/predicate via existing Phase 1 policy matrix (`review` default → review queue item, no write) (ONT-02)
- **D-08** Review queue: stable `rv_*` ids; accept/reject mutate graph or ontology only on accept (REV-01)
- **D-09** Build path uses Phase 1 `acquireBuildLock` + `publishGraphFiles` + `loadGraphV1`; never treat projection as SoT
- **D-10** Status / `.last-build-status.json` after offline build: node/triple counts, engine identity, freshness (STAT-01)
- **D-11** Copyright header on all source files (Jeremy McSpadden 2026)
- **D-12** Tests: `node:test` + c8; golden fixture seeds for structured MD/JSONL under `tests/fixtures/`

## Claude's Discretion

- Exact edge-line grammar for MD (e.g. `[[A]] --related_to--> [[B]]` vs definition lists) — must be documented and tested
- Fingerprint algorithm (sha256 of file bytes recommended)
- Whether `build()` is one public library function or pipeline stages called separately (recommend both: stages + orchestrating `build`)
- Review-queue file format details as long as schema + accept/reject effects match DESIGN
- Size caps / secret redaction minimal implementation for extract (paths that look like secrets)

## Deferred Ideas (OUT OF SCOPE for Phase 2)

- Full Query IR (path/neighborhood/filter) — Phase 3
- packSubgraph / answer — Phase 5
- CLI `gsd-graph` binary surface — Phase 4 (library APIs only here; optional thin test harness OK)
- Incremental maintain M1–M5 full matrix — Phase 3 (fingerprints yes; full invalidation lifecycle later)
- LLM providers — Phase 6
- MCP — Phase 6
- Communities — Phase 7
- NL→IR

## Phase 1 surface to reuse

- `loadOntologyPack`, `applyUnknownPolicy`
- `resolveStoreRoot`, `acquireBuildLock`, `publishGraphFiles`, `loadGraphV1`
- `validateGraphV1`, `GSD_GRAPH_REASON`, schemas

## Success criteria (from ROADMAP)

1. Deterministic MD/text extract; JSON/JSONL field map  
2. Fingerprints + multiset provenance + best_tier  
3. Exact same-type merge only; same_as advisory  
4. Review queue accept/reject only mutates on accept  
5. Status after offline build  

## Research fold-in

- `.planning/research/PITFALLS.md` — free-prose honesty, false-merge, ontology drift  
- `.planning/research/ARCHITECTURE.md` — pipeline layering  
- `docs/DESIGN.md` — pipeline stages, review queue schema, provenance model  
