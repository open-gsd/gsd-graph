# Technology Stack

**Project:** gsd-graph (`@opengsd/gsd-graph`)  
**Domain:** Standalone Graph Engineering toolkit (library + CLI + optional MCP)  
**Researched:** 2026-08-02  
**Overall confidence:** HIGH

## Recommended Stack

### Core runtime & language

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | `>=22.0.0` | Runtime | Locked by design; matches `@opengsd/gsd-core` / `@opengsd/gsd-pi` engines (`node: '>=22.0.0'`). [VERIFIED] |
| TypeScript | `^6.0.3` | Language / types | Same major as gsd-core (`typescript: ^6.0.3`). 7.0.2 exists on npm but ecosystem packages still ship on 6.x — stay aligned until a deliberate bump. [VERIFIED] |
| `@types/node` | `^22.19.0` | Node typings | Pin to Node 22 types (not latest `@types/node` 26.x) so APIs match engines. [VERIFIED] |

### Package shape (library + CLI)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `tsc` (typescript) | (above) | Build | Emit **CJS + `.d.ts`** first. Design open question defaults to CJS+types; dual ESM only if free later. gsd-core builds with plain `tsc -p tsconfig.build.json` — no bundler required. [CITED] design K / open Q1 |
| Package `exports` | — | Public API | `main` + `types` + `exports["."]` with `require`/`types`. Defer `import` condition until dual emit. [ASSUMED] pattern |
| `bin` | — | CLI surfaces | `gsd-graph` → `bin/gsd-graph.js`; optional `gsd-graph-mcp` → `bin/gsd-graph-mcp.js` (thin shebang wrappers requiring `dist/`). [CITED] DESIGN.md layout |
| `commander` | `^14.0.3` | CLI parsing | Mature, typed, agent-friendly. **14.x** engines `node: '>=20'` fit design `>=22.0.0`. Avoid commander **15.0.0** unless engines rise to `>=22.12.0` (15.x engines require that). [VERIFIED] |
| `picocolors` | `^1.1.1` | stderr human color | Tiny; only when `stderr.isTTY`. Keep stdout pure JSON (K22). [VERIFIED] |

**Publish posture:** single package `@opengsd/gsd-graph` (not a monorepo). `"files": ["dist", "bin", "schemas", "ontology-packs", "prompts"]`. **Zero runtime dependency on `gsd-core` / GSD planning.** [CITED] PROJECT.md / K18

**Dual package (CJS+ESM):** do **not** block 0.1.0 on dual emit. If dual becomes free, use `tsup` `^8.5.1` or dual `tsc` projects — not required for GA. [VERIFIED] tsup version

### Schema validation (graph.v1.json + prompts)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `ajv` | `^8.20.0` | JSON Schema validate | Store truth is **JSON Schema files** (`schemas/graph-v1.schema.json`, ontology, provenance, review-queue). Ajv is the standard JSON Schema engine; MCP SDK already depends on ajv 8.x. Compile validators once at load. [VERIFIED] |
| `ajv-formats` | `^3.0.1` | date-time / uri formats | Needed if schemas use format keywords. [VERIFIED] |
| `zod` | `^4.0.0` \|\| `^3.25` | MCP tool input schemas only | **Peer of MCP SDK**, not the store validator. Use for CLI/MCP arg shapes if desired; **do not** re-author `graph.v1.json` solely in Zod (would fork the on-disk contract). [VERIFIED] |

**Rule:** fail-closed on `schema_invalid` / `prompt_result_invalid`. Runtime types may mirror schemas in TS interfaces, but **publish-path validation goes through Ajv against the checked-in JSON Schema**. [CITED] DESIGN.md

### Graph algorithms & in-memory model

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **In-house pure TS** | — | Adjacency, BFS/path, budget, label propagation | Design caps (≤100k nodes / ≤250k triples) and laptop budgets (path ≤200ms, hops=2 ≤50ms) are well within pure-JS. Keep triple identity + provenance on our model; avoid translating to a third-party Graph object on every query. [CITED] DESIGN.md |
| `node:crypto` | built-in | `sha256` triple ids / fingerprints | No extra dep; triple id = first 16 hex of `sha256(s\\0p\\0o)`. [CITED] K20 |

**Do not take as v0.1 runtime deps:**

