# Feature Landscape

**Domain:** Graph Engineering / GraphRAG local tooling (CLI + library + optional MCP)
**Project:** `@opengsd/gsd-graph` (`gsd-graph`)
**Researched:** 2026-08-02
**Overall confidence:** HIGH (product surface locked in `docs/DESIGN.md` K1–K26 + PR-01..PR-17; ecosystem comparison vs Microsoft GraphRAG)

## Scope reminder

This product is a **standalone** Graph Engineering toolkit. OpenGSD is publisher namespace only. Features that imply gsd-core runtime, `.planning/` host layout, required cloud graph DBs, or full code AST graphs are **out of product scope** (see `PROJECT.md` Out of Scope).

---

## Table Stakes

Features users expect from a graph-engineering CLI/library. Missing any of these and the product feels incomplete relative to “build a local knowledge graph and ask multi-hop questions.”

| Feature | Why Expected | Complexity | v0.1 | Notes |
|---------|--------------|------------|------|-------|
| **Init / project bootstrap** | Every local toolkit needs a one-command store + config | Low | **Must** | `gsd-graph init`; writes `.gsd-graph/`; gitignore append (K26) |
| **Corpus build (extract → normalize → store)** | Core pipeline; without build there is no graph | High | **Must** | Full + incremental; dual-write publish; lock |
| **Deterministic extractors (MD/text)** | Offline honesty; no API key to get *a* graph | Med | **Must** | Wiki-links, edge lines, headings; free prose = weak only (K24) |
| **Structured JSON/JSONL extract** | Reproducible multi-hop fixtures and agent-written edges | Low | **Must** | Preferred path for G1 goldens |
| **Canonical triple store** | S–P–O with ids is the knowledge model | Med | **Must** | `graph.v1.json` SoT; projection disposable |
| **Ontology / schema constraint** | Unbounded predicates = unusable graph | Med | **Must** | Packs + lockfile; closed allowlist within pack |
| **Query: term / neighborhood** | “What do we know about X?” local retrieval | Med | **Must** | Seed+expand with hop budget |
| **Query: path** | Multi-hop “how does A connect to B?” | Med | **Must** | Typed path, max depth |
| **Query: filter** | Enumerate by type/predicate/confidence | Low | **Must** | Structured fields only — not NL |
| **Pack / subgraph retrieve** | Ground answers in a bounded subgraph | Med | **Must** | Composition of public query ops (K21) |
| **Answer with citations** | Differentiator vs keyword dump; table-stakes for “grounded” | Med | **Must** | Deterministic default; abstain when empty |
| **Status** | Operators/agents need “is store healthy?” | Low | **Must** | Counts, stale, lock, review queue length |
| **Maintenance / incremental rebuild** | Full re-ingest every edit does not scale | High | **Must** | Fingerprints + multiset provenance invalidation (M1–M5) |
| **Repair** | Crash / lagging projection is inevitable | Low | **Must** | Regenerate projection; validate SoT |
| **Machine-readable CLI contract** | Agents parse stdout; humans use stderr | Low | **Must** | JSON stdout; exit 0/1/2/3; reason codes (K22) |
| **Library API parity** | Embed without shelling out | Med | **Must** | Same ops as CLI core |
| **Build lock / crash-safe publish** | Concurrent writers corrupt SoT | Med | **Must** | `.build.lock` + atomic dual-write |
| **Golden offline scenarios** | Prove multi-hop honesty without LLM theater | Med | **Must** | G0–G4 release gate |

### Ecosystem baseline (why these are table stakes)

Microsoft GraphRAG’s default dataflow covers **extract → graph merge → (communities) → query/answer**, with provenance via TextUnits and a CLI index/query loop. Local toolkits that skip durable store, status, incremental maintain, or citation-bound answers feel like demos, not products. gsd-graph maps the same spine but **file-first, offline-first, deterministic-default** — communities and embeddings are *not* v0.1 table stakes here (deliberate product cut vs GraphRAG).

**Confidence:** HIGH for pipeline stages (GraphRAG docs + DESIGN); HIGH for CLI surface (DESIGN CLI section).

---

## Differentiators

Features that set gsd-graph apart from “another GraphRAG clone” or “chunk RAG with a graph label.” Not universally expected; highly valued for this product thesis.

