# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-08-05

### Added

- **Agent/user write path** — `gsd-graph assert <s> <p> <o>` and
  `gsd-graph retract <tripleId>` record facts through the normal
  ontology/review/provenance gates into an append-only `episodes.jsonl`;
  full rebuilds replay episodes so asserts survive and retractions hold.
  MCP: `graph_assert` / `graph_retract` behind the new `--allow-assert` gate
- **MCP parity** — default read tools now include `graph_why`,
  `graph_resolve` (term→id with did-you-mean), `graph_diff`, and
  `graph_communities`; `graph_sync` behind the allow-build gate;
  `GRAPH_REPORT.md` + community themes exposed as MCP resources
  (`gsd-graph://report`, `gsd-graph://communities`)
- **Global theme answers** — overview-shaped questions (`what are the main
  areas…`) that pack empty answer from community detection (mode `global`)
  instead of abstaining; `ask --global` forces it
- **Retrieval recall** — stem-aware seed matching (`phases` seeds `phase`),
  and `no_seeds_matched` abstains now return top-5 did-you-mean candidates
- **Relevance-ranked budget trimming** — pack trimming scores seed proximity,
  predicate weight, and provenance count (confidence still dominant);
  citations render trust tags like `[EXTRACTED ×3]`
- **Conflict surfacing + supersession** — `conflict` review kind for
  reciprocal directional edges and supports/contradicts pairs;
  `gsd-graph supersede <winner> <loser>` records decision reversals
  (superseded facts rank a tier lower and are flagged in citations);
  provenance entries stamp `first_seen` / `last_seen`
- **YAML + frontmatter extraction** — flat `.yaml`/`.yml` files and markdown
  frontmatter: `title`/`description` as Document fields, tags→`mentions`
  Topic edges, relational keys (`depends_on`, `blocked_by`, …) as
  ontology-gated edges, other scalars folded into searchable descriptions
- **Extractor registry** — `registerExtractor` makes source formats
  pluggable; discovery defaults derive from the registry
- **Eval harness** — `gsd-graph eval` runs a QA case file
  (`evals/gsd-graph.json`): pass/fail, seed recall, citation validity
- **Centrality analytics** — `gsd-graph top` (PageRank / degree, pure TS);
  `why --k <n>` returns alternative routes; GRAPH_REPORT gains a
  Central-nodes section
- **Watch mode + plain git hook** — `gsd-graph watch` (debounced incremental
  sync via fs.watch) and `gsd-graph hook install-git` (guarded
  `.git/hooks/post-commit` block) bring freshness to non-Claude-Code editors
- **Opt-in embedding sidecar** — `gsd-graph embeddings build|status` +
  `ask --semantic`: OpenAI-compatible embeddings as a fallback seed source
  behind a `SeedScorer` seam; the deterministic path stays the default
- **Ontology composition** — single-level `extends` with collision-error
  semantics, project-local `ontology-packs/<id>/` resolution, and
  `gsd-graph ontology eject` (materialize active pack + accepted lock
  extensions as a committable local pack)
- **Prompt templates wired** — `prompts/<stage>.md` now actually drive LLM
  stages (store-local override wins); template hash recorded as
  `prompt_version` in provenance
- **Library facade** — `GsdGraph.open()` handle (status/query/pack/ask/why/
  communities) over an mtime-keyed graph cache; adjacency maps memoized
- **Store migrations** — forward-only `schema_version` migration registry;
  newer-engine stores fail closed; builds stamp `built_at_commit`

### Changed

- `ask` / `why` / `status` / `query` / `top` render human output on an
  interactive TTY (JSON when piped / `--json` / CI); abstains print
  did-you-mean suggestions; `status` prints prescriptive next steps
- `review summary` (counts by kind + batch-accept hints), `review list
  --kind/--limit`, and a sync wrap-up nudge when the queue passes 25 items
- `export --open` opens the HTML viewer; first-run errors now say
  `no graph found — run gsd-graph enable` (STORE_NOT_FOUND) instead of a
  path-escape/schema error

## [0.3.0] - 2026-08-05

### Added

- **LLM-assisted extraction** (`build --llm` / `sync --llm`) — turns prose into
  INFERRED triple candidates without weakening the honesty contract
  - `--llm` / `--llm prompt` — writes `.prompt-extract.json` (corpus + ontology
    allowlists) for the host agent; merge with `gsd-graph prompt apply extract`
  - `--llm http` — live per-source extraction against an OpenAI- or
    Anthropic-compatible endpoint (config: `config.json` → `llm.http`
    `{ provider, base_url, model, api_key_env }`)
  - All LLM candidates are clamped to `INFERRED` confidence with `llm/*`
    extractor provenance and still flow through the ontology gate + review queue
