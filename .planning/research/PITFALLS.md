# Domain Pitfalls

// gsd-graph — Domain pitfalls research for Graph Engineering systems

**Domain:** Graph Engineering / GraphRAG-style knowledge graphs (local-first file store)
**Project:** `@opengsd/gsd-graph`
**Researched:** 2026-08-02
**Overall confidence:** MEDIUM–HIGH (product mitigations locked in design [VERIFIED]; ecosystem failure modes cross-checked against papers/docs [CITED])

**Claim tags:**
- **[VERIFIED]** — Confirmed against `docs/DESIGN.md` (product authority) and/or multiple independent sources
- **[CITED]** — Supported by a named external source with URL
- **[ASSUMED]** — Reasonable engineering inference; not directly measured in this repo (greenfield)

---

## Critical Pitfalls

Mistakes that cause rewrites, silent corruption, security incidents, or false product claims.

### Pitfall 1: Zero-shot ontology / LLM extraction without review gates

**What goes wrong:** The system invents predicates and types on every build, schema drifts across runs, and “the graph” becomes an unreproducible LLM dump rather than a queryable ontology. [CITED]

**Why it happens:** LLMs are strong at *suggesting* structure but unreliable at *locking* it. Meyer et al. show ChatGPT invents non-existent `schema.org` properties, varies KG modelling run-to-run, and emits SPARQL that is syntactically valid yet fails at execution (e.g. Mondial: 0/5 producing correct results). [CITED] Microsoft GraphRAG’s own docs recommend domain prompt tuning; the RAI FAQ states human analysis is required to verify answers and that effective indexing depends on domain-specific concepts. [CITED]

**Consequences:**
- Non-deterministic rebuilds → citations and review items thrash
- Open-world predicate explosion → multi-hop paths become noise
- Users trust invented relations as facts

**Prevention (product locks):**
- Closed allowlist **within** the loaded ontology pack; default `strict` + `unknown_*_policy: review` — **never silently expand `ontology.lock.json`** [VERIFIED] (K5, K9)
- LLM extract is opt-in (`llm.mode`, `--llm`); fail-closed JSON Schema validation; default confidence `INFERRED` unless quote span verified [VERIFIED]
- Ontology extension only via explicit `review accept … --extend-ontology` [VERIFIED]
- Replace-only packs in v0.1 (no ambient `extends` merge) [VERIFIED] (K19)

**Detection:** Growing `review-queue.json` of `predicate_unknown` / `type_unknown`; lockfile hash changes without user action; triple counts spike without corpus growth.

**Prevent in phase:** **Ontology + Normalize** (PR-02, PR-06); harden again in **LLM providers** (PR-12).

---

### Pitfall 2: Identity / dedup corruption (false merges & phantom splits)

**What goes wrong:** Aggressive fuzzy merge collapses distinct entities (silent corruption of every path through them), or weak identity never merges aliases and the graph fragments into duplicates. [CITED]

**Why it happens:** Entity resolution is a classic hard problem (duplicate record detection literature). [CITED] GraphRAG’s paper analysis uses exact string matching for entity matching and notes softer approaches need careful handling; duplicates are “tolerated” partly because community clustering later absorbs them—acceptable for summarization, **catastrophic** for citable triple identity. [CITED]

**Consequences:**
- False merge: wrong multi-hop answers that look confident
- Over-split: path queries fail; pack seeds miss the real node
- Unstable node ids → citation rot across rebuilds

**Prevention (product locks):**
- Canonical id `type:slug` with NFKC + collision suffixes [VERIFIED] (K20)
- **Auto-merge only** exact same-type id/alias match; **no** fuzzy/Levenshtein auto-merge [VERIFIED] (K23)
- Cross-type never auto-merges (`person:ada` ≠ `concept:ada`) [VERIFIED]
- `same_as` is **advisory** until `entity_merge` review accept rewrites ids [VERIFIED]
- Triple id = hash(s,p,o) so rebuilds stay citable when identity is stable [VERIFIED]

**Detection:** Sudden drop in node count after normalize; review queue flooded with `entity_merge`; golden path fixtures break after unrelated corpus add.

**Prevent in phase:** **Normalize + review queue** (PR-06). Do not “improve recall” with fuzzy merge in v0.1.

---

### Pitfall 3: Incremental invalidation bugs (provenance treated as scalar)

**What goes wrong:** Editing one source deletes triples still supported by other files, or leaves stale EXTRACTED claims after the only supporting source is gone. Confidence tiers lie. [VERIFIED]

