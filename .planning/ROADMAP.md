# Roadmap: gsd-graph

## Overview

Ship `@opengsd/gsd-graph` as a standalone Graph Engineering toolkit: bootstrap a safe file store and ontology contract, build a durable graph from MD/JSONL, query and maintain it offline, expose a machine-readable CLI, then prove multi-hop honesty with pack/answer goldens at **0.1.0**. Optional LLM/MCP/example packs ride after the critical path; community themes land in **0.2.0**.

## Phases

**Phase Numbering:**

- Integer phases (1–7): Planned milestone work
- Decimal phases (e.g. 2.1): Urgent insertions (marked with INSERTED)

Critical path to **0.1.0**: Phases 1–5. Phase 6 is optional for the tag. Phase 7 is **0.2.0**.

- [x] **Phase 1: Foundation & identity** - Installable package, ontology contract, crash-safe store IO
- [x] **Phase 2: Build pipeline** - Extract → normalize → review → publish graph.v1
- [x] **Phase 3: Query, lifecycle & maintain** - Query IR, snapshots/diff/repair, incremental M1–M5
- [x] **Phase 4: CLI surface** - `gsd-graph` machine contract over library ops
- [ ] **Phase 5: Ground & prove 0.1.0** - packSubgraph, cited answers, G0–G4 goldens, release tag
- [ ] **Phase 6: Optional agents** - LLM providers, MCP read tools, example packs, minimal report
- [ ] **Phase 7: Global themes 0.2** - Community detection and theme reports

## Phase Details

### Phase 1: Foundation & identity

**Goal**: Developers can install the package and rely on a validated ontology + crash-safe store foundation
**Depends on**: Nothing (first phase)
**Requirements**: PKG-01, PKG-02, ONT-01, ONT-02, ONT-03, STORE-01, STORE-02, STORE-03, STORE-04, STORE-05
**Success Criteria** (what must be TRUE):

  1. `@opengsd/gsd-graph` builds on Node ≥22 to CJS + `.d.ts` and documents itself as a Graph Engineering toolkit with zero gsd-core runtime dependency
  2. The `general` ontology pack loads with closed type/predicate allowlists, replace-only semantics, and a `review|coerce|drop` policy matrix (default `review` writes nothing)
  3. Store paths resolve under `.gsd-graph/` (overridable), are realpath-confined, and concurrent builds serialize via `.build.lock`
  4. Dual-write publish primitives rename `graph.v1.json` first; projection `graph.json` is never treated as SoT

**Plans:** 3/3 plans executed

Plans:

- [x] 01-01-PLAN.md — Package bootstrap: CJS+types identity, README, CI, reason codes (PKG-01, PKG-02)
- [x] 01-02-PLAN.md — Schemas, general ontology pack, Ajv validators, policy matrix (ONT-01..03)
- [x] 01-03-PLAN.md — Store paths, realpath confinement, .build.lock, dual-write publish (STORE-01..05)

### Phase 2: Build pipeline

**Goal**: Users can build a durable graph.v1 from Markdown and JSONL with review gates and honest status
**Depends on**: Phase 1
**Requirements**: EXT-01, EXT-02, EXT-03, NORM-01, NORM-02, REV-01, STAT-01
**Success Criteria** (what must be TRUE):

  1. Deterministic MD/text extract captures links, headings, and explicit edge lines; JSON/JSONL maps fields to EXTRACTED triples
  2. Source fingerprints support incremental rebuild; normalize writes multiset provenance with triple confidence = best_tier
  3. Auto-merge is exact same-type id/alias only; `same_as` stays advisory until review accept
  4. Review queue items have stable ids; accept/reject mutate graph or ontology only on accept
  5. Status reports node/triple counts, engine identity, and freshness after a successful offline build

**Plans:** 4/4 plans executed

Plans:

