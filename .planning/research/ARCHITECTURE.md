# Architecture Patterns

**Domain:** Local-first Graph Engineering toolkit (GraphRAG-lite)
**Project:** gsd-graph (`@opengsd/gsd-graph`)
**Researched:** 2026-08-02
**Overall confidence:** HIGH for product shape (locked in DESIGN.md); HIGH for GraphRAG/MCP lineage (official docs); MEDIUM for ecosystem generalization beyond DESIGN.md

Confidence tags used below:

| Tag | Meaning |
|-----|---------|
| `[VERIFIED]` | Confirmed against official docs or locked DESIGN.md |
| `[CITED]` | Quoted/derived from a named source (with URL or path) |
| `[ASSUMED]` | Reasonable synthesis; not a hard product lock |

---

## Recommended Architecture

**gsd-graph is a single-process, library-first Graph Engineering pipeline** with optional thin surfaces (CLI, MCP stdio). The durable core is a file store under `.gsd-graph/`; there is no required server, graph DB, or embedding service in v1. `[VERIFIED]` from `docs/DESIGN.md`.

Map the product onto the industry Graph Engineering shape:

```
Extract → Normalize → Store → Query → Ground → Maintain
```

Microsoft GraphRAG realizes a heavier cousin of this pipeline (chunk → LLM extract → community detection → embeddings → local/global search). `[CITED]` https://microsoft.github.io/graphrag/index/default_dataflow/ and https://microsoft.github.io/graphrag/query/overview/

**gsd-graph is deliberately GraphRAG-lite:**

| GraphRAG (Microsoft) | gsd-graph v0.1 |
|----------------------|----------------|
| TextUnits + LLM entity/relationship extract | Deterministic Markdown/JSONL extract; LLM opt-in |
| Leiden communities + community reports | Deferred to v0.2 |
| Vector embeddings + local/global search | Structured Query IR (term/path/neighborhood/filter) |
| Parquet + vector store | `graph.v1.json` file SoT under `.gsd-graph/` |
| LLM answer from mixed context | Pack = query composition; deterministic answer default |

**Opinionated stance:** ship the relationship graph and provenance first; treat communities, embeddings, and NL→IR as progressive sophistication—not the critical path. `[ASSUMED]` product priority aligned with DESIGN non-goals.

### System diagram

