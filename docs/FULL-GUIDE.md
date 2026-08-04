# gsd-graph — Full Guide

Complete guide to installing, updating, querying, and operating **@opengsd/gsd-graph**.

| Doc | Purpose |
|-----|---------|
| [QUICK-GUIDE.md](./QUICK-GUIDE.md) | 3-command start |
| **This guide** | Full reference |
| [DESIGN.md](./DESIGN.md) | Architecture, contracts, decisions |
| [../README.md](../README.md) | Package landing |

---

## Table of contents

1. [Concept](#1-concept)
2. [Install & enable](#2-install--enable)
3. [Day-to-day CLI](#3-day-to-day-cli)
4. [Store layout](#4-store-layout)
5. [Corpus & extraction](#5-corpus--extraction)
6. [Continuous update](#6-continuous-update)
7. [How AI leverages the graph](#7-how-ai-leverages-the-graph)
8. [Query, pack, answer](#8-query-pack-answer)
9. [Communities (global themes)](#9-communities-global-themes)
10. [Ontology & review](#10-ontology--review)
11. [Maintain, snapshots, repair](#11-maintain-snapshots-repair)
12. [MCP server](#12-mcp-server)
13. [Optional LLM stages](#13-optional-llm-stages)
14. [Agent skill](#14-agent-skill)
15. [Library API](#15-library-api)
16. [CLI reference](#16-cli-reference)
17. [Config reference](#17-config-reference)
18. [Troubleshooting](#18-troubleshooting)
19. [Honesty bar & limits](#19-honesty-bar--limits)

---

## 1. Concept

### Graph Engineering vs regular RAG

| Regular RAG | gsd-graph |
|-------------|-----------|
| Chunks + embeddings | Entities + **typed relationships** |
| “Find text about sales and March” | “What **caused** sales drop?” via multi-hop paths |
| Model stitches fragments | Model (or formatter) answers **only from a subgraph pack** |

Pipeline:

```text
extract → normalize → store → query → ground → maintain
```

Knowledge is stored as **subject–predicate–object triples** with confidence and multiset provenance.

### Product identity

| Surface | Value |
|---------|--------|
| npm | `@opengsd/gsd-graph` |
| CLI | `gsd-graph` |
| MCP | `gsd-graph-mcp` |
| Default store | `.gsd-graph/` |
| Engine field | `"gsd-graph"` |

OpenGSD is the **publisher namespace only**. No runtime dependency on gsd-core. Not a Python graphify facade.

### Requirements

- **Node.js ≥ 22**, npm ≥ 10  
- Offline by default (no API keys for core path)

---

## 2. Install & enable

### Happy path (recommended)

```bash
npm install @opengsd/gsd-graph

# One shot: agent skill + hooks + config + full brownfield sync
npx gsd-graph enable

# Use it
npx gsd-graph ask "why is X blocked by Y?"
npx gsd-graph status
```

`enable` does:

1. Installs skill to `~/.agents/skills/gsd-graph` and `~/.claude/skills/gsd-graph`  
2. Copies hooks to `.gsd-graph/hooks/`  
3. Writes `.gsd-graph/config.json` (`enabled`, `auto_update`, …)  
4. Mirrors flags into `.planning/config.json` → `gsd_graph` **only if that file already exists**  
5. Runs **full** `projectSync` over auto corpus (unless `--skip-sync`)

### Enable flags

```bash
gsd-graph enable
gsd-graph enable --skip-sync      # install only
gsd-graph enable --no-auto-update
gsd-graph enable --no-report
gsd-graph enable --communities    # also run community detect after first sync
gsd-graph --dir ./custom-store enable
```

### Legacy installer

```bash
# Prefer enable. This script shells to the same path:
node node_modules/@opengsd/gsd-graph/scripts/install-gsd-integration.js . --enable
npm run install-gsd -- --enable   # from package root
```

### From a git checkout

```bash
npm install
npm run build
node bin/gsd-graph.js enable
```

---

## 3. Day-to-day CLI

| Goal | Command |
|------|---------|
| First-time setup | `gsd-graph enable` |
| Incremental refresh | `gsd-graph sync` |
| Force re-extract all | `gsd-graph sync --full` |
| Question | `gsd-graph ask "…"` or `answer` |
| Term search | `gsd-graph query <term>` |
| Path between ids | `gsd-graph path <fromId> <toId>` |
| Health | `gsd-graph status` |
| Explicit corpus build | `gsd-graph build --corpus ./docs` |
| Themes | `gsd-graph communities detect` |

**Machine contract (K22):** successful commands print **JSON on stdout**. Errors print JSON on stderr with non-zero exit (`1` usage, `2` GraphError, `3` build locked).

Global option:

```bash
gsd-graph --dir .gsd-graph status
# or env:
GSD_GRAPH_DIR=.gsd-graph gsd-graph status
```

---

## 4. Store layout

Default directory: **`.gsd-graph/`**

```text
.gsd-graph/
├── config.json                 # ontology + enable/auto_update flags
├── graph.v1.json               # ★ CANONICAL source of truth
├── graph.json                  # disposable viewer projection (optional)
├── sources.manifest.json       # path → content_hash for incremental skip
├── review-queue.json           # schema / dedup human review
├── ontology.lock.json          # resolved pack snapshot
├── GRAPH_REPORT.md             # human summary (not SoT)
├── .last-build-status.json
├── .last-sync-status.json      # continuous update status
├── .build.lock                 # writers only
├── hooks/                      # continuous-update scripts (from enable)
│   ├── gsd-graph-update.sh
│   └── lib/gsd-graph-rebuild.sh
├── snapshots/
└── communities/                # disposable theme reports (not SoT)
    ├── index.json
    └── community-*.md
```

**Invariants:**

1. Only **`graph.v1.json`** is authoritative for native query/answer.  
2. `graph.json`, `GRAPH_REPORT.md`, and `communities/` are operator aids.  
3. Writers share `.build.lock` and publish via atomic rename.

---

## 5. Corpus & extraction

### Auto corpus (`sync` / `enable`)

When no explicit corpus list is configured:

**Directories** (if they exist):

- `.planning`, `.planning/codebase`  
- `docs`, `doc`, `wiki`, `architecture`

**Files** (if they exist):

- `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`  
- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`  
- `CHANGELOG.md`, `SECURITY.md`

**Not** scanned by default: entire monorepo root, `src/`, `node_modules`, `.git`, `dist`, the store itself.

### Overrides

```bash
# Extra roots (merged into auto resolve)
gsd-graph sync --corpus ./specs --corpus ./adr

# Config: .gsd-graph/config.json or .planning/config.json → gsd_graph.corpus
{
  "corpus": ["./docs", "./specs/README.md"]
}

# Explicit pipeline (no auto resolve)
gsd-graph build --corpus ./docs
gsd-graph build --corpus ./docs --full
```

### What extractors produce

| Source style | Typical result |
|--------------|----------------|
| Headings, wiki-links, edge lines | Structured nodes + triples |
| JSONL records `{type,label,edges}` | Strong **EXTRACTED** multi-hop (goldens) |
| Free prose only (offline) | Weak / mostly `mentions` — multi-hop **may abstain** |
| Optional LLM extract | Richer free-prose edges (`--llm`, opt-in) |

Confidence tiers: **`EXTRACTED` > `INFERRED` > `AMBIGUOUS`**. Budgeted query drops weak first.

### Tips for high-quality offline graphs

Prefer explicit structure in docs:

```markdown
## Decisions

[[Auth]] --part_of--> [[API]]
[[RateLimit]] --causes--> [[429s]]
```

Or JSONL:

```json
{"type":"Concept","label":"Drought","edges":[{"p":"causes","o":"Crop Failure"}]}
```

---

## 6. Continuous update

### Mental model

```text
Corpus files change
      ↓
Trigger: enable | sync | agent skill | post-commit hook
      ↓
Fingerprint each source (sha256)
      ↓
Skip unchanged · re-extract changed · drop deleted paths
      ↓
Invalidate provenance on affected triples
      ↓
Normalize / merge · publish graph.v1.json
```

This is **incremental maintain**, not chat-memory and not a full-repo FS watcher.

### Triggers

| Trigger | Mode |
|---------|------|
| `gsd-graph enable` | Full extract |
| `gsd-graph sync` | Incremental (default) |
| `gsd-graph sync --full` | Full re-extract |
| Hook after HEAD-advancing Bash | Detached incremental `sync` |
| Agent `/skill:gsd-graph sync` | Same as CLI |

### Hook wiring

1. `enable` sets `enabled: true` and `auto_update: true` in **`.gsd-graph/config.json`**.  
2. Point agent **PostToolUse** (Bash) at:

   ```text
   .gsd-graph/hooks/gsd-graph-update.sh
   ```

3. Stdin = PostToolUse JSON (`tool_name`, `tool_input.command`).  
4. On match, detaches `hooks/lib/gsd-graph-rebuild.sh` → `gsd-graph sync`.

**Hook gates:**

- `tool_name == Bash`  
- Command contains `git commit` / `merge` / `pull` / `rebase --continue` / `cherry-pick` (or `gsd-tools query commit`)  
- Not `$CI`  
- Git repo; **current branch = default** (`main`/`master`/`trunk` or planning `git.base_branch`)  
- `enabled && auto_update`  
- CLI resolvable; no live `.sync.lock` PID  

Never blocks the user-facing tool call. Status: `.last-sync-status.json`.

### Provenance rules (maintain)

| Situation | Result |
|-----------|--------|
| Source file content changes | Old provenance for that path invalidated; re-extracted facts re-merged |
| Source deleted | Path dropped; triples lose that provenance entry |
| Triple still has other sources | Triple remains (tier may drop) |
| Last provenance entry gone | Triple removed |

Manifest path: `sources.manifest.json` → skip when `content_hash` matches.

---

## 7. How AI leverages the graph

Agents should treat the graph as a **relationship index**, not a dump of markdown.

```text
1. status / last-sync     → is the graph fresh?
2. sync (if needed)       → update from corpus
3. ask / pack / query     → retrieve subgraph for the question
4. answer only from pack  → cite triples; abstain if empty
```

### Retrieval (pack)

1. Tokenize question (drop stopwords)  
2. Score seed nodes by label / id / alias  
3. Expand hops; find paths among top seeds  
4. Apply token budget (drop AMBIGUOUS → INFERRED → EXTRACTED)  
5. Project citations from remaining triples  

### Answer

**Default:** deterministic markdown sections — Seeds, Relationships, Paths, Citations — **no LLM**.  
**Optional LLM:** must cite only pack triple ids (fail-closed).

### Surfaces

| Surface | Tools / commands |
|---------|------------------|
| CLI | `ask`, `answer`, `pack`, `query`, `path`, `status` |
| Skill | `/skill:gsd-graph` modes |
| MCP | `graph_status`, `graph_query`, `graph_pack`, `graph_answer`, … |

**Do not** load entire `graph.v1.json` into the model context for normal Q&A — use pack.

---

## 8. Query, pack, answer

### query

```bash
gsd-graph query drought
gsd-graph query drought --hops 2 --budget 500
```

Seed-expand by term substring against labels/ids.

### path

```bash
gsd-graph path Concept:drought Concept:food-shortage
```

Shortest path between two node ids (if connected under hop limits).

### pack

```bash
gsd-graph pack "why does drought cause food shortage?"
gsd-graph pack "…" --budget 200
```

Returns JSON: `seeds`, `nodes`, `triples`, `paths`, `citations`, `trimmed`.

### ask / answer

```bash
gsd-graph ask "why does drought cause food shortage?"
gsd-graph answer "…" --budget 200
# optional LLM:
gsd-graph answer "…" --llm
gsd-graph answer "…" --llm http
```

Empty pack → `mode: "abstain"`, exit 0 (honest empty — does not invent edges).

---

## 9. Communities (global themes)

Local `pack`/`ask` answer **one question**. Communities surface **corpus-level themes**.

```bash
gsd-graph communities detect
gsd-graph communities detect --min-size 3 --max-iter 20
gsd-graph communities report    # rewrite markdown from last index
```

- Algorithm: pure-TS **label propagation** over undirected EXTRACTED|INFERRED edges  
- Output under `communities/` — **disposable, not SoT**  
- No network/LLM community essays by default  

```bash
gsd-graph sync --communities   # detect after project sync
```

---

## 10. Ontology & review

### Packs

Shipped under `ontology-packs/`:

| Pack | Intent |
|------|--------|
| `general` | Default broad types/predicates |
| `engineering` | Services, incidents, decisions-style |
| `research` | Papers, claims, authors-style |

```bash
gsd-graph init --ontology general
gsd-graph ontology show
gsd-graph ontology validate
```

Strict packs: unknown predicates/types → **review queue**, not silent invent.

### Review queue

```bash
gsd-graph review list
gsd-graph review accept <id>
gsd-graph review accept <id> --extend-ontology
gsd-graph review reject <id>
```

Human-in-the-loop for schema drift and ambiguous merges (aligned with “LLMs help extract; humans gate schema”).

---

## 11. Maintain, snapshots, repair

```bash
gsd-graph sync                 # incremental project maintain
gsd-graph sync --full          # authoritative rebuild after ontology/extractor changes
gsd-graph diff                 # vs last-diff-base snapshot
gsd-graph repair               # regenerate disposable projection from v1
gsd-graph snapshot save mytag
gsd-graph snapshot list
gsd-graph snapshot restore mytag
gsd-graph report               # GRAPH_REPORT.md
```

Snapshots store full `graph.v1` copies under `snapshots/`. Restore recovers graph SoT (sidecars may lag by design).

---

## 12. MCP server

Durable agent access without re-pasting the graph.

```bash
npx gsd-graph-mcp
# or
node node_modules/@opengsd/gsd-graph/bin/gsd-graph-mcp.js --dir .gsd-graph
```

### Tools (default read)

| Tool | Maps to |
|------|---------|
| `graph_status` | `status` |
| `graph_query` | query / path / neighborhood / filter IR |
| `graph_pack` | `packSubgraph` |
| `graph_answer` | `answer` |
| `graph_review_list` | review queue list |

### Privileged (off by default)

| Tool | Enable |
|------|--------|
| `graph_build` | `--allow-build` / `mcp.allow_build` |
| `graph_review_resolve` | `--allow-review-write` / `mcp.allow_review_write` |

Example MCP client config (shape varies by host):

```json
{
  "mcpServers": {
    "gsd-graph": {
      "command": "npx",
      "args": ["-y", "gsd-graph-mcp"],
      "env": { "GSD_GRAPH_DIR": ".gsd-graph" }
    }
  }
}
```

---

## 13. Optional LLM stages

Default `llm.mode = none` — deterministic extract + deterministic answer.

Five prompt templates under `prompts/` (mechanisms inside stages):

| Prompt | Role | Apply |
|--------|------|--------|
| `extract.md` | LLM entity/relation assist | `prompt apply extract` / build with LLM |
| `normalize.md` | Dedup / merge suggestions | `prompt apply normalize` |
| `query.md` | Reserved (NL→Query IR) — **not applied in 0.2** | — |
| `answer.md` | Grounded prose over pack | `answer --llm` / `prompt apply answer` |
| `maintain.md` | Diagnostics / repair suggestions | `prompt apply maintain` |

```bash
gsd-graph answer "…" --llm           # prompt mode
gsd-graph answer "…" --llm http      # HTTP provider
gsd-graph prompt apply answer --question "…"
```

Answer apply is **fail-closed**: cited triple ids must be a subset of the pack.

---

## 14. Agent skill

Installed by `enable` from `skills/gsd-graph/SKILL.md`.

```text
/skill:gsd-graph enable
/skill:gsd-graph sync
/skill:gsd-graph sync --full
/skill:gsd-graph status
/skill:gsd-graph ask <question>
/skill:gsd-graph query <term>
```

**Anti-patterns for agents:**

1. Don’t multi-step install — use `enable`  
2. Don’t treat projection/report as SoT  
3. Don’t block users waiting on detached hook rebuilds  
4. Don’t confuse with gsd-core / Python graphify  

---

## 15. Library API

```js
const {
  enable,
  projectSync,
  build,
  init,
  query,
  packSubgraph,
  answer,
  status,
  detectCommunities,
  // …
} = require('@opengsd/gsd-graph');

enable({ cwd: process.cwd() });
projectSync({ full: false, report: true });
const pack = packSubgraph({ question: 'why …?' });
const grounded = answer({ question: 'why …?' });
```

TypeScript types ship with the package (`dist/index.d.ts`).

---

## 16. CLI reference

| Command | Description |
|---------|-------------|
| `enable` | Skill + hooks + config + full project sync |
| `init` | Create store layout / gitignore entry |
| `sync` | Auto corpus init+build (incremental) |
| `build --corpus <path>` | Explicit extract→normalize→publish |
| `status` | Health, counts, stale, review size |
| `query <term>` | Seed expand |
| `path <from> <to>` | Shortest path |
| `pack <question>` | Subgraph pack JSON |
| `ask` / `answer <question>` | Grounded cited answer |
| `report` | Write GRAPH_REPORT.md |
| `communities detect\|report` | Global themes |
| `diff` | Diff vs baseline snapshot |
| `repair` | Regenerate projection from v1 |
| `snapshot save\|list\|restore` | Point-in-time graph.v1 |
| `review list\|accept\|reject` | Human review queue |
| `ontology show\|validate` | Pack inspection |
| `prompt apply <stage>` | Apply LLM prompt result files |

Use `gsd-graph <cmd> --help` where supported; top-level help is JSON-oriented (K22).

---

## 17. Config reference

### `.gsd-graph/config.json` (primary)

Written/updated by `enable` and `init`:

```json
{
  "ontology": "general",
  "enabled": true,
  "auto_update": true,
  "report_on_sync": true,
  "communities_on_sync": false,
  "store": {
    "write_projection": true
  }
}
```

| Key | Meaning |
|-----|---------|
| `enabled` | Project graph active (hook gate) |
| `auto_update` | Hook may run detached sync |
| `report_on_sync` | Write GRAPH_REPORT on project sync |
| `communities_on_sync` | Run LPA after sync |
| `corpus` | Optional string[] override of auto roots |
| `ontology` | Pack id or path |
| `store.write_projection` | Dual-write disposable `graph.json` |

### `.planning/config.json` → `gsd_graph` (optional host)

Only used when the file already exists; `enable` mirrors flags:

```json
{
  "gsd_graph": {
    "enabled": true,
    "auto_update": true,
    "store_dir": ".gsd-graph",
    "report_on_sync": true,
    "full_on_enable": true,
    "communities_on_sync": false,
    "corpus": null
  }
}
```

Resolution: **store config overrides / merges with planning** via `readGraphProjectConfig`.

---

## 18. Troubleshooting

| Symptom | Check |
|---------|--------|
| `corpus_not_found` | Add `docs/`, `README.md`, or `.planning/`, or pass `--corpus` |
| Empty / abstain answers | Need structured links or JSONL; free prose offline is weak |
| Hook never runs | `enabled`+`auto_update`; default branch; not CI; Bash+git commit pattern; CLI on PATH |
| Stale graph | `gsd-graph sync` or `sync --full`; check `.last-sync-status.json` |
| `build_locked` (exit 3) | Wait for other writer; remove stale `.build.lock` if PID dead |
| Huge noisy graph | Don’t point corpus at repo root / all of `src/` |
| Review pile-up | `review list`; accept/reject; consider ontology pack fit |
| MCP can’t build | Expected — enable `--allow-build` deliberately |

```bash
gsd-graph status
cat .gsd-graph/.last-sync-status.json
cat .gsd-graph/.last-build-status.json
```

---

## 19. Honesty bar & limits

### What 0.2 ships

- Offline multi-hop on **structured** corpora (links / JSONL) with citations  
- Incremental maintain with provenance  
- Communities for global themes (disposable reports)  
- Optional MCP + optional LLM stages  
- One-command `enable` + continuous hook path  

### Explicit non-goals (current)

- Required Neo4j / cloud graph DB  
- NL→Query IR (`prompts/query.md` reserved)  
- Full code AST / symbol graph as primary product  
- File-save watcher (use commit hook or manual/agent `sync`)  
- Guaranteed multi-hop from unstructured free prose without LLM extract  

### Design thesis

> LLM knows words. Knowledge graph knows relationships. The most powerful systems use both — with the graph as the grounded memory.

---

## See also

- [QUICK-GUIDE.md](./QUICK-GUIDE.md)  
- [DESIGN.md](./DESIGN.md)  
- [../CHANGELOG.md](../CHANGELOG.md)  
- [../skills/gsd-graph/SKILL.md](../skills/gsd-graph/SKILL.md)  
