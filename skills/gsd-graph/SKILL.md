---
name: gsd-graph
description: "Auto-build and continuously update the project knowledge graph (.gsd-graph/) for brownfield onboarding and ongoing work — enable, sync, status, ask"
---
Invoke this skill with `/skill:gsd-graph` or `/gsd-graph`.

**Banner (show first):**

```
GSD > GRAPH
```

## What this is

`@opengsd/gsd-graph` builds a local knowledge graph from project docs (not plain RAG). Store: `.gsd-graph/graph.v1.json`.

## Graph-first routing (IMPORTANT)

When this project has a graph store, route questions about the project THROUGH THE GRAPH before re-reading `.planning/`, `docs/`, or README files — that is the entire token-savings point of the tool.

**If the gsd-graph MCP server is registered** (check for `graph_*` tools), prefer these over file reads:

| Question shape | Tool |
|----------------|------|
| "why/how does A relate to B", multi-hop questions | `graph_answer` (citations included) |
| "how does A connect to B" | `graph_why` |
| "what are the main areas / overview" | `graph_answer` (auto community themes) or `graph_communities` |
| find a concept / fuzzy name | `graph_resolve`, `graph_query` |
| "what changed" | `graph_diff` |
| session-start briefing | read resources `gsd-graph://report` and `gsd-graph://communities` |
| record a learned fact (if `graph_assert` present) | `graph_assert` (episodes survive rebuilds) |

**Without MCP**, use the CLI equivalents: `gsd-graph ask`, `why`, `top`, `query`, `assert`. Only fall back to reading the underlying files when the graph abstains AND its `suggestions` don't resolve the question — then consider `gsd-graph sync` (stale graph) before a manual doc crawl.

## Resolve CLI

1. `command -v gsd-graph`
2. `./node_modules/.bin/gsd-graph`
3. `npx gsd-graph` (after local `npm install @opengsd/gsd-graph`)
4. `npx -y @opengsd/gsd-graph` (zero-install scoped package)
5. Dev checkout: `node bin/gsd-graph.js`

If missing: `npm install @opengsd/gsd-graph`.

## Happy path (prefer this)

```bash
npx gsd-graph enable          # after local install
# or: npx -y @opengsd/gsd-graph enable
npx gsd-graph ask "…"         # multi-hop answer with citations
npx gsd-graph sync            # incremental after doc changes
npx gsd-graph status
```

One command replaces the old multi-step installer + sync.

## Modes (`$ARGUMENTS`)

| Argument | Action |
|----------|--------|
| `enable` | `gsd-graph enable` (full brownfield + auto_update) |
| `sync` | Incremental `gsd-graph sync` |
| `sync --full` | Full re-extract |
| `status` | `gsd-graph status` |
| `ask` / `answer` / `query` | Q&A and search |
| `update` | Alias of `sync` |
| (empty) | Print usage |

### enable

```bash
gsd-graph enable
# install-only (no corpus):
gsd-graph enable --skip-sync
```

Writes `.gsd-graph/config.json` (`enabled`, `auto_update`). Mirrors into `.planning/config.json` → `gsd_graph` only if that file already exists. Installs skill under `~/.agents/skills` and `~/.claude/skills`. Copies hooks to `.gsd-graph/hooks/`.

### Continuous update

With `auto_update: true`, PostToolUse Bash should run:

`.gsd-graph/hooks/gsd-graph-update.sh`

Detached incremental sync after commits on the default branch. Not in CI. Status: `.gsd-graph/.last-sync-status.json`.

### Auto corpus

`.planning/`, `docs/`, README and similar top-level md. Not full `src/`. Override: `sync --corpus <path>`.

## Anti-patterns

1. Do not multi-step install — use **`enable`**
2. Do not treat `graph.json` / `GRAPH_REPORT.md` as SoT — only `graph.v1.json`
3. Do not block the user on hook rebuilds
4. Do not confuse with Python graphify / gsd-core graphify

## Usage

```
GSD > GRAPH

  enable              One-shot setup + full graph
  sync [--full]       Incremental (or full) rebuild
  status              Freshness and counts
  ask <question>      Grounded multi-hop answer
  query <term>        Term seed-expand
```
