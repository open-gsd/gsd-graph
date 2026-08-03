# Phase 3: Query, lifecycle & maintain - Research

**Researched:** 2026-08-03  
**Domain:** Pure-TS multi-hop Query IR, multiset provenance invalidation (M1–M5), snapshots/diff/repair over file-store graph.v1  
**Confidence:** HIGH (product locks in DESIGN + live Phase 1–2 code Read this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Locked (non-negotiable):

- **D-01** Query IR is structured only: term seed+expand, path, neighborhood, filter — **no NL→IR** (QRY-01)
- **D-02** Confidence budget filtering uses shared tier rank order with normalize/`best_tier` (QRY-02, K6)
- **D-03** Pure-TS adjacency BFS/path — no graphology/ngraph dependency
- **D-04** Query and lifecycle read **only** `graph.v1.json` via `loadGraphV1` — never projection as SoT
- **D-05** Incremental maintain invalidates multiset provenance correctly for **M1–M5** matrix (MNT-01)
- **D-06** Fingerprints from Phase 2 (`sha256:`) drive which sources are re-extracted; provenance entries drop when sources removed; triple confidence recompute = best_tier(remaining entries); drop triple when provenance empty
- **D-07** Snapshot save/list/restore of full `graph.v1` (and necessary lock/sidecars as designed) under store `snapshots/` (SNAP-01)
- **D-08** Diff: current graph vs named snapshot or `last-diff-base` — ± nodes & triples by id (DIFF-01, K25)
- **D-09** Repair regenerates projection from v1 only; invents no triples (REP-01)
- **D-10** Reuse Phase 1 lock for any write path that mutates store (maintain/snapshot/repair as needed)
- **D-11** Copyright headers on all source files
- **D-12** Tests: `node:test` + c8; dedicated M1–M5 tests; query path tests

### Claude's Discretion
- Exact Query IR TypeScript types / function split (`query` vs `path` helpers) as long as ops match DESIGN
- Budget units (token estimate vs node/triple count) — prefer DESIGN: budget drops worst confidence first
- Snapshot naming / retention policy for list
- Whether maintain is `maintain()` separate from `build({ full: false })` or extends build — RESEARCH must pick one clear API; prefer explicit `maintain` or documented incremental `build` contract that satisfies M1–M5
- Diff output JSON shape details

### Deferred Ideas (OUT OF SCOPE for Phase 3)
- packSubgraph / answer — Phase 5
- CLI binary surface — Phase 4 (library APIs only)
- LLM / MCP — Phase 6
- Communities — Phase 7
- NL→Query IR
- Neo4j export
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QRY-01 | Query IR supports term seed-expand, path, neighborhood, and filter | DESIGN Query IR + pure-TS adjacency patterns; `loadGraphV1` read path |
| QRY-02 | Confidence budget filtering uses tier ranks consistently | Shared `bestTier` / exportable rank map from `src/pipeline/ids.ts`; `applyBudget` drop order |
| MNT-01 | Incremental maintain invalidates provenance correctly (M1–M5) | Extract pure invalidation from build; fix deleted-source gap; dedicated maintain tests |
| SNAP-01 | Snapshot save/list/restore of graph.v1 | Store `snapshots/` layout; lock + atomic write; confine names |
| DIFF-01 | Diff current vs snapshot / last-diff-base (± nodes & triples by id) | DESIGN DiffResult; baseline resolution order |
| REP-01 | Repair regenerates projection from v1 without inventing triples | `projectGraph` from v1 only; never read projection as input |
</phase_requirements>

## Summary

Phase 3 adds the **read-side multi-hop Query IR** and the **lifecycle write side** (correct incremental invalidation, snapshots, diff, repair) on top of the Phase 1–2 store and build pipeline. The stack stays **pure TypeScript on Node ≥22**: adjacency maps + BFS for path/neighborhood, shared confidence ranks for budget/filter, and the existing lock + dual-write publish protocol for any mutation. No new npm runtime dependencies; graphology/ngraph are explicitly out (D-03).

Live code already supplies the hard prerequisites: `loadGraphV1` (v1-only SoT), `bestTier` multiset ranks, `fingerprintFile` (`sha256:`), `build({ full: false })` fingerprint skip + partial provenance strip, `acquireBuildLock` / `publishGraphFiles`, and reason code `NO_BASELINE`. Phase 2 incremental is **not yet M1–M5 complete** — in particular, **deleted corpus sources are not invalidated** when other files stay fresh. Phase 3 must extract a pure invalidation helper, close that gap inside the incremental build path, and ship library APIs for query/snapshot/diff/repair without CLI/pack/LLM.

**Primary recommendation:** Implement `src/pipeline/query.ts` (IR + adjacency + budget), pure `src/pipeline/maintain.ts` invalidation used by `build({ full: false })`, and lifecycle modules for snapshot/diff/repair under lock — zero new packages; export public façade from `src/index.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Query IR execution (seed/path/neighborhood/filter) | Library / in-process pure compute | File store (read graph.v1) | Stateless over loaded graph; no network |
| Confidence budget / tier ranks | Library pure compute | Normalize (`bestTier`) | Shared rank order K6; no separate ranking service |
| Adjacency BFS / shortest path | Library pure compute | — | D-03 pure-TS; laptop scale ≤100k nodes |
| Incremental provenance invalidation M1–M5 | Library write path | File store + corpus FS | Mutates graph via fingerprints; publish under lock |
| Fingerprint re-extract orchestration | Library write path (`build`/`maintain`) | sources/* extractors | Reuse Phase 2 discover/extract/normalize |
| Snapshot save/list/restore | Library write/read | Store `snapshots/` | Full graph.v1 copies; confine names |
| Diff vs baseline | Library pure compute | Store (load v1 + baseline file) | Id-set arithmetic; no graph DB |
| Repair projection | Library write path | Store (`graph.json` only) | Projection disposable; v1 sole input |
| Build lock for mutations | Library IO | OS filesystem | D-10; same `.build.lock` as build/review |
| packSubgraph / answer / CLI / LLM | Deferred | — | Phases 4–6 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `>=22` (env: v25.6.1) | Runtime | Package engines; built-in `fs`/`crypto`/`node:test` [VERIFIED: package.json engines] |
| TypeScript | `^6.0.3` (installed) | Language | Existing project compile path [VERIFIED: package.json devDependencies] |
| `ajv` | `^8.20.0` | graph.v1 validation on load/publish | Existing SoT validation [VERIFIED: package.json dependencies] |
| `ajv-formats` | `^3.0.1` | date-time formats | Existing [VERIFIED: package.json dependencies] |
| Pure-TS adjacency + BFS | (in-repo) | Query path/neighborhood/seed expand | D-03; STACK rejects graphology for v0.1 [VERIFIED: .planning/research/STACK.md Graph algorithms] |

### Supporting (already present — do not reinstall)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `c8` | `^12.0.0` | Coverage gate ≥80 lines | D-12 tests [VERIFIED: package.json scripts test:coverage] |
| `@types/node` | `^22.19.0` | Node typings | Existing |
| `node:crypto` createHash | built-in | Fingerprints / triple ids (reuse) | Already in fingerprint + ids |
| `node:test` + `node:assert/strict` | built-in | Unit/integration tests | D-12 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-TS BFS | `graphology` + `graphology-shortest-path` | Extra model translation; D-03 forbids for Phase 3 |
| Pure-TS BFS | `ngraph.graph` / `ngraph.path` | Second graph model; provenance lives on our triples |
| Token budget estimate | Node/triple count budget only | DESIGN specifies `ceil(JSON.stringify(subgraph).length / 4)`; count-only is simpler but diverges from pack later |
| Separate `maintain()` engine | Duplicate of `build({full:false})` | Dual paths drift; reject |

**Installation:**

```bash
# Phase 3 installs NO new packages. Existing stack is sufficient.
npm test
npm run test:coverage
```

**Version verification (session):** Node `v25.6.1`; `c8@12.0.0`; `typescript@6.0.3` installed; `graphology@0.26.0` / `ngraph.graph@20.1.2` exist on npm but **must not be added** (D-03).

## Package Legitimacy Audit

> Phase 3 installs **no** external packages. Pure-TS only.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none proposed)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  

*Explicit non-deps (do not install):* `graphology`, `ngraph.graph`, `ngraph.path` — rejected by D-03 and STACK.md.

## Architecture Patterns

### System Architecture Diagram

```text
                    query / path / filter / neighborhood
                              │
                              ▼
                    loadGraphV1(store)  ──X── graph.json (never SoT)
                              │
                              ▼
                    buildAdjacencyMap(nodes, triples)
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        seed_expand      BFS path         filter scan
        (term match →    (from→to)        (types/p/conf)
         hop expand)
              │               │                │
              └───────────────┼────────────────┘
                              ▼
                       applyBudget(rank drop)
                              ▼
                         QueryResult

WRITE / LIFECYCLE
  corpus + sources.manifest
           │
           ▼
  fingerprint deltas + removed paths
           │
           ▼
  invalidateProvenance (M1–M5) ──► re-extract changed ──► normalize
           │
           ▼
  acquireBuildLock → publishGraphFiles (v1 first) → release
           │
           ├── snapshotSave → snapshots/<iso>-<name>.json
           ├── last-diff-base write after successful build
           ├── diff(current, baseline) by id
           └── repair: project(v1) → graph.json only
```

### Recommended Project Structure

```text
src/
├── pipeline/
│   ├── query.ts          # Query IR, adjacency, BFS, applyBudget, query()
│   ├── maintain.ts       # pure invalidateProvenance + (optional) maintain alias
│   ├── build.ts          # wire full invalidation into full:false path
│   ├── snapshot.ts       # save/list/restore
│   ├── diff.ts           # DiffResult vs snapshot | last-diff-base
│   ├── repair.ts         # projection from v1
│   ├── project.ts        # graph.v1 → disposable graph.json edges (shared)
│   ├── normalize.ts      # reuse bestTier path
│   └── ids.ts            # export confidenceRank alongside bestTier
├── io/
│   ├── load-graph.ts     # loadGraphV1 only
│   ├── atomic-publish.ts # publish under caller lock
│   ├── lock.ts
│   └── paths.ts          # confineUnderRoot for snapshots/*
├── types.ts              # QueryIR, QueryResult, DiffResult, Snapshot*
└── index.ts              # public exports
tests/
├── query.test.ts
├── maintain.test.ts      # M1–M5
├── snapshot.test.ts
├── diff.test.ts
└── repair.test.ts
```

### Pattern 1: Query IR dispatcher (structured only)

**What:** Single `query(opts)` accepts a discriminated IR (or ergonomic bag that maps to ops).  
**When to use:** All multi-hop reads (CLI later maps flags → IR).  
**Example:**

```typescript
// Source: docs/DESIGN.md Query section (QueryIR) — [VERIFIED: docs/DESIGN.md:596-601]
type QueryIR =
  | { op: 'seed_expand'; term: string; hops: number }
  | { op: 'path'; from: string; to: string; maxDepth: number }
  | { op: 'neighborhood'; id: string; hops: number }
  | { op: 'filter'; types?: string[]; predicates?: string[]; confidenceMin?: Confidence };
```

Ergonomic library façade (discretion — map bag → IR):

```typescript
// Recommended public bag (discretion; maps to QueryIR)
export interface QueryOptions {
  dir?: string;
  /** seed_expand */
  term?: string;
  hops?: number;
  budget?: number | null;
  /** path */
  path?: { from: string; to: string; maxDepth?: number };
  /** neighborhood */
  id?: string;
  /** filter */
  types?: string[];
  predicates?: string[];
  confidenceMin?: Confidence;
  /** optional in-memory graph for unit tests (skip disk) */
  graph?: GraphV1Document;
}
```

### Pattern 2: Shared confidence ranks + applyBudget

**What:** One rank map for `bestTier`, `confidenceMin`, and budget drops.  
**When to use:** Always; never hard-code a second order.  
**Live ranks** [VERIFIED: src/pipeline/ids.ts:7-11]:

```typescript
// Verbatim from src/pipeline/ids.ts:7-11
const TIER_RANK: Record<Confidence, number> = {
  EXTRACTED: 2,
  INFERRED: 1,
  AMBIGUOUS: 0,
};
```

Budget (DESIGN) [VERIFIED: docs/DESIGN.md:593]:

```typescript
// Drop worst first: AMBIGUOUS → INFERRED → EXTRACTED; retain seeds when possible
// Token estimate: ceil(JSON.stringify(subgraph).length / 4)
function applyBudget(
  nodes: GraphNode[],
  triples: Triple[],
  budgetTokens: number | null | undefined,
  seedIds: ReadonlySet<string>,
): { nodes: GraphNode[]; triples: Triple[]; trimmed: string | null }
```

Export `confidenceRank(c: Confidence): number` from `ids.ts` (re-export of TIER_RANK) so query does not duplicate ranks (D-02).

### Pattern 3: Multiset provenance invalidation (M1–M5)

**What:** Pure function over triples; path set = changed ∪ removed.  
**When to use:** Incremental rebuild before re-extract/normalize.  
**Live partial impl** [VERIFIED: src/pipeline/build.ts:148-172]:

```typescript
// Verbatim core from stripChangedSources (build.ts:158-167)
const provenance = (t.provenance ?? []).filter(
  (e) => !changedPaths.has(normPathKey(e.source_path)),
);
if (provenance.length === 0) continue;
kept.push({
  ...t,
  provenance,
  confidence: bestTier(provenance),
});
```

**Must also strip paths present in prior manifest but absent from current discover set** (deleted sources) — see Pitfall 1.

### Pattern 4: Snapshot + last-diff-base under store

**What:** Full `graph.v1` JSON documents under `snapshots/`; baseline for diff.  
**When to use:** SNAP-01 / DIFF-01.  
Layout [VERIFIED: docs/DESIGN.md:287-288, 762-764]:

```text
.gsd-graph/
├── graph.v1.json
├── snapshots/
│   ├── .last-diff-base.json          # written after successful build
│   └── 2026-08-03T12-00-00.000Z-pre-refactor.json
```

### Pattern 5: Repair projection from v1 only

**What:** `loadGraphV1` → edge projection → write `graph.json` (under lock).  
**When to use:** REP-01; after crash lag; when `writeProjection` was false.  
Projection shape [VERIFIED: docs/DESIGN.md:490-498]:

```typescript
// Edge projection fields (DESIGN)
{
  source: triple.s,
  target: triple.o,
  relation: triple.p,
  label: triple.p,
  confidence: triple.confidence,
  id: triple.id
}
```

**Live gap:** `build()` passes `writeProjection` but **does not pass `projection` object**, so projection is never written even when requested [VERIFIED: src/pipeline/build.ts:397-406]. Phase 3 must add `projectGraph(v1)` and use it from `build`, `repair`, and any `writeProjection: true` publish.

### Anti-Patterns to Avoid

- **NL→IR in query.ts:** Deferred; structured ops only (D-01, K10).
- **Reading `graph.json` for query/diff/repair input:** Violates D-04 / STORE-02.
- **Second ranking order in budget:** Breaks QRY-02 vs normalize.
- **graphology/ngraph dependency:** Violates D-03.
- **Separate maintain engine that diverges from build:** Dual provenance logic.
- **Snapshot names with `..` or absolute paths:** PATH_ESCAPE (DESIGN security table).
- **Repair inventing triples from neighborhood heuristics:** Violates REP-01.
- **Implementing packSubgraph in Phase 3:** Deferred Phase 5 (may export helpers only).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation of graph.v1 | Custom validators | Existing Ajv `validateGraphV1` / `loadGraphV1` | Schema is authority |
| Atomic multi-file publish | Ad-hoc writeFile | `publishGraphFiles` + caller lock | Dual-write order proven |
| Content fingerprints | Custom hash format | `fingerprintFile` → `sha256:` | EXT-03 already shipped |
| Confidence aggregation | Ad-hoc max strings | `bestTier` | Multiset + M1–M5 depend on it |
| Path confinement | string prefix only | `confineUnderRoot` / `storeFile` | Symlink escape class |
| Graph DB for path queries | Embed Neo4j/SQLite | Pure adjacency Map + BFS | Local-first v1; caps fit RAM |
| Stable JSON for ids | Hand-rolled key sort | Existing `stableStringify` if needed | Already in ids.ts |

**Key insight:** Phase 3 is almost entirely **composition of existing store primitives + pure algorithms**. The rewrite risks are incorrect invalidation and dual ranking — not missing libraries.

## Common Pitfalls

### Pitfall 1: Deleted sources not invalidated on incremental build
**What goes wrong:** Remove a corpus file; other files stay fresh → triples from the deleted file survive with stale EXTRACTED confidence.  
**Why it happens:** Live `build` only strips `changedPaths` (re-extracted files). When `changedPaths` is empty and `sources_skipped_fresh > 0`, strip is a no-op [VERIFIED: src/pipeline/build.ts:153-155, 279-287]. Removed manifest keys are never added to the strip set.  
**How to avoid:** `pathsToDrop = changedPaths ∪ removedPaths` where `removedPaths = manifestKeys \ discoveredKeys` (realpath-normalized). Always apply invalidation when prior graph exists and `!full`, even if zero files re-extract.  
**Warning signs:** M2/M3 fail; `diff` after delete shows no triple removals; incremental ≠ full on same corpus.

### Pitfall 2: Budget hides multi-hop paths (PITFALLS #10)
**What goes wrong:** Budget drops EXTRACTED path edges before AMBIGUOUS noise, or hops too small → empty path / star neighborhood.  
**Why it happens:** Wrong drop order or budget applied before path retention.  
**How to avoid:** Drop AMBIGUOUS → INFERRED → EXTRACTED; retain seed nodes; stable tie-break by `triple.id` ascending; tests assert order (future G3).  
**Warning signs:** Path exists without budget, disappears with budget while AMBIGUOUS triples remain.

### Pitfall 3: Projection treated as SoT / repair invents data
**What goes wrong:** Repair or query falls back to `graph.json` when v1 missing; silent data loss.  
**How to avoid:** `loadGraphV1` only; missing v1 → `SCHEMA_INVALID`; repair writes projection from v1 triples only.  
**Warning signs:** Tests that seed only `graph.json` and still "query successfully."

### Pitfall 4: Dual confidence rank tables
**What goes wrong:** Query uses string sort or different enum order than `bestTier`.  
**How to avoid:** Export single `confidenceRank` from `ids.ts`; query/budget/filter import it.  
**Warning signs:** `confidenceMin: 'INFERRED'` includes/excludes differently than normalize expectations.

### Pitfall 5: Snapshot / restore without lock or path confinement
**What goes wrong:** Concurrent restore tears store; `../etc/passwd` snapshot name escapes.  
**How to avoid:** `acquireBuildLock` for save/restore (and repair); sanitize names to `[A-Za-z0-9._-]+` or similar; resolve under `confineUnderRoot(store, 'snapshots/...')`.  
**Warning signs:** PATH_ESCAPE tests missing; restore mid-build.

### Pitfall 6: Diff baseline ambiguity
**What goes wrong:** Diff with no snapshot and no last-diff-base succeeds with empty/wrong baseline.  
**How to avoid:** Resolution order from DESIGN: named snapshot → `snapshots/.last-diff-base.json` → throw `NO_BASELINE` [VERIFIED: docs/DESIGN.md:762-764, GSD_GRAPH_REASON.NO_BASELINE in src/errors.ts:19].  
**Warning signs:** Silent empty diff on fresh store.

### Pitfall 7: writeProjection flag without projection payload
**What goes wrong:** Callers set `writeProjection: true` but no `graph.json` appears.  
**Why:** `publishGraphFiles` requires both `writeProjection && projection != null` [VERIFIED: src/io/atomic-publish.ts:111]; build omits `projection`.  
**How to avoid:** Shared `projectGraph`; pass into publish from build/repair.

### Pitfall 8: Hand-rolling graphology for "faster path"
**What goes wrong:** Dependency bloat + model translation loses provenance.  
**How to avoid:** D-03 pure-TS; performance budgets in DESIGN are laptop-local.

## Code Examples

### query seed+expand + budget

```typescript
// gsd-graph — query seed_expand sketch (Phase 3)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
// Ranks: EXTRACTED=2, INFERRED=1, AMBIGUOUS=0 [VERIFIED: src/pipeline/ids.ts:7-11]
// Budget: ceil(JSON.stringify(sub).length/4); drop worst first [VERIFIED: docs/DESIGN.md:593]

import { loadGraphV1 } from '../io/load-graph';
import { resolveStoreRoot } from '../io/paths';
import { confidenceRank } from './ids'; // export in Phase 3
import type { GraphNode, GraphV1Document, Triple } from '../types';

export function query(opts: QueryOptions): QueryResult {
  const graph =
    opts.graph ??
    loadGraphV1(resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}));
  const adj = buildAdjacencyMap(graph);

  let nodes: GraphNode[] = [];
  let triples: Triple[] = [];
  let paths: Array<{ nodes: string[]; predicates: string[] }> = [];
  let seeds = new Set<string>();

  if (opts.path) {
    const found = findShortestPath(adj, opts.path.from, opts.path.to, opts.path.maxDepth ?? 6);
    paths = found ? [found] : [];
    ({ nodes, triples } = materializePath(graph, found));
    seeds = new Set(found?.nodes ?? []);
  } else if (opts.id) {
    seeds = new Set([opts.id]);
    ({ nodes, triples } = expandHops(adj, graph, seeds, opts.hops ?? 1));
  } else if (opts.types || opts.predicates || opts.confidenceMin) {
    ({ nodes, triples } = filterGraph(graph, opts));
  } else if (opts.term !== undefined) {
    seeds = matchTermSeeds(graph, opts.term); // id/label/alias substring, case-fold
    ({ nodes, triples } = expandHops(adj, graph, seeds, opts.hops ?? 2));
  } else {
    throw new GraphError(/* usage */ 'query requires term | path | id | filter fields');
  }

  const budgeted = applyBudget(nodes, triples, opts.budget, seeds);
  return {
    nodes: budgeted.nodes,
    triples: budgeted.triples,
    paths,
    seeds: [...seeds],
    trimmed: budgeted.trimmed,
    budget_tokens: opts.budget ?? null,
  };
}
```

### path / neighborhood / filter

```typescript
// BFS shortest path (unweighted) — pure TS
function findShortestPath(
  adj: AdjacencyMap,
  from: string,
  to: string,
  maxDepth: number,
): { nodes: string[]; predicates: string[] } | null {
  if (from === to) return { nodes: [from], predicates: [] };
  // queue BFS; parent + edge predicate maps; stop at maxDepth
  // Prefer fewer edges; tie-break: lexicographically smaller predicate then neighbor id
  // Undirected expansion: follow triples as s→o and o→s for neighborhood connectivity
  // (document directed vs undirected — recommend undirected for path/neighborhood v0.1)
  return null;
}

