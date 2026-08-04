# Phase 7: Global themes 0.2 - Research

**Researched:** 2026-08-03  
**Domain:** Pure-TS community detection (label propagation) + theme reports for v0.2.0  
**Confidence:** HIGH

## Summary

Phase 7 ships **corpus-level theme discovery** for `@opengsd/gsd-graph` **0.2.0**. The product differentiator vs local pack/answer search is **global structure**: cluster the undirected projection of high-confidence triples and emit disposable community/theme artifacts under the store. Algorithm is **pure TypeScript label propagation (LPA)** only — no Louvain, Leiden, graphology, ngraph, or native deps (K12, COM-01, D-01).

Locked algorithm envelope: max **20** iterations, min community size **3**, undirected edges with confidence **EXTRACTED | INFERRED** (exclude **AMBIGUOUS** by default), load SoT only via `loadGraphV1`, write under `communities/` never as SoT. Deterministic reports by default; LLM prose opt-in only if Phase 6 modes are reused later (not required for this phase).

**Primary recommendation:** Implement `src/pipeline/communities.ts` as a pure function pipeline — `projectCommunityEdges` → deterministic async LPA → post-filter/split → write `communities/index.json` + `community-*.md` — then thin K22 CLI `gsd-graph communities detect|report`, bump package to **0.2.0**, and lock behavior with a two-clique synthetic fixture under `node:test`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact label-propagation tie-breaking for determinism
- Whether to store communities array in graph.v1 optional field or only sidecar files (prefer sidecars + optional non-authoritative index; do not require graph schema bump if avoidable)
- Report markdown template details
- Whether pack/answer can optionally seed from community themes (nice-to-have, not required)

### Deferred Ideas (OUT OF SCOPE for Phase 7)
- NL→Query IR (QRY-03)
- Neo4j export (EXP-01)
- Pack extends (ONT-05)
- Louvain/Leiden algorithms
- Embedding-based clustering
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COM-01 | Community detection (label propagation) and community/theme reports | Pure-TS deterministic LPA; undirected EXTRACTED+INFERRED projection; min size 3 / max 20 iter; store under `communities/` only; deterministic reports; CLI + 0.2.0 ship docs |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load published graph SoT | Database / Storage | API / Backend | `loadGraphV1` only; never `graph.json` |
| Confidence-filtered undirected edge projection | API / Backend | — | Library builds adjacency for LP; reuses confidence ranks |
| Label propagation clustering | API / Backend | — | Pure in-process algorithm; no external service |
| Community id assignment + min-size filter | API / Backend | — | Post-process LP labels into stable community records |
| Write `communities/*` artifacts | Database / Storage | API / Backend | Sidecar files under store; realpath-confined like snapshots |
| Deterministic theme report markdown | API / Backend | CDN / Static (file artifact) | Disposable human/agent summary; not SoT |
| Optional LLM report prose | API / Backend | — | Opt-in only; out of default path (Phase 6 modes if reused later) |
| CLI `communities detect\|report` | API / Backend | — | Thin K22 adapter over library (commander nested verbs) |
| Version 0.2.0 identity | Package / release | — | `package.json` + CHANGELOG + engine_version stamp |
| Synthetic community fixture tests | API / Backend | — | Offline `node:test`; known structure asserts |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **In-house pure TS LPA** | — | Community detection | K12 / D-01; STACK already bans graphology for query; no first-class LP package in graphology stdlib [CITED: .planning/research/STACK.md:49-58] [CITED: docs/DESIGN.md:696-701] |
| Existing `buildAdjacencyMap` patterns | in-repo | Undirected neighbor lists | Query already walks undirected while preserving directed triples [VERIFIED: src/pipeline/query.ts:46-103] |
| `confidenceRank` / `Confidence` | in-repo | EXTRACTED=2, INFERRED=1, AMBIGUOUS=0 | Shared tier table for edge filter [VERIFIED: src/pipeline/ids.ts:7-19] |
| `loadGraphV1` | in-repo | SoT load | D-08; never projection [VERIFIED: src/io/load-graph.ts:20-50] |
| `confineUnderRoot` | in-repo | Path-safe `communities/` writes | Same pattern as `snapshots/` [VERIFIED: src/pipeline/snapshot.ts:103-111] |
| `commander` | already `^14.0.3` | Nested `communities` command | Matches snapshot/review CLI style [VERIFIED: package.json:43] |
| `node:test` + `node:assert/strict` | built-in | Tests | D-10; package scripts [VERIFIED: package.json:36-37] |
| Node `>=22` | engines | Runtime | Package engines [VERIFIED: package.json:29-32] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `writeGraphReport` patterns | in-repo | Markdown report style | Mirror non-authoritative header + counts [VERIFIED: src/pipeline/report.ts:62-89] |
| `readEngineVersion` via `package.json` | in-repo | Stamp engine_version on new builds | Bumping package version auto-stamps graphs [VERIFIED: src/pipeline/build.ts:95-107] |
| Phase 6 LLM modes (`none`/`prompt`/`http`) | in-repo | Optional report prose later | Only if explicitly flagged; default deterministic (D-05) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-TS LPA | `graphology` + Louvain plugin | Forbidden (D-01); Louvain ≠ design algorithm; dep tax [CITED: STACK.md:53-55] |
| Pure-TS LPA | Leiden (GraphRAG default) | Deferred; hierarchical + heavier; out of scope [CITED: docs/DESIGN.md:696-701] [CITED: microsoft.github.io/graphrag dataflow] |
| Pure-TS LPA | Embedding clustering | Out of scope; requires vectors/network |
| Sidecar `communities/` only | Mutate `graph.v1.communities` as SoT | Violates D-04 spirit; schema has only loose `communities: array` with no item schema [VERIFIED: schemas/graph-v1.schema.json:153-155] |
| Nested `communities detect\|report` | Single flat `community` command | Nested matches snapshot/review; clearer detect vs report |

