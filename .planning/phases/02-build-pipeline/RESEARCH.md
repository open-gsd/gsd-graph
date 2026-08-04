# Phase 2: Build pipeline - Research

**Researched:** 2026-08-02  
**Domain:** Local-first Graph Engineering write path (extract → normalize → review → publish → status)  
**Confidence:** HIGH (product contracts locked in DESIGN + Phase 1 live APIs verified; extract grammar details are design-discretion recommendations)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact edge-line grammar for MD (e.g. `[[A]] --related_to--> [[B]]` vs definition lists) — must be documented and tested
- Fingerprint algorithm (sha256 of file bytes recommended)
- Whether `build()` is one public library function or pipeline stages called separately (recommend both: stages + orchestrating `build`)
- Review-queue file format details as long as schema + accept/reject effects match DESIGN
- Size caps / secret redaction minimal implementation for extract (paths that look like secrets)

### Deferred Ideas (OUT OF SCOPE for Phase 2)
- Full Query IR (path/neighborhood/filter) — Phase 3
- packSubgraph / answer — Phase 5
- CLI `gsd-graph` binary surface — Phase 4 (library APIs only here; optional thin test harness OK)
- Incremental maintain M1–M5 full matrix — Phase 3 (fingerprints yes; full invalidation lifecycle later)
- LLM providers — Phase 6
- MCP — Phase 6
- Communities — Phase 7
- NL→IR
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-01 | Deterministic Markdown/text extract (links, headings, explicit edge lines) | Edge grammar OQ-1; `extractMarkdown` sketch; free-prose honesty pitfall |
| EXT-02 | JSON/JSONL structured extract maps fields to EXTRACTED triples | `extractJsonl` field map; multi-hop fixture seed |
| EXT-03 | Source fingerprints support incremental rebuild | `fingerprint` sha256; `sources.manifest.json`; rebuild skip by hash |
| NORM-01 | Multiset provenance; triple confidence = best_tier(entries) | `bestTier` rank table; normalize dedup union |
| NORM-02 | Auto-merge only exact same-type id/alias; `same_as` advisory | Merge rules; no fuzzy; same_as no-op for identity |
| REV-01 | Review queue stable ids; accept/reject mutate only on accept | `rv_` hash; accept/reject effects table; schema |
| STAT-01 | Status: node/triple counts, engine identity, freshness | `status()` over v1 + lock + last-build-status; build writes status |
</phase_requirements>

## Summary

Phase 2 implements the **write path** of gsd-graph: discover corpus files, deterministically extract candidate nodes/triples from Markdown/text and JSON/JSONL, normalize under the closed `general` ontology (multiset provenance + exact same-type merge + policy-gated unknowns), gate conflicts in a durable review queue, and publish a validated `graph.v1.json` under the Phase 1 lock + dual-write protocol. Status then reports honest counts, engine identity, and freshness without treating `graph.json` as SoT.

Phase 1 already shipped the foundations this phase must **call, not reimplement**: `loadOntologyPack` / `applyUnknownPolicy`, `resolveStoreRoot` / `acquireBuildLock` / `publishGraphFiles` / `loadGraphV1`, `validateGraphV1`, `GSD_GRAPH_REASON`, and schema mirrors. No new heavy dependencies are justified — parsers and hashing use Node built-ins (`node:crypto`, `node:fs`, pure TypeScript line scanners).

**Primary recommendation:** Ship pure stages (`extract*`, `fingerprint`, `normalize`, `reviewResolve`, `status`) plus one orchestrating `build()` that holds the lock, writes `sources.manifest.json` + `review-queue.json` + `ontology.lock.json` as publish sidecars, and never invents triples from free prose.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Corpus discovery + path confinement | Library / local FS | — | Single-process Node lib; realpath under user-supplied corpus roots only |
| Deterministic MD/text/JSONL extract | Library pipeline (`sources/` + `pipeline/extract`) | — | Offline, no server; candidates only — does not publish |
| Source fingerprints / manifest | Library pipeline + store artifact | — | `sources.manifest.json` under `.gsd-graph/` |
| Ontology allowlist / unknown policy | Library (`ontology/`) | — | Closed pack + `applyUnknownPolicy`; never ambient lock expand |
| Normalize + exact merge + best_tier | Library pipeline (`pipeline/normalize`) | — | Pure graph delta; emits review items |
| Review queue accept/reject | Library (`pipeline/review` or store resolve) | — | Privileged mutation path; CLI later; MCP off |
| Publish graph.v1 + sidecars | Library IO (`io/`) | Store FS | Reuse Phase 1 dual-write; caller holds lock |
| Status / freshness | Library read path | Store FS | Reads v1 + status/lock/manifest; never projection |
| CLI / MCP surfaces | — (out of phase) | — | Phase 4 / 6 adapters only |

This is a **library pipeline over a local file store**, not Browser / SSR / CDN / API-server architecture.

## Standard Stack

