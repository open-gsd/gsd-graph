# @opengsd/gsd-graph

**Graph Engineering toolkit** — build a local knowledge graph of **relationships** (subject–predicate–object triples with provenance), then answer multi-hop questions with **citations**.

| | |
|--|--|
| **CLI** | `gsd-graph` |
| **MCP** | `gsd-graph-mcp` |
| **Store** | `.gsd-graph/graph.v1.json` (source of truth) |
| **Runtime** | Node.js ≥ 22 · offline by default |
| **npm** | [`@opengsd/gsd-graph`](https://www.npmjs.com/package/@opengsd/gsd-graph) |

OpenGSD is the **publisher namespace only**. This package has no runtime dependency on gsd-core, GSD workflows, or Python graphify.

---

## Why this exists

Regular RAG finds **text fragments**. Graph Engineering finds **relationships** — causation chains, “how A connects to B,” corpus-level themes.

```text
extract → normalize → store → query → ground → maintain
```

---

## Quick start

### Global CLI (recommended)

```bash
npm install -g @opengsd/gsd-graph

# one shot: skill + hooks + config + full brownfield graph (+ MCP)
gsd-graph enable --mcp

# multi-hop Q&A with citations
gsd-graph ask "why is phase 4 blocked by phase 3?"
```

MCP for Claude / Codex / Cursor (if you skipped `--mcp`):

```bash
gsd-graph mcp install
gsd-graph mcp doctor   # after restarting the host
```

The global install keeps this CLI separate from a project's dependency tree. To
upgrade later, rerun the install command with `@latest`.

### Zero-install via npx (scoped package)

Because the package is scoped (`@opengsd/…`), use the package name (or `-p`) so npx resolves the bin:

```bash
# run the gsd-graph binary from the published package
npx -y @opengsd/gsd-graph enable
npx -y @opengsd/gsd-graph ask "why is X blocked by Y?"
npx -y @opengsd/gsd-graph status

# equivalent explicit form
npx -y -p @opengsd/gsd-graph gsd-graph enable
```

For reproducible automation, replace the unversioned package with an exact release,
for example `@opengsd/gsd-graph@0.2.11`.

### Local library dependency

Install locally only when application code imports the Node.js API:

```bash
npm install @opengsd/gsd-graph
```

After a local install, `npx gsd-graph …` also works via `node_modules/.bin`.

| Command | When |
|---------|------|
| `gsd-graph enable --mcp` | First time in a repo (+ register MCP hosts) |
| `gsd-graph sync` | After docs / planning change (incremental) |
| `gsd-graph ask "…"` | Grounded multi-hop answer |
| `gsd-graph status` | Counts / freshness |
| `gsd-graph query <term>` | Seed-expand search |
| `gsd-graph mcp install` | Wire Claude / Codex / Cursor + project `.mcp.json` |
| `gsd-graph mcp doctor` | Check store + MCP registration |

Agent skill (installed by `enable`): **`/skill:gsd-graph`**

---

## Documentation

| Guide | Audience |
|-------|----------|
| **[Quick Guide](./docs/QUICK-GUIDE.md)** | Install, 3 commands, continuous update, AI in 5 minutes |
| **[Day in the life](./docs/DAY-IN-THE-LIFE.md)** | Agent workflow: enable → hooks → ask vs query vs Memtrace |
| **[Full Guide](./docs/FULL-GUIDE.md)** | Corpus, maintain, MCP, ontology, LLM, CLI reference, troubleshooting |
| **[Publishing](./docs/PUBLISHING.md)** | GitHub Release → npm trusted-publishing runbook |
| **[Design](./docs/DESIGN.md)** | Architecture, store contracts, pipeline decisions |
| **[Changelog](./CHANGELOG.md)** | Release history |
| **[Skill](./skills/gsd-graph/SKILL.md)** | Agent skill source |

---

## Continuous update

`enable` writes `.gsd-graph/config.json` with `enabled` + `auto_update`. Wire PostToolUse (Bash) to:

```text
.gsd-graph/hooks/gsd-graph-update.sh
```

After commits on the default branch, a **detached** incremental `gsd-graph sync` runs (never blocks). Status: `.gsd-graph/.last-sync-status.json`.

No `.planning/` required. If `.planning/config.json` exists, flags are mirrored under `gsd_graph` for GSD hosts.

Details: [Full Guide → Continuous update](./docs/FULL-GUIDE.md#6-continuous-update).

---

## What gets indexed

**Auto corpus** (when present): `.planning/`, `docs/`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, …

Does **not** scan all of `src/` by default.

```bash
gsd-graph sync --corpus ./specs --full
# or zero-install:
npx -y @opengsd/gsd-graph sync --corpus ./specs --full
```

---

## How AI uses the graph

1. **Sync** keeps triples current from corpus files  
2. **Pack** retrieves a small subgraph for the question (seeds → hops → paths → budget)  
3. **Ask / MCP `graph_answer`** grounds the reply on that pack only — or **abstains** if empty  

Default answer path is **deterministic** (no API key). Optional `--llm` must still cite pack triple ids only.

→ [Full Guide → How AI leverages the graph](./docs/FULL-GUIDE.md#7-how-ai-leverages-the-graph)

---

## Store (source of truth)

| Path | Role |
|------|------|
| `.gsd-graph/graph.v1.json` | **Canonical** SoT |
| `.gsd-graph/graph.json` | Disposable projection |
| `.gsd-graph/communities/` | Disposable theme reports |
| `.gsd-graph/GRAPH_REPORT.md` | Human summary |

Native query/answer APIs **never** treat projections as authority.

---

## Advanced surfaces

```bash
gsd-graph init
gsd-graph build --corpus ./docs
gsd-graph pack "question"
gsd-graph path Concept:a Concept:b
gsd-graph communities detect
gsd-graph review list
gsd-graph snapshot save pre-refactor
gsd-graph mcp install
# or: npx -y -p @opengsd/gsd-graph@0.2.11 gsd-graph-mcp
```

Machine contract: **JSON on stdout** (K22). Library: `require('@opengsd/gsd-graph')`.

Ontology packs: `general` (default), `engineering`, `research`.

---

## Develop

```bash
npm install
npm run build
npm test
npm publish --access public   # maintainers; requires npm login to @opengsd
```

---

## License

MIT — see [LICENSE](./LICENSE).