```text
                    ┌─────────────────────────────────────────┐
                    │              Surfaces                    │
                    │  Library API  │  CLI  │  MCP (optional) │
                    └───────┬───────┴───┬───┴────────┬────────┘
                            │           │            │
                            ▼           ▼            ▼
                    ┌─────────────────────────────────────────┐
                    │         Public façade (index.ts)         │
                    │  init/build/query/pack/answer/review…   │
                    └───────────────────┬─────────────────────┘
                                        │
         ┌──────────────┬───────────────┼───────────────┬──────────────┐
         ▼              ▼               ▼               ▼              ▼
   ┌──────────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐
   │ sources/ │→ │ pipeline/ │→ │ ontology/  │  │ llm/     │  │ io/      │
   │ discover │  │ extract   │  │ load-pack  │  │ provider │  │ lock     │
   │ md/jsonl │  │ normalize │  │ types      │  │ budget   │  │ atomic   │
   │ fingerpr.│  │ store     │  │ migrate    │  │ prompts  │  │ safe-json│
   └──────────┘  │ query     │  └────────────┘  └──────────┘  └────┬─────┘
                 │ pack      │                                      │
                 │ answer    │                                      ▼
                 │ maintain  │                            ┌─────────────────┐
                 └─────┬─────┘                            │  .gsd-graph/    │
                       │                                  │  graph.v1.json  │
                       └─────────────────────────────────►│  review-queue   │
                                                          │  sources.manif. │
                                                          │  ontology.lock  │
                                                          └─────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Must not |
|-----------|----------------|-------------------|----------|
| **sources/** | Discover corpus files, parse MD/text/JSONL, content fingerprints | extract, maintain, io (path safety) | Write graph; call LLM; know Query IR |
| **pipeline/extract** | Emit candidate nodes/triples + diagnostics | sources, ontology (allowlist awareness), llm (opt-in) | Publish store; resolve review items |
| **pipeline/normalize** | Canonical ids, exact alias merge, dedup multiset provenance, unknown policy → review items | ontology, extract output, review-queue shape | Perform multi-hop query; call MCP |
| **pipeline/store** | Load/validate/publish graph.v1 + sidecars; dual-write protocol | io (lock, atomic), schemas | Own extractors; invent ontology |
| **pipeline/query** | Execute Query IR over in-memory adjacency; budget drop | store (read graph) | Mutate graph; render prose answers |
| **pipeline/pack** | Compose public query ops into SubgraphPack + citations | query only (K21) | Bypass query; call LLM |
| **pipeline/answer** | Deterministic render or optional LLM prose from pack | pack; llm (opt-in) | Expand graph beyond pack triples |
| **pipeline/maintain** | Incremental invalidate-by-provenance, re-extract, publish | sources, extract, normalize, store | Fuzzy entity merge; silent ontology extend |
| **ontology/** | Load pack, freeze lock, schema_version migrate | normalize, extract, CLI | Read MCP; write triples directly |
| **llm/** | Provider modes `none` \| `prompt` \| `http`; token budget | extract, normalize, answer (when flagged) | Ambient invocation; skip schema validation |
| **io/** | Paths, realpath confinement, lock, atomic rename, safe JSON | all writers/readers | Business ontology rules |
| **cli.ts** | Arg parse, exit codes, stdout JSON / stderr diagnostics | public façade only | Reimplement pipeline logic |
| **mcp/server.ts** | Stdio JSON-RPC tools mapping to public API | public façade only | Direct file writes outside store API |
| **review queue** (store artifact + resolve API) | Human/gated schema & entity decisions | normalize (emit), reviewResolve (mutate) | Auto-accept from MCP by default |

---

## Standard Architecture: Local-First Knowledge Graph / GraphRAG-lite

### Industry baseline (GraphRAG lineage)

Microsoft GraphRAG's indexing dataflow is the reference large-system shape: `[CITED]` https://microsoft.github.io/graphrag/index/default_dataflow/

1. **Compose TextUnits** — chunk documents; TextUnits are provenance anchors back to source text.
2. **Document processing** — link documents ↔ TextUnits.
3. **Graph extraction** — entities, relationships, optional claims; merge by title/type; summarize descriptions.
4. **Graph augmentation** — hierarchical Leiden communities.
5. **Community summarization** — reports for global questions.
6. **Embeddings** — entity descriptions, text units, community reports for vector retrieval.

Query engine splits **local** (entity-centric KG + text chunks + budgeted context) vs **global** (map-reduce over community reports) vs **DRIFT** (community-informed local). `[CITED]` https://microsoft.github.io/graphrag/query/local_search/ and https://microsoft.github.io/graphrag/query/overview/

Local search methodology maps cleanly onto gsd-graph pack:

- Seed entities related to the question
- Expand to relationships / neighborhood
- Prioritize + filter to a context budget
- Generate response from that context only

**Difference that defines this product:** GraphRAG seeds via entity-description embeddings; gsd-graph seeds via deterministic label/alias token scoring and expands via typed path/neighborhood IR—no vector store required. `[VERIFIED]` DESIGN pack algorithm vs GraphRAG local search docs.

### Local-first GraphRAG-lite principles (recommended)

1. **Library is the product; CLI/MCP are adapters.** One public API, multiple surfaces. `[VERIFIED]` DESIGN library exports.
2. **File store is the database.** `graph.v1.json` is SoT; projections are disposable. `[VERIFIED]` DESIGN dual-write invariant.
3. **Triples + multiset provenance are the unit of knowledge and invalidation.** Confidence is derived from best provenance tier. `[VERIFIED]` DESIGN data model.
4. **Ontology is a closed world at runtime.** Pack allowlist + lockfile; unknown → review/coerce/drop—never silent lock expansion. `[VERIFIED]` DESIGN policy matrix.
5. **Query IR is pure and testable; pack/answer are layers on top.** NL→IR is post-0.1. `[VERIFIED]` DESIGN QueryIR + K21.
6. **LLM is a staged plugin, not the spine.** Default `llm.mode = none`. `[VERIFIED]` DESIGN prompt-mode contract.
7. **Single-writer via process lock; single-process tools by default.** No always-on daemon. `[VERIFIED]` DESIGN build lock + process model below.
8. **Grounded answers are structurally bound to triple ids.** Abstain when empty. `[VERIFIED]` DESIGN GroundedAnswer.

### MCP as optional durable surface

MCP architecture: Host (AI app) creates one Client per Server; transport is **stdio** for local same-machine processes or Streamable HTTP for remote; data layer is JSON-RPC with Tools / Resources / Prompts primitives. `[CITED]` https://modelcontextprotocol.io/docs/concepts/architecture

**For gsd-graph:** optional `gsd-graph-mcp` is a **stdio MCP server** that exposes Tools wrapping the same library API. It is not a multi-tenant service and does not own state separate from `.gsd-graph/`. Privileged mutations (build, review write) stay off by default—aligns with MCP's "tools are actions" model while respecting local trust boundaries. `[VERIFIED]` DESIGN MCP surface + MCP official host/client/server split.

---

## Pipeline Stage Architecture (product mapping)

| Stage | Inputs | Outputs | Failure modes |
|-------|--------|---------|---------------|
| **Extract** | Corpus roots + globs, ontology pack, optional LLM | Candidate nodes/triples, diagnostics | Path escape, file too large, prompt_result_invalid |
| **Normalize** | Candidates + ontology.lock | Canonical graph delta, review-queue items | Policy conflicts, merge ambiguity |
| **Store** | In-memory graph | `graph.v1.json` (+ projection), manifest, status | build_locked, schema_invalid, limit_exceeded |
| **Query** | QueryIR + loaded graph | Subgraph (nodes/triples/paths) | Empty result (soft), budget trim |
| **Ground** | Question or pack opts | SubgraphPack → GroundedAnswer | empty_subgraph abstain, prompt_result_invalid |
| **Maintain** | Manifest fingerprints + sources | Incremental re-extract + publish | Same as build; provenance edge cases (M1–M5) |

**Store is first-class** in this product (durable boundary between write-path and read-path). The five prompt files (`extract`, `normalize`, `query`, `answer`, `maintain`) are mechanisms *inside* stages—not alternate architecture. `[VERIFIED]` DESIGN overview.

### Write path vs read path

```text
WRITE PATH (build / maintain / review resolve)
  sources → extract → normalize → [review pending] → store.publish
                                              ↑
                                    review accept/reject