**Why it happens:** Incremental KG maintenance is easy to under-specify. Common wrong models:
1. One provenance string per triple → any source change drops the triple
2. Append-only provenance → never remove stale support
3. Confidence stored as a static field instead of **best of multiset entries**

**Consequences:** Graph lies about “what the corpus still says”; incremental builds diverge from `--full`; goldens G4 / M1–M5 fail in production form.

**Prevention (product locks):**
- Multiset provenance entries; triple `confidence` = `best_tier(entries)` [VERIFIED] (K6)
- On source change: remove entries for that path; drop triple only if multiset empty; else re-derive tier [VERIFIED]
- Required unit matrix M1–M5 (mixed tiers, multi-source, single-source drop) [VERIFIED]
- Full rebuild authoritative after ontology/extractor changes [VERIFIED]

**Detection:** `diff` shows mass triple removal after one-file edit; confidence stays EXTRACTED after only EXTRACTED source deleted; incremental ≠ full on same corpus.

**Prevent in phase:** **Maintain / fingerprints** (PR-09) with M1–M5 tests as release gates; store publish (PR-07a) must not short-circuit provenance.

---

### Pitfall 4: Dual-write / lock races (torn store, projection as truth)

**What goes wrong:** Crash mid-publish leaves half-written JSON; two writers interleave; readers load disposable `graph.json` and disagree with `graph.v1.json`. [VERIFIED]

**Why it happens:** Multi-file stores are not ACID. POSIX `rename` is atomic for a single path on the same filesystem, but **two** renames (v1 + projection + sidecars) are not one transaction. Skipping fsync can lose durability on power loss. [ASSUMED for general FS semantics; [VERIFIED] protocol in design]

**Consequences:** Intermittent `schema_invalid`; agents see different graphs across CLI vs MCP; “repair” becomes folklore.

**Prevention (product locks):**
- Shared `.build.lock` (fail-fast / optional wait; stale steal rules) [VERIFIED] (K11)
- Dual-write protocol: temp → fsync → rename **v1 first**, then projection, then sidecars [VERIFIED] (K17)
- **`graph.v1.json` is sole SoT**; native query paths **never** read projection [VERIFIED]
- Crash after v1, before projection: lag is OK; `repair` regenerates projection [VERIFIED]
- Hard size caps; write `.last-build-status.json` with reason codes [VERIFIED]

**Detection:** `projection_stale: true`; lock contention exit code 3; corrupt partial `.tmp` files left behind; flaky CI without lock tests.

**Prevent in phase:** **IO / atomic publish** (PR-03) + **store publish** (PR-07a); suite `publish-lock.test`.

---

### Pitfall 5: “Grounded” answers that still hallucinate

**What goes wrong:** The system retrieves a subgraph (or worse, text chunks) then lets an LLM narrate freely. Citations are decorative or missing; users believe relationship answers that are not in the graph. [CITED]

**Why it happens:** RAG faithfulness is a known failure mode (RAGAS “faithfulness”; GraphRAG RAI tracks claim coverage and adversarial hallucination). [CITED] Providing context does **not** force models to stick to it. Graph systems that only “show sources” without binding answer claims to triple ids reintroduce classic RAG lies with fancier retrieval.

**Consequences:** Product differentiator collapses to keyword dump + fluent prose; offline GA becomes marketing fiction.

**Prevention (product locks):**
- Default answer mode is **deterministic render** of pack (seeds, `s —p→ o`, paths, citations) [VERIFIED] (K8)
- `packSubgraph` is composition of public query ops; empty triples → **abstain** [VERIFIED] (K21)
- LLM answer path: fail-closed; `cited_triple_ids ⊆ pack.triple ids` [VERIFIED]
- Never execute model output; schema-validate prompt results [VERIFIED]

**Detection:** Answers with prose but empty `citations[]`; cited ids not in pack; G1 passes neighborhood dump without required multi-hop predicate.

**Prevent in phase:** **Pack + answer** (PR-11); LLM apply path (PR-12); goldens G1/G3 (PR-17).

---

### Pitfall 6: Offline multi-hop claims on free prose (honesty failure)

**What goes wrong:** Marketing or tests claim “offline multi-hop why answers” while deterministic extract only produces weak `mentions` from paragraphs—paths are fabricated or LLM-dependent. [VERIFIED]

**Why it happens:** GraphRAG-class multi-hop quality on free text is powered by **LLM extraction** of entities/relations (and often community summaries). [CITED] Deterministic Markdown extractors do not invent typed `causes` / `depends_on` chains from unstructured prose.

**Consequences:** Failed offline demos; trust erosion; goldens that only pass with API keys.