**Installation:**

```bash
# No new runtime dependencies for Phase 7.
# Existing stack only:
# commander, loadGraphV1, pure-TS algorithm modules
```

**Version verification:** No new packages to install. Current package version is **`0.1.0`** and must bump to **`0.2.0`** (D-07) [VERIFIED: package.json:3].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — no new deps)* | — | — | — | — | — | N/A |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  

**Hard bans (do not install):**
- `graphology`, `graphology-communities-louvain`, `ngraph.graph`, `ngraph.path`
- Any native community-detection bindings
- Louvain/Leiden npm packages

## Architecture Patterns

### System Architecture Diagram

```text
  Operator / agent
        │
        ▼
  gsd-graph communities detect|report   (CLI, K22 JSON stdout)
        │
        ▼
  detectCommunities / writeCommunityReports  (library)
        │
        ▼
  loadGraphV1(storeRoot)  ──►  graph.v1.json  (SoT only)
        │
        ▼
  projectCommunityEdges
   • triples where confidenceRank >= INFERRED (exclude AMBIGUOUS)
   • undirected unique edges {a,b} with a < b
        │
        ▼
  labelPropagation
   • init label[v] = v
   • async updates, nodes sorted by id asc each iter
   • majority neighbor label; tie → lex-min label
   • stop: stable majority condition OR max 20 iters
        │
        ▼
  finalizeCommunities
   • group by label
   • BFS-split same-label disconnected components
   • drop |members| < 3
   • stable community ids + sort
        │
        ▼
  write under store/communities/   (NOT graph.v1 SoT)
   • index.json  (machine summary)
   • community-<id>.md  (theme report)
```

### Recommended Project Structure

```text
src/pipeline/
├── communities.ts          # detect + report + LPA (new, COM-01)
├── query.ts                # reuse adjacency patterns / confidence filter ideas
├── report.ts               # existing GRAPH_REPORT style reference
└── ...
src/cli.ts                  # add nested `communities` command
src/index.ts                # export detectCommunities, types
src/types.ts                # Community, CommunityDetectResult, options
tests/
├── communities.test.ts     # synthetic two-clique + determinism + min-size
└── fixtures/
    └── communities/
        └── two-cliques.json  # optional GraphV1Document fixture
.gsd-graph/                 # runtime store (not committed)
└── communities/
    ├── index.json
    └── community-c_0001.md
```

### Pattern 1: Deterministic asynchronous label propagation

