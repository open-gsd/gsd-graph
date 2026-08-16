# Phase 1: Foundation & identity - Research

**Researched:** 2026-08-02  
**Domain:** TypeScript library bootstrap, JSON Schema store contracts, ontology packs, crash-safe file IO  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Locked (non-negotiable):

- **D-01** Standalone Graph Engineering product — zero gsd-core runtime dependency (K1, K15, K18)
- **D-02** Package name `@opengsd/gsd-graph`, CLI `gsd-graph`, store default `.gsd-graph/` (K18)
- **D-03** Language: TypeScript → CJS + `.d.ts`, Node ≥22 (K16, STACK research)
- **D-04** File-first SoT `graph.v1.json`; optional `graph.json` projection never read as SoT by native APIs (K3, K4, K17)
- **D-05** Ontology packs: closed allowlist within pack; replace-only in v0.1; `unknown_*_policy` matrix `review|coerce|drop`, default `review` (K5, K9, K19)
- **D-06** Dual-write publish with atomic rename; `.build.lock` for concurrency (K11, K17)
- **D-07** realpath confinement of all store I/O under store root (STORE-05)
- **D-08** Copyright header on source files: Jeremy McSpadden 2026
- **D-09** Schema validation: Ajv + checked-in JSON Schema as authority for graph.v1 / ontology (STACK)
- **D-10** Tests: `node:test` + c8 (STACK)

### Claude's Discretion
- Exact package.json scripts and CI provider (GitHub Actions recommended)
- Whether dual ESM is free to add alongside CJS (default: CJS-only if dual costs)
- Exact file layout under `src/io` and `src/ontology` as long as public contracts match DESIGN
- Lock file format details (PID/stale heuristics) as long as exclusive and tested
- Whether `store.write_projection` defaults true or false in v0.1 config (prefer false until a viewer needs it, or true with docs that projection is disposable)

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Extract, normalize, query, pack, answer, maintain pipelines
- CLI command surface beyond what bootstrap needs for unit tests
- LLM / MCP
- Communities
- Example domain packs beyond `general`
- NL→IR
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-01 | Installable npm package `@opengsd/gsd-graph` builds on Node ≥22 with CJS + type declarations | Standard Stack + package.json exports sketch; `tsc` → `dist/` CJS + `.d.ts` |
| PKG-02 | README/package description as Graph Engineering toolkit; no gsd-core runtime dependency | Naming/identity pitfalls; package metadata + dependency ban tests |
| ONT-01 | Load and validate the `general` ontology pack with closed type/predicate allowlists | Ontology pack loader API + `ontology-pack.schema.json` + general pack fixture |
| ONT-02 | Unknown type/predicate policy matrix `review` \| `coerce` \| `drop` (default `review` = no write) | Policy matrix from DESIGN; `applyUnknownPolicy` pure helper |
| ONT-03 | Ontology packs are replace-only in v0.1 (no extends merge) | Loader rejects/`ignores` `extends`; single pack path |
| STORE-01 | Default store directory is `.gsd-graph/` (overridable via `--dir` / config) | `resolveStoreRoot` defaults + override chain |
| STORE-02 | Canonical SoT is `graph.v1.json`; optional `graph.json` is disposable projection only | Dual-write + load APIs read v1 only |
| STORE-03 | Publish uses dual-write protocol with atomic rename; native query never reads projection as SoT | `atomic-publish.ts` ordered rename protocol |
| STORE-04 | Concurrent builds are serialized via `.build.lock` | `lock.ts` exclusive `wx` + stale steal |
| STORE-05 | All store paths are realpath-confined under the store root | `paths.ts` realpath + prefix check → `PATH_ESCAPE` |
</phase_requirements>

## Summary

Phase 1 bootstraps a **greenfield single-package TypeScript library** that is already fully specified in `docs/DESIGN.md`. There is no application server tier: one Node process, pure library modules, and a file store under `.gsd-graph/`. The phase delivers four foundations the rest of the roadmap depends on: (1) installable package identity and CJS build, (2) checked-in JSON Schemas + Ajv validators, (3) the `general` ontology pack with closed allowlists and the `review|coerce|drop` policy matrix, and (4) realpath-confined store paths, exclusive `.build.lock`, and dual-write publish primitives that rename `graph.v1.json` first.

Do **not** pull in graph libraries, CLI frameworks, MCP, Zod-as-store-authority, or lock/atomic npm packages. Phase 1 runtime deps are **Ajv + ajv-formats only**; lock and dual-write are intentionally **hand-rolled** to match the product multi-file publish protocol. Tests use built-in `node:test` + `c8`. CLI binary packaging can wait for Phase 4 (PKG-03) except optional empty `bin/` placeholder if desired for layout parity.

**Primary recommendation:** Implement PR-01 → PR-02 → PR-03 order from DESIGN (bootstrap → schemas/ontology → io lock/dual-write), CJS-only via `tsc`, `store.write_projection` default **`false`** until a viewer needs projection (discretion), and compile Ajv validators once at module load against checked-in schemas.

## Architectural Responsibility Map

