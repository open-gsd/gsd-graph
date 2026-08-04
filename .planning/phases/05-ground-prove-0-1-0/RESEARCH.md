# Phase 5: Ground & prove 0.1.0 - Research

**Researched:** 2026-08-03  
**Domain:** Graph grounding (`packSubgraph` / deterministic `answer`), golden offline multi-hop honesty, CLI pack/answer, 0.1.0 release readiness  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** `packSubgraph` is composition of **public** query ops only (K21) — no private graph walk that bypasses `query` (PACK-01)
- **D-02** Algorithm: tokenize question → score seeds (top 5) → seed_expand union → path among top seeds → applyBudget → citations from remaining triples (DESIGN § Grounded answer)
- **D-03** Deterministic `answer()` default: markdown Seeds / Relationships / Paths / Citations; citations ⊆ pack triples (ANS-01)
- **D-04** Empty pack → `abstained: true`, mode `abstain`, no fabricated relationships (ANS-02)
- **D-05** No LLM required for Phase 5 GA; optional LLM answer deferred to Phase 6
- **D-06** CLI registers `pack` and `answer` commands (K22 JSON) wiring library APIs
- **D-07** Golden G0: free-prose corpus offline → answer/pack abstains (or no typed multi-hop path) (GOLD-01)
- **D-08** Golden G1+: structured MD/JSONL with explicit chain (e.g. `causes`) → paths ≥1 with ≥3 nodes and required predicate (GOLD-02)
- **D-09** GOLD-03: suite green including M1–M5 (already Phase 3), core CLI, pack/answer goldens; package remains version `0.1.0` (already) with release notes / CHANGELOG readiness
- **D-10** loadGraphV1 only for pack/answer store reads
- **D-11** Copyright headers on all new source
- **D-12** Tests: node:test; fixtures under `tests/fixtures/golden/` and/or existing corpus

### Claude's Discretion
- Exact stopword list (must include DESIGN set)
- Whether pack accepts in-memory graph vs only on-disk store (prefer both: graph in opts or load from --dir)
- CHANGELOG.md format for 0.1.0
- G2–G4 if DESIGN mentions them — implement if cheap; G0–G1 are required

### Deferred Ideas (OUT OF SCOPE for Phase 5)
- LLM `prompt`/`http` answer apply — Phase 6  
- MCP tools — Phase 6  
- Communities — Phase 7  
- Example domain packs — Phase 6  
- GRAPH_REPORT — Phase 6  
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PACK-01 | `packSubgraph` is composition of public query ops (documented algorithm) | K21 algorithm maps 1:1 onto exported `expandHops` / `query({id})` / `query({path})` / `findShortestPath` / `applyBudget` + `loadGraphV1`; seed scoring is pack-layer only (not a private walk) |
| ANS-01 | Deterministic answer renders markdown with triple citations from pack only | Fixed markdown template; citation triple_ids must be ⊆ pack.triples ids |
| ANS-02 | Empty pack produces abstain (no fabricated relationships) | Return `GroundedAnswer` with `mode: 'abstain'`, `abstained: true`, reason `empty_subgraph` — do not throw for empty pack |
| GOLD-01 | Golden G0 (abstain on unstructured free prose offline) | Reuse `tests/fixtures/corpus/free-prose.md`; live build yields only `about` (no typed multi-hop) |
| GOLD-02 | Golden G1+ multi-hop on link/JSONL with path assertions | Reuse `tests/fixtures/corpus/multi-hop.jsonl`; live path Drought→Food Shortage has ≥3 nodes + `causes` |
| GOLD-03 | 0.1.0 release only after goldens + M1–M5 + core CLI green | `package.json` already `0.1.0`; add CHANGELOG + gate on full `npm test` |
</phase_requirements>

## Summary

Phase 5 closes the **Ground** stage and the **0.1.0** honesty bar. The library already owns a complete Query IR (`path`, `seed_expand`, `neighborhood`, `filter`, `applyBudget`) and CLI surface for everything except `pack` / `answer`. Those two verbs, plus offline goldens G0–G1 (and cheap G2–G4 wrappers), are the only product work left on the critical path.

**`packSubgraph` is implementable today without new graph-walk code.** Live exports already provide undirected hop expansion, shortest path with directed predicates, and confidence-budget trim. Pack only adds: (1) question tokenization + stopword drop, (2) per-node seed scoring and top-k selection, (3) union of public expand/path results, (4) citation projection. Deterministic `answer()` is a pure formatter over the pack (plus abstain). No new npm dependencies.