| Library | Latest | Why not for v0.1 |
|---------|--------|------------------|
| `graphology` | 0.26.0 | Solid multipurpose Graph (~2.7 MB unpacked) + plugin tax; no first-class **label propagation** package (Louvain/Leiden only). Overkill for seed/expand + path + budget. [VERIFIED] |
| `graphology-shortest-path` | 2.1.0 | Fine Dijkstra/A\* if we already depended on graphology — we should not. [VERIFIED] |
| `graphology-communities-louvain` | 2.0.2 | Design v0.2 specifies **label propagation**, not Louvain. [CITED] DESIGN communities |
| `ngraph.graph` / `ngraph.path` | 20.1.2 / 1.6.1 | Fast pathfinding, but another graph model + dep surface; pure BFS/Dijkstra on our adjacency map is enough and keeps provenance-native triples. [VERIFIED] |

**v0.2 communities:** implement pure-TS label propagation (max 20 iterations, min size 3) per design. Revisit graphology only if we need Louvain/export/visualization later as an **optional** adapter. [CITED]

### Corpus I/O

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:fs` / `node:fs/promises` | built-in | Read/write store | Includes **`fs.glob` / `fs.globSync`** on Node 22 — prefer built-in globs for corpus discovery over `glob`/`fast-glob` unless we need ignore-file parity. [VERIFIED] |
| `node:path` + `realpath` | built-in | Path confinement | Design security: realpath + prefix checks on corpus, store, ontology, prompts, snapshots. [CITED] |
| `fast-json-stable-stringify` | `^2.1.0` | Stable review-item ids | Review id = hash of kind + canonical JSON payload; deterministic stringify avoids key-order churn. Tiny. [VERIFIED] |

Optional later: `minimatch` only if built-in glob semantics diverge from needed ignore rules.

### Atomic publish & locking (dual-write store)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **In-house `io/atomic-publish.ts`** | — | tmp → fsync → rename | Design protocol is multi-file ordered publish (v1 first, then projection, then sidecars). A single-file helper cannot own that ordering. [CITED] dual-write protocol |
| **In-house `io/lock.ts`** | — | `.build.lock` | Spec is product-specific: JSON `{pid, started_at, owner, cwd}`, 15‑min stale or dead-PID steal, fail-fast `build_locked` / `--wait`. [CITED] |
| `write-file-atomic` | 8.0.0 (avoid) | — | Single-file focus; v8 engines (`^22.22.2 \|\| ^24.15.0 \|\| >=26`) are **stricter than** design `>=22.0.0`. Not worth the engines fight. [VERIFIED] |
| `proper-lockfile` | 4.1.2 (avoid) | — | Last release 2021; stale/retry model differs from design; adds graceful-fs. Prefer ~40 LOC matching gsd-core’s proven tmp+rename + wx lock patterns. [VERIFIED][CITED] gsd-core `atomicWriteFileSync` / planning-workspace lock |

**Canonical publish algorithm (implement, do not outsource):**

1. Acquire `.build.lock` (`open` with `wx` or exclusive create; stale steal per design).  
2. Validate in-memory graph with Ajv (+ size caps).  
3. Write `graph.v1.json.tmp` → `fsync` (file handle; directory fsync best-effort on POSIX).  
4. Optional projection `graph.json.tmp` → fsync.  
5. Sidecar temps (manifest, review-queue, report).  
6. `rename` **v1 first**, then projection, then sidecars (POSIX rename atomic same-volume).  
7. Write `.last-build-status.json`.  
8. Release lock.  

Match open-gsd pattern: `file.tmp-${pid}-${counter}` then `renameSync` with retry; clean tmp on failure. [CITED] gsd-core `runtime-hooks-surface.cts` / `installer-migrations.cts`

### Optional MCP server

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | `^1.30.0` | MCP stdio server | **v1 line** still current on npm (1.30.0, 2026-07-27). OpenGSD ships `@opengsd/mcp-server` on `^1.27.1` — stay on v1 for ecosystem parity and stable stdio tool API. [VERIFIED] |
| `zod` | (peer) | Tool `inputSchema` | Required peer of the SDK (`zod: ^3.25 \|\| ^4.0`). Prefer Zod 4 to match gsd-pi. [VERIFIED] |

**Do not adopt MCP SDK v2 (`@modelcontextprotocol/server` / `@modelcontextprotocol/client` 2.0.0) for 0.1.0.** v2 is the new split package line (2026-07-28 spec); open-gsd production packages still use v1. Revisit MCP after 0.1 GA if clients demand v2. [VERIFIED][CITED] MCP typescript-sdk README

**Dependency style:** list `@modelcontextprotocol/sdk` + `zod` as normal dependencies (not optionalDependencies). The MCP binary is a product surface; dynamic-optional install complexity is not worth the install-size win for a local toolkit. Gate **behavior** (build/review-write off by default), not install. [CITED] K14

### Testing & quality

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:test` | built-in | Test runner | **OpenGSD standard:** gsd-core and gsd-pi run `node --test` / `require('node:test')`. Zero config, Node 22–native, works with CJS emit. [VERIFIED] |
| `node:assert/strict` | built-in | Assertions | Matches ecosystem; no chai/jest expect needed. [VERIFIED] |
| `c8` | `^12.0.0` | Coverage | Used by gsd-core (`c8` ^11) and gsd-pi; pure V8 coverage over `node --test`. [VERIFIED] |
| `tsx` | `^4.23.5` | Dev: run TS tests | Optional: `node --import tsx --test tests/**/*.test.ts` during development. Alternative: compile tests then `node --test` (gsd-core style). [VERIFIED] |
| `fast-check` | `^4.8.0` | Property tests (optional) | Already in gsd-core; useful for slug/id stability and budget ordering later — not required day one. [VERIFIED] |