**What:** Raghavan–Albert–Kumara LPA with **all randomness removed**.  
**When to use:** Always for COM-01 (locked).  

**Prescribed algorithm (normative for planner/executor):**

```typescript
// Source: Raghavan et al. 2007 (arXiv:0709.2938) + project determinism rules
// Constants (D-02):
export const COMMUNITY_MAX_ITERATIONS = 20;
export const COMMUNITY_MIN_SIZE = 3;

// 1. Nodes = endpoints of filtered edges only (isolates never form size≥3).
// 2. labels: Map<nodeId, label> initialized label[v] = v
// 3. For iter = 1..MAX:
//      order = sort(nodeIds ascending)
//      changed = false
//      For v of order:  // asynchronous: see already-updated neighbors
//        counts = frequency of labels of neighbors(v)
//        if no neighbors: keep label
//        else:
//          best = labels with max count
//          next = min(best) by localeCompare  // D-discretion: lex-min tie-break
//          if next !== labels[v]: labels[v] = next; changed = true
//      if !changed OR every node already has a majority label among neighbors: break
// 4. Group nodes by final label.
// 5. Within each label group, BFS on the undirected edge set; split disconnected
//    components (Raghavan §V disconnected same-label case).
// 6. Drop communities with members.length < MIN_SIZE.
// 7. Sort communities: size desc, then min(memberId) asc.
// 8. Assign id `c_${String(i+1).padStart(4,'0')}` and
//    stable_key = first 16 hex of sha256(membersSorted.join('\0'))
```

**Why async + fixed order:** Paper uses random order + random ties; both break determinism. Fixed id order + lex-min ties yields bit-stable partitions for tests (D-05, D-10). [CITED: arxiv.org/abs/0709.2938]

### Pattern 2: Confidence-filtered undirected projection

**What:** Build a simple undirected multigraph-free edge list from triples.  
**When to use:** Before LPA only — do not reuse `buildAdjacencyMap` as-is without filtering (it indexes **all** triples).  

```typescript
// Confidence gate (D-03) — ranks from ids.ts:
// EXTRACTED=2, INFERRED=1, AMBIGUOUS=0
// Keep edge when confidenceRank(t.confidence) >= confidenceRank('INFERRED')
// i.e. EXTRACTED | INFERRED only.

function projectCommunityEdges(graph: GraphV1Document): {
  nodes: string[];
  neighbors: Map<string, string[]>; // undirected, unique, sorted neighbor lists
} {
  // for each triple meeting rank gate:
  //   add undirected adjacency both ways; dedupe neighbor lists
  // nodes = sorted unique endpoints
}
```

Do **not** invent edges from `graph.json` projection. [VERIFIED: src/pipeline/project.ts:4-7]

### Pattern 3: Sidecar storage under `communities/` (prefer no schema bump)

**What:** Write disposable artifacts only; leave `graph.v1.json` authoritative.  
**When to use:** Always (D-04 + discretion preference).  

```text
.gsd-graph/
├── graph.v1.json              # SoT — do not require communities[] mutation
└── communities/               # create via confineUnderRoot + mkdirSync
    ├── index.json             # non-authoritative machine summary
    ├── community-c_0001.md
    └── community-c_0002.md
```

**Discretion decision (locked for planning):**  
- **Do not** require writing into `graph.v1.communities` for correctness.  
- Schema already allows optional `communities: array` with no item shape [VERIFIED: schemas/graph-v1.schema.json:153-155] — leave unused rather than half-schema.  
- Optional later: non-authoritative mirror field is OK only if still documented as non-SoT; **prefer sidecars only** this phase.

Path writes must use `confineUnderRoot(storeRoot, path.join('communities', fileName))` like snapshots — `storeFile` rejects path separators [VERIFIED: src/io/paths.ts:137-150].

### Pattern 4: Nested CLI + K22

**What:** Mirror `snapshot` / `review` nested commander verbs.  
**When to use:** CLI surface (D-06).  

```text
gsd-graph communities detect [--dir …] [--min-size 3] [--max-iter 20]
gsd-graph communities report [--dir …]
```