- **Anthropic-native HTTP adapter** — `provider: "anthropic"` posts
  `/v1/messages` with `x-api-key` / `anthropic-version`; `ask --llm http` now
  performs the live grounded answer (was previously an error)
- **`gsd-graph why <a> <b>`** — resolves human terms to nodes, finds the
  shortest path, and explains it as cited prose (`path:line` citations)
- **`gsd-graph export --format mermaid|graphml|cypher|html`** — graph
  projections including a self-contained interactive HTML viewer (no CDN)
- **Batch review** — `review accept|reject --all --kind <kind>
  --predicate <p>` resolves many pending items under one lock/publish
  (`reviewResolveBatch` in the library)
- **Alias suggestions** — normalize now emits suggest-only `entity_merge`
  review items (`reason: alias_suggestion`) for plural/acronym near-matches
- **Richer citations** — every distinct provenance source with line spans is
  projected (`citations[].sources[]`); deterministic markdown renders
  `path:line +N more`
- **Distinct abstain reasons** — `no_seeds_matched`, `seeds_disconnected`,
  `empty_subgraph` instead of one blanket reason
- Hook: `sync_on_feature_branches: true` config opts into auto-sync on
  non-default branches; failed detached syncs keep logs in
  `.last-sync-failure.{out,err}` plus `stderr_tail` in `.last-sync-status.json`

### Fixed

- **Ontology selection is honored end-to-end** — `init --ontology <pack>` is
  persisted to `config.json`, `build`/`sync` read it (previously always
  `general`), and both commands accept `--ontology` directly; re-running
  `init --ontology` updates an existing config
- Engineering pack now includes `blocked_by`, `requires`, `uses`,
  `implements`, `delivers`, `precedes`, `supports`, `mentions`, `Topic`, and
  domain-open `depends_on` — the README's own examples are now expressible
- Headings no longer emit the degenerate `Document --about--> Topic` self-echo
  pair (was ~90% of typical graphs and flooded review with cross-type clashes)
- IDF-weighted seed scoring — rare question tokens now dominate; common tokens
  ("phase", "service") no longer match half the graph equally
- Performance: linear-time path materialization and budget trimming
  (previously quadratic), indexed triple dedup in the markdown extractor
- Removed dead mode-resolution branch in `answerHttp`

### Changed

- `bin/gsd-graph.js` resolves `main()` as a promise (only `--llm http`
  commands are actually async; everything else stays synchronous/offline)

## [0.2.11] - 2026-08-05

### Added

- **Easy MCP setup** for Claude Code, Codex, Cursor, and project `.mcp.json`
  - `gsd-graph enable --mcp` — register hosts during one-shot enable
  - `gsd-graph mcp install` — write host configs (repeatable; merges existing)
  - `gsd-graph mcp doctor` — check store + host registration
  - `--host claude|codex|cursor|project` (repeatable), `--allow-build`, `--allow-review-write`
  - Project `.mcp.json` uses portable `npx` launch (safe to commit); user-local hosts prefer absolute package bin

## [0.2.10] - 2026-08-05

### Changed

- `gsd-graph enable` / `sync` no longer dump full JSON on interactive TTY by default (wrap-up only)
  - Emit JSON with `--json`, `--pretty`, or `--compact`, or when stdout is piped
  - `GSD_GRAPH_JSON=1` force / `GSD_GRAPH_NO_JSON=1` silence

## [0.2.9] - 2026-08-05

### Added

- `gsd-graph --version` / `-V` / `version` — package version JSON (`--check` for npm latest)
- `gsd-graph --update` / `-U` / `update` — install latest from npm (global or project-local)

## [0.2.8] - 2026-08-05

### Added

- **Pretty-print JSON on stdout** when interactive (TTY); compact when piped
  - Force: `--pretty` / `--compact`, or `GSD_GRAPH_JSON_PRETTY=1` / `GSD_GRAPH_JSON_COMPACT=1`

## [0.2.7] - 2026-08-05

### Fixed

- Spinner no longer freezes on "Normalizing…" — progress + elapsed time update through alias-merge and triple normalize (CPU-bound phase)

## [0.2.6] - 2026-08-05

### Fixed

- Enable wrap-up summary still prints when `GSD_GRAPH_PROGRESS=1` even if `CI=true` (CI test fix)

## [0.2.5] - 2026-08-05

### Added