**Do not use Vitest as the primary runner.** Vitest 4.x is fine software and appears only in a niche gsd-pi script; the org’s default is `node:test` + c8. Avoid two runners in a greenfield package. [VERIFIED]

Suggested scripts:

```json
{
  "build": "tsc -p tsconfig.build.json",
  "test": "npm run build && node --test dist-test/**/*.test.js",
  "test:coverage": "c8 --check-coverage --lines 80 node --test dist-test/**/*.test.js"
}
```

(Or `tsx` path if you prefer no separate test emit — still `node:test` under the hood.)

### Supporting / deferred

| Library | Version | When to use |
|---------|---------|-------------|
| `tsup` | `^8.5.1` | Only if dual CJS+ESM publish becomes a hard requirement |
| Neo4j driver / Cypher export | — | Post-0.1 optional **export** only; never required runtime |
| Embedding / vector DB clients | — | Explicit non-goal for v1 offline path |
| HTTP LLM client | undici built-in or thin fetch wrapper | Only when `llm.mode = http`; default is `none` |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Module format | CJS + types via `tsc` | ESM-only first | Design defaults CJS for broad tooling; open Q1. [CITED] |
| Bundler | none (`tsc`) | tsup / esbuild | Extra moving parts; library consumers prefer readable `dist/` and simple source maps. |
| Store schema | Ajv + JSON Schema files | Zod-only | Schemas are on-disk JSON Schema; prompt results validated the same way. Zod forks the contract. |
| CLI parser | commander 14 | yargs / cac / hand-rolled | commander is the ecosystem default; 14 fits engines. |
| Graph core | pure TS adjacency | graphology / ngraph | Extra model + weight; no label-propagation fit; pure TS meets budgets. |
| MCP SDK | `@modelcontextprotocol/sdk` 1.x | `@modelcontextprotocol/server` 2.x | v2 too new vs open-gsd v1 usage; stabilize product first. |
| Tests | `node:test` + c8 | vitest / jest | Org standard is node:test; avoid dual frameworks. |
| Atomic write | in-house dual-write | `write-file-atomic` | Multi-file order + engines mismatch. |
| Lock | in-house `.build.lock` | `proper-lockfile` | Stale semantics differ; unmaintained relative to Node 22. |
| Graph DB | file store `.gsd-graph/` | Neo4j / Neptune / Memgraph | Ops burden; conflicts with offline-first v1 non-goals. |
| Python bridge | none | graphify / graphifyy runtime | Product is TypeScript; Python as runtime dep breaks offline Node install and publisher isolation. |

## What NOT to use (hard bans for v0.1)

1. **Python graphify / graphifyy (or any Python graph pipeline) as a runtime dependency** — extract/normalize must be pure Node. [CITED] non-goals / PROJECT constraints  
2. **Required Neo4j, managed graph cloud, or embedding SaaS** — file-first `graph.v1.json` is the product. Optional export only later. [CITED]  
3. **Heavy graph DBs** (ArangoDB, Amazon Neptune, TigerGraph, JanusGraph) as default store.  
4. **Runtime dependency on `gsd-core`, GSD workflows, or `.planning/`** — OpenGSD is publisher namespace only. [CITED] K18  
5. **`graphology` / `ngraph` as required deps in 0.1.0** — implement query/path/budget in-house.  
6. **Vitest/Jest as the default test runner** — use `node:test` to match open-gsd.  
7. **Zod as the sole authority for `graph.v1.json`** — keep JSON Schema + Ajv as SoT for on-disk files.  
8. **`write-file-atomic@8` / `proper-lockfile`** — wrong abstraction for dual-write + design lock semantics.

## Installation