### Core (reuse Phase 1 — no new runtime deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | ≥22 (runtime v25.6.1 available) | FS, crypto, test runner | Project engines + Phase 1 [VERIFIED: package.json engines + `node --version`] |
| TypeScript | ^6.0.3 (dev) | CJS + `.d.ts` emit | Phase 1 build [VERIFIED: package.json] |
| `ajv` | 8.20.0 | graph.v1 + new review-queue schema validate | Already dependency; compile-once pattern [VERIFIED: npm registry / package.json] |
| `ajv-formats` | 3.0.1 | date-time on graph.v1 | Already dependency [VERIFIED: npm registry / package.json] |
| `node:crypto` | built-in | sha256 fingerprints, triple ids, review ids | Matches packHash + DESIGN K20 [VERIFIED: src/ontology/load-pack.ts uses createHash] |
| `node:test` + `c8` | built-in / ^12.0.0 | Unit + coverage ≥80 lines | D-12 [VERIFIED: package.json scripts] |

### Supporting (optional schemas only — no packages)

| Artifact | Purpose | When to Use |
|----------|---------|-------------|
| `schemas/review-queue.schema.json` | Ajv-validate review queue SoT | On load/save of `review-queue.json` |
| `schemas/sources-manifest.schema.json` (optional light) | Manifest shape check | On publish; can start as TS type + tests if schema PR budget tight |
| Golden fixtures under `tests/fixtures/corpus/` | EXT/NORM goldens | G0-style free prose + structured MD/JSONL seeds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled MD line extractors | `remark` / `unified` / `mdast` | Heavier dep surface; full AST not needed for wiki/edge grammar |
| Hand-rolled JSONL | Streaming JSON parsers | Overkill for laptop corpora under 8 MiB/file |
| Fuzzy entity linker | Exact alias only (locked) | Fuzzy is post-0.1 / deferred |
| LLM extract | Deterministic only (D-01) | Phase 6 |

**Installation:** none required beyond existing deps.

```bash
# No new packages for Phase 2 core path
npm test   # existing harness
```

**Version verification:** `ajv@8.20.0`, `ajv-formats@3.0.1` confirmed via `npm view` this session. [VERIFIED: npm registry]

## Package Legitimacy Audit

> No new external packages recommended for Phase 2. Reuse Phase 1 `ajv` / `ajv-formats` only.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| ajv | npm | mature | high | ajv-validator/ajv | OK (existing) | Approved — already installed |
| ajv-formats | npm | mature | high | ajv-validator/ajv-formats | OK (existing) | Approved — already installed |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  
**New installs this phase:** none — planner must not add markdown AST libraries without a new discuss decision.

## Architecture Patterns

### System Architecture Diagram

```text
  --corpus roots (user paths)          ontology pack (general | path)
           │                                      │
           ▼                                      ▼
  ┌─────────────────┐                   ┌──────────────────┐
  │ sources/discover│──fingerprint──────│ loadOntologyPack │
  │  *.md *.txt     │                   │ applyUnknownPolicy│
  │  *.json *.jsonl │                   └────────┬─────────┘
  └────────┬────────┘                            │
           ▼                                     │
  ┌─────────────────┐                            │
  │ extractMarkdown │                            │
  │ extractJsonl    │──► ExtractResult           │
  │  (candidates)   │    nodes[], triples[],     │
  └────────┬────────┘    diagnostics[]           │
           │                                     │
           └──────────────┬──────────────────────┘
                          ▼
                 ┌─────────────────┐
                 │    normalize    │
                 │  slug / merge   │── exact same-type only
                 │  best_tier      │── multiset provenance
                 │  policy gate    │── review | coerce | drop
                 └────────┬────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      graph delta   review-queue    diagnostics
            │         items[]            │
            │             │              │
            ▼             ▼              ▼
  ┌──────────────────────────────────────────────┐
  │ acquireBuildLock(store, 'lib')               │
  │ publishGraphFiles({                          │
  │   graphV1,                                   │
  │   writeProjection: DEFAULT_WRITE_PROJECTION, │
  │   sidecars: {                                │
  │     'sources.manifest.json',                 │
  │     'review-queue.json',                     │
  │     'ontology.lock.json'                     │
  │   }                                          │
  │ })                                           │
  │ release()                                    │
  └──────────────────┬───────────────────────────┘
                     ▼
              .gsd-graph/
              ├── graph.v1.json          ◄── SoT
              ├── graph.json             ◄── optional, never read as SoT
              ├── sources.manifest.json
              ├── review-queue.json
              ├── ontology.lock.json
              ├── .last-build-status.json
              └── .build.lock (ephemeral)

  reviewResolve(accept|reject) ──► mutate graph/ontology ONLY on accept
                                   ──► publish under lock again

  status() ──► loadGraphV1 + status file + lock presence + manifest mtimes
               (never open graph.json as truth)
```

### Recommended Project Structure (Phase 2 additions)