**Prevention (product locks):**
- **K24 / G0–G1 honesty bar:** multi-hop offline goldens require wiki-links, edge grammar lines, definition lists, and/or JSONL structured edges [VERIFIED]
- Free-prose corpus: weak `mentions` at `INFERRED`; pack for “why X” **abstains** or has no typed multi-hop path [VERIFIED]
- Free-prose multi-hop quality is `--llm` / post-0.1, not GA claim [VERIFIED]

**Detection:** G0 green while G1 only green with `--llm`; README claims offline multi-hop on “any notes folder.”

**Prevent in phase:** **Extract + fixtures** (PR-04, PR-05) and **release goldens** (PR-17). Docs wording in PR-01/PR-15.

---

### Pitfall 7: Path traversal / secret leakage on corpus ingest

**What goes wrong:** `--corpus`, `--dir`, ontology path, snapshot name, or symlink in the tree escapes the intended root and reads `/etc/passwd`, SSH keys, `.env`, or sibling private repos. Secrets become node labels and get packed into answers/MCP responses. [CITED]

**Why it happens:** Path traversal (`../`, encodings, symlink following) is OWASP-class directory traversal. [CITED] Local CLI tools often skip confinement because “it’s the user’s machine”—until an agent passes untrusted paths or a malicious doc tree is cloned.

**Consequences:** High-severity local data exfiltration via graph/MCP; secrets committed in store snapshots; compliance failure.

**Prevention (product locks):**
- `realpath` + prefix check on corpus roots, store dir, ontology, prompt bundles, snapshot names; reject `..` and symlink escape → `PATH_ESCAPE` [VERIFIED]
- Never walk whole FS without explicit roots [VERIFIED]
- Soft cap 8 MiB/file; hard caps nodes/triples [VERIFIED]
- Best-effort secret redaction patterns (`sk-…`, `AKIA…`, private key blocks) → `[REDACTED]` in labels/descriptions [VERIFIED]
- MCP build/review-write **off** by default [VERIFIED] (K14)
- No network unless user enables `llm.http` [VERIFIED]

**Detection:** Integration tests with symlink escape and `../` corpus paths; fixtures containing fake secrets that must not appear in graph JSON.

**Prevent in phase:** **IO paths** (PR-03) + **extract** (PR-04); security tests before MCP (PR-14).

---

### Pitfall 8: Package naming confusion (publisher org ≠ product runtime)

**What goes wrong:** Users (and future PRs) treat `@opengsd/gsd-graph` as a gsd-core capability/plugin, pull in `.planning/` assumptions, or depend on gsd-core at runtime. Docs and npm description reinforce the wrong product category. [VERIFIED]

**Why it happens:** npm scopes are **publisher namespaces**, not product taxonomies. [CITED] The `gsd-` stem + OpenGSD org strongly imply “GSD subsystem.” Greenfield pivots that keep the name without ruthless messaging create permanent category error.

**Consequences:** Wrong install audience; scope creep PRs; dual product identity; support burden (“where does this plug into GSD phases?”).

**Prevention (product locks):**
- **K18:** OpenGSD is publisher only; **zero** runtime dependency on gsd-core / GSD workflows / `.planning/` [VERIFIED]
- README + npm description lead with **“Graph Engineering toolkit”**; must **not** describe as GSD capability/plugin [VERIFIED]
- PR rule: reject runtime gsd-core deps or `.planning/` assumptions [VERIFIED]
- Store dir `.gsd-graph/` is tool state, not host planning layout [VERIFIED]

**Detection:** `package.json` dependencies include gsd-core; README “install as GSD skill”; issues asking for phase-loop integration as v1.

**Prevent in phase:** **Bootstrap / docs** (PR-01, PR-15); continuous PR policy (all phases).

---

## Moderate Pitfalls

### Pitfall 9: Prompt / corpus injection into LLM stages

**What goes wrong:** Malicious markdown in the corpus instructs the extract/answer model to emit unauthorized triples or exfiltrate context. [CITED]

**Prevention:** LLM opt-in only; schema-validate all results; never execute model output; maintain-stage suggestions only (no silent rewrite). [VERIFIED] GraphRAG RAI documents prompt and data-corpus injection testing as a first-class concern. [CITED]

**Prevent in phase:** PR-12 (LLM), PR-11 (answer apply), PR-14 (MCP trust boundary).

### Pitfall 10: Budget / hop defaults that hide the multi-hop path

**What goes wrong:** Token budget drops EXTRACTED path edges before AMBIGUOUS noise, or hops too small → pack is a star neighborhood, not a chain. Users conclude “graph doesn’t work.”

