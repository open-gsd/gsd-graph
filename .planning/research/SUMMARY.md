# Project Research Summary

**Project:** gsd-graph (`@opengsd/gsd-graph`)
**Domain:** Local-first Graph Engineering / GraphRAG-lite toolkit (library + CLI + optional MCP)
**Researched:** 2026-08-02
**Confidence:** HIGH

## Executive Summary

**gsd-graph** is a standalone Graph Engineering toolkit—not a gsd-core subsystem and not a full Microsoft GraphRAG clone. Experts build this class of product as a six-stage pipeline (**extract → normalize → store → query → ground → maintain**) with a durable graph SoT, closed-world ontology, multiset provenance, and grounded answers bound to triple citations. Industry GraphRAG adds LLM extraction, communities, and embeddings as the spine; this product deliberately ships **GraphRAG-lite**: file-first `graph.v1.json` under `.gsd-graph/`, deterministic Markdown/JSONL extract by default, structured Query IR, and pack-as-composition of public query ops. OpenGSD is publisher namespace only (K18).

**Recommended approach:** Node ≥22 + TypeScript CJS+types via `tsc`; Ajv over checked-in JSON Schema for store truth; pure-TS adjacency for query/path/budget; in-house dual-write + `.build.lock`; commander CLI with JSON stdout; optional MCP SDK 1.x after the critical path. Critical path to **0.1.0** is: bootstrap → ontology + IO → extract → normalize → store → query + maintain → CLI → pack/answer → goldens G0–G4. Defer communities (label propagation) to **v0.2**. Treat LLM prompt/http and MCP as optional for the 0.1 tag—do not block GA on them.

**Key risks and mitigations:** (1) zero-shot ontology drift → strict packs + review queue, never silent lock expand; (2) entity false-merge → exact same-type alias only; (3) broken incremental maintain → multiset provenance + M1–M5 gates; (4) torn dual-write / projection-as-truth → v1-first rename, query only reads v1; (5) “grounded” LLM hallucination → deterministic answer default, citations ⊆ pack, abstain on empty; (6) offline multi-hop honesty on free prose → G0/G1 fixtures require structured links/JSONL; (7) path escape/secrets → realpath confinement + redaction; (8) naming confusion → no gsd-core runtime dep, README as Graph Engineering toolkit.

## Key Findings

### Recommended Stack

Ship a single npm package with a thin dependency surface aligned to open-gsd house style. Prefer built-ins and in-house protocol code over graph DB / graphology runtimes for v0.1 budgets (≤100k nodes / ≤250k triples).

**Core technologies:**
- **Node.js ≥22 + TypeScript ^6.0.3 (`tsc` → CJS + `.d.ts`)** — runtime/language lock with gsd-core/gsd-pi; dual ESM only if free later
- **Ajv ^8 + ajv-formats + JSON Schema files** — on-disk `graph.v1` / ontology / provenance / review-queue are the contract; fail-closed validation
- **Pure-TS adjacency + BFS/path/budget** — provenance-native; no graphology/ngraph tax; communities pure-TS label prop in 0.2
- **commander 14 + picocolors** — CLI parse; human color on stderr only; JSON stdout (K22)
- **In-house `io/atomic-publish` + `io/lock`** — ordered multi-file dual-write and product-specific `.build.lock` (not write-file-atomic / proper-lockfile)
- **`node:test` + c8 (+ optional tsx, fast-check later)** — org standard; avoid Vitest as primary
- **Optional: `@modelcontextprotocol/sdk` ^1.30 + zod 4** — MCP stdio; do not adopt SDK v2 for 0.1

**Hard bans (v0.1):** Python graphify runtime, required Neo4j/embeddings SaaS, gsd-core runtime, Zod as sole SoT for `graph.v1`, graphology as required dep.

Details: [STACK.md](./STACK.md)

### Expected Features

Table stakes map to a complete local build→query→ground loop. Differentiators are offline multi-hop honesty, ontology packs, review gates, multiset provenance, and pack = public query composition.