Single-tier **library / local process** product — no browser, SSR, CDN, or remote API server in Phase 1.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Package identity & build emit | Library package (Node process) | — | `tsc` produces CJS + `.d.ts` consumed by Node hosts |
| Public library façade (`index.ts`) | Library API | — | Sole public surface; CLI/MCP later are adapters only |
| Ontology pack load / validate / lock snapshot | Library (`src/ontology`) | Filesystem read of pack files | Closed-world schema lives in process memory; pack files are inputs |
| Unknown type/predicate policy matrix | Library pure logic | — | No network; pure function over pack + candidates |
| Store path resolution & realpath confinement | Library IO (`src/io/paths`) | OS filesystem | Security boundary is process-local path math + realpath |
| `.build.lock` exclusive concurrency | Library IO (`src/io/lock`) | OS file exclusive create (`wx`) | Single-writer on laptop FS; no daemon |
| Dual-write atomic publish | Library IO (`src/io/atomic-publish`) | OS rename/fsync | Multi-file ordered renames; v1 SoT |
| JSON Schema validation (graph.v1 / ontology) | Library (Ajv) | Checked-in `schemas/*.json` | Schema files are authority; Ajv is the engine |
| Unit tests / coverage | Local Node test process | — | `node:test` + c8 over compiled or tsx-run tests |

## Standard Stack

### Core (Phase 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `>=22.0.0` | Runtime | Locked D-03; engines match open-gsd house style. [VERIFIED: npm engines convention + local Node v25.6.1] |
| TypeScript | `^6.0.3` (6.0.3 on registry) | Language / emit CJS+d.ts | Align with gsd-core; 7.x exists but stay on 6.x until deliberate bump. [VERIFIED: npm registry `typescript@6.0.3`] |
| `@types/node` | `^22.19.0` (22.20.1 latest 22.x) | Node typings for engines ≥22 | Pin major 22, not `@types/node` 26.x. [VERIFIED: npm registry] |
| `ajv` | `^8.20.0` (8.20.0) | Compile/validate JSON Schema | D-09; store authority is JSON Schema files. [VERIFIED: npm registry] |
| `ajv-formats` | `^3.0.1` (3.0.1) | `date-time` / `uri` formats | Needed when schemas use format keywords. [VERIFIED: npm registry] |
| `node:test` / `node:assert/strict` | built-in | Test runner + asserts | D-10; OpenGSD standard. [VERIFIED: Node built-in] |
| `node:fs` / `node:path` / `node:crypto` | built-in | Store IO, realpath, locks, hashes | No extra dep for lock/publish. [CITED: nodejs.org/api/fs.html] |
| `c8` | `^12.0.0` (12.0.0) | Coverage over `node --test` | D-10 / STACK. [VERIFIED: npm registry] |

### Supporting (optional in Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.23.5` | Run TS tests without separate emit | Optional DX; alternative is compile tests then `node --test`. [VERIFIED: npm registry] |
| GitHub Actions | — | CI build + test | Discretion: recommended CI provider |

### Alternatives Considered (Phase 1)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CJS-only `tsc` | Dual CJS+ESM via tsup | Dual costs tooling; default CJS-only until free (discretion) |
| Ajv + JSON Schema | Zod-only store model | Forks on-disk contract; banned by D-09 / STACK |
| In-house lock + dual-write | `proper-lockfile` / `write-file-atomic` | Wrong multi-file order; engines mismatch; unmaintained lock semantics |
| `node:test` + c8 | Vitest / Jest | Dual framework tax; not house style |
| graphology / ngraph | — | Out of Phase 1 entirely; pure TS later for query |

**Installation (Phase 1 only):**

```bash
npm install ajv@^8.20.0 ajv-formats@^3.0.1

npm install -D typescript@^6.0.3 @types/node@^22.19.0 c8@^12.0.0
# optional: tsx@^4.23.5
```

**Do not install in Phase 1:** `commander`, `picocolors`, `@modelcontextprotocol/sdk`, `zod`, `graphology`, `gsd-core`, `write-file-atomic`, `proper-lockfile`.

**Engines:**

```json
{
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  }
}
```

## Package Legitimacy Audit

| Package | Registry | Age / signal | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|--------------|-----------|-------------|---------|-------------|
| `ajv` | npm | published 2026-04-24 (v8.20.0) | ~364M/wk | github.com/ajv-validator/ajv | OK | Approved |
| `ajv-formats` | npm | published 2024-03-30 (v3.0.1) | ~118M/wk | github.com/ajv-validator/ajv-formats | OK | Approved |
| `typescript` | npm | latest version recency flagged | ~258M/wk | github.com/microsoft/TypeScript | SUS (`too-new`) | **Approved** — false positive on latest version date; established package; pin `^6.0.3` |
| `@types/node` | npm | latest version recency flagged | ~406M/wk | DefinitelyTyped | SUS (`too-new`) | **Approved** — false positive; pin `^22.19.0` |
| `c8` | npm | latest version recency flagged | ~4.4M/wk | github.com/bcoe/c8 | SUS (`too-new`) | **Approved** — false positive; house coverage tool; pin `^12.0.0` |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** `typescript`, `@types/node`, `c8` — seam reason is version recency only; downloads + official repos confirm legitimacy. Planner may skip `checkpoint:human-verify` for these three given open-gsd stack alignment, but must re-run `npm view` at install time for pin confirmation.