function filterGraph(graph: GraphV1Document, opts: QueryOptions) {
  const minRank = opts.confidenceMin ? confidenceRank(opts.confidenceMin) : 0;
  const triples = graph.triples.filter((t) => {
    if (opts.predicates && !opts.predicates.includes(t.p)) return false;
    if (confidenceRank(t.confidence) < minRank) return false;
    return true;
  });
  // nodes: endpoints ∪ type filter on graph.nodes
  return { nodes: /* … */, triples };
}
```

### applyBudget / confidence ranks

```typescript
export function confidenceRank(c: Confidence): number {
  // Must match ids.ts TIER_RANK verbatim
  if (c === 'EXTRACTED') return 2;
  if (c === 'INFERRED') return 1;
  return 0; // AMBIGUOUS
}

export function applyBudget(
  nodes: GraphNode[],
  triples: Triple[],
  budgetTokens: number | null | undefined,
  seedIds: ReadonlySet<string>,
) {
  if (budgetTokens == null || budgetTokens <= 0) {
    return { nodes, triples, trimmed: null as string | null };
  }
  // Sort drop candidates: rank asc (worst first), then id asc
  const ordered = [...triples].sort((a, b) => {
    const dr = confidenceRank(a.confidence) - confidenceRank(b.confidence);
    return dr !== 0 ? dr : a.id.localeCompare(b.id);
  });
  let kept = [...ordered];
  let trimmed: string | null = null;
  const estimate = (n: GraphNode[], t: Triple[]) =>
    Math.ceil(JSON.stringify({ nodes: n, triples: t }).length / 4);

  // Drop from worst until under budget; never drop last edge that isolates all seeds if avoidable
  while (kept.length > 0 && estimate(nodes, kept) > budgetTokens) {
    const victim = kept[0]!;
    kept = kept.slice(1);
    trimmed = `dropped ${victim.id} (${victim.confidence})`;
  }
  const nodeIds = new Set<string>([...seedIds]);
  for (const t of kept) {
    nodeIds.add(t.s);
    nodeIds.add(t.o);
  }
  return {
    nodes: nodes.filter((n) => nodeIds.has(n.id)),
    triples: kept,
    trimmed,
  };
}
```

### maintain / incremental invalidation M1–M5

```typescript
// gsd-graph — pure invalidation (MNT-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/** Drop provenance entries for paths; recompute bestTier; drop empty. */
export function invalidateProvenance(
  triples: readonly Triple[],
  pathsToDrop: ReadonlySet<string>, // realpath-normalized
): Triple[] {
  if (pathsToDrop.size === 0) return triples.map(cloneTriple);
  const kept: Triple[] = [];
  for (const t of triples) {
    const provenance = (t.provenance ?? []).filter(
      (e) => !pathsToDrop.has(normPathKey(e.source_path)),
    );
    if (provenance.length === 0) continue; // M2, M3
    kept.push({
      ...t,
      provenance,
      confidence: bestTier(provenance), // M1, M4, M5
    });
  }
  return kept;
}

