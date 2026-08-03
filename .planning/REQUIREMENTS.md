# Requirements: gsd-graph

**Defined:** 2026-08-02  
**Core Value:** Relationship answers with citations beat keyword dumps — offline multi-hop over triples.

## v1 Requirements

### Package & identity

- [x] **PKG-01**: Installable npm package `@opengsd/gsd-graph` builds on Node ≥22 with CJS + type declarations
- [x] **PKG-02**: README and package description present as Graph Engineering toolkit; no gsd-core runtime dependency
- [ ] **PKG-03**: CLI binary `gsd-graph` is published and invokable after install

### Ontology

- [x] **ONT-01**: Load and validate the `general` ontology pack with closed type/predicate allowlists
- [x] **ONT-02**: Unknown type/predicate policy matrix supports `review` | `coerce` | `drop` (default `review` = no write)
- [x] **ONT-03**: Ontology packs are replace-only in v0.1 (no extends merge)

### Store & IO

- [x] **STORE-01**: Default store directory is `.gsd-graph/` (overridable via `--dir` / config)
- [x] **STORE-02**: Canonical SoT is `graph.v1.json`; optional `graph.json` is disposable projection only
- [x] **STORE-03**: Publish uses dual-write protocol with atomic rename; native query never reads projection as SoT
- [x] **STORE-04**: Concurrent builds are serialized via `.build.lock`
- [x] **STORE-05**: All store paths are realpath-confined under the store root

### Extract & normalize

- [x] **EXT-01**: Deterministic Markdown/text extract (links, headings, explicit edge lines)
- [x] **EXT-02**: JSON/JSONL structured extract maps fields to EXTRACTED triples
- [x] **EXT-03**: Source fingerprints support incremental rebuild
- [x] **NORM-01**: Multiset provenance per triple with per-entry confidence; triple confidence = best_tier(entries)
- [x] **NORM-02**: Auto-merge only exact same-type id/alias; `same_as` is advisory until review
- [x] **REV-01**: Review queue items have stable ids and accept/reject effects that mutate graph/ontology only on accept

### Query & ground

- [x] **QRY-01**: Query IR supports term seed-expand, path, neighborhood, and filter
- [x] **QRY-02**: Confidence budget filtering uses tier ranks consistently
- [ ] **PACK-01**: `packSubgraph` is composition of public query ops (documented algorithm)
- [ ] **ANS-01**: Deterministic answer renders markdown with triple citations from pack only
- [ ] **ANS-02**: Empty pack produces abstain (no fabricated relationships)

### Maintain & lifecycle

- [ ] **MNT-01**: Incremental maintain invalidates provenance correctly (M1–M5 matrix)
- [ ] **SNAP-01**: Snapshot save/list/restore of graph.v1
- [ ] **DIFF-01**: Diff current graph vs snapshot / last-diff-base (± nodes & triples by id)
- [ ] **REP-01**: Repair regenerates projection from v1 without inventing triples
- [x] **STAT-01**: Status reports node/triple counts, engine identity, freshness signals

### CLI & agent contract

- [ ] **CLI-01**: Commands: init, build, query, path, status, diff, snapshot, review, repair, ontology, pack, answer
- [ ] **CLI-02**: Machine contract: JSON on stdout; human diagnostics on stderr; exit 0/1/2/3
- [ ] **CLI-03**: `init` appends store dir to `.gitignore` when a gitignore exists

### Quality gates

- [ ] **GOLD-01**: Golden G0 (abstain on unstructured free prose offline)
- [ ] **GOLD-02**: Golden G1+ multi-hop on link/JSONL structured fixtures with path assertions
- [ ] **GOLD-03**: 0.1.0 release only after goldens + M1–M5 + core CLI green

### Optional for 0.1 tag (non-blocking)

- [ ] **LLM-01**: Optional LLM providers (`prompt` | `http`) for extract/normalize/answer with fail-closed schema
- [ ] **MCP-01**: Optional MCP tools for status/query/pack/answer; build/review-write off by default
- [ ] **RPT-01**: Minimal GRAPH_REPORT.md writer
- [ ] **ONT-04**: Example research and engineering ontology packs

## v2 Requirements

- **COM-01**: Community detection (label propagation) and community/theme reports
- **QRY-03**: NL → Query IR
- **EXP-01**: Optional Neo4j / Cypher export
- **ONT-05**: Pack extends / inheritance

## Out of Scope

| Feature | Reason |
|---------|--------|
| Required Neo4j / embedding SaaS | Local-first file store is the product |
| gsd-core capability / graphify migration | Publisher only; not product scope |
| Full code AST symbol graph | Different product boundary |
| Hosted multi-tenant service | Not v1 |
| Fine-tuning models | Out of scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 1 | Complete |
| PKG-02 | Phase 1 | Complete |
| PKG-03 | Phase 4 | Pending |
| ONT-01 | Phase 1 | Complete |
| ONT-02 | Phase 1 | Complete |
| ONT-03 | Phase 1 | Complete |
| STORE-01 | Phase 1 | Complete |
| STORE-02 | Phase 1 | Complete |
| STORE-03 | Phase 1 | Complete |
| STORE-04 | Phase 1 | Complete |
| STORE-05 | Phase 1 | Complete |
| EXT-01 | Phase 2 | Complete |
| EXT-02 | Phase 2 | Complete |
| EXT-03 | Phase 2 | Complete |
| NORM-01 | Phase 2 | Complete |
| NORM-02 | Phase 2 | Complete |
| REV-01 | Phase 2 | Complete |
| STAT-01 | Phase 2 | Complete |
| QRY-01 | Phase 3 | Complete |
| QRY-02 | Phase 3 | Complete |
| MNT-01 | Phase 3 | Pending |
| SNAP-01 | Phase 3 | Pending |
| DIFF-01 | Phase 3 | Pending |
| REP-01 | Phase 3 | Pending |
| CLI-01 | Phase 4 | Pending |
| CLI-02 | Phase 4 | Pending |
| CLI-03 | Phase 4 | Pending |
| PACK-01 | Phase 5 | Pending |
| ANS-01 | Phase 5 | Pending |
| ANS-02 | Phase 5 | Pending |
| GOLD-01 | Phase 5 | Pending |
| GOLD-02 | Phase 5 | Pending |
| GOLD-03 | Phase 5 | Pending |
| LLM-01 | Phase 6 | Pending |
| MCP-01 | Phase 6 | Pending |
| RPT-01 | Phase 6 | Pending |
| ONT-04 | Phase 6 | Pending |
| COM-01 | Phase 7 | Pending |

---
*Requirements defined: 2026-08-02 after research synthesis*
*Traceability updated: 2026-08-02 with roadmap phases*