- `detect`: run LP + write index + markdown; stdout JSON summary  
- `report`: rewrite markdown from last `index.json` (or re-detect if missing — prefer fail with clear reason if index absent)  
- stdout: JSON only; stderr diagnostics; exits 0/1/2/3 via existing `mapCliError`  

### Anti-Patterns to Avoid

- **Using Louvain/Leiden "because GraphRAG does":** GraphRAG uses hierarchical Leiden for communities [CITED: microsoft.github.io/graphrag/index/default_dataflow/]; this product explicitly chose LPA (K12).  
- **Treating community markdown as SoT:** classic pitfall 11 [CITED: .planning/research/PITFALLS.md:212-216].  
- **Including AMBIGUOUS edges in LP:** dilutes clusters; violates D-03.  
- **Random node order / random ties:** non-deterministic tests and agent diffs.  
- **Reading `graph.json` for clustering:** projection is disposable [VERIFIED: src/pipeline/project.ts:4-7].  
- **Installing graphology for "just this feature":** STACK hard ban for required deps [CITED: STACK.md:158].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undirected adjacency idea | New graph DB model | Simple `Map<string, string[]>` + existing query patterns | Caps ≤100k/250k already pure-TS [CITED: STACK.md:46] |
| Confidence ordering | Custom tier strings | `confidenceRank` | Shared with query budget [VERIFIED: src/pipeline/ids.ts:17-19] |
| SoT load | Ad-hoc `fs.readFileSync('graph.json')` | `loadGraphV1` | D-08 / STORE-02 |
| Path confinement | Manual string join only | `confineUnderRoot` | STORE-05; snapshots precedent |
| CLI exit mapping | New exit taxonomy | Existing `mapCliError` / K22 | CLI-02 |
| LLM theme essays (default) | Always-on model calls | Deterministic member/predicate summary | D-05 offline honesty |
| Community detection library | graphology Louvain | Pure-TS LPA | D-01 |

**Key insight:** Community detection here is a **small, deterministic clustering pass over an already-published triple store**, not a second graph engine. Hand-rolling LPA is intentional and smaller than adopting a graph library that still lacks first-class LP.

## Common Pitfalls

### Pitfall 1: Non-deterministic LPA
**What goes wrong:** Same store yields different community ids across runs; tests flake; agent diffs thrash.  
**Why it happens:** Paper algorithm randomizes node order and ties [CITED: arxiv.org/abs/0709.2938].  
**How to avoid:** Fixed ascending node order; lex-min label on frequency ties; stable community id assignment after sort.  
**Warning signs:** Two consecutive `detect` calls differ in `index.json`.

### Pitfall 2: Treating community artifacts as SoT
**What goes wrong:** Downstream code reads `communities/` or `graph.v1.communities` instead of triples for truth.  
**Why it happens:** GraphRAG-style reports feel authoritative.  
**How to avoid:** Header on every markdown: non-authoritative; query/pack continue on `loadGraphV1` only; tests assert `graph.v1.json` unchanged by detect (bytes or semantic triple set).  
**Warning signs:** `query` path starts depending on community files.

### Pitfall 3: Including AMBIGUOUS / projection edges
**What goes wrong:** Weak/noisy edges glue unrelated clusters.  
**Why it happens:** Reusing unfiltered `buildAdjacencyMap`.  
**How to avoid:** Explicit `projectCommunityEdges` with rank ≥ INFERRED; unit test with AMBIGUOUS bridge that must **not** merge cliques.  
**Warning signs:** One giant community on noisy corpora.

### Pitfall 4: Same label, disconnected components
**What goes wrong:** Two distant cliques share a label by propagation accident and appear as one theme.  
**Why it happens:** Documented LPA issue [CITED: arxiv.org/abs/0709.2938 §V].  
**How to avoid:** Post-pass BFS split per label on the undirected edge set before min-size filter.  
**Warning signs:** Community member graph not connected under filtered edges.

### Pitfall 5: Min-size 3 silently drops everything
**What goes wrong:** Sparse graphs yield zero communities; UX looks broken.  
**Why it happens:** Min size 3 is aggressive on tiny demos.  
**How to avoid:** JSON result includes `community_count`, `dropped_small_count`, `node_count_considered`; docs note need for structured multi-edge corpora.  
**Warning signs:** Empty `communities/` after detect on tiny fixture.