**postinstall scripts:** none on `ajv`, `ajv-formats`, `c8`, `typescript` (checked via `npm view … scripts.postinstall`).

## Architecture Patterns

### System Architecture Diagram (Phase 1 scope)

```text
                    ┌──────────────────────────────────────┐
                    │  Consumer (tests / future CLI/lib)   │
                    └──────────────────┬───────────────────┘
                                       │ require('@opengsd/gsd-graph')
                                       ▼
                    ┌──────────────────────────────────────┐
                    │  src/index.ts  (public façade)       │
                    │  loadOntologyPack · resolveStoreRoot │
                    │  withBuildLock · publishGraphFiles   │
                    │  validateGraphV1 · GSD_GRAPH_REASON  │
                    └───────────┬──────────────┬───────────┘
                                │              │
              ┌─────────────────▼──┐    ┌──────▼────────────────┐
              │  src/ontology/*    │    │  src/io/*             │
              │  load-pack         │    │  paths (realpath)     │
              │  policy matrix     │    │  lock (.build.lock)   │
              │  types             │    │  atomic-publish       │
              └─────────┬──────────┘    │  safe-json            │
                        │               └──────────┬────────────┘
                        ▼                          ▼
              ┌──────────────────┐      ┌─────────────────────────┐
              │ ontology-packs/  │      │  <store>/.gsd-graph/    │
              │  general/        │      │  graph.v1.json  (SoT)   │
              │ schemas/         │      │  graph.json (optional)  │
              │  *.schema.json   │      │  .build.lock            │
              └──────────────────┘      │  ontology.lock.json     │
                        │               └─────────────────────────┘
                        ▼
              ┌──────────────────┐
              │  Ajv validators  │  compile once at load
              └──────────────────┘
```

### Recommended Project Structure (Phase 1 slice)

```text
gsd-graph/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── LICENSE
├── schemas/
│   ├── graph-v1.schema.json
│   └── ontology-pack.schema.json
├── ontology-packs/
│   └── general/
│       ├── ontology.json
│       └── README.md
├── src/
│   ├── index.ts                 # public exports only
│   ├── types.ts                 # GraphNode, Triple, OntologyPack, …
│   ├── errors.ts                # GSD_GRAPH_REASON + typed errors
│   ├── ontology/
│   │   ├── types.ts
│   │   ├── load-pack.ts
│   │   └── policy.ts            # review|coerce|drop helpers
│   ├── io/
│   │   ├── paths.ts             # resolveStoreRoot, confinePath
│   │   ├── lock.ts              # .build.lock
│   │   ├── atomic-publish.ts    # dual-write ordered rename
│   │   └── safe-json.ts         # read/write JSON with validate hooks
│   └── schema/
│       └── validators.ts        # Ajv compile once
└── tests/
    ├── ontology-load.test.ts
    ├── paths-confine.test.ts
    ├── lock.test.ts
    └── publish-dual-write.test.ts
```

`pipeline/*`, `sources/*`, `cli.ts`, `mcp/*`, extra packs, prompts — **not Phase 1**.

### Pattern 1: CJS package with explicit exports

**What:** Emit CommonJS + declaration files; expose `main`/`types`/`exports["."].require`.  
**When:** Always for v0.1 (D-03).  
**Example:** see Code Examples → package.json exports.

### Pattern 2: Schema-as-authority + Ajv compile-once