| Feature | Value Proposition | Complexity | Target | Notes |
|---------|-------------------|------------|--------|-------|
| **Offline deterministic multi-hop** | Answer “why / how connected” with **no API keys** when corpus is link/JSONL structured | Med | **v0.1 core** | G1: path ≥3 nodes + typed predicate; G0 abstains on free prose |
| **Ontology packs (domain-configurable)** | Same engine for research, engineering, or custom domains without hard-coding verticals | Med | **v0.1 core** | `general` default; research/engineering examples; replace-only (K19) |
| **Review gates (schema + entity merge)** | Zero-shot schema/dedup is unreliable; humans stay in the loop | Med | **v0.1 core** | Strict default `review`; never silent lock expand (K9) |
| **Multiset provenance + best_tier confidence** | Correct incremental invalidation; citations survive partial source deletes | Med | **v0.1 core** | M1–M5 matrix; confidence derived, not free-form scores alone (K6) |
| **`packSubgraph` = public query composition** | Multi-hop pack is testable and non-gameable (not a private mega-function) | Med | **v0.1 core** | Seeds → expand → path among top seeds → budget (K21) |
| **Exact-only auto-merge + advisory `same_as`** | Avoid silent entity corruption common in fuzzy KG pipelines | Low | **v0.1 core** | Same-type exact id/alias only (K23) |
| **LLM as optional stage assist (`none`/`prompt`/`http`)** | Offline GA remains true; agents can still use prompt-file exchange | Med | **v0.1 optional** | Fail-closed schema; never ambient LLM (K7) |
| **Optional MCP with privileged ops off** | Durable agent access without footguns (build/review-write gated) | Med | **v0.1 optional / stabilize 0.2** | Read-path default (K14) |
| **Snapshot / diff by stable triple ids** | “What changed in the knowledge graph?” for CI and humans | Med | **v0.1 core** | vs last-diff-base or named snapshot (K25) |
| **Communities + theme reports** | Global “what are the themes?” questions | Med | **v0.2** | Pure-TS label propagation; not 0.1 gate (K12) |
| **Cypher/JSONL export; optional backends** | Interop with Neo4j viewers without requiring them at runtime | Med | **v0.3+** | Export only; file store remains SoT |

**Product thesis restated:** relationship answers with triple citations beat keyword dumps — and that must work **offline** on structured corpora.

**Confidence:** HIGH (locked differentiators K5–K9, K21, K23–K24).

---

## Anti-Features

Features to **explicitly not build** (or defer with hard fences). Building these in v0.1 creates rewrites, false marketing, or scope collapse into host products.

| Anti-Feature | Why Avoid | What to Do Instead | Horizon |
|--------------|-----------|--------------------|---------|
| **Required cloud / Neo4j / embedding SaaS** | Breaks local-first zero-ops v1; ops burden | File store `.gsd-graph/`; optional export later | Never required; export ≥0.3 |
| **Auto-merge fuzzy entities (Levenshtein/embedding link)** | Silent graph corruption; undebuggable merges | Exact same-type alias/id only; review queue for candidates | Fuzzy link optional post-0.1 research |
| **NL→Cypher or NL→QueryIR in v0.1 without structure** | Unreliable; hard to test; known design gap | Structured CLI/MCP Query IR args; agents compose ops | Post-0.1 (prompt `query.md` reserved) |
| **Ambient LLM extract/answer** | Offline honesty broken; cost/surprise | Explicit `--llm` / config `llm.mode`; default `none` | Keep opt-in forever |
| **Silent ontology lock expansion** | Schema drift; non-reproducible graphs | `review` policy; accept requires `--extend-ontology` | Forever |
| **gsd-core capability / graphify / `.planning/` coupling** | Product pivot: standalone toolkit | Publish as normal npm library consumers may wrap | Out of scope |
| **Full code AST / symbol-graph product** | Different product; huge surface | Optional adapter later if ever | Not v0.1–0.2 |
| **Hosted multi-tenant service** | Ops, tenancy, security model | Local CLI/lib/MCP only | Out of scope |
| **Community / global theme reports in 0.1.0** | Not needed for multi-hop path goldens; GraphRAG-sized scope | Ship path/pack first; communities in 0.2 | **v0.2** |
| **Pack composition / `extends` merge in v0.1** | Merge complexity and conflict rules | Replace-only packs; copy-to-customize | Post-0.1 if demanded |
| **Native query reading `graph.json` projection** | Projection lag → wrong answers | Always read `graph.v1.json` | Forever |
| **Competing feature-for-feature with RAG frameworks** | Chunk stores, hybrid rankers dilute relationship thesis | Stay graph/triple-centric | Forever for core |
| **Training / fine-tuning models** | Not a model lab | Prompt templates only | Out of scope |
| **MCP build + review-write on by default** | Agents rewrite graphs unintentionally | Opt-in flags | Forever default-off |