**Primary recommendation:** Implement `src/pipeline/pack.ts` + `src/pipeline/answer.ts` as pure composition over existing query exports; wire CLI like Phase 4 thin adapters; goldens build isolated stores from existing corpus fixtures (`free-prose.md`, `multi-hop.jsonl`); flip Phase 4 “pack/answer unregistered” tests to registered happy-path; ship CHANGELOG for `0.1.0` when `npm test` is green.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Seed scoring / tokenize question | Library (pack) | — | Pure function over in-memory graph nodes + question string |
| Hop expand / path / budget | Library (query) | — | Already public; pack must call these, not reimplement BFS |
| Load SoT graph | Library IO (`loadGraphV1`) | CLI `--dir` | D-10: never read projection |
| Deterministic answer markdown | Library (answer) | — | Formatter only; no LLM |
| pack/answer CLI verbs | CLI adapter | Library | Same K22 pattern as query/path |
| Golden G0/G1 honesty | Test suite | Corpus fixtures | Offline build + pack/answer assertions |
| 0.1.0 release readiness | Package metadata + CHANGELOG | CI `npm test` | Version already 0.1.0; gate is green suite |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | ≥22 (env: v25.6.1) | Runtime | Engines field already locked [VERIFIED: package.json] |
| TypeScript → CJS + `.d.ts` | project `typescript` ^6 | Build | Existing `tsc -p tsconfig.build.json` [VERIFIED: package.json scripts] |
| `node:test` + `node:assert/strict` | Node built-in | Tests | D-12; all prior phases [VERIFIED: tests/query.test.ts:4-5] |
| commander | ^14.0.3 (registry 15.0.0) | CLI | Existing CLI surface [VERIFIED: package.json] |
| Existing query pipeline | in-repo | Pack composition | `query`, `expandHops`, `findShortestPath`, `applyBudget`, `seedAndExpand`, `buildAdjacencyMap` [VERIFIED: src/index.ts:105-118] |
| `loadGraphV1` | in-repo | SoT reads | D-10 [VERIFIED: src/io/load-graph.ts:20-50] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | ^1.1.1 | stderr TTY color only | Already in CLI error path — do not touch stdout JSON |
| ajv / ajv-formats | existing | Schema validation | Unchanged this phase (loadGraphV1 already validates) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Public `expandHops` / `query({id})` | Private BFS inside pack.ts | **Forbidden by D-01/K21** — would bypass query |
| `seedAndExpand(graph, seed.label)` for each seed | `expandHops(adj, graph, Set([seed.id]), hops)` | Label re-match can pull extra seeds via substring; prefer expand from **scored seed ids** |
| Throw `GraphError(EMPTY_SUBGRAPH)` on empty pack | Return empty pack / abstain answer | DESIGN + ANS-02: abstain is a **successful** grounded result, not operational failure |
| New graph library (graphology, ngraph) | — | Rejected in Phase 3; pure-TS already ships |

**Installation:** none — no new packages for Phase 5.

**Version verification:** Existing deps re-checked via package-legitimacy seam (all OK). Registry `commander@15.0.0` is newer than pin `^14.0.3` — **do not bump** in this phase unless needed; pack/answer need no commander API changes beyond two new `.command()` registrations.

## Package Legitimacy Audit

> Phase 5 installs **no** new external packages. Audit of already-declared runtime deps for completeness:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| commander | npm | mature | ~476M/wk | github.com/tj/commander.js | OK | Approved (existing) |
| picocolors | npm | mature | ~219M/wk | github.com/alexeyraspopov/picocolors | OK | Approved (existing) |
| ajv | npm | mature | ~366M/wk | github.com/ajv-validator/ajv | OK | Approved (existing) |
| ajv-formats | npm | mature | ~119M/wk | github.com/ajv-validator/ajv-formats | OK | Approved (existing) |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  
**New installs this phase:** none

## Architecture Patterns

### System Architecture Diagram

```text
                    question string
                          │
                          ▼
                 ┌─────────────────┐
                 │  packSubgraph   │  tokenize + score seeds (pack-layer)
                 └────────┬────────┘
                          │ seed ids (top k≤5, score>0)
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
   query({id,hops})  query({path})    applyBudget
   expandHops×seeds  among top≤3      (public)
   union triples     union paths
          │               │                │
          └───────────────┴────────────────┘
                          │
                          ▼
                   SubgraphPack
              (nodes, triples, paths,
               citations, trimmed, …)
                          │
                          ▼
                 ┌─────────────────┐
                 │     answer      │  deterministic markdown OR abstain
                 └────────┬────────┘
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
     mode=deterministic          mode=abstain
     answer_markdown             abstained=true
     citations ⊆ triples         no fabricated edges
              │                        │
              └───────────┬────────────┘
                          ▼
              CLI pack | answer → writeOk(JSON)
                          │
                          ▼
              goldens G0 (free-prose) / G1 (multi-hop.jsonl)
```

### Recommended Project Structure

```text
src/
├── pipeline/
│   ├── pack.ts          # NEW — packSubgraph (K21)
│   ├── answer.ts        # NEW — deterministic answer (+ abstain)
│   └── query.ts         # EXISTING — public ops only (do not fork BFS)
├── types.ts             # ADD SubgraphPack, GroundedAnswer, PackOptions, AnswerOptions
├── index.ts             # export packSubgraph, answer + types
└── cli.ts               # register pack + answer (remove Phase 4 “intentionally unregistered”)
tests/
├── pack-answer.test.ts          # NEW — composition, citations ⊆, abstain
├── golden-scenarios.test.ts     # NEW — G0, G1 (+ cheap G2–G4)
└── fixtures/
    ├── corpus/                  # REUSE — free-prose.md, multi-hop.jsonl, structured-edges.md
    └── golden/                  # OPTIONAL thin wrappers / question fixtures only
CHANGELOG.md                     # NEW — 0.1.0 release notes
```