/**
 * API decision (RESOLVED):
 * - Pure helpers live in maintain.ts
 * - build({ full: false }) MUST call invalidateProvenance with changed∪removed
 * - Optional public: maintain(opts) => build({ ...opts, full: false })
 *   (alias only — no second orchestrator)
 */
export function maintain(opts: BuildOptions): BuildResult {
  return build({ ...opts, full: false });
}

// M1–M5 matrix [VERIFIED: docs/DESIGN.md:687-692]
// M1 Two entries EXTRACTED+INFERRED; drop EXTRACTED source → remains INFERRED
// M2 Drop both sources → triple gone
// M3 Single EXTRACTED; drop path → triple gone
// M4 Two EXTRACTED different paths; drop one → remains EXTRACTED
// M5 Dedup merge mixed tiers → confidence EXTRACTED if any entry is
```

### snapshotSave / List / Restore

```typescript
// Layout [VERIFIED: docs/DESIGN.md:287-288]
// snapshots/<iso>-<name>.json ; snapshots/.last-diff-base.json

const SNAP_DIR = 'snapshots';
const LAST_DIFF_BASE = '.last-diff-base.json';

function sanitizeSnapshotName(name: string): string {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new GraphError(GSD_GRAPH_REASON.PATH_ESCAPE, `invalid snapshot name: ${name}`);
  }
  // Discretion: allow [A-Za-z0-9._-]+ only
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new GraphError(GSD_GRAPH_REASON.PATH_ESCAPE, `invalid snapshot name: ${name}`);
  }
  return name;
}