- **Human wrap-up stats on stderr** after `gsd-graph enable` and `gsd-graph sync`
  - Nodes, triples, sources extracted/fresh, review pending, diagnostics, corpus, next commands
  - stdout remains pure JSON; disable with `GSD_GRAPH_NO_SUMMARY=1`

## [0.2.4] - 2026-08-05

### Added

- **stderr spinner / progress** for `gsd-graph enable` and `gsd-graph sync` (TTY only; stdout remains pure JSON)
  - Stages: skill/hooks/config → corpus resolve → extract N/M files → normalize → publish
  - Disable: `GSD_GRAPH_NO_SPINNER=1` · plain lines: `GSD_GRAPH_PROGRESS=1` (for non-TTY logs)

## [0.2.3] - 2026-08-05

### Fixed

- `.json` files always use whole-document parse (`json-document` mode) — never line-by-line JSONL (vendor/OpenAPI dumps under `docs/`)
- Cap per-file record diagnostics so large non-field-map JSON arrays stay quiet
- Users on 0.2.1 still saw line spam; upgrade to 0.2.3 required

## [0.2.2] - 2026-08-04

### Fixed

- Pretty-printed `.json` (OpenAPI dumps, configs) no longer scanned line-by-line as JSONL — stops thousands of `JSON_LINE_INVALID` diagnostics on `enable`/`sync`
- Cap extract line diagnostics and build diagnostic list so CLI JSON stays usable

## [0.2.1] - 2026-08-04

### Added

- One-shot `gsd-graph enable` (skill + hooks + full project sync)
- `gsd-graph ask` alias for `answer`
- Continuous update hooks + project sync corpus auto-resolve
- Quick Guide and Full Guide under `docs/`
- npm publish of public package `@opengsd/gsd-graph`

### Changed

- Config/auto_update lives in `.gsd-graph/config.json` (`.planning` optional)
- Removed per-file copyright headers

## [0.2.0] - 2026-08-03

### Added

- **Global themes via community detection** — pure TypeScript **label propagation** over an undirected projection of EXTRACTED|INFERRED triples (no graphology / Louvain / Leiden / native deps)
- Disposable `communities/` store sidecars: `index.json` + `community-c_NNNN.md` theme reports — **never** replace `graph.v1.json` as source of truth
- Library API: `detectCommunities`, `writeCommunityReports` (rewrite markdown from index without re-running LPA)
- CLI nested verbs (K22 JSON stdout): **`gsd-graph communities detect`** and **`gsd-graph communities report`**
  - `detect` options: `--min-size`, `--max-iter`
  - Result includes `ok`, `community_count`, community summaries (`id`/`size`/`label`/`stable_key`), `index_path`, `report_paths`
- **Global-search differentiator:** corpus-level theme clusters complement local `pack` / `answer` multi-hop grounding

### Notes

- Community markdown is deterministic and disposable (not SoT); no network/LLM community essays by default
- Optional LLM community prose remains out of scope for this release

## [0.1.0] - 2026-08-03

### Added

- Graph Engineering library foundation: extract → normalize → store → query → ground → maintain
- File-first store under `.gsd-graph/` with `graph.v1.json` source of truth (optional disposable `graph.json` projection)
- Ontology pack load/validate (`general` pack) and review-queue accept/reject
- Query IR: `path`, `seed_expand`, `neighborhood`, `filter`, `applyBudget`, `confidenceRank`
- Maintain / incremental rebuild with provenance invalidation (M1–M5)
- Snapshot save/list/restore, diff vs last-diff-base, repair projection from v1
- CLI binary `gsd-graph` with K22 JSON stdout: `init`, `build`, `status`, `query`, `path`, `diff`, `repair`, `snapshot`, `review`, `ontology`, **`pack`**, **`answer`**
- `packSubgraph` — public query composition (seed → expand → path → budget → citations)
- Deterministic `answer` — Seeds / Relationships / Paths / Citations markdown; empty pack abstains (`mode: abstain`) without fabricating edges
- Offline goldens G0 (free-prose honesty / no typed multi-hop) and G1 (multi-hop.jsonl causes path ≥3 nodes)
- Cheap G2 path assert Drought → Food Shortage on multi-hop store
- Disposable `GRAPH_REPORT.md` via `gsd-graph report` (non-SoT)

### Notes

- Optional LLM answer apply (`prompt` / `http`) deferred to a later release
- MCP tools shipped as optional surface in later 0.1.x work where present
- Communities deferred from 0.1.0 — shipped in **0.2.0**
- Release gated by full `npm test` green (maintain M1–M5, core CLI, pack/answer, golden-scenarios)