### Pattern 1: Pack as public-query composition (K21 / D-01 / D-02)

**What:** Implement DESIGN algorithm using only exported query helpers + `loadGraphV1`.  
**When to use:** Always for `packSubgraph`.

**Live public surface (must use these, not private BFS):**

```typescript
// Source: src/index.ts:105-118 (exports) + src/pipeline/query.ts
export {
  query,
  buildAdjacencyMap,
  findShortestPath,
  matchTermSeeds,
  expandHops,
  seedAndExpand,
  filterGraph,
  applyBudget,
  MAX_QUERY_DEPTH,          // 16
  DEFAULT_PATH_MAX_DEPTH,   // 6
  DEFAULT_SEED_HOPS,        // 2
  DEFAULT_NEIGHBORHOOD_HOPS // 1
} from './pipeline/query';
```

**Prescriptive algorithm (planner → executor):**

```typescript
// Source: docs/DESIGN.md:605-628 (algorithm) + live helpers
// Defaults: hops=2, k_seeds=5, budget=opts.budget ?? null

function packSubgraph(opts: PackOptions): SubgraphPack {
  const graph = opts.graph ?? loadGraphV1(resolveStoreRoot({ dir: opts.dir }));
  const hops = opts.hops ?? DEFAULT_SEED_HOPS; // 2
  const kSeeds = opts.kSeeds ?? 5;
  const budget = opts.budget ?? null;

  // 1. Tokenize: lower case; split non-alphanumeric; drop stopwords; keep len≥2
  // 2. Score each node (see Seed scoring)
  // 3. seeds = top kSeeds by score; drop score 0; ties: shorter label then id asc
  // 4. For each seed id: expandHops(adj, graph, Set([id]), hops) OR
  //    query({ graph, id, hops }) — UNION nodes/triples
  // 5. If ≥2 seeds: pairs among top min(3, seeds.length):
  //    findShortestPath(adj, a, b, hops+2) OR query({ graph, path:{from,to,maxDepth:hops+2} })
  //    keep shortest (fewest edges); union path nodes/predicates + path triples
  // 6. applyBudget(nodes, triples, budget, seedIdSet)
  // 7. citations = remaining triples → { triple_id, s, p, o, source_path: provenance[0]?.source_path }
  // 8. If no triples → empty pack (answer abstains)
}
```

**Stopword set (discretion, must include DESIGN set verbatim):**

```text
a, an, the, and, or, of, to, in, on, for, why, how, what, is, are, did, does, do
```

[VERIFIED DESIGN set: docs/DESIGN.md:613-615]  
Recommendation: use **exactly** that set for 0.1.0 (no extra stopwords) so goldens stay stable. Export `PACK_STOPWORDS` constant for tests.

**Seed scoring (DESIGN step 2):** for each token vs each node (NFKC-lower):

| Signal | Points |
|--------|--------|
| token is full substring of normalized **label** | +3 |
| token is substring of **description** | +1 |
| token matches an **alias** (substring) | +2 |

[VERIFIED: docs/DESIGN.md:616-619]

**Prefer expand-by-id over `seedAndExpand(label)`:** `matchTermSeeds` / `seedAndExpand` re-match a free string and can expand extra nodes when labels share substrings. After scoring, expand from concrete seed **ids** via `expandHops` or `query({ id, hops })` so pack seeding stays faithful to D-02 top-k.

### Pattern 2: Deterministic answer template (D-03 / D-04)

**What:** Pure function `answer(opts) → GroundedAnswer` calling `packSubgraph` then rendering markdown.  
**Empty pack rule:** do **not** invent relationships; set:

```typescript
// Source: docs/DESIGN.md:650-663, src/errors.ts:14
{
  pack, // empty triples
  answer_markdown: '', // or a single non-relational abstain note — never "X causes Y"
  mode: 'abstain',
  abstained: true,
  abstain_reason: 'empty_subgraph', // GSD_GRAPH_REASON.EMPTY_SUBGRAPH value
}
```

**Non-empty pack:**

```markdown
## Seeds
- Concept:drought
- Concept:crop-failure

## Relationships
- Concept:drought —causes→ Concept:crop-failure (`t_…`)
- Concept:crop-failure —causes→ Concept:food-shortage (`t_…`)

## Paths
- Concept:drought -causes→ Concept:crop-failure -causes→ Concept:food-shortage

## Citations
- `t_…`: Concept:drought —causes→ Concept:crop-failure (multi-hop.jsonl)
```

**Invariant (ANS-01):** every citation `triple_id` ∈ `pack.triples.map(t => t.id)`. Test with `assert.ok(citations.every(c => tripleIds.has(c.triple_id)))`.