export function snapshotSave(opts: { dir?: string; name: string }): SnapshotResult {
  const storeRoot = resolveStoreRoot(opts.dir ? { dir: opts.dir } : {});
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const graph = loadGraphV1(storeRoot);
    const safe = sanitizeSnapshotName(opts.name);
    const iso = new Date().toISOString().replace(/:/g, '-');
    const fileName = `${iso}-${safe}.json`;
    const finalPath = confineUnderRoot(storeRoot, `${SNAP_DIR}/${fileName}`);
    fs.mkdirSync(confineUnderRoot(storeRoot, SNAP_DIR), { recursive: true });
    const tmp = `${finalPath}.tmp-${process.pid}`;
    writeJsonAtomicTemp(tmp, graph);
    fs.renameSync(tmp, finalPath);
    return { name: safe, path: finalPath, fileName };
  } finally {
    lock.release();
  }
}

export function snapshotList(opts?: { dir?: string }): SnapshotInfo[] {
  // list snapshots/*.json excluding .last-diff-base.json; sort by mtime desc
  // retention policy (discretion): no auto-prune in v0.1; list returns all
}

export function snapshotRestore(opts: { dir?: string; name: string }): SnapshotResult {
  // lock → load snapshot file (validateGraphV1) → publishGraphFiles({ graphV1, writeProjection })
  // invent no triples; optional keep sidecars as-is (document: restore replaces v1 only)
}
```

### diff

```typescript
// DiffResult [VERIFIED: docs/DESIGN.md:769-775]
export interface DiffResult {
  baseline: string; // path or name
  nodes: { added: string[]; removed: string[]; changed: string[] };
  triples: { added: string[]; removed: string[]; changed: string[] };
  counts: {
    nodes_added: number;
    nodes_removed: number;
    triples_added: number;
    triples_removed: number;
  };
}