```text
src/
├── index.ts                 # re-export new public build surface
├── types.ts                 # + BuildOptions, ExtractResult, Review*, StatusResult, Manifest
├── sources/
│   ├── discover.ts          # glob under corpus roots (md/txt/json/jsonl)
│   ├── fingerprint.ts       # sha256 file bytes → content_hash
│   ├── markdown.ts          # MD/text extract
│   ├── jsonl.ts             # JSON/JSONL field map
│   └── redact.ts            # secret pattern redaction helpers
├── pipeline/
│   ├── extract.ts           # orchestrate per-file extractors
│   ├── normalize.ts         # slug, merge, best_tier, policy → queue
│   ├── ids.ts               # slugify, tripleId, reviewItemId
│   ├── review.ts            # load/save queue; accept/reject effects
│   ├── build.ts             # build() orchestrator under lock
│   └── status.ts            # status() read path
├── ontology/                # Phase 1 — reuse
├── io/                      # Phase 1 — reuse
└── schema/
    └── validators.ts        # + validateReviewQueue (optional)

schemas/
├── graph-v1.schema.json     # existing
├── ontology-pack.schema.json
└── review-queue.schema.json # NEW

tests/
├── fixtures/
│   ├── corpus/
│   │   ├── free-prose.md          # G0 seed: no typed multi-hop
│   │   ├── structured-edges.md    # wiki + edge lines
│   │   └── multi-hop.jsonl        # EXTRACTED chain
│   └── ontology/                  # existing
├── extract-markdown.test.ts
├── extract-jsonl.test.ts
├── fingerprint.test.ts
├── normalize.test.ts
├── review-queue.test.ts
├── build-pipeline.test.ts
└── status.test.ts
```

### Pattern 1: Stages + orchestrating `build` (public API)

**What:** Export pure stages for unit tests and an orchestrating `build()` for the happy path.  
**When to use:** Always — matches CONTEXT discretion recommendation and DESIGN library exports.  
**Example:** see Code Examples — `build()`.

### Pattern 2: Dual-write publish under caller-held lock

**What:** `acquireBuildLock` → `publishGraphFiles` → `release` (try/finally). Publish does **not** take the lock.  
**When:** build, review accept that writes triples, any graph mutation.  
**Verified:** Phase 1 summary + `src/io/atomic-publish.ts` header comment. [VERIFIED: src/io/atomic-publish.ts:73-87]

```text
// Quote (atomic-publish.ts:73-87):
// Does **not** acquire `.build.lock` — caller holds lock (single responsibility).
// Usage: acquireBuildLock → publishGraphFiles → release.
```

### Pattern 3: Multiset provenance + best_tier

**What:** Triple key = `(s,p,o)`; provenance is a multiset of entries; `confidence = best_tier(entries)`.  
**When:** normalize dedup and any future maintain (Phase 3).  
**Ranks (DESIGN):** EXTRACTED=2, INFERRED=1, AMBIGUOUS=0.

### Pattern 4: Review as control plane

**What:** Unknown types/predicates and non-exact entity conflicts become `review-queue.json` items; graph write of the contested fact happens only on accept.  
**When:** policy=`review` (default general pack) or ambiguous merge.  
**Anti-pattern:** auto-accept from extract volume metrics.

### Anti-Patterns to Avoid

- **Projection-as-truth:** never `load` from `graph.json` for status or rebuild. [VERIFIED: src/io/load-graph.ts:14-18]
- **Fuzzy auto-merge:** Levenshtein/Jaro collapses identities — forbidden (D-06 / K23).
- **Ambient LLM extract:** no network / prompt apply in Phase 2 (D-01).
- **Silent ontology lock expand:** accept without `--extend-ontology` must not add types/predicates.
- **Unstable review ids:** re-hash every build with non-canonical payload → thrash (Pitfall 12).
- **Free-prose multi-hop claims:** paragraphs alone must not invent `causes` chains offline (K24 / G0).
- **Reimplementing IO:** do not hand-roll publish/lock/paths — call Phase 1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-file publish | Custom tmp/rename | `publishGraphFiles` | Ordered v1-first rename + status already proven STORE-03 |
| Build exclusion | DIY lock files | `acquireBuildLock` | wx + stale/dead-PID steal |
| Path escape | ad-hoc string checks | `confineUnderRoot` / realpath prefix on corpus | PATH_ESCAPE contract |
| Ontology policy | inline if/else | `applyUnknownPolicy` | review\|coerce\|drop matrix locked |
| Schema validation | hand JSON checks | `validateGraphV1` (+ new review-queue Ajv) | schema is authority |
| Hashing | custom checksum | `node:crypto` createHash('sha256') | same as packHash |
| Full Markdown AST | remark pipeline | targeted line/regex extractors | only wiki/links/headings/edge grammar needed |

**Key insight:** Phase 2 complexity is **policy + identity + provenance**, not parsers. Invest tests in merge/review/best_tier; keep extractors small and fixture-driven.

## Common Pitfalls

### Pitfall 1: Free-prose honesty failure (offline multi-hop lie)
**What goes wrong:** Extract invents typed `causes`/`depends_on` from paragraphs; tests “prove” multi-hop offline without structure.  
**Why it happens:** GraphRAG-class quality needs LLM extract or structured sources.  
**How to avoid:** Free prose → weak `mentions` at `INFERRED` only; typed edges only from wiki links, edge grammar, definition structure, or JSONL. Seed G0 + structured fixtures now.  
**Warning signs:** EXTRACTED typed edges from paragraph-only fixtures.

### Pitfall 2: False merge (identity corruption)
**What goes wrong:** Fuzzy or cross-type merge collapses distinct entities.  
**Why it happens:** Recall pressure; GraphRAG-style title merge assumptions.  
**How to avoid:** Auto-merge **exact** same-type id **or** exact normalized alias only; cross-type never; `same_as` edge does not rewrite ids until `entity_merge` accept.  
**Warning signs:** Node count drops after adding an alias-like label of different type.

