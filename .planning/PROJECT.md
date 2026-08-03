# gsd-graph

## What This Is

**gsd-graph** (`@opengsd/gsd-graph`) is a standalone Graph Engineering toolkit: TypeScript library, CLI, and optional MCP server that turns document corpora into a queryable knowledge graph of **relationships** (triples with provenance and confidence), then answers multi-hop questions from retrieved subgraphs with citations—not free-form text-chunk RAG.

OpenGSD is the **publisher namespace only**. This product has zero runtime dependency on gsd-core, GSD workflows, or `.planning/` host integration.

## Core Value

**Relationship answers with citations beat keyword dumps** — multi-hop path/pack over triples works offline without an LLM.

## Requirements

### Validated

(None yet — greenfield)

### Active

- [ ] Complete Graph Engineering pipeline: extract → normalize → store → query → ground → maintain
- [ ] File-first store under `.gsd-graph/` (`graph.v1.json` SoT)
- [ ] Domain-configurable ontology packs (closed allowlist within pack; general default)
- [ ] Deterministic Markdown/JSONL extract + multiset provenance + review queue
- [ ] Multi-hop query IR (term / path / neighborhood / filter) and packSubgraph composition
- [ ] Deterministic grounded answer with triple citations; optional LLM stages
- [ ] CLI (`gsd-graph`) with machine-readable JSON contract
- [ ] Optional MCP tools (read-path default; build/review-write off)
- [ ] Golden scenarios proving offline multi-hop honesty (G0–G4)
- [ ] Incremental maintenance (fingerprints, provenance invalidation, snapshots, diff)

### Out of Scope

- Required Neo4j / managed graph cloud / embedding SaaS — local-first file store is the product
- GSD Core capability / graphify migration as product scope — publisher only
- Full code AST / symbol-graph product — optional adapter later
- NL→graph-query (article Prompt 3) in v0.1 — structured CLI/MCP args instead
- Community / global theme reports — v0.2 after 0.1.0
- Hosted multi-tenant service

## Context

- Greenfield repo: only `docs/DESIGN.md` (approved design, ~1200 lines)
- Conceptual base: Graph Engineering (GraphRAG-style pipelines; Microsoft GraphRAG lineage)
- Design locks: K1–K26 (see `docs/DESIGN.md` ## Key Decisions)
- Target stack: TypeScript, Node ≥22, CJS+types first publish, pure-TS where possible
- Performance: laptop-local agent loops

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

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-08-02 after initialization from docs/DESIGN.md*