**Modes in Phase 5:** only `'deterministic' | 'abstain'`. Leave `'prompt_pending' | 'http'` typed for Phase 6 but unused.

### Pattern 3: CLI pack/answer (D-06) — Phase 4 adapter clone

**What:** Thin commander actions → library → `writeOk`.  
**Current state:** pack/answer intentionally unregistered [VERIFIED: src/cli.ts:340-342].

```typescript
// Mirror query/path pattern from src/cli.ts:132-178
program
  .command('pack')
  .description('Pack a grounded subgraph for a natural-language question')
  .argument('<question>', 'question text')
  .option('--budget <n>', 'token budget', parseIntOpt)
  .action((question: string, opts: { budget?: number }, cmd: Command) => {
    const result = packSubgraph(
      withDir(
        {
          question,
          ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
        },
        globalDir(cmd),
      ),
    );
    writeOk(result);
  });

program
  .command('answer')
  .description('Deterministic grounded answer with triple citations')
  .argument('<question>', 'question text')
  .option('--budget <n>', 'token budget', parseIntOpt)
  .action((question: string, opts: { budget?: number }, cmd: Command) => {
    const result = answer(
      withDir(
        {
          question,
          ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
        },
        globalDir(cmd),
      ),
    );
    writeOk(result);
  });
```

**Exit semantics:** empty/abstain is **exit 0** with JSON body (`abstained: true`). Missing/invalid `graph.v1` → `GraphError` SCHEMA_INVALID → exit 2 (existing mapCliError). Usage (missing question arg) → exit 1.

**Tests that must flip:**

| File | Today | Phase 5 |
|------|-------|---------|
| `tests/cli-commands.test.ts` “pack and answer are unregistered” | exit 1 | exit 0 happy path after build |
| `tests/cli.test.ts` “unknown command and unregistered pack/answer exit 1” | pack/answer in exit-1 loop | keep only unknown verb; add pack/answer success cases |

### Pattern 4: G0 / G1 fixture strategy (reuse corpus)

**Do not invent new corpora for G0/G1.** Existing fixtures already prove extract honesty:

| Golden | Fixture | Live offline build (verified this session) | Pass criteria |
|--------|---------|--------------------------------------------|---------------|
| **G0** | `tests/fixtures/corpus/free-prose.md` | triples predicates = `['about']`; typed multi-hop count = **0**; nodes Document/Topic/Concept from heading+definition only | pack/answer for a multi-hop “why drought causes food shortage?” style question → **abstain** OR no path with typed multi-hop predicate (`causes`/`depends_on`/…) |
| **G1** | `tests/fixtures/corpus/multi-hop.jsonl` | 3 nodes, 2 triples: `Concept:drought -causes→ Concept:crop-failure -causes→ Concept:food-shortage` | `paths[]` length ≥1, some path `nodes.length ≥ 3`, predicates include `causes`; citations include that predicate |

[VERIFIED free-prose extract: live `extractMarkdown` / full `build` this session]  
[VERIFIED multi-hop chain: live `build` + `query({path})` → nodes `['Concept:drought','Concept:crop-failure','Concept:food-shortage']`, preds `['causes','causes']`]

**Recommended golden harness:**

1. `mkdtemp` store + corpus dir  
2. Copy **only** the needed fixture file(s) into corpus (isolate free-prose vs multi-hop — do not mix for G0/G1)  
3. `init` + `build({ corpus, dir, full: true })`  
4. `packSubgraph` / `answer` with fixed question strings  
5. Assert pass criteria  

**Optional `tests/fixtures/golden/`:** question JSON sidecars only (e.g. `g1-question.txt`) — avoid duplicating corpus content (drift risk). D-12 allows either location.

**G2–G4 (discretion — implement if cheap):**

| ID | DESIGN pass | Recommendation |
|----|-------------|----------------|
| G2 | `path` between two entities non-empty typed | **Cheap:** assert `query({path:{from:drought,to:food}})` or pack paths on multi-hop store — largely already in `query.test.ts`; one golden re-assert OK |
| G3 | Budget drops AMBIGUOUS before EXTRACTED | **Cheap:** already covered in `tests/query.test.ts` applyBudget suite — optional golden wrapper calling `applyBudget` / pack with tiny budget |
| G4 | Incremental edit one source | **Mostly done** by M1–M5 in `maintain.test.ts`; golden can skip full reimplementation and document “covered by maintain.test M1–M5” for GOLD-03, or one thin incremental build smoke if time |

### Pattern 5: Types & public API

Add to `src/types.ts` (names from DESIGN):