**Prevention:** Drop order AMBIGUOUS → INFERRED → EXTRACTED; retain seeds; G1 asserts path ≥3 nodes with required predicate; G3 asserts budget order. [VERIFIED]

**Prevent in phase:** PR-08 (query), PR-11 (pack), PR-17 (goldens).

### Pitfall 11: Treating projection or community reports as source of truth

**What goes wrong:** External viewers or future community markdown (v0.2) get written back as graph state.

**Prevention:** v1-only read path; projection disposable; communities post-0.1 and non-gating. [VERIFIED]

**Prevent in phase:** PR-07a, PR-16 (later).

### Pitfall 12: Review-queue identity thrash

**What goes wrong:** Unstable review item ids re-open accepted/rejected conflicts every build.

**Prevention:** Stable `rv_` id from hash(kind + canonical payload); decisions retained. [VERIFIED]

**Prevent in phase:** PR-06.

### Pitfall 13: MCP over-privilege

**What goes wrong:** Agents build/rewrite graphs and accept ontology extensions without human intent.

**Prevention:** MCP read-path default; `allow_build` / `allow_review_write` explicit. [VERIFIED]

**Prevent in phase:** PR-14.

---

## Minor Pitfalls

### Pitfall 14: Gigantic corpora DoS the laptop

**Prevention:** 8 MiB skip + diagnostic; hard fail at 100k nodes / 250k triples; warn at 50 MB v1. [VERIFIED]

**Prevent in phase:** PR-04, PR-07a.

### Pitfall 15: Git commit stamp injection

**Prevention:** Hex-only fence if `stamp_git_commit` enabled. [VERIFIED]

**Prevent in phase:** PR-07a.

### Pitfall 16: Init does not gitignore store → accidental secret/graph commit

**Prevention:** `init` appends store dir to `.gitignore` when present (K26). [VERIFIED]

**Prevent in phase:** PR-10.

### Pitfall 17: NL→query assumed in v0.1

**Prevention:** Documented known gap (K10); structured CLI/MCP args only. [VERIFIED]

**Prevent in phase:** PR-08, PR-10; do not fake NL→IR in PR-12 `query.md`.

---

## Phase-Specific Warnings

Map assumes design PR plan / natural pipeline phases. Use this table when building the roadmap.

| Phase / PR cluster | Topic | Likely pitfall | Mitigation |
|--------------------|-------|----------------|------------|
| PR-01 Bootstrap + docs | Naming / category | Pitfall 8 — GSD product coupling | K18 README/npm wording; no gsd-core dep |
| PR-02 Ontology packs | Schema drift | Pitfall 1 — open ontology | strict review policy; lock freeze tests |
| PR-03 IO paths/lock/publish | Filesystem safety | Pitfalls 4, 7 — races + traversal | realpath prefix; dual-write order; lock tests |
| PR-04/05 Extract | Offline honesty + secrets | Pitfalls 6, 7 — free-prose multi-hop; secret labels | G0/G1 fixtures; redaction; structured JSONL |
| PR-06 Normalize + review | Identity corruption | Pitfalls 2, 12 — false merge; queue thrash | exact-alias only; stable rv_ ids; K23 |
| PR-07a/b Store/snapshot/diff | Torn writes | Pitfall 4 — projection as truth | v1 SoT; repair; last-build-status |
| PR-08 Query | Budget hides paths | Pitfall 10 | G3 order; confidenceMin; path tests |
| PR-09 Maintain | Stale / over-deleted triples | Pitfall 3 — invalidation | M1–M5 mandatory |
| PR-10 CLI | Machine contract footguns | Agent parse breakage | K22 JSON stdout / exit codes |
| PR-11 Pack + answer | Fake grounding | Pitfall 5 — hallucinated prose | deterministic default; citation subset check |
| PR-12 LLM providers | Injection + schema invent | Pitfalls 1, 5, 9 | fail-closed schema; opt-in flags |
| PR-14 MCP | Exfil / write abuse | Pitfalls 7, 13 | read default; allow flags |
| PR-15 Example packs + docs | Naming + overclaim | Pitfalls 6, 8 | offline callout; offline honesty |
| PR-17 Goldens + 0.1.0 | False GA claims | Pitfalls 5, 6 | G0–G4 as release gate |
| PR-16 Communities (v0.2) | Global summary as fact | Pitfall 11 | non-SoT reports; opt-in LLM prose |

---

## Roadmap Implications (for orchestrator)

