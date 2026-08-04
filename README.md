# @opengsd/gsd-graph

**Graph Engineering toolkit** — build a local knowledge graph of **relationships** (subject–predicate–object triples with provenance), then answer multi-hop questions with **citations**.


|             |                                              |
| ----------- | -------------------------------------------- |
| **CLI**     | `gsd-graph`                                  |
| **MCP**     | `gsd-graph-mcp`                              |
| **Store**   | `.gsd-graph/graph.v1.json` (source of truth) |
| **Runtime** | Node.js ≥ 22 · offline by default            |




---

## Why this exists

Regular RAG finds **text fragments**. Graph Engineering finds **relationships** — causation chains, “how A connects to B,” corpus-level themes.

```text
extract → normalize → store → query → ground → maintain
```

---

## Quick start

```bash
npm install @opengsd/gsd-graph

# one shot: skill + hooks + config + full brownfield graph
npx gsd-graph enable

# multi-hop Q&A with citations
npx gsd-graph ask "why is phase 4 blocked by phase 3?"
```


| Command                  | When                                       |
| ------------------------ | ------------------------------------------ |
| `gsd-graph enable`       | First time in a repo                       |
| `gsd-graph sync`         | After docs / planning change (incremental) |
| `gsd-graph ask "…"`      | Grounded multi-hop answer                  |
| `gsd-graph status`       | Counts / freshness                         |
| `gsd-graph query <term>` | Seed-expand search                         |


Agent skill (installed by `enable`): `**/skill:gsd-graph**`

---

## Documentation


| Guide                                    | Audience                                                             |
| ---------------------------------------- | -------------------------------------------------------------------- |
| [**Quick Guide**](./docs/QUICK-GUIDE.md) | Install, 3 commands, continuous update, AI in 5 minutes              |
| [**Full Guide**](./docs/FULL-GUIDE.md)   | Corpus, maintain, MCP, ontology, LLM, CLI reference, troubleshooting |
| [**Design**](./docs/DESIGN.md)           | Architecture, store contracts, pipeline decisions                    |
| [**Changelog**](./CHANGELOG.md)          | Release history                                                      |
| [**Skill**](./skills/gsd-graph/SKILL.md) | Agent skill source                                                   |


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
npx gsd-graph sync --corpus ./specs --full
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


| Path                         | Role                     |
| ---------------------------- | ------------------------ |
| `.gsd-graph/graph.v1.json`   | **Canonical** SoT        |
| `.gsd-graph/graph.json`      | Disposable projection    |
| `.gsd-graph/communities/`    | Disposable theme reports |
| `.gsd-graph/GRAPH_REPORT.md` | Human summary            |


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
gsd-graph-mcp                    # optional MCP stdio server
```

Machine contract: **JSON on stdout** (K22). Library: `require('@opengsd/gsd-graph')`.

Ontology packs: `general` (default), `engineering`, `research`.

---

## Develop

```bash
npm install
npm run build
npm test
```

---

## License

MIT — see [LICENSE](./LICENSE).