```typescript
// Source: docs/DESIGN.md:635-660
interface SubgraphPack {
  question: string;
  seeds: string[];
  nodes: GraphNode[];
  triples: Triple[];
  paths: { nodes: string[]; predicates: string[] }[]; // same shape as QueryPath
  citations: {
    triple_id: string;
    s: string; p: string; o: string;
    source_path?: string;
  }[];
  trimmed: string | null;
  budget_tokens: number | null;
}

interface GroundedAnswer {
  pack: SubgraphPack;
  answer_markdown: string;
  mode: 'deterministic' | 'prompt_pending' | 'http' | 'abstain';
  abstained: boolean;
  abstain_reason?: string;
  prompt_bundle?: object; // unused Phase 5
}

// PackOptions / AnswerOptions (discretion — prefer both graph + dir):
interface PackOptions {
  question: string;
  dir?: string;
  graph?: GraphV1Document; // tests / library callers
  hops?: number;
  kSeeds?: number;
  budget?: number | null;
}
interface AnswerOptions extends PackOptions {
  // Phase 5: no apply-prompt flags
}
```

Export `packSubgraph`, `answer` from `src/index.ts` (DESIGN public API list).

### Anti-Patterns to Avoid

- **Private BFS inside pack.ts:** violates D-01/PACK-01. Use `expandHops` / `findShortestPath` / `query`.  
- **Neighborhood dump as “path”:** G1 requires `paths[]` with ≥3 nodes and typed predicate — not “many triples near seeds”.  
- **Hallucinated citations:** never emit citation ids not in pack.triples; never invent prose edges in abstain mode.  
- **Throwing on empty pack:** breaks ANS-02 and agent UX; abstain is success.  
- **Reading `graph.json`:** D-10 / STORE-02.  
- **LLM / `--apply-prompt-result`:** Phase 6 only (D-05).  
- **Leaving Phase 4 “unregistered” tests as-is:** they will fail once commands register — update in same wave.  
- **Mixing free-prose + multi-hop in one G0 store:** multi-hop would make G0 pass for the wrong reason.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hop expansion BFS | New walk in pack.ts | `expandHops` / `query({ id, hops })` | Already tested undirected expand [VERIFIED: src/pipeline/query.ts:268-297] |
| Shortest path | New Dijkstra/BFS | `findShortestPath` / `query({ path })` | Deterministic lex tie-break already locked [VERIFIED: src/pipeline/query.ts:120-176] |
| Budget trim | Custom drop order | `applyBudget` | Shared rank EXTRACTED>INFERRED>AMBIGUOUS [VERIFIED: src/pipeline/query.ts:372-411] |
| Load graph | Read files ad hoc | `loadGraphV1` | Schema validate + never projection [VERIFIED: src/io/load-graph.ts:20-50] |
| Node/triple ids in tests | Hand-written slugs | `nodeId` / `tripleId` | Canonical K20 [VERIFIED: src/pipeline/ids.ts:30-45] |
| CLI error/exit mapping | New exit table | Existing `mapCliError` + `writeOk`/`writeErrorJson` | K22 already proven Phase 4 |
| Free-prose / multi-hop fixtures | New synthetic corpora | `tests/fixtures/corpus/*` | Already golden seeds from Phase 2 |

**Key insight:** Phase 5 is **composition + formatting + proof**, not a new graph engine. The expensive correctness (path, budget, extract honesty) already shipped in Phases 2–3.

## Common Pitfalls

### Pitfall 1: Hallucinated citations / fabricated relationships
**What goes wrong:** Answer markdown claims `X causes Y` without a triple, or citation ids not in pack.  
**Why it happens:** Formatter builds prose from seeds alone; or LLM-shaped habits in template code.  
**How to avoid:** Relationships and Citations sections iterate **only** `pack.triples`; Paths only `pack.paths`; abstain path never lists relationships. Unit test: mutate pack to empty triples → markdown has no `—causes→`.  
**Warning signs:** Golden G0 fails because answer invents drought chain from free prose.

### Pitfall 2: Neighborhood dump vs multi-hop path (G1 gameable)
**What goes wrong:** Pack returns large triple set from expand but `paths[]` empty; test only checks triple count.  
**Why it happens:** Skipping DESIGN step 5 (path among top seeds) or only calling seed_expand.  
**How to avoid:** Always run path among top `min(3, k_seeds)` seed pairs when ≥2 seeds; G1 asserts `paths.some(p => p.nodes.length >= 3 && p.predicates.includes('causes'))`.  
**Warning signs:** G1 green on structured-edges.md related_to noise without a 3-node causes chain.

### Pitfall 3: seedAndExpand(label) expands the wrong set
**What goes wrong:** After scoring seed A, expand via `seedAndExpand(graph, A.label)` also seeds unrelated nodes whose labels contain a substring of A.  
**Why it happens:** `matchTermSeeds` is substring-based [VERIFIED: src/pipeline/query.ts:239-261].  
**How to avoid:** Expand from **seed id** with `expandHops(adj, graph, new Set([seedId]), hops)`.  
**Warning signs:** Unstable pack sizes; citations from nodes never selected as seeds.

### Pitfall 4: Empty pack treated as CLI failure
**What goes wrong:** `answer` throws `GraphError(EMPTY_SUBGRAPH)` → exit 2; agents treat abstain as crash.  
**Why it happens:** Reason code exists and looks like an error code [VERIFIED: src/errors.ts:14].  
**How to avoid:** Use `empty_subgraph` only as `abstain_reason` string (and optional library diagnostic). CLI always `writeOk` for pack/answer library returns.  
**Warning signs:** G0 CLI test expects exit 0 but gets 2.