### Pitfall 3: Review thrash (unstable `rv_` ids)
**What goes wrong:** Accepted items reappear every build.  
**Why it happens:** Payload JSON key order / volatile timestamps in hash input.  
**How to avoid:** Hash `kind + "\0" + stable_payload_canonical_json` (sorted keys, no `created_at`); retain `decisions[]`; skip re-open when decision exists for same id.  
**Warning signs:** review_queue_count grows unbounded on identical corpus rebuilds.

### Pitfall 4: Provenance as scalar
**What goes wrong:** One source path overwrites another; confidence not re-derived.  
**Why it happens:** Treating provenance as a single string field.  
**How to avoid:** Multiset union on `(s,p,o)`; `confidence = best_tier(entries)`; never drop a triple while any entry remains (full M1–M5 later, but union now).  
**Warning signs:** Second source “loses” first source’s EXTRACTED tier.

### Pitfall 5: Path / secret leakage on extract
**What goes wrong:** `../` corpus paths or secrets become node labels.  
**How to avoid:** realpath-confine every file under declared corpus roots; skip >8 MiB with diagnostic; redact `sk-…`, `AKIA…`, private key blocks → `[REDACTED]`.  
**Warning signs:** labels containing `BEGIN PRIVATE KEY` or absolute `/Users/.../.env` paths.

### Pitfall 6: Publishing without lock or reading projection
**What goes wrong:** torn store or status lies.  
**How to avoid:** always lock for write; status/load via `loadGraphV1` only.  
**Warning signs:** tests that assert on `graph.json` content for SoT.

## Code Examples

Verified contracts from live code + DESIGN-shaped sketches for Phase 2 (sketches are planning targets; enums/paths quoted from sources where tagged).

### Confidence + best_tier

```typescript
// Source: docs/DESIGN.md confidence table + src/types.ts Confidence union
// [VERIFIED: src/types.ts:12-13] Confidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'
// Rank (DESIGN): EXTRACTED=2, INFERRED=1, AMBIGUOUS=0

import type { Confidence, ProvenanceEntry } from '../types';

const TIER_RANK: Record<Confidence, number> = {
  EXTRACTED: 2,
  INFERRED: 1,
  AMBIGUOUS: 0,
};

export function bestTier(entries: readonly ProvenanceEntry[]): Confidence {
  let best: Confidence = 'AMBIGUOUS';
  for (const e of entries) {
    if (TIER_RANK[e.confidence] > TIER_RANK[best]) best = e.confidence;
  }
  return best;
}
```

### fingerprint (EXT-03)

```typescript
// Source: discretion + DESIGN content_hash examples ("sha256:…")
// packHash precedent: raw file bytes [VERIFIED: src/ontology/load-pack.ts:118-119]

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** content_hash format used in provenance + manifest */
export function fingerprintFile(absPath: string): string {
  const bytes = readFileSync(absPath);
  const hex = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${hex}`;
}
```

### IDs (K20)

```typescript
// Source: docs/DESIGN.md Node identity & stable ids (K20)
// Triple id pattern in schema: ^t_[0-9a-f]{16}$
// [VERIFIED: schemas/graph-v1.schema.json:81-84]

import { createHash } from 'node:crypto';

export function slugifyLabel(label: string): string {
  const n = label.normalize('NFKC').toLowerCase();
  const slug = n.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'unnamed';
}

export function nodeId(type: string, label: string): string {
  return `${type}:${slugifyLabel(label)}`;
}