**Confidence:** HIGH (PROJECT.md Out of Scope + DESIGN Non-Goals + K decisions).

---

## Feature Dependencies (v0.1.0)

```text
                    ┌─────────────────────┐
                    │  Package bootstrap  │
                    │  (build/ts/ci)      │
                    └──────────┬──────────┘
               ┌───────────────┼───────────────┐
               ▼               ▼               │
        ┌────────────┐  ┌────────────┐         │
        │ Ontology   │  │ IO: paths  │         │
        │ packs+schema│  │ lock, dual │         │
        └──────┬─────┘  │ write      │         │
               │        └──────┬─────┘         │
               └───────┬───────┘               │
                       ▼                       │
               ┌───────────────┐               │
               │ Extract MD/txt│               │
               │ + fingerprints│               │
               └───────┬───────┘               │
                       │                       │
          ┌────────────┼────────────┐          │
          ▼            ▼            │          │
   ┌────────────┐ ┌──────────┐      │          │
   │ JSON/JSONL │ │ Normalize│      │          │
   │ extract    │ │ + review │      │          │
   └────────────┘ └────┬─────┘      │          │
                       ▼            │          │
               ┌───────────────┐    │          │
               │ Store publish │◄───┘          │
               │ + status      │               │
               └───┬───┬───┬───┘               │
                   │   │   │                   │
       ┌───────────┘   │   └──────────┐        │
       ▼               ▼              ▼        │
 ┌──────────┐   ┌──────────┐   ┌──────────┐    │
 │ Snapshot │   │ Query IR │   │ Maintain │    │
 │ diff     │   │ path/    │   │ increm.  │    │
 │ repair   │   │ filter   │   │          │    │
 └────┬─────┘   └────┬─────┘   └────┬─────┘    │
      │              │              │          │
      └──────────────┼──────────────┘          │
                     ▼                         │
              ┌────────────┐                   │
              │ CLI core   │◄──────────────────┘
              │ init/build │
              │ query/path │
              │ status/... │
              └──────┬─────┘
                     ▼
              ┌────────────┐     ┌────────────┐
              │ Pack +     │────►│ Golden G0– │
              │ Answer     │     │ G4 + 0.1.0 │
              └──────┬─────┘     └────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ LLM opt  │ │ MCP opt  │ │ Report   │
  │ prompt/  │ │ read path│ │ minimal  │
  │ http     │ │          │ │          │
  └──────────┘ └──────────┘ └──────────┘

  Example packs (research/engineering) ── depends only on Ontology
  Communities ── v0.2 after Store; not on 0.1 critical path
```

### Dependency rules (normative for roadmap)

| Consumer | Requires |
|----------|----------|
| Extract | Ontology pack load + IO path safety |
| Normalize / review | Extract candidates + ontology policy matrix |
| Store publish / status | Normalize + lock/dual-write |
| Query / pack / answer | Published `graph.v1.json` |
| Maintain incremental | Store + extract + provenance multiset semantics |
| CLI core | Query + maintain + snapshot/diff/review APIs |
| Pack/answer CLI | CLI core + query composition |
| Goldens G0–G4 | Normalize + maintain + CLI + pack/answer + minimal report |
| LLM providers | Extract + pack/answer (optional for tag) |
| MCP | CLI/library ops (optional for tag) |

---

## PR-01..PR-17 → Feature Groups (roadmap phases)

Opinionated grouping for roadmap creation. **Critical path to 0.1.0** is Groups A–F; **optional for 0.1 tag** is Group G; **post-0.1** is Group H.

### Group A — Foundation (ship skeleton)

| PR | Feature | Size |
|----|---------|------|
| **PR-01** | Package bootstrap, Node ≥22, copyright, CI | S |

**Phase intent:** Installable empty package; nothing graph-smart yet.

### Group B — Graph identity (schema + store mechanics)

| PR | Feature | Size |
|----|---------|------|
| **PR-02** | Schemas, ontology pack loader, general pack, policy matrix | M |
| **PR-03** | Paths, realpath confinement, build lock, atomic dual-write | M |