### Pitfall 5: Phase 4 tests still expect unregistered pack/answer
**What goes wrong:** Registering commands turns “exit 1” tests red.  
**Why it happens:** Explicit Phase 4 gates [VERIFIED: tests/cli.test.ts:175-182, tests/cli-commands.test.ts:342-351].  
**How to avoid:** Same PR/wave: register commands + rewrite tests to happy-path JSON. Keep a true unknown-verb exit 1 case.  
**Warning signs:** `npm test` fails only in cli* suites after feat commit.

### Pitfall 6: G0 store polluted with multi-hop.jsonl
**What goes wrong:** Building whole `tests/fixtures/corpus/` for G0 imports causes chain → false multi-hop success.  
**Why it happens:** Discover walks directory; Phase 4 E2E uses full corpus dir.  
**How to avoid:** G0 tmp corpus contains **only** free-prose.md; G1 only multi-hop.jsonl (or multi-hop + structured-edges intentionally).  
**Warning signs:** G0 pack returns `causes` paths.

### Pitfall 7: Free-prose still creates non-empty graph
**What goes wrong:** Expecting zero nodes/triples on free-prose; pack may return `about` edges if question tokens hit “free/prose/honesty/seed”.  
**Why it happens:** Heading → Document `about` Topic EXTRACTED; definition line may create Concept [VERIFIED live build].  
**How to avoid:** G0 pass = **no typed multi-hop path** (`causes|supports|contradicts|precedes|depends_on`) and/or abstain on drought/food questions — not “empty graph”. Align with D-07 wording.  
**Warning signs:** Brittle test `assert.equal(triples.length, 0)` on free-prose build.

## Code Examples

### Load graph for pack (D-10)

```typescript
// Source: src/pipeline/query.ts:413-422 (same pattern)
function loadPackGraph(opts: PackOptions): GraphV1Document {
  if (opts.graph !== undefined) return opts.graph;
  const storeRoot =
    opts.dir !== undefined
      ? resolveStoreRoot({ dir: opts.dir })
      : resolveStoreRoot();
  return loadGraphV1(storeRoot);
}
```

### Expand seeds + path pairs

```typescript
// Source: public API shapes from src/pipeline/query.ts
const adj = buildAdjacencyMap(graph);
const unionTripleIds = new Set<string>();
const unionNodeIds = new Set<string>(seedIds);
const paths: QueryPath[] = [];

for (const id of seedIds) {
  const { nodes, triples } = expandHops(adj, graph, new Set([id]), hops);
  for (const n of nodes) unionNodeIds.add(n.id);
  for (const t of triples) unionTripleIds.add(t.id);
}

const pathSeeds = seedIds.slice(0, Math.min(3, seedIds.length));
for (let i = 0; i < pathSeeds.length; i++) {
  for (let j = i + 1; j < pathSeeds.length; j++) {
    const found = findShortestPath(
      adj,
      pathSeeds[i]!,
      pathSeeds[j]!,
      hops + 2,
    );
    if (found && found.nodes.length >= 2) {
      paths.push(found);
      // materialize path triples via query({ path }) or same endpoint match as materializePath
    }
  }
}
```

Recommendation: for path triple materialization, call `query({ graph, path: { from, to, maxDepth: hops + 2 } })` and union `result.triples` + `result.paths` — stays 100% on public `query` entrypoint (strongest D-01 reading).

### Citation ⊆ triples check (test)

```typescript
// Source: ANS-01 invariant
const ids = new Set(pack.triples.map((t) => t.id));
for (const c of pack.citations) {
  assert.ok(ids.has(c.triple_id), `citation ${c.triple_id} not in pack triples`);
}
```

### G1 assertion skeleton