```bash
# Runtime (product)
npm install commander@^14.0.3 picocolors@^1.1.1 \
  ajv@^8.20.0 ajv-formats@^3.0.1 \
  fast-json-stable-stringify@^2.1.0 \
  @modelcontextprotocol/sdk@^1.30.0 zod@^4.0.0

# Dev
npm install -D typescript@^6.0.3 @types/node@^22.19.0 \
  tsx@^4.23.5 c8@^12.0.0

# Optional later (not v0.1)
# npm install -D tsup@^8.5.1
# npm install graphology  # only if an optional viz/export adapter appears
```

**Engines (package.json):**

```json
{
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  }
}
```

**Minimal package.json surface (illustrative):**

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
  "bin": {
    "gsd-graph": "./bin/gsd-graph.js",
    "gsd-graph-mcp": "./bin/gsd-graph-mcp.js"
  },
  "files": ["dist", "bin", "schemas", "ontology-packs", "prompts", "LICENSE", "README.md"],
  "engines": { "node": ">=22.0.0", "npm": ">=10.0.0" }
}
```

## Opinionated defaults (one-liners)

| Decision | Choice | Because |
|----------|--------|---------|
| Build | `tsc` → CJS + d.ts | Matches design + gsd-core; dual ESM later if free |
| Validate store | Ajv on JSON Schema files | On-disk schemas are the contract |
| Query engine | Pure-TS adjacency + BFS/path | Provenance-native; no graphology tax |
| Communities (0.2) | Pure-TS label propagation | Design-specified; no Louvain package needed |
| MCP | SDK 1.x + zod, same package | Ecosystem parity; behavioral gates not install gates |
| Tests | `node:test` + c8 | OpenGSD house style |
| Publish I/O | Custom dual-write + `.build.lock` | Protocol is the product invariant |
| CLI | commander 14 | Engines-safe under Node ≥22.0.0 |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Node/TS/engines | HIGH | npm + local open-gsd package.json verified |
| Packaging CJS-first | HIGH | Design open Q1 + gsd-core tsc pattern |
| Ajv vs Zod | HIGH | Design schemas are JSON Schema; MCP needs zod separately |
| Pure-TS graph vs graphology | HIGH | Versions/sizes verified; label-prop gap confirmed |
| MCP 1.x vs 2.x | HIGH | npm + SDK README + open-gsd deps |
| node:test vs vitest | HIGH | gsd-core/gsd-pi scripts verified |
| Atomic write / lock in-house | HIGH | Design protocol + gsd-core precedent; dep engines checked |
| Built-in `fs.glob` adequacy | MEDIUM | Available on Node 22; may need minimatch later for ignore parity |

## Sources

- npm registry versions (2026-08-02): `typescript@7.0.2` / `6.0.3`, `ajv@8.20.0`, `ajv-formats@3.0.1`, `zod@4.4.3`, `graphology@0.26.0`, `graphology-shortest-path@2.1.0`, `graphology-communities-louvain@2.0.2`, `ngraph.graph@20.1.2`, `ngraph.path@1.6.1`, `@modelcontextprotocol/sdk@1.30.0`, `@modelcontextprotocol/server@2.0.0`, `vitest@4.1.10`, `commander@15.0.0` / `14.0.3`, `write-file-atomic@8.0.0`, `proper-lockfile@4.1.2`, `c8@12.0.0`, `tsx@4.23.5`, `tsup@8.5.1`, `picocolors@1.1.1`, `fast-json-stable-stringify@2.1.0` — [VERIFIED] via `npm view`
- Local open-gsd packages: `/Users/jeremy/github/open-gsd/gsd-core/package.json` (node:test, c8, typescript ^6.0.3, engines ≥22); `/Users/jeremy/github/open-gsd/gsd-pi/package.json` (node:test primary, MCP sdk ^1.27.1, zod ^4) — [VERIFIED]
- gsd-core atomic write / lock patterns: `src/runtime-hooks-surface.cts`, `src/installer-migrations.cts`, `src/planning-workspace.cts` — [CITED]
- Product design: `docs/DESIGN.md` (pipeline, dual-write, MCP K14, pure-TS communities, CJS-first open Q) — [CITED]
- Graphology standard library: https://graphology.github.io/standard-library/ (Louvain present; no label-propagation package) — [VERIFIED]
- MCP TypeScript SDK README (v1 vs v2 split packages): https://github.com/modelcontextprotocol/typescript-sdk — [VERIFIED]
- Node.js `fs` / test runner: Node ≥22 built-ins (`node:test`, `fs.glob`) — [VERIFIED] local Node v25.6.1 runtime + docs
- `@opengsd/mcp-server` npm: depends on `@modelcontextprotocol/sdk` ^1.27.1, zod ^4, engines ≥22 — [VERIFIED]

---
*Research artifact for roadmap only. Do not treat version pins as a lockfile — re-verify at implementation time.*