1. **Security and store durability before LLM features** — PR-03/04/07 before PR-12/14 so traversal and torn writes cannot ship under “AI demo” pressure.
2. **Normalize review gates before celebrating extract volume** — raw triple count is a vanity metric; false merges and open predicates are the real debt.
3. **Maintain matrix is not optional polish** — without M1–M5, incremental mode is a corruption feature.
4. **Goldens encode product honesty** — G0 abstain + G1 structured multi-hop prevent Pitfall 6 from becoming a release lie.
5. **Docs/naming is a phase, not a footnote** — Pitfall 8 is organizational; fix in PR-01 and re-check every public surface.

**Research flags (deeper work later):**
- Fuzzy entity linking (post-0.1 embeddings) — high rewrite risk; keep out of v0.1
- Cross-filesystem rename atomicity / Windows symlink policy — verify on CI matrix
- Secret redaction false negatives (entropy detectors vs regex) — best-effort only; document residual risk
- Faithfulness metrics beyond citation subset (claim-level NLI) — optional eval harness post-GA

---

## Sources

### Project (primary — [VERIFIED] for product decisions)

- [`docs/DESIGN.md`](../../docs/DESIGN.md) — Security table; Risks via Alternatives; Key Decisions **K9, K18, K23, K24** (also K5–K8, K11, K14, K17, K20–K22); dual-write protocol; M1–M5; G0–G4; PR plan
- [`.planning/PROJECT.md`](../PROJECT.md) — standalone scope, offline multi-hop honesty, out-of-scope GSD coupling

### External ([CITED])

- Meyer et al., *LLM-assisted Knowledge Graph Engineering: Experiments with ChatGPT*, arXiv:2307.06917 — ontology invention, non-executable SPARQL, run-to-run modelling variance  
  https://arxiv.org/abs/2307.06917
- Edge et al., *From Local to Global: A GraphRAG Approach…*, arXiv:2404.16130 — LLM entity/relationship extraction; exact string entity matching; baseline RAG multi-hop limits  
  https://arxiv.org/abs/2404.16130 · https://arxiv.org/html/2404.16130
- Microsoft GraphRAG docs + RAI FAQ — prompt tuning necessity; human verification; injection/hallucination evaluation concerns  
  https://microsoft.github.io/graphrag/ · https://github.com/microsoft/graphrag/blob/main/RAI_TRANSPARENCY.md
- Microsoft Research blog on GraphRAG — grounding via entities/relationships vs baseline RAG  
  https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/
- OWASP Path Traversal — `../` and encoding variants  
  https://owasp.org/www-community/attacks/Path_Traversal  
  https://raw.githubusercontent.com/OWASP/www-community/master/pages/attacks/Path_Traversal.md
- npm Docs, *About scopes* — scopes are publisher namespaces  
  https://docs.npmjs.com/about-scopes
- Node.js `fs` documentation — `rename` / `fsync` / `writeFile` primitives used by atomic publish patterns  
  https://nodejs.org/api/fs.html
- Elmagarmid et al. / Barlaug & Gulla (via GraphRAG paper bibliography) — duplicate detection / neural entity matching surveys (entity resolution difficulty) [CITED secondary]
- Es et al., RAGAS (arXiv:2309.15217) — faithfulness as RAG evaluation criterion [CITED for metric name/role; full paper rate-limited during research]

### Confidence notes

| Pitfall cluster | Confidence | Basis |
|-----------------|------------|-------|
| Ontology without review | HIGH product / MEDIUM ecosystem | K9 [VERIFIED] + Meyer + GraphRAG RAI [CITED] |
| Identity / dedup | HIGH product / MEDIUM ecosystem | K23 [VERIFIED] + GraphRAG exact-match note [CITED] |
| Incremental invalidation | HIGH | Design M1–M5/K6 [VERIFIED]; limited external incremental-KG literature in this pass |
| Dual-write races | HIGH product | K11/K17 [VERIFIED]; FS atomicity [ASSUMED general] |
| Grounded hallucination | HIGH product / MEDIUM ecosystem | K8 citation contract [VERIFIED] + RAI/RAGAS [CITED] |
| Offline free-prose multi-hop | HIGH | K24/G0–G1 [VERIFIED] + GraphRAG pipeline dependence on LLM extract [CITED] |
| Path/secrets | HIGH | Design security table [VERIFIED] + OWASP [CITED] |
| Naming confusion | HIGH product | K18 [VERIFIED] + npm scopes [CITED] |

**Gaps:** No live production post-mortems of `@opengsd/gsd-graph` (greenfield). Cross-platform lock/steal behavior and advanced secret scanning remain phase-level research items.

---

*End of pitfalls research.*