```typescript
// Source: docs/DESIGN.md:630, 998-999 + live multi-hop ids
const drought = nodeId('Concept', 'Drought'); // Concept:drought
const food = nodeId('Concept', 'Food Shortage'); // Concept:food-shortage
const pack = packSubgraph({
  graph,
  question: 'why does drought cause food shortage?',
});
assert.ok(pack.paths.length >= 1);
assert.ok(
  pack.paths.some(
    (p) => p.nodes.length >= 3 && p.predicates.includes('causes'),
  ),
);
assert.ok(pack.citations.some((c) => c.p === 'causes'));
const ans = answer({ graph, question: 'why does drought cause food shortage?' });
assert.equal(ans.abstained, false);
assert.equal(ans.mode, 'deterministic');
assert.match(ans.answer_markdown, /causes/);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RAG chunk dump as “answer” | Subgraph pack + triple citations | Product thesis / K8 | Honesty offline |
| Private pack graph walk | Composition of public Query IR (K21) | DESIGN lock | Testable; no dual BFS |
| LLM required for multi-hop | Deterministic extract + pack on JSONL/links | K24 offline GA bar | G0/G1 without API keys |
| pack/answer unregistered | Register in Phase 5 | Phase 4 D-02 → Phase 5 D-06 | CLI complete for 0.1.0 |

**Deprecated/outdated:**
- Treating Phase 4 “pack/answer exit 1” as permanent product behavior — temporary until Phase 5.  
- README line “CLI … ships in a later phase” — update when pack/answer land [VERIFIED: README.md:29-31].

## Release Checklist (0.1.0 / GOLD-03)

| # | Gate | Status / Action |
|---|------|-----------------|
| 1 | `package.json` `"version": "0.1.0"` | Already set [VERIFIED: package.json] |
| 2 | Full `npm test` green | Must include maintain M1–M5, query, cli, pack-answer, golden-scenarios |
| 3 | `npm run build` green | CJS + d.ts |
| 4 | pack/answer library + CLI wired | New this phase |
| 5 | G0 + G1 goldens pass offline | No env API keys; no network |
| 6 | CHANGELOG.md `## [0.1.0]` | **Missing today** — create Keep a Changelog style |
| 7 | README CLI section updated | Document init/build/query/path/pack/answer |
| 8 | Copyright headers on new sources | D-11 |
| 9 | No gsd-core runtime dep | Already true |
| 10 | Optional: `git tag v0.1.0` | After green suite; publish npm is operator step outside code |

**CHANGELOG format (discretion):** Keep a Changelog / semver:

```markdown
# Changelog

## [0.1.0] - 2026-08-03

### Added
- Query IR, build pipeline, CLI machine contract (K22)
- packSubgraph + deterministic answer with citations
- Offline goldens G0 (free-prose abstain) and G1 (multi-hop causes path)

### Notes
- Optional LLM/MCP deferred; communities → 0.2.0
```

## Open Questions — RESOLVED

| # | Question | Resolution | Binding |
|---|----------|------------|---------|
| OQ-R1 | In-memory `graph` vs disk-only for pack/answer? | **Both** — `opts.graph` for tests; else `loadGraphV1` via `--dir` / default store (mirrors `query`) | Discretion locked for planner |
| OQ-R2 | Exact stopword list? | **Exactly** DESIGN set (14 tokens); export constant; no extras in 0.1.0 | Discretion locked |
| OQ-R3 | Empty pack: throw or abstain? | **Abstain return**; CLI exit 0; reason string `empty_subgraph` | ANS-02 / D-04 |
| OQ-R4 | Expand via label or id? | **Id + expandHops / query({id})** after scoring | Avoid pitfall 3 |
| OQ-R5 | G2–G4 required? | G0–G1 required; G2 cheap yes; G3 covered by query tests (+ optional golden); G4 covered by M1–M5 | D discretion |
| OQ-R6 | Fixture location golden/ vs corpus/? | **Reuse corpus files**; golden tests isolate copies in tmp; optional golden/ for questions only | D-12 |
| OQ-R7 | Path materialization API? | Prefer `query({ path })` public entry for triple materialization; `findShortestPath` OK if triples re-derived consistently with query tests | D-01 |
| OQ-R8 | CHANGELOG? | Create Keep a Changelog `0.1.0` section as GOLD-03 readiness | D-09 |
| OQ-R9 | LLM answer / MCP this phase? | **No** — Phase 6 (D-05, deferred) | Locked |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Keep a Changelog date for 0.1.0 can be release day (not pre-filled as publish date) | Release Checklist | Cosmetic only |
| A2 | CLI abstain exit 0 is preferred over exit 2 with EMPTY_SUBGRAPH | Pattern 3 / Pitfall 4 | If product later wants hard fail, CLI contract changes — confirm only if user objects |

**Note:** Algorithm defaults, fixture behavior, query exports, and free-prose/multi-hop extract results were verified from in-repo sources and live `node` runs this session — not assumptions.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test/runtime | ✓ | v25.6.1 (≥22) | — |
| npm | scripts | ✓ | 11.9.0 | — |
| TypeScript toolchain | `npm run build` | ✓ | project dep | — |
| Network / LLM API keys | — | N/A | — | **Must not require** (D-05 / offline GA) |
| CHANGELOG.md | GOLD-03 docs | ✗ missing | — | Create in phase |
| tests/fixtures/golden/ | optional | ✗ missing | — | Use corpus/ + tmp copies |
| src/pipeline/pack.ts | PACK-01 | ✗ missing | — | Implement |
| src/pipeline/answer.ts | ANS-01/02 | ✗ missing | — | Implement |

**Missing dependencies with no fallback:** none external — only in-repo files to create.  
**Missing dependencies with fallback:** `tests/fixtures/golden/` → reuse `tests/fixtures/corpus/`.