**Must have (table stakes / v0.1 core):**
- Init + `.gsd-graph/` file store + dual-write + lock
- Ontology packs (general) + closed allowlist + review policy
- Deterministic MD/text + JSON/JSONL extract
- Normalize, exact merge, multiset provenance, review accept/reject
- Query IR: term/neighborhood/path/filter + budgets
- Incremental maintain (fingerprints, M1–M5), snapshot/diff/repair, status
- CLI machine contract (JSON stdout; exit 0/1/2/3) + library parity
- packSubgraph + deterministic answer with citations
- Goldens G0–G4 as release gate

**Should have (competitive / optional for tag):**
- Minimal GRAPH_REPORT
- Example research/engineering packs
- LLM `prompt`/`http` providers (opt-in, fail-closed)
- Thin MCP read path (build/review-write off)

**Defer (v0.2+):**
- Communities + theme reports (PR-16 → **0.2.0**)
- NL→QueryIR, Cypher/Neo4j export, embeddings/fuzzy link, pack `extends`, hosted service

Details: [FEATURES.md](./FEATURES.md)

### Architecture Approach

**Library-first pipeline** with CLI and MCP as adapters over one public façade. Write path: sources → extract → normalize → [review] → store.publish. Read path: load `graph.v1.json` → query → pack → answer. Query IR is pure; pack composes only public query ops (K21); answer may render/filter pack content but never expands the graph. Review queue is control-plane between free-form extract and durable mutation. Single-process CLI/lib default—no required daemon.