### Pitfall 6: Path escape via community filenames
**What goes wrong:** Crafted labels write outside store.  
**Why it happens:** Using label strings directly in paths.  
**How to avoid:** Community file basenames only from assigned `c_NNNN` ids; always `confineUnderRoot`.  
**Warning signs:** `..` or `/` in written paths.

### Pitfall 7: Forgetting version/docs ship work
**What goes wrong:** Algorithm lands but package still 0.1.0; no CHANGELOG differentiator.  
**Why it happens:** Implementation-first tunnel vision.  
**How to avoid:** Explicit plan tasks for package.json, CHANGELOG, README global-themes blurb (D-07).  
**Warning signs:** `npm view` / local package still 0.1.0 after phase.

## Code Examples

### Edge projection + rank gate

```typescript
// Source: in-repo confidenceRank [VERIFIED: src/pipeline/ids.ts:7-19]
import { confidenceRank } from './ids';
import type { GraphV1Document, Triple } from '../types';

const MIN_EDGE_RANK = confidenceRank('INFERRED'); // 1

export function isCommunityEdge(t: Triple): boolean {
  return confidenceRank(t.confidence) >= MIN_EDGE_RANK;
}
```

### Library API sketch

```typescript
// Source: phase research prescription (implement in src/pipeline/communities.ts)
export interface Community {
  id: string;              // c_0001
  stable_key: string;      // hash of sorted members
  label: string;           // human theme title (deterministic)
  members: string[];       // sorted node ids
  size: number;
  internal_triple_count: number;
  top_predicates: Array<{ p: string; count: number }>;
  top_nodes: Array<{ id: string; label: string; degree: number }>;
}

export interface DetectCommunitiesOptions {
  dir?: string;
  graph?: GraphV1Document; // test injection; production loads via loadGraphV1
  maxIterations?: number;  // default 20
  minSize?: number;        // default 3
  write?: boolean;         // default true — write communities/ artifacts
}

export interface DetectCommunitiesResult {
  communities: Community[];
  iterations: number;
  stopped_reason: 'converged' | 'max_iterations';
  nodes_considered: number;
  edges_considered: number;
  dropped_small_count: number;
  index_path?: string;
  report_paths?: string[];
}

export function detectCommunities(
  opts?: DetectCommunitiesOptions,
): DetectCommunitiesResult;

export function writeCommunityReports(
  opts?: { dir?: string; communities?: Community[] },
): { index_path: string; report_paths: string[] };
```

### Deterministic report template

```markdown
# Community c_0001 — <theme title>

> Non-authoritative theme report. Source of truth is graph.v1.json.
> Generated by gsd-graph label propagation (max_iter=20, min_size=3).

- members: N
- internal_triples: M
- stable_key: <hex>

## Top nodes (by internal degree)
- `concept:foo` (Foo) — degree 4
- …

## Top predicates (internal)
- related_to: 6
- about: 3

## Members
- `concept:foo` — Foo
- …
```

**Theme title rule (discretion):**  
`top_nodes[0].label` if present, else `Community ${id}`. Never call LLM for title by default.

### CLI result shape (stdout JSON)

```json
{
  "ok": true,
  "community_count": 2,
  "iterations": 4,
  "stopped_reason": "converged",
  "nodes_considered": 12,
  "edges_considered": 30,
  "dropped_small_count": 1,
  "communities": [
    { "id": "c_0001", "size": 6, "label": "Supply Chain", "stable_key": "…" }
  ],
  "index_path": "/abs/.../communities/index.json"
}
```

### Known-structure test fixture (two cliques + weak bridge)