- [x] 02-01-PLAN.md — Fingerprints, discover, MD/text extract, corpus fixtures (EXT-01, EXT-03)
- [x] 02-02-PLAN.md — JSON/JSONL field-map extract + extract router (EXT-02)
- [x] 02-03-PLAN.md — Normalize best_tier/exact merge + review queue accept/reject (NORM-01, NORM-02, REV-01)
- [x] 02-04-PLAN.md — build() orchestrator + incremental fingerprints + status (STAT-01, EXT-03 wire)

### Phase 3: Query, lifecycle & maintain

**Goal**: Users can multi-hop query a published graph and keep it correct across edits
**Depends on**: Phase 2
**Requirements**: QRY-01, QRY-02, MNT-01, SNAP-01, DIFF-01, REP-01
**Success Criteria** (what must be TRUE):

  1. Query IR supports term seed-expand, path, neighborhood, and filter with consistent confidence-budget tier ranks
  2. Incremental maintain invalidates multiset provenance correctly against the M1–M5 matrix
  3. Snapshot save/list/restore round-trips `graph.v1`; diff reports ± nodes and triples by id vs snapshot or last-diff-base
  4. Repair regenerates projection from v1 only and invents no triples

**Plans:** 4/4 plans executed

Plans:

- [x] 03-01-PLAN.md — Query IR (term/path/neighborhood/filter) + budget ranks (QRY-01, QRY-02)
- [x] 03-02-PLAN.md — Maintain invalidateProvenance + M1–M5 + build({full:false}) fix (MNT-01)
- [x] 03-03-PLAN.md — Snapshot save/list/restore under snapshots/ (SNAP-01)
- [x] 03-04-PLAN.md — Diff ± by id + repair projection from v1 (DIFF-01, REP-01)

### Phase 4: CLI surface

**Goal**: Agents and operators can drive the full library surface through a stable `gsd-graph` JSON contract
**Depends on**: Phase 3
**Requirements**: PKG-03, CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):

  1. After install, `gsd-graph` is on PATH and exposes init, build, query, path, status, diff, snapshot, review, repair, ontology (pack/answer land in Phase 5)
  2. Successful commands emit JSON on stdout; human diagnostics go to stderr; exits use 0/1/2/3 per the machine contract
  3. `init` creates the store layout and appends the store dir to `.gitignore` when a gitignore exists
  4. Happy path init → build → query → path returns structured JSON without a TTY

**Plans:** 3/3 plans executed

Plans:

- [x] 04-01-PLAN.md — Bin publish + K22 CLI skeleton + library/CLI init (PKG-03, CLI-02, CLI-03)
- [x] 04-02-PLAN.md — Wire build/query/path/status/diff/snapshot/review/repair/ontology (CLI-01)
- [x] 04-03-PLAN.md — E2E spawn happy path + exit 0/1/2/3 matrix (PKG-03, CLI-01..03)

### Phase 5: Ground & prove 0.1.0

**Goal**: Users get relationship answers with triple citations, proven offline by goldens, and the package ships as 0.1.0
**Depends on**: Phase 4
**Requirements**: PACK-01, ANS-01, ANS-02, GOLD-01, GOLD-02, GOLD-03
**Success Criteria** (what must be TRUE):

  1. `packSubgraph` is a documented composition of public query ops; CLI pack/answer are available
  2. Deterministic answer renders markdown whose citations are ⊆ pack triples; empty pack abstains with no fabricated relationships
  3. Golden G0 abstains on unstructured free prose offline (no API keys)
  4. Golden G1+ multi-hop path assertions pass on link/JSONL structured fixtures
  5. Version 0.1.0 is releasable only when goldens, M1–M5, and core CLI are green

**Plans:** 4 plans

Plans:

- [ ] 05-01-PLAN.md — packSubgraph public-query composition + types + pack tests (PACK-01)
- [ ] 05-02-PLAN.md — deterministic answer() + empty abstain (ANS-01, ANS-02)
- [ ] 05-03-PLAN.md — CLI pack/answer + flip Phase 4 unregistered tests (D-06)
- [ ] 05-04-PLAN.md — Golden G0/G1(+G2) + CHANGELOG 0.1.0 release gate (GOLD-01..03)