export function tripleId(s: string, p: string, o: string): string {
  const hex = createHash('sha256')
    .update(`${s}\0${p}\0${o}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `t_${hex}`;
}

export function reviewItemId(kind: string, stablePayload: unknown): string {
  const canonical = stableStringify(stablePayload); // sorted keys, no timestamps
  const hex = createHash('sha256')
    .update(`${kind}\0${canonical}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
  return `rv_${hex}`;
}
```

### extractMarkdown / extractJsonl (EXT-01 / EXT-02)

```typescript
// Source: docs/DESIGN.md Pipeline stages § Extract + OQ-1 resolved grammar below
// Confidence on structured edges: EXTRACTED; weak free-prose mentions: INFERRED

export interface ExtractDiagnostic {
  path: string;
  code: string;
  message: string;
}

export interface ExtractResult {
  nodes: import('../types').GraphNode[];
  triples: import('../types').Triple[];
  diagnostics: ExtractDiagnostic[];
}

/** Resolved MD edge grammar (document + test):
 *  1. Wiki: [[Label]]
 *  2. MD link: [label](url-or-path)  → mentions (path not fetched)
 *  3. Heading: /^#{1,2}\s+(.+)$/     → Document + Topic, document--about-->topic
 *  4. Edge line (primary):
 *       [[A]] --predicate--> [[B]]
 *     also accepted:
 *       A --predicate--> B
 *       A -predicate-> B
 *     predicate must match /^[a-z][a-z0-9_]*$/ and be checked later by policy
 *  5. Definition-ish: /^([^:\n]{1,80})\s*:\s+(.+)$/ → Concept node + description (no fake causes)
 *  6. Tags: #topic-token → Topic + mentions (EXTRACTED if on own token boundary)
 *  Free prose sentences alone do NOT emit typed causation edges.
 */
export function extractMarkdown(
  sourcePath: string,
  content: string,
  contentHash: string,
): ExtractResult {
  // implement line scanner; attach provenance:
  // { source_path, extractor: 'markdown/<rule>', content_hash, confidence, span? }
  throw new Error('Phase 2 implementation');
}

/**
 * JSONL / JSON field map (preferred multi-hop fixtures):
 *  {
 *    "id"?: string,          // optional explicit node id; else type:slug(label)
 *    "type": string,
 *    "label": string,
 *    "aliases"?: string[],
 *    "edges"?: Array<{ "p": string, "o": string } | { "p": string, "o": { "id"|"type"|"label" } }>
 *  }
 * Arrays of records (JSON array file) or one JSON object per line (JSONL).
 * All emitted triples confidence EXTRACTED, extractor: 'jsonl/field-map'.
 */
export function extractJsonl(
  sourcePath: string,
  content: string,
  contentHash: string,
): ExtractResult {
  throw new Error('Phase 2 implementation');
}
```

### normalize + best_tier (NORM-01 / NORM-02)

```typescript
// Source: docs/DESIGN.md Normalize + applyUnknownPolicy
// [VERIFIED: src/ontology/policy.ts:21-51] actions allow|review|coerce|drop

import { applyUnknownPolicy } from '../ontology/policy';
import type { LoadedOntology } from '../ontology/types';
import type { GraphNode, Triple } from '../types';
import { bestTier, nodeId, tripleId } from './ids';

export interface NormalizeInput {
  ontology: LoadedOntology;
  nodes: GraphNode[];
  triples: Triple[];
}

export interface NormalizeOutput {
  nodes: GraphNode[];
  triples: Triple[];
  reviewItems: ReviewItem[]; // pending
  diagnostics: ExtractDiagnostic[];
}

export function normalize(input: NormalizeInput): NormalizeOutput {
  // 1. Canonicalize node ids to type:slug; collision suffixes -2,-3
  // 2. Index by id; exact same-type alias/id → merge labels/aliases into keeper
  // 3. Non-exact / cross-type clash → entity_merge review item (no auto merge)
  // 4. For each triple: applyUnknownPolicy type(s) on endpoint types + predicate
  //    - review → queue item, do not write triple
  //    - coerce → rewrite p→related_to or type→Concept, write
  //    - drop → discard
  // 5. Dedup (s,p,o): union provenance arrays (stable unique by source_path+extractor+content_hash+confidence)
  // 6. triple.confidence = bestTier(provenance); triple.id = tripleId(s,p,o)
  // 7. same_as triples may be written as advisory edges when predicate allowed —
  //    they MUST NOT rewrite node ids here
  throw new Error('Phase 2 implementation');
}
```

### review queue accept/reject (REV-01)

```typescript
// Source: docs/DESIGN.md Review queue normative schema
// File basename: review-queue.json (store sidecar)
// Item id: rv_ + first 8 hex of sha256(kind + "\0" + stable_payload_canonical_json)

export type ReviewKind =
  | 'entity_merge'
  | 'predicate_unknown'
  | 'type_unknown'
  | 'schema_drift';

export interface ReviewItem {
  id: string; // rv_[0-9a-f]{8}
  kind: ReviewKind;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string | null;
  payload: Record<string, unknown>;
  decision: null | {
    action: 'accept' | 'reject';
    at: string;
    extend_ontology?: boolean;
  };
}

export interface ReviewQueueDocument {
  schema_version: 1;
  items: ReviewItem[];
  decisions: Array<{
    id: string;
    action: 'accept' | 'reject';
    at: string;
    extend_ontology?: boolean;
  }>;
}

/**
 * accept effects (DESIGN table):
 * - entity_merge: rewrite triples s/o drop→keep; merge aliases; delete drop node
 * - predicate_unknown: if extend_ontology → add to lock + write triple; else require coerce path or fail
 * - type_unknown: if extend_ontology → add type + write; else coerce Concept on accept-coerce
 * - schema_drift: manual / docs only
 * reject: record decision; do not write contested draft; do not re-open unless payload hash changes
 */
export function reviewResolve(opts: {
  storeRoot: string;
  id: string;
  action: 'accept' | 'reject';
  extendOntology?: boolean;
}): void {
  // load queue + loadGraphV1 under lock; mutate; publishGraphFiles; release
  throw new Error('Phase 2 implementation');
}
```

### build() orchestrator + status() (D-09 / D-10 / STAT-01)

```typescript
// Source: docs/DESIGN.md Library API + StatusResult; Phase 1 IO
// [VERIFIED: src/index.ts:38-62] exports resolveStoreRoot, publishGraphFiles,
// loadGraphV1, acquireBuildLock, DEFAULT_WRITE_PROJECTION
// [VERIFIED: src/errors.ts:8-20] GSD_GRAPH_REASON includes CORPUS_NOT_FOUND,
// PATH_ESCAPE, LIMIT_EXCEEDED, BUILD_LOCKED, SCHEMA_INVALID, …

import {
  acquireBuildLock,
  DEFAULT_WRITE_PROJECTION,
  loadGraphV1,
  publishGraphFiles,
  resolveStoreRoot,
  ensureStoreRoot,
} from '../io/...'; // via public façade in implementation
import { loadOntologyPack } from '../ontology/load-pack';
import { GSD_GRAPH_REASON, GraphError } from '../errors';

export interface BuildOptions {
  corpus: string | string[];       // roots
  dir?: string;                    // store override
  ontology?: string;               // pack id or path (default general)
  full?: boolean;                  // default false → skip unchanged fingerprints
  writeProjection?: boolean;       // default DEFAULT_WRITE_PROJECTION (false)
  globs?: string[];                // default **/*.{md,txt,markdown,json,jsonl}
}

export interface BuildResult {
  store_dir: string;
  node_count: number;
  triple_count: number;
  review_pending: number;
  sources_total: number;
  sources_extracted: number;
  sources_skipped_fresh: number;
  diagnostics: ExtractDiagnostic[];
  engine: 'gsd-graph';
  engine_version: string;
  built_at: string;
}

export function build(opts: BuildOptions): BuildResult {
  const storeRoot = ensureStoreRoot(resolveStoreRoot({ dir: opts.dir }));
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const ontology = loadOntologyPack({ packIdOrPath: opts.ontology ?? 'general' });
    // 1. discover files under corpus roots (realpath confine; missing → CORPUS_NOT_FOUND)
    // 2. load prior graph.v1 if exists + sources.manifest (for incremental)
    // 3. for each file: fingerprint; if !full && hash matches manifest → skip extract
    // 4. extractMarkdown | extractJsonl by extension
    // 5. normalize → nodes/triples/reviewItems
    // 6. hard caps: nodes>100_000 or triples>250_000 → LIMIT_EXCEEDED
    // 7. assemble GraphV1Document:
    //    schema_version:1, engine:'gsd-graph', engine_version from package,
    //    ontology_pack_id/version, built_at ISO, stats
    // 8. publishGraphFiles({
    //      storeRoot, graphV1,
    //      writeProjection: opts.writeProjection ?? DEFAULT_WRITE_PROJECTION,
    //      sidecars: {
    //        'sources.manifest.json': manifest,
    //        'review-queue.json': queueDoc,
    //        'ontology.lock.json': { pack id, version, packHash, types, predicates },
    //      },
    //    })
    // 9. return BuildResult
    throw new Error('Phase 2 implementation');
  } finally {
    lock.release();
  }
}