export function diff(opts: { dir?: string; snapshot?: string }): DiffResult {
  const storeRoot = resolveStoreRoot(opts.dir ? { dir: opts.dir } : {});
  const current = loadGraphV1(storeRoot);
  const baselinePath = resolveBaseline(storeRoot, opts.snapshot); // throws NO_BASELINE
  const baseline = readJsonFile(baselinePath) as GraphV1Document;
  if (!validateGraphV1(baseline)) {
    throw new GraphError(GSD_GRAPH_REASON.SCHEMA_INVALID, 'baseline not valid graph.v1');
  }
  // set arithmetic by id; changed = same id, stable payload differs
  // exclude built_at / engine_version from node/triple compare? 
  // DESIGN: "same id, different JSON payload (excluding volatile timestamps if any)"
  // → compare nodes without store-level built_at; triples full s/p/o/confidence/provenance
}
```

**After successful build:** write `snapshots/.last-diff-base.json` as a copy of the published v1 (under same lock as publish, or immediately after publish still holding lock) so DIFF-01 default baseline exists [VERIFIED: docs/DESIGN.md:763].

### repair

```typescript
export function repair(opts?: { dir?: string; writeProjection?: boolean }): RepairResult {
  const storeRoot = resolveStoreRoot(opts?.dir ? { dir: opts.dir } : {});
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const graphV1 = loadGraphV1(storeRoot); // fails if missing — never invent
    const projection = projectGraph(graphV1); // nodes + edges from triples only
    publishGraphFiles({
      storeRoot,
      graphV1,
      projection,
      writeProjection: true, // repair's job is to materialize projection
    });
    return {
      store_dir: storeRoot,
      node_count: graphV1.nodes.length,
      triple_count: graphV1.triples.length,
      projection_written: true,
      reason: GSD_GRAPH_REASON.OK,
    };
  } finally {
    lock.release();
  }
}

