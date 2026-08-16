# gsd-graph

## What This Is

**gsd-graph** (`@opengsd/gsd-graph`) is a standalone Graph Engineering toolkit: TypeScript library, CLI, and optional MCP server that turns document corpora into a queryable knowledge graph of **relationships** (triples with provenance and confidence), then answers multi-hop questions from retrieved subgraphs with citations—not free-form text-chunk RAG. Shipped through 0.2.0, it also detects corpus-level communities and generates theme reports as a global-search complement to local multi-hop query.

OpenGSD is the **publisher namespace only**. This product has zero runtime dependency on gsd-core, GSD workflows, or `.planning/` host integration.

## Core Value

**Relationship answers with citations beat keyword dumps** — multi-hop path/pack over triples works offline without an LLM.

## Requirements

### Validated

- ✓ Complete Graph Engineering pipeline: extract → normalize → store → query → ground → maintain — v0.1.0
- ✓ File-first store under `.gsd-graph/` (`graph.v1.json` SoT) — v0.1.0
- ✓ Domain-configurable ontology packs (closed allowlist within pack; general default) — v0.1.0
- ✓ Deterministic Markdown/JSONL extract + multiset provenance + review queue — v0.1.0
- ✓ Multi-hop query IR (term / path / neighborhood / filter) and packSubgraph composition — v0.1.0
- ✓ Deterministic grounded answer with triple citations; optional LLM stages — v0.1.0
- ✓ CLI (`gsd-graph`) with machine-readable JSON contract — v0.1.0
- ✓ Optional MCP tools (read-path default; build/review-write off) — v0.1.0
- ✓ Golden scenarios proving offline multi-hop honesty (G0–G1, extendable) — v0.1.0
- ✓ Incremental maintenance (fingerprints, provenance invalidation, snapshots, diff) — v0.1.0
- ✓ Community detection (label propagation) and community/theme reports — v0.2.0

### Active

(None yet — define during next milestone's requirements phase)

### Out of Scope

- Required Neo4j / managed graph cloud / embedding SaaS — local-first file store is the product
- GSD Core capability / graphify migration as product scope — publisher only
- Full code AST / symbol-graph product — optional adapter later
- NL→graph-query (article Prompt 3) — structured CLI/MCP args instead; tracked as QRY-03 for a future milestone
- Hosted multi-tenant service
- Pack extends / inheritance — tracked as ONT-05 for a future milestone
- Neo4j / Cypher export — tracked as EXP-01 for a future milestone

## Context

- Shipped v0.1.0 → v0.2.0 in ~3 days (2026-08-02 → 2026-08-05), 7 phases, 25 plans, 61 tasks, 177 commits
- ~36,000 LOC TypeScript; 311/311 tests passing at v0.2.0
- Conceptual base: Graph Engineering (GraphRAG-style pipelines; Microsoft GraphRAG lineage)
- Design locks: K1–K26 (see `docs/DESIGN.md` ## Key Decisions)
- Target stack: TypeScript, Node ≥22, CJS+types first publish, pure-TS where possible
- Performance: laptop-local agent loops
- Known follow-ups (not yet scheduled): NL→graph-query (QRY-03), ontology pack inheritance (ONT-05), Neo4j/Cypher export (EXP-01)

## Constraints

- **Tech stack**: TypeScript / Node ≥22; no required Python graph DB for v1
- **Offline-first**: deterministic GA without API keys; LLM is `none` | `prompt` | `http`
- **Security**: realpath confinement under store dir; secret redaction on extract; caps on corpus size
- **Naming**: keep `@opengsd/gsd-graph` / CLI `gsd-graph` / `.gsd-graph/`; docs must not imply gsd-core runtime
- **Copyright**: source files use Jeremy McSpadden 2026 header per project conventions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Standalone product (not gsd-core subsystem) | User product pivot | ✓ Locked |
| File-first `.gsd-graph/` + graph.v1.json SoT | Local-first, zero ops | ✓ Locked |
| Ontology packs replace-only in v0.1 | Avoid merge complexity | ✓ Locked |
| Offline multi-hop goldens use link/JSONL structure | Deterministic honesty | ✓ Locked |
| packSubgraph = composition of public query ops | Testable multi-hop | ✓ Locked |
| Review default for unknown types/predicates | Zero-shot schema unreliable | ✓ Locked |
| Communities are disposable sidecars, never SoT | Keep graph.v1 the single source of truth | ✓ Locked |
| Label propagation (pure-TS) over external clustering libs | Deterministic, offline, no new runtime deps | ✓ Locked |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-08-16 after v0.2.0 milestone*