export interface StatusResult {
  exists: boolean;
  store_dir: string;
  engine: 'gsd-graph';
  schema_version?: number;
  ontology_pack_id?: string;
  node_count?: number;
  triple_count?: number;
  edge_count?: number; // === triple_count for v1
  last_build?: string;
  stale?: boolean;
  age_hours?: number;
  build_in_progress?: boolean;
  review_queue_count?: number;
  projection_stale?: boolean;
  last_build_status?: object | null;
  reason?: string | null;
}

export function status(opts?: { dir?: string }): StatusResult {
  const storeRoot = resolveStoreRoot({ dir: opts?.dir });
  // if no graph.v1 → { exists:false, store_dir, engine:'gsd-graph' }
  // else loadGraphV1 (never projection)
  // read .last-build-status.json best-effort
  // build_in_progress if .build.lock exists and not stale
  // stale: any corpus path from manifest missing OR content_hash mismatch (if corpus still present)
  //   Phase 2 minimal: stale if manifest mtime/hash policy says rebuild needed; may be
  //   store-only freshness (age from built_at) when corpus not re-passed
  // review_queue_count from review-queue.json pending items
  throw new Error('Phase 2 implementation');
}
```

### Phase 1 publish status note

`publishGraphFiles` already writes a **minimal** `.last-build-status.json`:

```text
// [VERIFIED: src/io/atomic-publish.ts:56-70]
// { status: 'ok'|'failed', reason, finished_at }
```

Phase 2 `status()` must **compose** richer STAT-01 fields from `graph.v1.json` + this file + lock + review queue. Do **not** break the minimal writer without a deliberate IO change; enrich via read-side composition (preferred) or an additive sidecar field set written by `build` after publish.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM-first KG extract every build | Deterministic extract + optional LLM later | Product lock K7/K24 | Offline honesty; fixtures work without keys |
| Fuzzy entity resolution at ingest | Exact same-type only + review | K23 | Prevents silent multi-hop corruption |
| Single provenance string | Multiset + best_tier | K6 | Enables incremental maintain (Phase 3) |
| Projection / viewer JSON as DB | `graph.v1.json` sole SoT | K4 / STORE-02 | Crash-safe dual-write |

**Deprecated/outdated for this product:**
- Treating GraphRAG community reports as v0.1 write-path center (v0.2)
- Ambient OpenAI extract during `build`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Primary edge line form `[[A]] --predicate--> [[B]]` is acceptable product grammar | Open Questions / extract | Fixture authors may prefer only `A -causes-> B`; both accepted in OQ-1 |
| A2 | Incremental rebuild = skip unchanged fingerprints + reuse prior triples for those paths (not full M1–M5) | build() | May diverge from full rebuild on edge cases until Phase 3 |
| A3 | `stableStringify` = JSON with sorted object keys, no whitespace variance | review ids | Different canonicalization → thrash |
| A4 | Domain/range checks on predicates are soft (policy on unknown id only) in Phase 2 | normalize | Over-strict domain checks could over-queue valid general-pack edges |
| A5 | Corpus confinement helper can reuse the same realpath+prefix algorithm as `confineUnderRoot` with corpus root as root | extract safety | Need slight API generalization beyond store-only basenames |

**If wrong:** planner should confirm A1/A2 with user only if fixtures or incremental semantics surprise; A3–A5 are implementation details with recommended defaults.

## Open Questions

### OQ-1: MD edge grammar — **RESOLVED**

- **What we know:** DESIGN lists wiki-links, markdown links, definition lists, lines like `A -causes-> B` / `A depends_on B`, and tags. CONTEXT leaves exact grammar to discretion.
- **Choice (locked for planning):**
  1. **Primary (document in extract README comment + tests):** `[[Subject]] --predicate--> [[Object]]`
  2. **Also accept:** unlinked `Subject --predicate--> Object`, `Subject -predicate-> Object`
  3. **Predicate token:** `/^[a-z][a-z0-9_]*$/` then ontology policy
  4. **Definition lines** create/update Concept `description` only — **no** invented `causes`
  5. **Headings** H1/H2 → `Document` + `Topic` + `about` EXTRACTED
  6. **Wiki/MD links** → `mentions` EXTRACTED (object Concept or Document by heuristic: internal wiki → Concept)
- **Recommendation:** Implement exactly the six rules above; golden `structured-edges.md` covers (1)(2)(5)(6).

### OQ-2: build API shape — **RESOLVED**

- **Choice:** Export **both**:
  - Stages: `discoverSources`, `fingerprintFile`, `extractMarkdown`, `extractJsonl`, `normalize`, `reviewResolve`, `status`
  - Orchestrator: `build(opts) → BuildResult`
- **Rationale:** CONTEXT recommendation; unit-test stages without lock; CLI Phase 4 maps 1:1 to `build` / `status` / `reviewResolve`.

### OQ-3: Fingerprint algorithm — **RESOLVED**

- **Choice:** `sha256:` + hex of **raw file bytes** (not re-encoded text). Same family as `packHash` and DESIGN examples (`content_hash: "sha256:…"`).
- **Manifest entry shape:**
  ```json
  {
    "schema_version": 1,
    "sources": {
      "notes/a.md": {
        "content_hash": "sha256:…",
        "mtime_ms": 0,
        "bytes": 0,
        "last_extracted_at": "2026-08-02T12:00:00.000Z",
        "extractor": "markdown"
      }
    }
  }
  ```

### OQ-4: Review-queue schema file — **RESOLVED**

- **Choice:** Add `schemas/review-queue.schema.json` + Ajv compile-once `validateReviewQueue` following DESIGN JSON exactly (`schema_version: 1`, `items[]`, `decisions[]`).
- **Accept ontology extend:** library option `extendOntology: true` (CLI flag later).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | v25.6.1 (≥22) | — |
| npm | scripts | ✓ | 11.9.0 | — |
| `ajv` / `ajv-formats` | schema validate | ✓ | 8.20.0 / 3.0.1 | already in package.json |
| External LLM / network | — | n/a | — | **not used** (D-01) |
| CLI binary | — | n/a | — | library API only Phase 2 |

**Missing dependencies with no fallback:** none  

**Missing dependencies with fallback:** none  

Step 2.6: external tools OK for this phase (pure library + existing test stack).

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include full map.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (compile via `tsc -p tsconfig.test.json`) |
| Coverage | `c8 --check-coverage --lines 80` |
| Config file | `package.json` scripts `test` / `test:coverage`; `tsconfig.test.json` |
| Quick run command | `npm test` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | Headings, wiki, md links, edge grammar → EXTRACTED nodes/triples | unit | `node --test dist-test/extract-markdown.test.js` | ❌ Wave 0 |
| EXT-01 | Free-prose only → no typed multi-hop predicates | unit | same file `free prose does not emit causes` | ❌ Wave 0 |
| EXT-02 | JSONL field map edges → EXTRACTED chain | unit | `node --test dist-test/extract-jsonl.test.js` | ❌ Wave 0 |
| EXT-03 | Same bytes → same `sha256:` hash; rebuild skips fresh | unit | `node --test dist-test/fingerprint.test.js` + build test | ❌ Wave 0 |
| NORM-01 | Multiset union; best_tier EXTRACTED wins | unit | `node --test dist-test/normalize.test.js` | ❌ Wave 0 |
| NORM-02 | Exact same-type alias merges; cross-type does not; same_as no id rewrite | unit | same | ❌ Wave 0 |
| D-07 / ONT-02 | unknown predicate + review → queue item, no triple write | unit | normalize + ontology-policy reuse | ❌ Wave 0 (policy tests exist) |
| REV-01 | stable `rv_` across rebuild; accept merges; reject no write | unit | `node --test dist-test/review-queue.test.js` | ❌ Wave 0 |
| STAT-01 | after build: counts, engine `gsd-graph`, last_build set | integration | `node --test dist-test/status.test.js` | ❌ Wave 0 |
| D-09 | build uses lock + publish; loadGraphV1 reads SoT | integration | `node --test dist-test/build-pipeline.test.js` | ❌ Wave 0 |
| Caps | >8 MiB skip diagnostic; over node/triple caps LIMIT_EXCEEDED | unit | extract + build tests | ❌ Wave 0 |
| Secrets | `sk-` / `AKIA` / private key not in labels | unit | extract redaction test | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** full suite green + fixtures present before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/extract-markdown.test.ts` — EXT-01 + free-prose honesty
- [ ] `tests/extract-jsonl.test.ts` — EXT-02
- [ ] `tests/fingerprint.test.ts` — EXT-03
- [ ] `tests/normalize.test.ts` — NORM-01/02 + policy integration
- [ ] `tests/review-queue.test.ts` — REV-01
- [ ] `tests/build-pipeline.test.ts` — lock + publish + manifest sidecars
- [ ] `tests/status.test.ts` — STAT-01
- [ ] `tests/fixtures/corpus/free-prose.md` — G0 seed
- [ ] `tests/fixtures/corpus/structured-edges.md` — wiki + `--p-->` edges
- [ ] `tests/fixtures/corpus/multi-hop.jsonl` — EXTRACTED multi-hop chain
- [ ] `schemas/review-queue.schema.json` — Ajv authority for queue
- [ ] Framework install: **none** — `node:test` + c8 already configured