export function projectGraph(v1: GraphV1Document): {
  nodes: GraphV1Document['nodes'];
  edges: Array<{
    source: string;
    target: string;
    relation: string;
    label: string;
    confidence: Confidence;
    id: string;
  }>;
} {
  return {
    nodes: v1.nodes,
    edges: v1.triples.map((t) => ({
      source: t.s,
      target: t.o,
      relation: t.p,
      label: t.p,
      confidence: t.confidence,
      id: t.id,
    })),
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RAG chunk retrieve | Typed multi-hop over triples | Product thesis | Query IR is the differentiator |
| GraphRAG embeddings local search | Deterministic term seed + path (no vectors) | DESIGN v0.1 | Offline honesty |
| Scalar provenance | Multiset + best_tier | K6 | Enables M1–M5 |
| graphology default | Pure-TS adjacency | STACK + D-03 | Zero graph deps |
| Phase 2 partial incremental | Full M1–M5 + deleted sources | Phase 3 | Correct maintain |

**Deprecated/outdated:**
- Treating Phase 2 `build({full:false})` as complete MNT-01 without deleted-source strip and M1–M5 tests.
- NL→Query IR as a v0.1 requirement (explicit gap).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Path/neighborhood expand **undirected** (follow s→o and o→s) | Code Examples | Directed-only may miss DESIGN “path” goldens; confirm in plan if product wants directed |
| A2 | Snapshot restore replaces **graph.v1 only** (sidecars/manifest unchanged unless documented) | Snapshots | Restoring old graph with new manifest may look “stale”; may need restore policy note |
| A3 | Budget tie-break by `triple.id` ascending | applyBudget | Non-determinism across runs if omitted |
| A4 | `maintain()` public alias is optional; build incremental is normative | API decision | Naming confusion for library users if alias omitted without docs |
| A5 | No auto-prune of snapshots in v0.1 (list returns all) | Snapshot retention | Disk growth on heavy snapshot use |

**If wrong:** Planner should freeze directedness (A1) and restore scope (A2) in PLAN task notes; low risk for A3–A5.

## Open Questions

### OQ-1: maintain vs `build({ full: false })` — **RESOLVED**
- **What we know:** Phase 2 already implements fingerprint skip + partial strip in `build` [VERIFIED: src/pipeline/build.ts:1-14, 148-172]. DESIGN library API lists `build`, not `maintain` [VERIFIED: docs/DESIGN.md:784-796]. CONTEXT allows either explicit maintain or documented incremental build.
- **Decision:** **Normative incremental API = `build({ full: false })`.** Implement pure `invalidateProvenance` in `src/pipeline/maintain.ts` and call it from build. **Optional** public `maintain(opts) => build({ ...opts, full: false })` alias for readability — must not diverge. M1–M5 tests target the pure helper + integration via `build({ full: false })`.
- **Also fix:** include **removed** sources in invalidation set; run invalidation whenever prior graph exists and `!full` (not only when `sources_skipped_fresh > 0` with non-empty changed set).

### OQ-2: Budget unit — **RESOLVED**
- **What we know:** DESIGN: `ceil(JSON.stringify(subgraph).length / 4)`; drop AMBIGUOUS → INFERRED → EXTRACTED [VERIFIED: docs/DESIGN.md:593].
- **Decision:** Use DESIGN token estimate as budget unit. `budget: null|undefined` = no trim. Drop order uses shared ranks (D-02). Tie-break triple id ascending (A3).

### OQ-3: Snapshot file layout — **RESOLVED**
- **What we know:** DESIGN store tree `snapshots/<iso>-<name>.json`; diff baseline `snapshots/.last-diff-base.json` after successful build [VERIFIED: docs/DESIGN.md:287-288, 762-764].
- **Decision:**
  - Directory: `<store>/snapshots/`
  - Named snapshots: `<ISO-8601-with-colons-as-hyphens>-<sanitizedName>.json` containing full graph.v1 document
  - Auto baseline: `snapshots/.last-diff-base.json` (full graph.v1 copy) written at end of successful `build`/`maintain` while lock held
  - `snapshotList`: all `*.json` except `.last-diff-base.json`, newest first
  - Retention: none automatic (A5)
  - Names: reject `..`, separators; allow `[A-Za-z0-9._-]+`

### OQ-4: Directed vs undirected path — **RESOLVED (recommendation)**
- **Decision for v0.1:** **Undirected** expansion for path + neighborhood (treat edges as bidirectional for traversal; still return actual predicates on the directed triple used). Document clearly. Directed-only mode can be a later option. (A1)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test/query | ✓ | v25.6.1 | — |
| npm | scripts | ✓ | (project) | — |
| TypeScript / tsc | compile | ✓ | 6.0.3 | — |
| c8 | coverage gate | ✓ | 12.0.0 | — |
| ajv | schema validate | ✓ | 8.20.0 | — |
| graphology | — | n/a | — | **Do not install** |
| External DB / network | — | n/a | — | Not required |

**Missing dependencies with no fallback:** none  
**Missing dependencies with fallback:** none  

Step 2.6: external services not required (library-only pure FS + RAM).

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` [VERIFIED: .planning/config.json workflow.nyquist_validation].

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node built-in) |
| Coverage | `c8` `--check-coverage --lines 80` |
| Config file | none separate — scripts in package.json |
| Quick run command | `npm test` |
| Full suite command | `npm run test:coverage` |
| Build before test | `tsc -p tsconfig.build.json` + `tsc -p tsconfig.test.json` → `dist-test/**/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QRY-01 | seed_expand finds term and expands hops | unit | `node --test dist-test/query.test.js` | ❌ Wave 0 |
| QRY-01 | path returns node chain with predicates | unit | same | ❌ Wave 0 |
| QRY-01 | neighborhood by id | unit | same | ❌ Wave 0 |
| QRY-01 | filter types/predicates/confidenceMin | unit | same | ❌ Wave 0 |
| QRY-02 | budget drops AMBIGUOUS before EXTRACTED | unit | same | ❌ Wave 0 |
| QRY-02 | confidenceMin uses same ranks as bestTier | unit | same | ❌ Wave 0 |
| MNT-01 | M1 mixed tier drop EXTRACTED source | unit | `node --test dist-test/maintain.test.js` | ❌ Wave 0 |
| MNT-01 | M2 drop both sources | unit | same | ❌ Wave 0 |
| MNT-01 | M3 single source drop | unit | same | ❌ Wave 0 |
| MNT-01 | M4 two EXTRACTED drop one | unit | same | ❌ Wave 0 |
| MNT-01 | M5 merge mixed → EXTRACTED | unit | same | ❌ Wave 0 |
| MNT-01 | deleted file invalidates provenance (integration) | integration | `node --test dist-test/maintain.test.js` | ❌ Wave 0 |
| SNAP-01 | save/list/restore round-trip graph.v1 | integration | `node --test dist-test/snapshot.test.js` | ❌ Wave 0 |
| SNAP-01 | bad name → PATH_ESCAPE | unit | same | ❌ Wave 0 |
| DIFF-01 | ± nodes/triples by id vs snapshot | unit/integration | `node --test dist-test/diff.test.js` | ❌ Wave 0 |
| DIFF-01 | missing baseline → NO_BASELINE | unit | same | ❌ Wave 0 |
| REP-01 | repair writes graph.json from v1 only | integration | `node --test dist-test/repair.test.js` | ❌ Wave 0 |
| REP-01 | repair does not invent triples | unit | same | ❌ Wave 0 |
| D-04 | query never reads graph.json | unit | query + load tests | partial (load-graph exists) |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green + M1–M5 + query path tests before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/query.test.ts` — QRY-01, QRY-02
- [ ] `tests/maintain.test.ts` — M1–M5 + deleted source
- [ ] `tests/snapshot.test.ts` — SNAP-01
- [ ] `tests/diff.test.ts` — DIFF-01
- [ ] `tests/repair.test.ts` — REP-01
- [ ] Export `confidenceRank` (or equivalent) from `ids.ts` for shared rank tests
- [ ] `projectGraph` helper + wire into build publish when `writeProjection: true`
- [ ] Write `snapshots/.last-diff-base.json` from build success path

Existing infrastructure covers store/load/lock/normalize/build fingerprints — reuse fixtures under `tests/fixtures/` (JSONL multi-hop from Phase 2).

## Security Domain

> `security_enforcement` enabled (default) in config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local library; no authn |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | OS file permissions only |
| V5 Input Validation | yes | Query options shape; snapshot name sanitize; Ajv on graph.v1; path confinement |
| V6 Cryptography | no new | Existing sha256 fingerprints/ids only; no new crypto protocols |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Snapshot name path traversal (`..`, abs paths) | Tampering / Info disclosure | sanitize + `confineUnderRoot`; PATH_ESCAPE |
| Symlink escape under store/snapshots | Elevation / Info disclosure | realpath prefix checks (existing paths.ts) |
| Concurrent restore/build tear | Tampering | `.build.lock` on all writers (D-10) |
| Query DoS via huge hops on max graph | Denial of service | Respect existing hard caps; bound maxDepth/hops (e.g. clamp hops ≤ 16) [ASSUMED clamp] |
| Projection re-imported as graph | Tampering | Never load projection as SoT (D-04, REP-01) |
| Budget/filter confusion as “security” | — | Not authz; still consistency-critical for product honesty |

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` — Query IR, budget, M1–M5, DiffResult, snapshots, library exports, dual-write, K6/K10/K21/K25 [VERIFIED: Read this session]
- `src/pipeline/ids.ts` — `TIER_RANK`, `bestTier` [VERIFIED: lines 7-52]
- `src/pipeline/build.ts` — incremental strip, fingerprint skip, publish [VERIFIED: full file]
- `src/io/load-graph.ts` — v1-only load [VERIFIED: full file]
- `src/io/atomic-publish.ts` — projection requires payload [VERIFIED: lines 111-116]
- `src/errors.ts` — `NO_BASELINE`, reason codes [VERIFIED: lines 8-20]
- `src/types.ts` — BuildOptions `full?: boolean`, StatusResult [VERIFIED: Read]
- `.planning/phases/02-build-pipeline/02-04-SUMMARY.md` — incremental not full M1–M5 [VERIFIED]
- `.planning/research/PITFALLS.md` — invalidation, budget, projection SoT [VERIFIED]
- `.planning/research/ARCHITECTURE.md` — query under pack layer; read vs write path [VERIFIED]
- `.planning/research/STACK.md` — pure-TS graph algorithms; reject graphology [VERIFIED]
- `.planning/config.json` — nyquist_validation true; security_enforcement true [VERIFIED]
- `package.json` — scripts, deps, engines [VERIFIED]

### Secondary (MEDIUM confidence)

- Microsoft GraphRAG local search methodology (architecture lineage only; not implemented) — cited in ARCHITECTURE.md
- npm registry existence of graphology/ngraph (versions checked; **not adopted**)

### Tertiary (LOW confidence)

- Hop clamp default upper bound (A1/security DoS) — product discretion
- Snapshot restore sidecar policy details beyond v1 replace

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new packages; live package.json + STACK
- Architecture: **HIGH** — DESIGN + live IO/build surface; one fix gap (deleted sources) clearly identified
- Pitfalls: **HIGH** — PITFALLS.md + verified build.ts gap
- API resolutions (maintain/budget/snapshots): **HIGH** for product locks; **MEDIUM** for undirected path default (A1)

**Research date:** 2026-08-03  
**Valid until:** 2026-09-02 (30 days; stable local-first design)

---

*End of Phase 3 research.*