**What:** Checked-in JSON Schema files are the on-disk contract; TS interfaces mirror them but do not replace them. Compile validators at module load.  
**When:** Any load of `graph.v1.json` or ontology pack.  
**Source:** [CITED: https://ajv.js.org/guide/getting-started.html] — compile once, reuse functions; `errors` overwritten each call.

### Pattern 3: Ontology replace-only load + closed allowlist

**What:** One active pack; validate with Ajv; expose `Set`s of types/predicate ids; freeze lock snapshot shape for later store write. No `extends` merge in v0.1 (ONT-03 / K19).  
**When:** Init and before any future normalize (Phase 2).

### Pattern 4: Dual-write ordered publish

**What:** Acquire lock → validate → write `*.tmp` → fsync → rename **v1 first** → optional projection → sidecars → status → release.  
**When:** Any future graph mutation; Phase 1 ships the primitive + unit tests with fixtures (even empty/minimal graphs).  
**Source:** [VERIFIED: docs/DESIGN.md dual-write protocol] verbatim order 1–8.

### Pattern 5: realpath confinement

**What:** Resolve store root and every relative child via `fs.realpathSync.native` (or promises equivalent); require `resolved === root || resolved.startsWith(root + path.sep)`; reject `..` and symlink escape with `PATH_ESCAPE`.  
**When:** Every store path construction (STORE-05).

### Anti-Patterns to Avoid

- **Projection-as-truth:** never load `graph.json` when v1 missing; fail `schema_invalid`.
- **Zod as store SoT:** forks the JSON Schema contract (D-09).
- **Runtime gsd-core / `.planning/` dependency:** category error (D-01, Pitfall 8).
- **Silent ontology lock expansion:** unknown types/predicates never auto-add to lock (D-05).
- **Single-file atomic helper as whole publish:** cannot encode multi-file rename order.
- **Reading lock without `wx` exclusive create:** races two writers into torn stores.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema validation | Custom recursive validators | `ajv` + `ajv-formats` | Draft edge cases, formats, compile cache |
| Coverage | Custom counters | `c8` | V8 coverage over `node --test` |
| Test runner | Jest/Vitest harness | `node:test` | Zero config, house style |
| Typechecking / emit | Babel/esbuild-only pipeline | `tsc -p tsconfig.build.json` | Declaration emit + simple dist |

### DO Hand-Roll (product invariants)

| Problem | Hand-roll | Why not a library |
|---------|-----------|-------------------|
| Multi-file dual-write publish | `src/io/atomic-publish.ts` | Ordered renames (v1 → projection → sidecars); `write-file-atomic` is single-file and engines-stricter than `>=22.0.0` [VERIFIED: STACK.md] |
| `.build.lock` with stale PID steal | `src/io/lock.ts` | Spec is product-specific: JSON `{pid, started_at, owner, cwd}`, 15‑min or dead-PID steal, `build_locked` [VERIFIED: docs/DESIGN.md:319-327] |
| realpath store confinement | `src/io/paths.ts` | Security policy is product-owned; thin wrapper over Node `fs`/`path` |
| Ontology policy matrix | `src/ontology/policy.ts` | Domain rules (`review` writes nothing) not a generic package |

**Key insight:** Phase 1 complexity is **protocol fidelity**, not framework choice. Libraries that almost match dual-write/lock will force the wrong abstraction; ~40–80 LOC matching gsd-core’s `tmp-${pid}-${counter}` + `wx` patterns is the standard path. [CITED: gsd-core `runtime-hooks-surface.cts` atomicWriteFileSync; `installer-migrations.cts` `openSync(..., 'wx')`]

## Common Pitfalls

### Pitfall 1: Category / naming confusion (GSD product coupling)
**What goes wrong:** README or deps imply gsd-core plugin.  
**Why:** npm scope is publisher namespace. [CITED: docs.npmjs.com/about-scopes]  
**How to avoid:** PKG-02 wording “Graph Engineering toolkit”; test `package.json` has zero `gsd-core` dependency.  
**Warning signs:** deps include `@opengsd/gsd-core`; README “GSD capability”.

### Pitfall 2: Dual-write race / projection-as-truth
**What goes wrong:** Crash mid-publish; readers load lagging projection.  
**How to avoid:** rename v1 first; native load APIs accept only `graph.v1.json`; tests kill mid-protocol.  
**Warning signs:** tests that assert query reads `graph.json`.

### Pitfall 3: Path traversal / symlink escape
**What goes wrong:** `../` or symlink under store/corpus escapes root.  
**How to avoid:** realpath + prefix; fixtures with symlink escape; reason `path_escape`.  
**Warning signs:** relative joins without realpath.

### Pitfall 4: Open-world ontology drift
**What goes wrong:** unknown predicates written or lock auto-expanded.  
**How to avoid:** default `review` writes nothing; unit matrix for coerce/drop; reject extends.  
**Warning signs:** lock hash changes without explicit extend API (extend is Phase 2+).

### Pitfall 5: Lock not exclusive or stale forever
**What goes wrong:** two builds interleave; dead PID blocks forever.  
**How to avoid:** `openSync(path, 'wx')`; stale = 15 min **or** `process.kill(pid, 0)` fails; fail-fast `build_locked`.  
**Warning signs:** lock file without PID; no EEXIST test.

### Pitfall 6: Compiling Ajv on every validate
**What goes wrong:** slow tests/builds.  
**How to avoid:** module-level `compile()` once. [CITED: ajv.js.org getting-started]

### Pitfall 7: Missing copyright headers
**What goes wrong:** D-08 / project convention violation.  
**How to avoid:** every source file starts with:

```ts
// gsd-graph — <file purpose>
```

## Code Examples

### package.json exports (CJS + types)

```json
{
  "name": "@opengsd/gsd-graph",
  "version": "0.1.0",
  "description": "Graph Engineering toolkit: extract → normalize → store → query → ground → maintain",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "schemas", "ontology-packs", "LICENSE", "README.md"],
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "npm run build && node --test dist-test/**/*.test.js",
    "test:coverage": "c8 --check-coverage --lines 80 node --test dist-test/**/*.test.js"
  }
}
```

[CITED: .planning/research/STACK.md package shape] · Phase 1 may omit `bin` until PKG-03.

### tsconfig.build.json sketch

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

[ASSUMED] exact tsconfig knobs beyond CJS+declaration — standard `tsc` library emit.

### Ontology pack loader API

```ts
// gsd-graph — ontology pack load API sketch
// Source shape: docs/DESIGN.md ontology model [VERIFIED: docs/DESIGN.md:337-363]

export type UnknownPolicy = 'review' | 'coerce' | 'drop';

export interface OntologyPredicate {
  id: string;
  domain: string[];
  range: string[];
}

export interface OntologyPack {
  id: string;
  version: string;
  title: string;
  node_types: string[];
  predicates: OntologyPredicate[];
  strict: boolean;
  unknown_predicate_policy: UnknownPolicy;
  unknown_type_policy: UnknownPolicy;
}

export interface LoadedOntology {
  pack: OntologyPack;
  typeSet: ReadonlySet<string>;
  predicateSet: ReadonlySet<string>;
  packHash: string; // sha256 of canonical pack JSON for ontology.lock.json
}

/** Load + Ajv-validate pack. Replace-only: no extends merge (ONT-03). */
export function loadOntologyPack(opts: {
  packIdOrPath?: string; // default 'general' → package ontology-packs/general/ontology.json
  baseDir?: string;      // for path packs; realpath-confined when under store
}): LoadedOntology;

/**
 * Policy matrix (ONT-02). Default review = do not write candidate.
 * [VERIFIED: docs/DESIGN.md:365-376]
 */
export function applyUnknownPolicy(
  loaded: LoadedOntology,
  kind: 'type' | 'predicate',
  proposed: string,
): { action: 'allow' | 'review' | 'coerce' | 'drop'; coercedTo?: string };
```

**general pack predicates/types** must match DESIGN example (verbatim node_types and predicate ids from DESIGN ontology JSON). [VERIFIED: docs/DESIGN.md:337-363]

Quote (node_types):

```text
"node_types": ["Entity", "Person", "Organization", "Place", "Concept", "Document", "Event", "Claim", "Topic", "Community"]
```

Quote (policy defaults):

```text
"strict": true,
"unknown_predicate_policy": "review",
"unknown_type_policy": "review"
```

### Lock + atomic publish helpers

```ts
// gsd-graph — lock + dual-write sketches
// Protocol: docs/DESIGN.md [VERIFIED: docs/DESIGN.md:302-327]
// Pattern precedent: gsd-core openSync wx + tmp-${pid}-N rename [CITED]

import fs from 'node:fs';
import path from 'node:path';

export interface BuildLockPayload {
  pid: number;
  started_at: string; // ISO
  owner: 'cli' | 'lib' | 'mcp' | 'test';
  cwd: string;
}

export interface LockHandle {
  release(): void;
}

const STALE_MS = 15 * 60 * 1000;

export function acquireBuildLock(
  storeRoot: string,
  owner: BuildLockPayload['owner'],
  opts?: { waitMs?: number },
): LockHandle {
  const lockPath = path.join(storeRoot, '.build.lock');
  // 1) openSync(lockPath, 'wx') — EEXIST → read payload; steal if stale/dead PID
  // 2) write JSON payload; return release() => unlinkSync
  // 3) on contention without steal → throw reason build_locked
  void lockPath; void owner; void opts;
  throw new Error('implement');
}

export interface PublishPlan {
  storeRoot: string;
  graphV1: object;           // already Ajv-valid
  projection?: object | null; // if write_projection
  sidecars?: Record<string, object>; // manifest, review-queue, etc.
  writeProjection: boolean;  // Phase 1 recommend default false (discretion)
}

/**
 * Dual-write:
 * 1 lock held by caller
 * 2 validate (caller)
 * 3 write graph.v1.json.tmp → fsync
 * 4 optional graph.json.tmp → fsync
 * 5 sidecar temps
 * 6 rename v1 first, then projection, then sidecars
 * 7 write .last-build-status.json
 * 8 caller releases lock
 */
export function publishGraphFiles(plan: PublishPlan): void {
  const tmp = (finalName: string) =>
    path.join(plan.storeRoot, `${finalName}.tmp-${process.pid}-${Date.now()}`);
  // writeFileSync(tmp, JSON.stringify(...))
  // const fd = openSync(tmp, 'r'); fsyncSync(fd); closeSync(fd);
  // renameSync(tmpV1, path.join(plan.storeRoot, 'graph.v1.json'))  // FIRST
  // then projection, then sidecars; clean tmp on failure
  void tmp;
  throw new Error('implement');
}
```

**Lock contents quote** [VERIFIED: docs/DESIGN.md:321-327]:

```text
| Path | `<store>/.build.lock` |
| Contents | `{ pid, started_at, owner: "cli\|lib\|mcp", cwd }` |
| Stale | 15 minutes or dead PID → steal with warning |
| Contention | Default fail-fast `build_locked`; optional `--wait <sec>` |
```

### graph.v1 schema skeleton

JSON Schema authority file `schemas/graph-v1.schema.json` must accept the DESIGN canonical document. Skeleton fields [VERIFIED: docs/DESIGN.md:445-484]:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opengsd.dev/schemas/graph-v1.schema.json",
  "title": "gsd-graph graph.v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "engine",
    "engine_version",
    "ontology_pack_id",
    "ontology_version",
    "built_at",
    "nodes",
    "triples"
  ],
  "properties": {
    "schema_version": { "const": 1 },
    "engine": { "const": "gsd-graph" },
    "engine_version": { "type": "string", "minLength": 1 },
    "ontology_pack_id": { "type": "string", "minLength": 1 },
    "ontology_version": { "type": "string", "minLength": 1 },
    "built_at": { "type": "string", "format": "date-time" },
    "built_at_commit": {
      "type": ["string", "null"],
      "pattern": "^[0-9a-fA-F]{4,40}$"
    },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "label"],
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "type": { "type": "string", "minLength": 1 },
          "label": { "type": "string" },
          "description": { "type": "string" },
          "aliases": { "type": "array", "items": { "type": "string" } }
        },
        "additionalProperties": false
      }
    },
    "triples": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "s", "p", "o", "confidence", "provenance"],
        "properties": {
          "id": { "type": "string", "pattern": "^t_[0-9a-f]{16}$" },
          "s": { "type": "string" },
          "p": { "type": "string" },
          "o": { "type": "string" },
          "confidence": { "enum": ["EXTRACTED", "INFERRED", "AMBIGUOUS"] },
          "score": { "type": "number", "minimum": 0, "maximum": 1 },
          "provenance": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["source_path", "extractor", "content_hash", "confidence"],
              "properties": {
                "source_path": { "type": "string" },
                "extractor": { "type": "string" },
                "content_hash": { "type": "string" },
                "confidence": { "enum": ["EXTRACTED", "INFERRED", "AMBIGUOUS"] },
                "score": { "type": "number" },
                "span": {
                  "type": "object",
                  "properties": {
                    "start_line": { "type": "integer" },
                    "end_line": { "type": "integer" }
                  }
                }
              }
            }
          }
        },
        "additionalProperties": false
      }
    },
    "communities": { "type": "array" },
    "stats": {
      "type": "object",
      "properties": {
        "node_count": { "type": "integer", "minimum": 0 },
        "triple_count": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

**Canonical instance quote** [VERIFIED: docs/DESIGN.md:445-453]:

```json
{
  "schema_version": 1,
  "engine": "gsd-graph",
  "engine_version": "0.1.0",
  "ontology_pack_id": "general",
  "ontology_version": "1",
  "built_at": "2026-08-02T12:00:00.000Z",
  "built_at_commit": null
}
```

### Ajv compile-once

```ts
// Source: https://ajv.js.org/guide/getting-started.html [CITED]
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import graphV1Schema from '../../schemas/graph-v1.schema.json';
import ontologyPackSchema from '../../schemas/ontology-pack.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

export const validateGraphV1 = ajv.compile(graphV1Schema);
export const validateOntologyPack = ajv.compile(ontologyPackSchema);
```

[ASSUMED] draft-2020-12 import path `ajv/dist/2020` — confirm against Ajv 8 docs at implement time; if using draft-07, use default `Ajv` constructor instead. Prefer matching `$schema` in checked-in files.

### realpath confinement

```ts
// gsd-graph — path confinement

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';

export const DEFAULT_STORE_DIR = '.gsd-graph';

export function resolveStoreRoot(opts?: {
  dir?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): string {
  const raw =
    opts?.dir ??
    opts?.env?.GSD_GRAPH_DIR ??
    DEFAULT_STORE_DIR;
  const abs = path.resolve(opts?.cwd ?? process.cwd(), raw);
  return fs.realpathSync.native(abs);
}

export function confineUnderRoot(rootReal: string, candidate: string): string {
  const resolved = fs.realpathSync.native(path.resolve(rootReal, candidate));
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (resolved !== rootReal && !resolved.startsWith(prefix)) {
    throw new GraphError(GSD_GRAPH_REASON.PATH_ESCAPE, `path escapes store root: ${candidate}`);
  }
  return resolved;
}
```

Reason code quote [VERIFIED: docs/DESIGN.md:828-840]:

```ts
const GSD_GRAPH_REASON = Object.freeze({
  OK: 'ok',
  BUILD_LOCKED: 'build_locked',
  BUILD_FAILED: 'build_failed',
  SCHEMA_INVALID: 'schema_invalid',
  ONTOLOGY_INVALID: 'ontology_invalid',
  EMPTY_SUBGRAPH: 'empty_subgraph',
  PROMPT_RESULT_INVALID: 'prompt_result_invalid',
  CORPUS_NOT_FOUND: 'corpus_not_found',
  PATH_ESCAPE: 'path_escape',
  LIMIT_EXCEEDED: 'limit_exceeded',
  NO_BASELINE: 'no_baseline',
});
```

Phase 1 must implement at least: `OK`, `BUILD_LOCKED`, `SCHEMA_INVALID`, `ONTOLOGY_INVALID`, `PATH_ESCAPE`.

### Discretion recommendations (locked for planner unless user overrides)

| Topic | Recommendation | Rationale |
|-------|----------------|-----------|
| Dual ESM | **CJS-only** for 0.1 | Dual costs; discretion default |
| `store.write_projection` | **default `false`** | Prefer until viewer needs it; docs: projection disposable |
| CI | **GitHub Actions** `node:22` matrix (+ optional 24/25) | Discretion recommendation |
| Lock format | DESIGN payload + 15m / dead-PID steal | Matches K11 |
| Test layout | Compile tests to `dist-test/` OR `tsx` | Either is fine; prefer one path in plan |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Graph DB first (Neo4j default) | File-first `graph.v1.json` SoT | Product pivot 2026-08 | Phase 1 is FS + schema, not drivers |
| Zod-only TS contracts | JSON Schema files + Ajv | STACK / D-09 | Schemas ship in package `files` |
| `write-file-atomic` for durability | Hand-rolled dual-write order | STACK research | Multi-file protocol is the product |
| Vitest default | `node:test` + c8 | OpenGSD house style | Zero runner config |

**Deprecated/outdated for this phase:**
- Graphology as required dep — deferred forever for v0.1 query; irrelevant to Phase 1
- MCP SDK / commander — Phase 4/6 only

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tsconfig` knobs (`ES2022`, `Node` resolution) are acceptable without further debate | Standard Stack | Minor emit tweaks at implement time |
| A2 | Ajv draft-2020-12 constructor path is preferred for `$schema` 2020-12 | Code Examples | Swap to draft-07 Ajv default if schemas use draft-07 |
| A3 | Phase 1 omits `bin/gsd-graph.js` until Phase 4 PKG-03 | Summary / package.json | If planner wants layout parity early, empty bin is optional |
| A4 | `store.write_projection` default false is the right product default vs DESIGN example `true` | Discretion | Docs + config default only; protocol still supports projection |
| A5 | Directory fsync after rename is best-effort optional on POSIX | Dual-write | Durability on power loss slightly weaker without dir fsync |

**If this table is empty:** N/A — five assumptions listed for planner confirmation.

## Open Questions (RESOLVED)

Resolved 2026-08-02 during plan-phase (plans 01-01..01-03 lock these choices).

1. **Schema draft version (2020-12 vs draft-07)** — **RESOLVED: draft-2020-12**  
   - Decision: All Phase 1 checked-in schemas (`graph-v1.schema.json`, `ontology-pack.schema.json`) set `$schema` to JSON Schema draft-2020-12 and compile with Ajv 2020 constructor (`ajv/dist/2020`).  
   - Rationale: greenfield schemas; one draft for pack + graph; matches RESEARCH recommendation and plan 01-02 Task 1.  
   - Follow-on schemas (provenance, review-queue) should stay on the same draft.

2. **Whether Phase 1 public API exports `init()` or only IO/ontology primitives** — **RESOLVED: primitives only**  
   - Decision: Phase 1 exports library primitives only — `resolveStoreRoot`, `ensureStoreRoot` (mkdir helper), `loadOntologyPack`, `applyUnknownPolicy`, `acquireBuildLock`, `publishGraphFiles`, `loadGraphV1`, `validateGraphV1` / `validateOntologyPack`, reason codes.  
   - No full CLI `init` (gitignore append, interactive layout) in Phase 1 — that is Phase 4 (CLI-03 / PKG-03).  
   - Optional thin `ensureStoreLayout()` that only creates empty store dirs is allowed as a test/helper; it is not the product CLI init.

3. **Windows lock steal semantics** — **RESOLVED: POSIX-first; Windows best-effort later**  
   - Decision: Implement `.build.lock` with exclusive `wx` create, 15-minute stale age, and dead-PID steal via `process.kill(pid, 0)` semantics that match DESIGN on POSIX.  
   - Phase 1 gate: macOS/Linux (local + GitHub Actions ubuntu) green.  
   - Windows exclusive-create / symlink / PID-liveness edge cases are best-effort documented; deeper Windows CI matrix is deferred past Phase 1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test | ✓ | v25.6.1 (local) | engines `>=22.0.0` |
| npm | Install | ✓ | 11.9.0 | — |
| TypeScript (npm) | Emit | ✓ (registry 6.0.3) | install as devDep | — |
| Git | Optional stamp later | ✓ (assumed dev machine) | — | not required Phase 1 |
| GitHub Actions | CI | N/A (remote) | — | local `npm test` only |

**Missing dependencies with no fallback:** none for Phase 1 code work.

**Missing dependencies with fallback:** dual ESM tooling (not needed).

## Validation Architecture

> `workflow.nyquist_validation` is enabled in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node ≥22 built-in) + `node:assert/strict` |
| Coverage | `c8` ^12.0.0 |
| Config file | none required — Wave 0 may add `c8` config in package.json |
| Quick run command | `npm test` (or `node --test dist-test/**/*.test.js` after build) |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-01 | `npm run build` emits `dist/index.js` + `dist/index.d.ts`; engines ≥22 | smoke | `npm run build && test -f dist/index.js && test -f dist/index.d.ts` | ❌ Wave 0 |
| PKG-02 | package description mentions Graph Engineering; deps exclude gsd-core | unit | `node --test dist-test/package-identity.test.js` | ❌ Wave 0 |
| ONT-01 | `loadOntologyPack({ packIdOrPath: 'general' })` validates allowlists | unit | `node --test dist-test/ontology-load.test.js` | ❌ Wave 0 |
| ONT-02 | review writes nothing; coerce maps to related_to/Concept; drop discards | unit | `node --test dist-test/ontology-policy.test.js` | ❌ Wave 0 |
| ONT-03 | pack with `extends` rejected or ignored (replace-only) | unit | same as ONT-01 | ❌ Wave 0 |
| STORE-01 | default dir `.gsd-graph`; override via opts/env | unit | `node --test dist-test/paths-confine.test.js` | ❌ Wave 0 |
| STORE-02 | publish writes `graph.v1.json`; load API refuses projection as SoT | unit | `node --test dist-test/publish-dual-write.test.js` | ❌ Wave 0 |
| STORE-03 | rename order v1 before projection; crash fixture leaves v1 readable | unit | same | ❌ Wave 0 |
| STORE-04 | second lock fails `build_locked`; stale steal works | unit | `node --test dist-test/lock.test.js` | ❌ Wave 0 |
| STORE-05 | symlink/`..` escape → `path_escape` | unit | `node --test dist-test/paths-confine.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green + success criteria 1–4 true before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/package-identity.test.ts` — PKG-01/02
- [ ] `tests/ontology-load.test.ts` — ONT-01/03
- [ ] `tests/ontology-policy.test.ts` — ONT-02
- [ ] `tests/paths-confine.test.ts` — STORE-01/05
- [ ] `tests/lock.test.ts` — STORE-04
- [ ] `tests/publish-dual-write.test.ts` — STORE-02/03
- [ ] `schemas/graph-v1.schema.json` + `schemas/ontology-pack.schema.json`
- [ ] `ontology-packs/general/ontology.json`
- [ ] Framework: `typescript`, `@types/node`, `ajv`, `ajv-formats`, `c8` install
- [ ] `tsconfig.build.json` + package scripts

## Security Domain

> `security_enforcement` enabled; ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local library; no auth surface in Phase 1 |
| V3 Session Management | no | No sessions |
| V4 Access Control | partial | MCP write gates deferred; filesystem trust = user process |
| V5 Input Validation | **yes** | Ajv on ontology + graph.v1; path confinement on all store paths |
| V6 Cryptography | partial | `node:crypto` sha256 for pack hash / future triple ids — no hand-rolled crypto |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal / symlink escape | Elevation / Information disclosure | realpath + prefix; `PATH_ESCAPE` [VERIFIED: docs/DESIGN.md:906] |
| Torn multi-file write | Tampering | dual-write order + lock [VERIFIED: docs/DESIGN.md:302-317] |
| Concurrent writers | Tampering | `.build.lock` exclusive [VERIFIED: docs/DESIGN.md:319-327] |
| Schema invalid / hostile JSON | Tampering | Ajv fail-closed `schema_invalid` / `ontology_invalid` |
| Dependency confusion / slopsquat | Tampering | package legitimacy gate; pin known packages |
| Secrets in future corpus | Information disclosure | Phase 2 extract redaction; N/A Phase 1 except don't log lock cwd secrets carelessly |

## Project Constraints

No project-root `CLAUDE.md` or `.claude/CLAUDE.md` present at research time. Applicable constraints from locked product docs:

- Copyright header on source files (D-08)
- Zero runtime dependency on gsd-core / GSD workflows / `.planning/` (D-01)
- Store default `.gsd-graph/` (D-02)
- Follow DESIGN.md as product authority for discrete values

## Sources

### Primary (HIGH confidence)

- `docs/DESIGN.md` — package shape, store layout, dual-write, lock table, ontology pack + policy matrix, graph.v1 model, reason codes, security table  
- `.planning/research/STACK.md` — stack pins, hand-roll lock/publish rationale, banned deps  
- `.planning/research/ARCHITECTURE.md` — module boundaries, dependency rules  
- `.planning/research/PITFALLS.md` — dual-write, path traversal, naming  
- `.planning/phases/01-foundation-identity/CONTEXT.md` — D-01..D-10  
- `.planning/REQUIREMENTS.md` / `ROADMAP.md` — Phase 1 requirement set  
- npm registry (2026-08-02 session): `ajv@8.20.0`, `ajv-formats@3.0.1`, `typescript@6.0.3`, `c8@12.0.0`, `@types/node@22.20.1`  
- Ajv getting started: https://ajv.js.org/guide/getting-started.html  
- Node.js fs API: https://nodejs.org/api/fs.html  
- gsd-core patterns: `runtime-hooks-surface.cts` atomicWriteFileSync; `installer-migrations.cts` `openSync(..., 'wx')`

### Secondary (MEDIUM confidence)

- npm scopes as publisher namespaces (pitfalls research citation)  
- POSIX rename atomicity same-volume general FS knowledge (design assumes; multi-file not one transaction)

### Tertiary (LOW confidence)

- Exact Windows symlink + exclusive-create edge cases — verify in later CI matrix  
- Ajv draft-2020 import path convenience — confirm at implement

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — npm view + STACK + legitimacy seam  
- Architecture: **HIGH** — DESIGN + ARCHITECTURE normative for greenfield  
- Pitfalls: **HIGH** for product locks; **MEDIUM** for FS edge cases  

**Research date:** 2026-08-02  
**Valid until:** 2026-09-01 (30 days; re-verify npm pins at implementation)

### Phase success criteria → validation mapping

| # | Success criterion (ROADMAP) | How Phase 1 proves it |
|---|----------------------------|------------------------|
| 1 | Package builds CJS+types; GE toolkit docs; no gsd-core dep | `npm run build`; README/description assert; dependency unit test |
| 2 | general pack + policy matrix | load tests + policy matrix unit tests |
| 3 | realpath + lock under `.gsd-graph/` | paths + lock tests with tmp dirs |
| 4 | Dual-write v1-first rename | publish tests with ordered rename spy/crash fixture |