READ PATH (query / pack / answer / status / diff)
  store.load(graph.v1) → query → pack → answer
```

Readers never depend on `graph.json` projection. Writers never skip the lock. `[VERIFIED]` DESIGN invariants.

---

## Recommended Project Structure

Align with DESIGN repo layout; enforce layering by directory:

```text
gsd-graph/
├── bin/
│   ├── gsd-graph.js              # CLI entry → dist/cli
│   └── gsd-graph-mcp.js          # optional MCP entry → dist/mcp/server
├── src/
│   ├── index.ts                  # public library exports ONLY
│   ├── cli.ts                    # CLI adapter
│   ├── types.ts                  # shared domain types (GraphNode, Triple, QueryIR, …)
│   ├── errors.ts                 # reason codes (GSD_GRAPH_REASON)
│   ├── pipeline/
│   │   ├── extract.ts
│   │   ├── normalize.ts
│   │   ├── store.ts
│   │   ├── query.ts              # Query IR + adjacency + budget
│   │   ├── pack.ts               # composition over query
│   │   ├── answer.ts             # render / optional LLM
│   │   ├── maintain.ts
│   │   └── communities.ts        # v0.2 only
│   ├── ontology/
│   │   ├── types.ts
│   │   ├── load-pack.ts
│   │   └── migrate.ts
│   ├── sources/
│   │   ├── discover.ts
│   │   ├── markdown.ts
│   │   ├── text.ts
│   │   ├── jsonl.ts
│   │   └── fingerprint.ts
│   ├── llm/
│   │   ├── provider.ts
│   │   └── budget.ts
│   ├── io/
│   │   ├── paths.ts
│   │   ├── lock.ts
│   │   ├── atomic-publish.ts
│   │   └── safe-json.ts
│   └── mcp/
│       └── server.ts
├── ontology-packs/
│   ├── general/
│   ├── research/
│   └── engineering/
├── schemas/
│   ├── graph-v1.schema.json
│   ├── ontology-pack.schema.json
│   ├── provenance.schema.json
│   └── review-queue.schema.json
├── prompts/
│   ├── extract.md
│   ├── normalize.md
│   ├── query.md                  # reserved post-0.1 for NL→IR
│   ├── answer.md
│   └── maintain.md
├── tests/
│   ├── fixtures/golden/          # G0–G4 offline multi-hop
│   └── *.test.ts
└── docs/
    └── DESIGN.md