```typescript
// Clique A: a1—a2—a3—a1 (EXTRACTED)
// Clique B: b1—b2—b3—b1 (EXTRACTED)
// Optional AMBIGUOUS edge a1—b1 must NOT force a single community
// Expect: 2 communities, members partitioned {a*} vs {b*}, size >= 3 each
// Second detect() deep-equal to first (determinism)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GraphRAG Leiden + LLM community reports | Pure-TS LPA + deterministic reports | Product K12 / v0.2 design | Offline, no native deps, global themes without embeddings |
| Louvain npm plugins | In-house LPA | STACK 2026-08-02 | Avoid graphology tax; algorithm matches design text |
| Random classic LPA | Deterministic async LPA | This phase | Stable agent/CI outputs |

**Deprecated/outdated for this product:**
- **Louvain/Leiden as required path:** deferred / out of scope for Phase 7  
- **Community reports as SoT:** never  
- **Embedding-based clustering:** deferred  

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Lex-min label on frequency ties is the preferred determinism rule (vs. keep-current-label-on-tie) | Pattern 1 | Partition differs slightly; tests must match chosen rule — **pick one and freeze** |
| A2 | `report` subcommand rewrites from `index.json` and errors if missing (vs always re-detect) | Pattern 4 | UX only |
| A3 | Theme title = highest internal-degree member label | Report template | Cosmetic |
| A4 | No write to `graph.v1.communities` in this phase | Storage | If product later wants in-graph listing, additive change |

**Note:** A1–A4 are discretion resolutions proposed as planning defaults. User already left these to Claude's discretion; treat as **recommended locks** for the planner.

## Open Questions

> **RESOLVED for planning** — no blockers.

1. **Tie-break policy**  
   - What we know: Paper uses random ties; product needs determinism.  
   - Resolution: **lexicographically smallest label among max-frequency candidates**; process nodes by **ascending id** each iteration.  
   - Recommendation: Document in code comment + test.

2. **graph.v1.communities field**  
   - What we know: Optional untyped array exists in schema.  
   - Resolution: **Sidecars only** (`communities/index.json` + markdown); do not require schema bump or SoT mutation.  
   - Recommendation: Leave field unused.

3. **CLI verb shape**  
   - What we know: D-06 allows `communities` or `community detect|report`.  
   - Resolution: Nested **`gsd-graph communities detect|report`** (plural, matches store dir name).  
   - Recommendation: Also export library functions for programmatic use.

4. **Pack/answer seed from communities**  
   - What we know: Nice-to-have in discretion.  
   - Resolution: **Out of Phase 7 required scope**; do not block 0.2.0.  
   - Recommendation: Document as future enhancement.

5. **LLM prose for reports**  
   - What we know: D-05 opt-in only.  
   - Resolution: **Not required** this phase; deterministic markdown only.  
   - Recommendation: Optional follow-up wiring to Phase 6 prompt/http if demanded.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime / tests | ✓ | v25.6.1 (engines ≥22) | — |
| npm | Scripts | ✓ | 11.9.0 | — |
| TypeScript (dev) | Build | ✓ | ^6.0.3 in package | — |
| graphology / Louvain | — | N/A | — | **Do not install** |
| Network / LLM API | Default communities | not required | — | Deterministic path only |
| Neo4j | — | N/A | — | Out of scope |

**Missing dependencies with no fallback:** none  

**Missing dependencies with fallback:** none  

Step 2.6 note: Phase is code/algorithm + file IO only; no external services.

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` [VERIFIED: .planning/config.json:25].

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (built-in) |
| Config file | none — compile via `tsc -p tsconfig.test.json` |
| Quick run command | `npm test` (build + build:test + `node --test dist-test/**/*.test.js`) |
| Full suite command | `npm test` |
| Coverage (optional) | `npm run test:coverage` (c8 lines 80) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COM-01 | Two-clique synthetic graph → 2 communities, correct partition | unit | `node --test dist-test/communities.test.js` | ❌ Wave 0 |
| COM-01 | AMBIGUOUS bridge does not merge cliques | unit | same | ❌ Wave 0 |
| COM-01 | Min size 3 drops smaller groups | unit | same | ❌ Wave 0 |
| COM-01 | Max iterations respected / stopped_reason set | unit | same | ❌ Wave 0 |
| COM-01 | Determinism: two detects deep-equal | unit | same | ❌ Wave 0 |
| COM-01 | Artifacts under `communities/`; graph.v1 triples unchanged | unit/integration | same | ❌ Wave 0 |
| COM-01 | CLI `communities detect` K22 JSON exit 0 | integration | `node --test dist-test/cli-commands.test.js` (extend) | ❌ Wave 0 (extend existing) |
| COM-01 | load path uses loadGraphV1 only (missing v1 → SCHEMA_INVALID) | unit | communities.test | ❌ Wave 0 |
| D-07 | package.json version `0.2.0` after release tasks | unit | package-identity or communities release test | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (or targeted `node --test dist-test/communities.test.js` after build:test)  
- **Per wave merge:** full `npm test`  
- **Phase gate:** full suite green before `/gsd-verify-work`; version 0.2.0 + CHANGELOG present  