**Major components:**
1. **sources/** — corpus discovery, MD/JSONL parse, fingerprints
2. **pipeline/** — extract, normalize, store, query, pack, answer, maintain (+ communities v0.2)
3. **ontology/** — pack load, lock freeze, migrate
4. **io/** — realpath confinement, lock, atomic dual-write, safe JSON
5. **llm/** — provider modes `none` | `prompt` | `http`
6. **cli / mcp** — surfaces only; never reimplement pipeline internals

Details: [ARCHITECTURE.md](./ARCHITECTURE.md)

### Critical Pitfalls

1. **Zero-shot ontology without review** — closed pack allowlist; `unknown_*_policy: review`; extend only via `review accept --extend-ontology`
2. **Identity false-merge** — auto-merge exact same-type id/alias only; `same_as` advisory until review
3. **Scalar provenance / bad incremental invalidation** — multiset provenance + best_tier; M1–M5 mandatory
4. **Dual-write races / projection as truth** — lock; rename v1 first; native query never reads `graph.json`
5. **Hallucinated “grounded” answers** — deterministic default; citations ⊆ pack; abstain when empty
6. **Offline multi-hop on free prose** — G0 abstain / G1 structured corpora only for offline claims
7. **Path traversal / secret leakage** — realpath + prefix; redaction; MCP writes off by default
8. **Naming = gsd-core product** — K18 docs/deps discipline on every public surface

Details: [PITFALLS.md](./PITFALLS.md)

## Implications for Roadmap

Group design **PR-01..PR-17** into **7 phases** at standard granularity. Critical path is Phases 1–5; Phase 6 is optional for 0.1 tag; Phase 7 is explicit **0.2.0**.

### Phase 1: Foundation & identity
**Rationale:** Nothing else is safe or installable without package bootstrap, schema/ontology contract, and crash-safe IO.
**PR mapping:** PR-01 ∥ then PR-02 ∥ PR-03
**Delivers:** Installable `@opengsd/gsd-graph` skeleton; JSON Schemas; general ontology pack loader + policy matrix; realpath confinement; `.build.lock`; dual-write publish primitives; CI/build/copyright
**Addresses:** Init foundation, ontology packs (load path), build lock / crash-safe publish
**Avoids:** Pitfalls 4, 7, 8 (races, traversal, naming/category)
**Exit:** Pack validates; dual-write + lock tests green; no gsd-core dep

### Phase 2: Build pipeline (extract → normalize → store)
**Rationale:** Store is the durable write/read boundary; query without a real graph is theater.
**PR mapping:** PR-04 → PR-05; PR-04 → PR-06 → PR-07a
**Delivers:** Deterministic MD/text + JSONL extract; fingerprints; normalize + exact merge + multiset provenance; review queue; `graph.v1` publish; status / last-build-status; size caps
**Addresses:** Corpus build, extractors, canonical triple store, review gates, status
**Avoids:** Pitfalls 1, 2, 6, 12 (ontology drift, false merge, free-prose honesty, review thrash)
**Exit:** End-to-end build from MD+JSONL; review queue live; `status` green offline

### Phase 3: Query, lifecycle & report
**Rationale:** Multi-hop value and edit-loop integrity sit on published v1; parallelizable after store.
**PR mapping:** After PR-07a: PR-07b ∥ PR-08 ∥ PR-09 ∥ PR-13
**Delivers:** Snapshots, repair, diff; Query IR (seed-expand, path, neighborhood, filter, budget); incremental maintain M1–M5; minimal GRAPH_REPORT
**Addresses:** Query ops, maintenance, snapshot/diff/repair, report
**Avoids:** Pitfalls 3, 10, 11 (invalidation, budget hiding paths, projection/community as SoT)
**Exit:** Path/filter/budget tests; M1–M5; repair regenerates projection from v1 only

### Phase 4: CLI surface
**Rationale:** Agents need a machine contract over library ops before pack goldens shell the binary.
**PR mapping:** PR-10 (deps: PR-08 + PR-09 + PR-07b)
**Delivers:** `gsd-graph` CLI: init, build, query, path, status, diff, snapshot, review, repair, ontology; K22 JSON stdout / exit codes; gitignore on init (K26)
**Addresses:** Machine-readable CLI, library parity via façade, operator UX
**Avoids:** Agent parse breakage; Pitfall 16 (store commit leakage)
**Exit:** init → build → query → path happy path as JSON

### Phase 5: Ground & prove (0.1.0)
**Rationale:** Product thesis is relationship answers with citations; goldens are the honesty bar.
**PR mapping:** PR-11 → PR-17 (needs PR-06, PR-09, PR-10, PR-11, PR-13)
**Delivers:** `packSubgraph` + deterministic `answer` + CLI pack/answer; G0–G4 offline goldens; version **0.1.0**
**Addresses:** Pack retrieve, cited answers, release gate
**Avoids:** Pitfalls 5, 6 (fake grounding; offline multi-hop lies)
**Exit:** G0–G4 green offline without API keys; pack citations; tag 0.1.0

### Phase 6: Optional agents (non-blocking for 0.1)
**Rationale:** LLM assist and MCP improve agent hosts but must not delay offline GA.
**PR mapping:** PR-12 (LLM), PR-14 (MCP), PR-15 (example packs)—slice as capacity allows
**Delivers:** prompt/http providers with fail-closed schema; optional MCP read tools; research/engineering packs + docs
**Addresses:** Optional LLM stages, optional MCP, example ontologies
**Avoids:** Pitfalls 1, 5, 9, 13 (schema invent, hallucination, injection, MCP over-privilege)
**Exit:** Behavioral gates documented; no ambient LLM; MCP writes default-off
**Recommendation:** Prefer thin MCP / prompt apply in early 0.1.x or early 0.2 stabilize rather than blocking Phase 5

### Phase 7: Global themes (0.2.0)
**Rationale:** Communities are GraphRAG global-search value, not required for multi-hop path goldens.
**PR mapping:** PR-16 (+ richer report / MCP polish)
**Delivers:** Pure-TS label propagation communities + community reports → **0.2.0**
**Addresses:** Global “what are the themes?” differentiator deferred from v0.1
**Avoids:** Pitfall 11 (reports as SoT); do not gate 0.1 on Leiden/LLM report quality
**Exit:** Community artifacts under store; non-SoT reports; opt-in LLM prose

### Phase Ordering Rationale

- **Dependencies match DESIGN PR graph:** bootstrap → ontology ∥ IO → extract → normalize → store → (query ∥ maintain ∥ snapshot) → CLI → pack/answer → goldens.
- **Architecture write/read split:** durable store before pure query; pack only after Query IR exists (K21).
- **Pitfall order:** security + dual-write + normalize gates before LLM/MCP “demo pressure.”
- **Honesty before breadth:** G0–G4 offline multi-hop before communities and free-prose LLM quality chase.
- **Surfaces last on critical path:** library/pipeline first; CLI then optional MCP adapters.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase`):
- **Phase 3 (Maintain M1–M5):** edge cases for multiset invalidation and incremental ≠ full divergence—spec is locked but implementation is subtle
- **Phase 5 (Pack seeding + budgets):** seed ranking / budget drop order under adversarial fixtures; G1/G3 assertions
- **Phase 6 (LLM prompt apply + MCP trust):** prompt injection containment, Windows symlink/path policy, MCP host integration quirks
- **Phase 7 (Communities):** label-propagation params and report schema vs sample corpora (post-0.1)

Phases with standard / well-documented patterns (skip deep research-phase):
- **Phase 1:** package bootstrap, Ajv, commander, tsc CJS, open-gsd atomic write precedent
- **Phase 2 extract MD/JSONL:** deterministic parsers; design fixtures specified
- **Phase 4 CLI:** K22 contract and commander patterns are clear

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm versions + open-gsd package.json patterns verified 2026-08-02 |
| Features | HIGH | DESIGN K1–K26 + PR-01..17 + GraphRAG baseline comparison |
| Architecture | HIGH | Normative DESIGN boundaries; GraphRAG/MCP official docs |
| Pitfalls | MEDIUM–HIGH | Product mitigations locked; ecosystem papers cited; no production post-mortems (greenfield) |

**Overall confidence:** HIGH

### Gaps to Address

- **Read-during-build consistency** — document best-effort vs fail `build_locked` for readers; phase 1–2 IO tests
- **Cross-platform lock/steal + rename** — verify on CI matrix (macOS/Linux/Windows) during Phase 1/2
- **Built-in `fs.glob` vs ignore parity** — may need minimatch later (STACK MEDIUM)
- **Review UX multi-user** — lockfile + `--extend-ontology` workflow docs during Phase 2/4
- **Secret redaction residual risk** — best-effort regex only; document, do not overclaim
- **NL→QueryIR / Cypher export / fuzzy entity link** — explicitly post-0.1 research, not silent scope
- **Whether prompt-mode alone satisfies agent hosts without HTTP in 0.1** — experiment in Phase 6 / PR-12

## Sources

### Primary (HIGH confidence)
- [`docs/DESIGN.md`](../../docs/DESIGN.md) — pipeline, dual-write, Query IR, pack K21, review queue, MCP, PR-01..PR-17, K1–K26
- [`.planning/PROJECT.md`](../PROJECT.md) — standalone scope, active requirements, out of scope
- [STACK.md](./STACK.md) / [FEATURES.md](./FEATURES.md) / [ARCHITECTURE.md](./ARCHITECTURE.md) / [PITFALLS.md](./PITFALLS.md) — parallel research artifacts 2026-08-02
- Microsoft GraphRAG indexing + query docs — industry pipeline baseline
- MCP architecture docs — stdio host/client/server model
- Local open-gsd packages (gsd-core, gsd-pi) — engines, node:test, MCP sdk 1.x, atomic write patterns

### Secondary (MEDIUM confidence)
- Meyer et al. arXiv:2307.06917 — LLM ontology invention failure modes
- Edge et al. GraphRAG arXiv:2404.16130 — LLM extract + exact entity match notes
- GraphRAG RAI transparency — injection/hallucination evaluation concerns
- OWASP path traversal — corpus confinement threat model
- npm scopes docs — publisher namespace ≠ product taxonomy

### Tertiary (LOW confidence)
- Streaming/partial load beyond 100k nodes — out of v1; not surveyed
- Claim-level NLI faithfulness harness — optional post-GA eval, not designed

---
*Research completed: 2026-08-02*
*Ready for roadmap: yes*