**Phase intent:** Can load a pack and safely write bytes; still no corpus intelligence.

**Parallelism:** PR-02 ∥ PR-03 after PR-01.

### Group C — Ingest & integrity (build the graph)

| PR | Feature | Size |
|----|---------|------|
| **PR-04** | Deterministic MD/text extract + golden fixture seed | M |
| **PR-05** | JSON/JSONL structured extract | S |
| **PR-06** | Normalize, multiset provenance, review queue accept/reject | M |
| **PR-07a** | `graph.v1` publish, status, last-build-status, caps | M |

**Phase intent:** End-to-end **build → durable store → status**. Exact-merge only; review gates live.

**Order:** PR-04 → PR-05; PR-04 → PR-06 → PR-07a (PR-03 required for 07a).

### Group D — Read path & maintain (query + lifecycle)

| PR | Feature | Size |
|----|---------|------|
| **PR-07b** | Snapshots, repair, diff vs baseline | M |
| **PR-08** | Query engine: seed-expand, budget, path, neighborhood, filter | M |
| **PR-09** | Incremental maintain: fingerprints + provenance invalidation (M1–M5) | M |
| **PR-13** | Minimal `GRAPH_REPORT.md` (counts + top predicates) | S |

**Phase intent:** Multi-hop **query** works offline; rebuilds are incremental; operators can diff/repair.

**Parallelism:** After PR-07a: PR-07b ∥ PR-08 ∥ PR-09 ∥ PR-13.

### Group E — Operator surface (CLI)

| PR | Feature | Size |
|----|---------|------|
| **PR-10** | CLI core: init, build, query, path, status, diff, snapshot, review, repair, ontology | M |

**Phase intent:** Full machine-contract CLI **without** pack/answer yet — agents can already explore the graph.

**Deps:** PR-08 + PR-09 + PR-07b.

### Group F — Grounding + release gate (product thesis)

| PR | Feature | Size |
|----|---------|------|
| **PR-11** | `packSubgraph` + deterministic `answer` + CLI pack/answer | M |
| **PR-17** | Golden scenarios G0–G4 + version **0.1.0** publish | M |

**Phase intent:** Prove **relationship answers with citations** offline; tag release.

**Deps:** PR-11 needs PR-08 + PR-10; PR-17 needs PR-06, PR-09, PR-10, PR-11, PR-13.

### Group G — Optional for 0.1.0 tag (do not block GA)

| PR | Feature | Size | Recommendation |
|----|---------|------|----------------|
| **PR-12** | LLM `prompt`/`http` providers + unified prompt apply | M | **Nice-to-have in 0.1**; ship if cheap after F; else early 0.1.x |
| **PR-14** | Optional MCP server (read default; build/review-write off) | M | **Prefer early 0.2 stabilize**; thin read MCP OK if PR-11 green |
| **PR-15** | Research + engineering example ontology packs + naming docs | S | **Ship when PR-02 stable**; not a release gate |

### Group H — Explicit v0.2+ (do not schedule in 0.1 critical path)

| PR | Feature | Size | Milestone |
|----|---------|------|-----------|
| **PR-16** | Communities (label propagation) + community reports | M | **0.2.0** |
| — | Richer GRAPH_REPORT, MCP polish | — | **0.2.0** |
| — | NL→QueryIR, HTTP LLM polish, Cypher export, embedding entity-link | — | **0.3.0+** |
| — | Optional SQLite/Neo4j backends, more packs | — | Later |

---

## Suggested roadmap phases (feature-centric)

| Phase | Name | Feature groups | Exit criteria |
|-------|------|----------------|---------------|
| **1** | Foundation & identity | A + B | Pack validates; dual-write protocol tested |
| **2** | Build pipeline | C | Deterministic build from MD+JSONL; review queue; `status` green |
| **3** | Query & maintain | D | Path/filter/budget tests; M1–M5; snapshot/diff/repair |
| **4** | CLI surface | E | K22 contract; init→build→query→path happy path |
| **5** | Ground & prove | F | G0–G4 pass offline; pack citations; **0.1.0** |
| **6** | Optional agents | G (slice) | Prompt apply and/or MCP read tools — only if not delaying tag |
| **7** | Global themes | H / PR-16 | Communities + reports → **0.2.0** |

**Phase ordering rationale:** Store and normalize before query; query before pack (pack is composition); CLI before goldens that shell the binary; communities after multi-hop is honest so v0.1 does not inherit GraphRAG’s heaviest stage.