## Security Domain

> `security_enforcement` enabled (ASVS level 1) in `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Local library; no authn surface |
| V3 Session Management | no | No sessions |
| V4 Access Control | partial | Review resolve is privileged API (no ambient auto-accept); MCP write off later |
| V5 Input Validation | yes | realpath corpus confinement; Ajv graph/review schemas; size caps; globs under roots only |
| V6 Cryptography | yes (hashing only) | `node:crypto` sha256 for fingerprints/ids — never hand-roll hashes |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `--corpus` / file entries | Tampering / Info disclosure | realpath + prefix under declared roots; `PATH_ESCAPE` |
| Secrets in corpus → graph labels / packs | Info disclosure | Best-effort redaction (`sk-…`, `AKIA…`, private keys) → `[REDACTED]` |
| Schema / ontology injection via malicious JSONL | Tampering | Closed allowlist + review policy; Ajv validate before publish |
| Concurrent writers | Tampering | `.build.lock` exclusive acquire |
| DoS via huge file / graph | Denial of service | 8 MiB skip; 100k nodes / 250k triples hard fail `limit_exceeded` |
| LLM prompt injection | — | Out of scope Phase 2 (no LLM) |

## Phase 1 Surface to Reuse (executor checklist)

| Export | Module | Phase 2 use |
|--------|--------|-------------|
| `loadOntologyPack` | `src/ontology/load-pack.ts` | build start |
| `applyUnknownPolicy` | `src/ontology/policy.ts` | normalize |
| `validateGraphV1` | `src/schema/validators.ts` | before publish (also inside publish) |
| `resolveStoreRoot` / `ensureStoreRoot` / `confineUnderRoot` | `src/io/paths.ts` | store + generalize for corpus |
| `acquireBuildLock` | `src/io/lock.ts` | build / reviewResolve |
| `publishGraphFiles` / `DEFAULT_WRITE_PROJECTION` | `src/io/atomic-publish.ts` | publish v1 + sidecars |
| `loadGraphV1` | `src/io/load-graph.ts` | status, incremental base, review |
| `GSD_GRAPH_REASON` / `GraphError` | `src/errors.ts` | CORPUS_NOT_FOUND, PATH_ESCAPE, LIMIT_EXCEEDED, … |
| Types `GraphNode`, `Triple`, `ProvenanceEntry`, `Confidence`, `GraphV1Document` | `src/types.ts` | all stages |

**Public façade:** re-export new APIs from `src/index.ts` only (Phase 1 pattern).

**Copyright:** every new file:

```ts
// gsd-graph — <purpose>
```

[VERIFIED: existing src headers, e.g. src/index.ts:1-2]

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` — pipeline stages, extract honesty, normalize, review queue schema, StatusResult, K6/K20/K23/K24, caps, dual-write
- `src/io/atomic-publish.ts`, `src/io/lock.ts`, `src/io/load-graph.ts`, `src/io/paths.ts` — live publish/lock/SoT contracts
- `src/ontology/policy.ts`, `src/ontology/load-pack.ts` — policy matrix + packHash
- `src/types.ts`, `schemas/graph-v1.schema.json` — Confidence, triple id pattern, provenance required fields
- `ontology-packs/general/ontology.json` — allowlisted types/predicates for extract tests
- `.planning/phases/01-foundation-identity/01-02-SUMMARY.md`, `01-03-SUMMARY.md` — reuse surface
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` — layering + false-merge / free-prose / thrash
- `.planning/phases/02-build-pipeline/CONTEXT.md` — D-01…D-12
- `package.json` / live `npm test` (54 pass) — stack verification this session

### Secondary (MEDIUM confidence)

- Microsoft GraphRAG indexing dataflow (architecture research) — contrast only; not implementation dependency

### Tertiary (LOW confidence)

- none material for Phase 2 execution

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — reuse verified package.json + no new deps
- Architecture: **HIGH** — DESIGN + ARCHITECTURE + live IO
- Pitfalls: **HIGH** — PITFALLS.md mapped to Phase 2 requirements
- Extract grammar details: **HIGH for product intent / MEDIUM for exact regex edge cases** — resolved in OQ-1 with tests required

**Research date:** 2026-08-02  
**Valid until:** 2026-09-01 (stable design contracts; re-verify if DESIGN extract section changes)