```

**Rationale:** `[VERIFIED]` DESIGN package shape; `[ASSUMED]` `types.ts` / `errors.ts` at `src/` root prevent circular imports between pipeline modules.

### On-disk store structure (runtime, not repo)

```text
.gsd-graph/
├── config.json
├── ontology.lock.json
├── graph.v1.json                 # SoT
├── graph.json                    # disposable projection
├── sources.manifest.json
├── review-queue.json
├── .build.lock
├── snapshots/
├── communities/                  # v0.2
├── GRAPH_REPORT.md
└── .last-build-status.json
```

---

## Module Dependency Rules

**Rule of thumb:** dependencies point inward/down toward pure data and IO primitives—not sideways across surfaces.

```text
bin/*  →  cli | mcp
cli    →  index (public API) only
mcp    →  index (public API) only

index  →  pipeline/*, ontology, sources, llm, io, types, errors

pipeline/answer   →  pipeline/pack, llm?, types
pipeline/pack     →  pipeline/query, types          # K21: composition only
pipeline/query    →  types, (read-only graph)
pipeline/maintain →  sources, extract, normalize, store
pipeline/store    →  io, ontology?, types, schemas
pipeline/normalize→  ontology, types
pipeline/extract  →  sources, ontology, llm?, types

sources  →  io/paths, types
ontology →  types, io (read pack files)
llm      →  types, io (prompt file exchange under store)
io       →  (Node fs only; no pipeline imports)
types    →  (nothing domain-specific)
```

### Forbidden dependencies (enforce in review / lint if practical)

| From | Must not import | Why |
|------|-----------------|-----|
| `pipeline/query` | `pack`, `answer`, `cli`, `mcp` | Query stays pure IR executor |
| `pipeline/pack` | `answer`, `llm`, extract/normalize | Pack is deterministic composition |
| `pipeline/extract` | `store` publish helpers | Extract emits candidates only |
| `sources/*` | `pipeline/*`, `mcp` | Parsers stay free of graph policy |
| `io/*` | `pipeline/*`, `ontology/*` | IO is mechanism |
| `mcp/*` | `pipeline/*` internals | Adapter boundary; use public API |
| `cli.ts` | `pipeline/*` internals | Same |
| anything | gsd-core / `.planning` host APIs | Standalone product lock |

**Test rule:** unit tests may import pipeline internals; golden/CLI tests should prefer public API + fixtures. `[ASSUMED]` DX convention.

---

## Query IR vs Pack / Answer Layering

This is the architectural differentiator vs both chunk-RAG and opaque “agent tools.”

### Layer 0 — Graph memory

In-memory (or mmap-later) nodes + triples + adjacency built from `graph.v1.json`.

### Layer 1 — Query IR (structured, pure)

```ts
type QueryIR =
  | { op: 'seed_expand'; term: string; hops: number }
  | { op: 'path'; from: string; to: string; maxDepth: number }
  | { op: 'neighborhood'; id: string; hops: number }
  | { op: 'filter'; types?: string[]; predicates?: string[]; confidenceMin?: Confidence };
```

- **Input:** IR object + graph  
- **Output:** nodes, triples, optional path lists  
- **Side effects:** none  
- **Budget:** drop AMBIGUOUS → INFERRED → EXTRACTED; retain seeds when possible  

`[VERIFIED]` DESIGN Query section.

v0.1 agents and CLI pass structured args. **NL→IR (`prompts/query.md`) is a known gap**—do not entangle NL parsing into Layer 1. `[VERIFIED]` DESIGN non-goals / article mapping.

### Layer 2 — Pack (composition)

`packSubgraph` is **only** a composition of public query ops (K21):

1. Tokenize question → score nodes (label/alias/description) → top-k seeds  
2. `seed_expand` each seed; union  
3. Pairwise `path` among top seeds; union shortest paths  
4. `applyBudget`  
5. Emit `citations[]` from remaining triple provenance  

- **Input:** natural-language question string (for seeding only) + budget  
- **Output:** `SubgraphPack` (structured, citable)  
- **Must not:** invent triples; call LLM  

This is the local-search analogue of GraphRAG's "prioritize + filter to context window," without embeddings. `[CITED]` GraphRAG local search methodology; `[VERIFIED]` DESIGN pack algorithm.

### Layer 3 — Answer (grounding / render)

| Mode | Behavior |
|------|----------|
| `deterministic` | Markdown from pack: seeds, relationships, paths, citations |
| `prompt_pending` / `http` | LLM prose **constrained** to pack; `cited_triple_ids ⊆ pack` |
| `abstain` | Empty triples → no hallucination path |

**Invariant:** answer layer may **filter or phrase** pack content; it may not **expand** the graph. `[VERIFIED]` DESIGN GroundedAnswer + prompt validation.

```text
Question ──► packSubgraph ──► SubgraphPack ──► answer ──► GroundedAnswer
                 │                                  │
                 │                                  └── optional LLM (opt-in)
                 └── uses Query IR only
```

**Testing implication:** G1 goldens assert on pack paths/predicates offline; answer prose is secondary. `[VERIFIED]` DESIGN golden G1.

---

## How Review-Queue Fits

Review queue is the **human/control-plane gate** between free-form extraction and durable ontology/graph mutation—not a side UI.

### Placement in the pipeline

```text
extract candidates
       │
       ▼
normalize ──► known types/predicates ──► graph write candidates
       │
       ├── exact same-type alias match ──► auto-merge
       ├── ambiguous entity_merge ───────► review-queue item
       ├── unknown predicate/type ───────► policy:
       │         review → queue (no write)
       │         coerce → rewrite + optional diagnostic
       │         drop   → discard + diagnostic
       └── schema_drift ─────────────────► queue (manual)
```

### Architectural properties

| Property | Spec | Why |
|----------|------|-----|
| Stable item ids | `rv_` + hash(kind + payload) | Avoid re-queue loops after accept/reject |
| Decisions log | `decisions[]` retained | Audit + replay |
| Privileged resolve | `reviewResolve` / CLI only | Single mutation path |
| MCP | list default; resolve requires `mcp.allow_review_write` | Agents read friction, write gated |
| Ontology extend | `accept --extend-ontology` only | Never ambient lock expansion |
| `same_as` edges | Advisory until entity_merge accept | Prevent silent identity collapse |

`[VERIFIED]` DESIGN review-queue schema + policy matrix.

### Interaction with maintain

Maintain removes provenance by source fingerprint and may drop triples; it **does not** auto-resolve review items. Rebuild after ontology/extractor changes is authoritative (`build --full`). Review decisions remain until payload changes. `[VERIFIED]` DESIGN maintain + review id stability.

### Anti-pattern

Do **not** fold review into LLM normalize auto-apply. Zero-shot schema invention is explicitly unreliable (DESIGN goals/non-goals). Queue is the product mechanism that keeps the closed-world ontology honest.

---

## Process Model: Single-Process CLI, No Server Required

### Default operating mode

```text
$ gsd-graph build --corpus ./notes
   → one Node process
   → acquire .build.lock
   → extract/normalize/publish
   → release lock
   → exit

$ gsd-graph query "supply chain" --hops 2
   → one Node process
   → read graph.v1.json (no lock needed for pure read*)
   → print JSON to stdout
   → exit
```

\*Reads should tolerate a concurrent build by either reading a consistent pre-rename snapshot or failing with `build_locked` if a partial write is detected; prefer documenting read-during-build as best-effort on v1 with lock optional for readers. `[ASSUMED]` detail—DESIGN specifies lock for writers; readers use v1 only.

**No daemon, no HTTP port, no background worker** for v1. Laptop-local agent loops spawn CLI or import the library in-process. `[VERIFIED]` DESIGN goals + e2e sequence.

### Library in-process

Host applications (including future OpenGSD tools that *choose* to depend on the package) call:

```ts
import { build, query, packSubgraph, answer } from '@opengsd/gsd-graph';
```

Same lock/publish code paths as CLI. Zero runtime coupling to gsd-core. `[VERIFIED]` PROJECT.md / DESIGN naming.

### Optional MCP process

```text
Host (Claude Desktop / Cursor / etc.)
  └── spawns gsd-graph-mcp via stdio
        └── MCP Client ↔ MCP Server (JSON-RPC)
              └── library API → .gsd-graph/
```

- One MCP server process per host connection (stdio local pattern). `[CITED]` MCP architecture (local servers typically serve a single client).
- Server is **stateless protocol-wise**; durable state remains on disk.
- Default tools: status, query, pack, answer, review_list.
- Dangerous tools (build, review_resolve) require explicit config flags.

**Do not** require MCP for core product value. MCP is permanent session access for agents—not the system of record. `[VERIFIED]` DESIGN MCP purpose statement.

### Concurrency model

| Scenario | Behavior |
|----------|----------|
| Two builds | Second fails `build_locked` or `--wait N` |
| Stale lock | 15 min or dead PID → steal with warning |
| Build + query | Writer holds lock; reader uses v1 (projection may lag) |
| Crash mid-publish | v1 rename first; repair regenerates projection |

`[VERIFIED]` DESIGN dual-write publish protocol + lock table.

### Why not a long-running server in v1

| Concern | Server | Single-process CLI/lib |
|---------|--------|-------------------------|
| Ops burden | Port, lifecycle, auth | None |
| Agent integration | Custom protocol or HTTP | CLI JSON + optional MCP stdio |
| Local-first story | Weaker | Matches `.gsd-graph/` mental model |
| Concurrency | Easier multi-reader | Sufficient with file lock for laptop corpora |

Optional Neo4j export / remote backends remain progressive sophistication—not architectural center. `[VERIFIED]` DESIGN alternatives considered (Alt 2 deferred).

---

## Patterns to Follow

### Pattern 1: Dual-write publish with ordered rename

**What:** Validate → write temps → fsync → rename v1 first → projection → sidecars → status → unlock.  
**When:** Any graph mutation (build, maintain, review accept that writes triples).  
**Why:** Crash-safe SoT; projection lag is recoverable via `repair`.  
`[VERIFIED]` DESIGN dual-write protocol.

### Pattern 2: Multiset provenance invalidation

**What:** Triple identity is `(s,p,o)`; provenance is a multiset of source entries; drop sources on file change; re-derive confidence; drop triple if empty.  
**When:** Incremental maintain (M1–M5).  
**Why:** Enables incremental builds without full graph recompute.  
`[VERIFIED]` DESIGN maintain unit matrix.

### Pattern 3: Pack-as-query-composition (K21)

**What:** Implement pack only via exported query primitives.  
**When:** Grounding / multi-hop questions.  
**Why:** Testable multi-hop; prevents a second ad-hoc traversal engine.  
`[VERIFIED]` DESIGN K21.

### Pattern 4: Fail-closed LLM results

**What:** Schema-validate prompt results; ontology policy; answer citations subset of pack.  
**When:** Any `prompt` / `http` apply.  
**Why:** Prompt injection and schema drift are contained.  
`[VERIFIED]` DESIGN security + prompt contract.

### Pattern 5: Adapter surfaces over one façade

**What:** CLI and MCP call `index.ts` public functions only.  
**When:** Always.  
**Why:** One reason-code contract, one lock implementation, one test surface.  
`[VERIFIED]` DESIGN library API + machine contract K22.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Projection-as-truth

**What:** Querying or repairing from `graph.json` when v1 is missing.  
**Why bad:** Silent data loss / drift.  
**Instead:** Fail `schema_invalid`; repair only regenerates projection from v1.

### Anti-Pattern 2: Second graph engine inside pack/answer

**What:** Custom BFS in answer “to help the model.”  
**Why bad:** Untestable divergence from Query IR; goldens lie.  
**Instead:** Extend Query IR ops; pack composes them.

### Anti-Pattern 3: Ambient LLM on build

**What:** Auto-call HTTP LLM during `build` without `--llm` / config.  
**Why bad:** Breaks offline GA, cost, non-determinism.  
**Instead:** `llm.mode = none` default; explicit flag.

### Anti-Pattern 4: MCP write-open by default

**What:** Expose `graph_build` / review resolve without flags.  
**Why bad:** Agent loops can corrupt ontology/store.  
**Instead:** Read-path default; privileged flags.

### Anti-Pattern 5: Cross-layer imports (CLI → pipeline internals)

**What:** `cli.ts` imports `normalize.ts` directly for a “fast path.”  
**Why bad:** Divergent validation and lock behavior.  
**Instead:** Public API only.

### Anti-Pattern 6: Fuzzy auto-merge

**What:** Levenshtein entity merge without review.  
**Why bad:** Silent identity collapse; unrecoverable provenance.  
**Instead:** Exact same-type only; else `entity_merge` queue.

### Anti-Pattern 7: Treating community reports as v0.1 architecture center

**What:** Blocking GA on Leiden + report LLM quality.  
**Why bad:** GraphRAG global search is powerful but heavy; offline multi-hop value is in typed paths.  
**Instead:** v0.2 communities; v0.1 goldens on path/pack.  
`[CITED]` GraphRAG global vs local split; `[VERIFIED]` DESIGN v0.2 deferral.

---

## Scalability Considerations

| Concern | Laptop / agent (target) | ~10k nodes | ~100k nodes (hard cap 100k / 250k triples) |
|---------|-------------------------|------------|---------------------------------------------|
| Store | Single `graph.v1.json` load | Still OK if <50MB warn | Near hard fail; need streaming/chunk later |
| Query hops=2 | ≤50ms target | Adjacency map in RAM | Same until cap; no server sharding in v1 |
| Build incremental | ≤5s for ≤10 files | Manifest fingerprints | Full rebuild cost grows linear in changed set |
| Concurrency | Single writer lock | Same | Still single-process; no cluster story |
| MCP | One stdio child | Same | Same; not a multi-tenant gateway |

`[VERIFIED]` DESIGN observability budgets + hard caps; `[ASSUMED]` post-cap architecture is out of v1 scope (export/backend).

---

## Architecture Decision Summary (opinionated)

1. **Pipeline, not framework:** six stages with store first-class; five prompts as optional mechanisms.  
2. **File SoT + atomic publish** over embedded graph DB for v1.  
3. **Query IR pure → pack composes → answer grounds** — never invert.  
4. **Review queue is control-plane**, not UX polish.  
5. **Single-process CLI/lib default; MCP stdio optional** — no required server.  
6. **Surfaces are adapters** to one public façade.  
7. **GraphRAG lineage for vocabulary and local-search packing**, not for embedding/community mandatory path.

---

## Gaps / Phase-Specific Research Flags

| Topic | Status | When to deepen |
|-------|--------|----------------|
| NL→Query IR architecture | Out of v0.1 | Post-0.1 prompt/query design |
| Community detection pure-TS details | v0.2 | Label propagation params, report schema |
| Read-during-build consistency | Partially specified | Lock readers vs copy-on-read |
| Streaming/partial load for huge graphs | Not in v1 | If caps become user pain |
| Neo4j/Cypher export mapping | Optional later | Export phase |
| Embedding hybrid seed ranking | Explicit non-goal v1 | If deterministic seed quality insufficient |

---

## Sources

### Official / primary

- Microsoft GraphRAG — Indexing dataflow: https://microsoft.github.io/graphrag/index/default_dataflow/ `[VERIFIED]`
- Microsoft GraphRAG — Indexing overview: https://microsoft.github.io/graphrag/index/overview/ `[VERIFIED]`
- Microsoft GraphRAG — Query overview (local/global/DRIFT): https://microsoft.github.io/graphrag/query/overview/ `[VERIFIED]`
- Microsoft GraphRAG — Local search methodology: https://microsoft.github.io/graphrag/query/local_search/ `[VERIFIED]`
- Model Context Protocol — Architecture (host/client/server, stdio, tools): https://modelcontextprotocol.io/docs/concepts/architecture `[VERIFIED]`

### Project authority

- `docs/DESIGN.md` — pipeline, store, Query IR, pack K21, review queue, MCP surface, process/CLI `[VERIFIED]`
- `.planning/PROJECT.md` — standalone scope, non-goals, locked decisions `[VERIFIED]`

### Confidence notes

- GraphRAG and MCP structural claims: **HIGH** (official docs fetched 2026-08-02).
- gsd-graph component boundaries and dependency rules: **HIGH** (normative DESIGN) with **MEDIUM** on enforcement tactics (lint boundaries) as implementation detail.
- Ecosystem generalization (“all local-first KG toolkits”): **MEDIUM** — synthesis from GraphRAG-lite goals + DESIGN, not a survey of every toolkit.