---

## MVP Recommendation (v0.1.0)

### Prioritize (must ship)

1. **Init + file store + dual-write publish** — durable boundary  
2. **Ontology packs (general) + strict review policy** — controlled schema  
3. **Deterministic MD + JSONL extract** — offline corpus path  
4. **Normalize + multiset provenance + review accept/reject** — integrity  
5. **Query IR (term/path/neighborhood/filter) + budgets** — multi-hop read  
6. **Incremental maintain (fingerprints, M1–M5)** — edit loop  
7. **CLI machine contract (init/build/query/path/status/diff/snapshot/review/repair)** — agent UX  
8. **packSubgraph + deterministic answer + citations** — product thesis  
9. **Goldens G0–G4** — honesty bar  

### Include if capacity (should not slip release)

- Minimal GRAPH_REPORT (PR-13)  
- Example packs research/engineering (PR-15)  
- Prompt-mode LLM apply without requiring HTTP keys (subset of PR-12)

### Defer past 0.1.0 tag

| Feature | Why defer |
|---------|-----------|
| Communities / global theme reports | v0.2 by design; not needed for G1 multi-hop |
| MCP full surface | Optional; stabilize after CLI goldens |
| HTTP LLM extract quality chase | Free-prose multi-hop is post-0.1 quality work |
| NL→QueryIR | Known gap; structured args suffice for agents |
| Cypher export / Neo4j / embeddings | 0.3+ interop |
| Pack `extends` composition | Replace-only is enough for 0.1 |
| Fuzzy entity resolution | Explicit anti-feature until review UX is solid |

### v0.1 vs v0.2 opinion (hard cuts)

| Concern | v0.1.0 | v0.2.0 |
|---------|--------|--------|
| Multi-hop path/pack offline | **Required** | Keep |
| Communities / global reports | **No** | **Yes** |
| MCP | Optional thin read | Stabilized default story |
| LLM | Optional assist | Polish + better extract prompts |
| Ontology | Replace-only + general (+ examples) | Possibly composition if users demand |
| Success metric | G0–G4 green, no gsd-core dep | Theme questions + agent MCP durability |

---

## Feature → CLI / Library map (v0.1)

| User job | CLI | Library |
|----------|-----|---------|
| Start project | `init` | `init` |
| Build graph | `build` | `build` |
| Inspect health | `status` | `status` |
| Find by term | `query` | `query` |
| Connect A→B | `path` | `query({ path })` |
| Multi-hop pack | `pack` | `packSubgraph` |
| Cited answer | `answer` | `answer` |
| Review schema/merge | `review list\|accept\|reject` | `reviewList` / `reviewResolve` |
| See changes | `diff` | `diff` |
| Time travel | `snapshot *` | `snapshotSave/List/Restore` |
| Fix store | `repair` | `repair` |
| Ontology check | `ontology show\|validate` | pack load APIs |
| Apply LLM file result | `prompt apply` / flags | `promptApply` |

MCP (optional): `graph_status`, `graph_query`, `graph_pack`, `graph_answer`, `graph_review_list`; write tools off by default.

---

## Sources

| Source | Use | Confidence |
|--------|-----|------------|
| `docs/DESIGN.md` (Goals, article→feature map, CLI, PR-01..PR-17, K1–K26) | Primary product feature authority | HIGH |
| `.planning/PROJECT.md` (Active requirements, Out of Scope) | Scope fence | HIGH |
| [Microsoft GraphRAG dataflow](https://microsoft.github.io/graphrag/index/default_dataflow/) | Ecosystem table-stakes baseline (extract → graph → communities → embed → query) | HIGH |
| [Microsoft GraphRAG repo](https://github.com/microsoft/graphrag) | Positioning: LLM-heavy index vs local deterministic toolkit | MEDIUM–HIGH |

---

## Gaps / phase-specific research later

- Exact UX for review `--extend-ontology` in multi-user repos (file locking of lockfile already specified; workflow docs TBD).  
- Whether prompt-mode alone satisfies agent hosts without HTTP in 0.1 (implementation experiment in PR-12).  
- Community algorithm parameters (iteration/min-size) locked in design for 0.2 — re-validate against sample corpora before PR-16.  
- Export Cypher dialect target (Neo4j vs openCypher) deferred to 0.3 research.

---

*Feature landscape for roadmap input. Do not treat Group G/H items as 0.1 blockers.*