### Wave 0 Gaps

- [ ] `tests/communities.test.ts` — COM-01 algorithm + artifact + determinism + AMBIGUOUS exclusion  
- [ ] Optional `tests/fixtures/communities/two-cliques.json` — GraphV1Document with known structure  
- [ ] Extend `tests/cli-commands.test.ts` — `communities detect` / `report` smoke  
- [ ] Framework install: none (existing `node:test`)  

## Security Domain

> `security_enforcement` enabled (default) [VERIFIED: .planning/config.json:48].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local CLI/library; no auth surface |
| V3 Session Management | no | — |
| V4 Access Control | no | Same trust as local store files |
| V5 Input Validation | yes | Community file basenames from generated ids only; `confineUnderRoot`; numeric clamps on minSize/maxIter |
| V6 Cryptography | no new | `sha256` for stable_key only via `node:crypto` (existing id style) |

### Known Threat Patterns for pure-TS communities

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via report filenames | Tampering | `c_NNNN` ids only + `confineUnderRoot` under store |
| DoS via huge iteration work | Denial of Service | max 20 iters; existing graph size caps on publish |
| Prompt injection via future LLM reports | Elevation / Spoofing | LLM opt-in only; default deterministic (D-05) |
| Treating reports as graph truth | Tampering | Explicit non-authoritative headers; no SoT promotion |
| Reading projection as input | Tampering | `loadGraphV1` only (D-08) |

## Project Constraints (from CLAUDE.md / org)

No project-root `CLAUDE.md` found in gsd-graph. Apply org working rules from user context:

- Copyright header on all new source:  
- Prefer simple, minimal changes; read before edit  
- Tests via existing `npm test` pipeline  
- No gsd-core runtime dependency (already enforced)

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` § Communities v0.2 (lines 696–701), K12 (line 1058), store layout `communities/` (lines 289–291)  
- `.planning/research/STACK.md` pure-TS graph + no graphology LP (lines 42–58, 225)  
- `.planning/REQUIREMENTS.md` COM-01  
- `.planning/ROADMAP.md` Phase 7  
- `.planning/phases/07-global-themes-0-2/CONTEXT.md` D-01..D-10  
- In-repo: `src/pipeline/query.ts`, `src/pipeline/ids.ts`, `src/io/load-graph.ts`, `src/pipeline/report.ts`, `src/pipeline/snapshot.ts`, `src/cli.ts`, `package.json`, `schemas/graph-v1.schema.json`

### Secondary (MEDIUM confidence)

- Raghavan, Albert, Kumara 2007 — *Near linear time algorithm to detect community structures in large-scale networks* (arXiv:0709.2938) — LPA steps, async update, stop criterion, disconnected same-label note [CITED: arxiv.org/abs/0709.2938]  
- Microsoft GraphRAG default dataflow — Leiden communities + LLM reports (contrast only) [CITED: microsoft.github.io/graphrag/index/default_dataflow/]  
- `.planning/research/PITFALLS.md` pitfall 11 (community reports as SoT)  
- `.planning/research/FEATURES.md` PR-16 → 0.2.0  

### Tertiary (LOW confidence)

- Wikipedia LPA summary (secondary paraphrase of Raghavan; prefer arXiv text)  

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new deps; bans verified against STACK + CONTEXT  
- Architecture: **HIGH** — reuse loadGraphV1, confidence ranks, snapshot path pattern, report style  
- Algorithm prescription: **HIGH** for steps; **MEDIUM** for exact tie-break choice (resolved as lex-min by discretion)  
- Pitfalls: **HIGH** — product pitfalls doc + classic LPA non-uniqueness  

**Research date:** 2026-08-03  
**Valid until:** 2026-09-02 (30 days; algorithm stable, package surface small)