### Phase 6: Optional agents

**Goal**: Optional LLM assist, MCP read tools, example packs, and minimal report improve agent hosts without blocking 0.1
**Depends on**: Phase 5 (MCP/LLM after pack/answer); ONT-04 depends on Phase 1 only
**Requirements**: LLM-01, MCP-01, RPT-01, ONT-04
**Success Criteria** (what must be TRUE):

  1. Optional LLM providers (`prompt` | `http`) for extract/normalize/answer fail closed on schema; no ambient network/LLM by default
  2. Optional MCP tools expose status/query/pack/answer; build and review-write are off by default
  3. Example research and engineering ontology packs load as replace-only packs with docs for domain use
  4. Minimal GRAPH_REPORT.md writer emits counts and top predicates from published v1

**Plans**: TBD

### Phase 7: Global themes 0.2

**Goal**: Users can discover corpus-level themes via community detection (v0.2.0)
**Depends on**: Phase 2 store (post-0.1.0)
**Requirements**: COM-01
**Success Criteria** (what must be TRUE):

  1. Pure-TS label-propagation communities produce artifacts under the store without becoming SoT
  2. Community/theme reports summarize clusters; LLM prose for reports is opt-in only
  3. Package version can ship as 0.2.0 with communities documented as the global-search differentiator

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7  
(Phase 6 may ship partially in 0.1.x without blocking Phase 5 tag.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & identity | 3/3 | Complete | 2026-08-02 |
| 2. Build pipeline | 4/4 | Complete |  |
| 3. Query, lifecycle & maintain | 4/4 | Complete | 2026-08-03 |
| 4. CLI surface | 3/3 | Complete | 2026-08-03 |
| 5. Ground & prove 0.1.0 | 0/4 | Planned | - |
| 6. Optional agents | 0/TBD | Not started | - |
| 7. Global themes 0.2 | 0/TBD | Not started | - |

## Coverage

| Requirement | Phase |
|-------------|-------|
| PKG-01 | 1 |
| PKG-02 | 1 |
| PKG-03 | 4 |
| ONT-01 | 1 |
| ONT-02 | 1 |
| ONT-03 | 1 |
| STORE-01 | 1 |
| STORE-02 | 1 |
| STORE-03 | 1 |
| STORE-04 | 1 |
| STORE-05 | 1 |
| EXT-01 | 2 |
| EXT-02 | 2 |
| EXT-03 | 2 |
| NORM-01 | 2 |
| NORM-02 | 2 |
| REV-01 | 2 |
| STAT-01 | 2 |
| QRY-01 | 3 |
| QRY-02 | 3 |
| MNT-01 | 3 |
| SNAP-01 | 3 |
| DIFF-01 | 3 |
| REP-01 | 3 |
| CLI-01 | 4 |
| CLI-02 | 4 |
| CLI-03 | 4 |
| PACK-01 | 5 |
| ANS-01 | 5 |
| ANS-02 | 5 |
| GOLD-01 | 5 |
| GOLD-02 | 5 |
| GOLD-03 | 5 |
| LLM-01 | 6 |
| MCP-01 | 6 |
| RPT-01 | 6 |
| ONT-04 | 6 |
| COM-01 | 7 |

**v1 mapped:** 37/37 ✓  
**v2 mapped:** COM-01 → Phase 7 (0.2.0)

## Research Flags

Phases likely needing `/gsd-plan-phase --research-phase`:

- **Phase 3** — M1–M5 incremental invalidation edge cases
- **Phase 5** — pack seeding/budget order under adversarial fixtures; G1/G3 assertions
- **Phase 6** — prompt injection containment; MCP host path policy
- **Phase 7** — label-propagation params and report schema (post-0.1)

Standard patterns (skip deep research-phase): Phases 1, 2 extract, 4 CLI.

---
*Roadmap created: 2026-08-02*
*Granularity: standard · 7 phases from research SUMMARY*