Step 2.6 external tools: no Postgres/Redis/Docker required.

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none (tsconfig.test.json → dist-test) |
| Quick run command | `npm test` (project is small; no separate unit filter yet) |
| Full suite command | `npm test` |
| Coverage (optional) | `npm run test:coverage` (c8, lines 80) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PACK-01 | pack uses public ops; seeds+paths+budget | unit | `node --test dist-test/pack-answer.test.js` | ❌ Wave 0 |
| PACK-01 | citations from remaining triples only | unit | same | ❌ Wave 0 |
| ANS-01 | markdown sections + citations ⊆ triples | unit | same | ❌ Wave 0 |
| ANS-02 | empty pack → abstain, no fabricated edges | unit | same | ❌ Wave 0 |
| GOLD-01 | free-prose offline pack/answer abstain or no typed multi-hop | integration | `node --test dist-test/golden-scenarios.test.js` | ❌ Wave 0 |
| GOLD-02 | multi-hop.jsonl paths ≥1, ≥3 nodes, causes | integration | same | ❌ Wave 0 |
| GOLD-03 | M1–M5 still green | unit | `node --test dist-test/maintain.test.js` | ✅ maintain.test.ts |
| GOLD-03 | core CLI still green + pack/answer registered | e2e | `node --test dist-test/cli.test.js dist-test/cli-commands.test.js` | ✅ must **update** |
| CLI D-06 | pack/answer JSON stdout exit 0 | integration | cli-commands / cli | ❌ rewrite Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`  
- **Per wave merge:** `npm test`  
- **Phase gate:** Full suite green before `/gsd-verify-work` and 0.1.0 tag  

### Wave 0 Gaps

- [ ] `tests/pack-answer.test.ts` — PACK-01, ANS-01, ANS-02  
- [ ] `tests/golden-scenarios.test.ts` — GOLD-01, GOLD-02 (+ optional G2)  
- [ ] Rewrite `tests/cli-commands.test.ts` pack/answer registration expectations  
- [ ] Rewrite `tests/cli.test.ts` exit matrix (drop pack/answer from unknown-only list; add success)  
- [ ] `src/pipeline/pack.ts` / `answer.ts` + types + index exports  
- [ ] `CHANGELOG.md`  
- [ ] Framework install: **none** — existing `npm test` pipeline  

*(No new test framework. Reuse captureIO / tmp dir patterns from cli-commands and query tests.)*

## Security Domain

> `security_enforcement` enabled (ASVS level 1).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local CLI/library; no auth |
| V3 Session Management | no | — |
| V4 Access Control | no | Local filesystem trust model |
| V5 Input Validation | yes | Question is free text (no path); store paths still via `resolveStoreRoot` / realpath; budget parsed as int |
| V6 Cryptography | no new | tripleId sha256 already exists — do not hand-roll |

### Known Threat Patterns for pack/answer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via question → LLM | Spoofing / Tampering | **No LLM in Phase 5** (D-05); deterministic formatter only |
| Path escape via `--dir` | Tampering | Existing `resolveStoreRoot` / confine (unchanged) |
| Answer cites non-graph facts | Spoofing | Citations ⊆ pack triples unit test |
| Huge question / budget DoS | Denial of service | Budget clamp via applyBudget; hops clamp MAX_QUERY_DEPTH=16 already in query |
| Projection SoT confusion | Tampering | loadGraphV1 only (D-10) |

## Project Constraints (from CLAUDE.md / project)

- Read before edit; keep changes minimal  
- Copyright header on all new source:  
  `// gsd-graph — <purpose>`  
- Build and test after major changes; fix errors before commit  
- No gsd-core runtime coupling  
- Memtrace preferred for symbol discovery when indexed (index empty for packSubgraph this session — filesystem verified)

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` — K8, K21, K22, K24; pack algorithm; SubgraphPack/GroundedAnswer; G0–G4 table (lines 603-663, 994-1002, 1040-1071)  
- `src/pipeline/query.ts` — full public op implementations and defaults  
- `src/index.ts:105-118` — exported query helpers  
- `src/io/load-graph.ts` — SoT load  
- `src/errors.ts:8-20` — `EMPTY_SUBGRAPH: 'empty_subgraph'`  
- `src/cli.ts` — adapter patterns; pack/answer unregistered comment line 340  
- `tests/fixtures/corpus/free-prose.md`, `multi-hop.jsonl`, `structured-edges.md`  
- Live `node` runs: extract/build/path for G0/G1 fixtures (2026-08-03)  
- Phase 4 summaries `04-02-SUMMARY.md`, `04-03-SUMMARY.md` — CLI patterns & tests to flip  
- `.planning/phases/05-ground-prove-0-1-0/CONTEXT.md` — D-01..D-12  
- `.planning/REQUIREMENTS.md` — PACK/ANS/GOLD  
- package-legitimacy seam on commander/picocolors/ajv/ajv-formats → OK  

### Secondary (MEDIUM confidence)

- README CLI “later phase” wording — product docs lag Phase 4 completion  

### Tertiary (LOW confidence)

- None material for implementation  

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new deps; live exports verified  
- Architecture: **HIGH** — DESIGN K21 + query.ts composition path clear  
- Pitfalls: **HIGH** — Phase 4 test traps + G0 pollution + citation honesty validated against fixtures  

**Research date:** 2026-08-03  
**Valid until:** 2026-09-02 (30 days; stack stable)
