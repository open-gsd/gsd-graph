# gsd-graph — Quick Guide

Get a local knowledge graph running in minutes. For depth (MCP, ontology, maintain, LLM), see [FULL-GUIDE.md](./FULL-GUIDE.md). For day-to-day agent use (when to `ask` vs `query` vs a code graph like Memtrace), see [DAY-IN-THE-LIFE.md](./DAY-IN-THE-LIFE.md).

---

## What you get

| | |
|--|--|
| **Product** | Graph Engineering toolkit — relationships (triples), not RAG chunks |
| **CLI** | `gsd-graph` |
| **Store** | `.gsd-graph/graph.v1.json` (source of truth) |
| **Default** | Offline, no API keys |

**Need:** Node.js ≥ 22

---

## 3 commands

```bash
npm install -g @opengsd/gsd-graph

# skill + hooks + config + full brownfield graph
gsd-graph enable

# multi-hop Q&A with citations
gsd-graph ask "why is phase 4 blocked by phase 3?"
```

**Zero-install** (scoped package — use the package name so npx finds the bin):

```bash
npx -y @opengsd/gsd-graph enable
npx -y @opengsd/gsd-graph ask "why is phase 4 blocked by phase 3?"
# same as: npx -y -p @opengsd/gsd-graph gsd-graph enable
```

| When | Global CLI | Zero-install |
|------|------------|--------------|
| First time | `gsd-graph enable` | `npx -y @opengsd/gsd-graph enable` |
| After doc edits | `gsd-graph sync` | `npx -y @opengsd/gsd-graph sync` |
| Question | `gsd-graph ask "…"` | `npx -y @opengsd/gsd-graph ask "…"` |
| Status | `gsd-graph status` | `npx -y @opengsd/gsd-graph status` |
| Search | `gsd-graph query <term>` | `npx -y @opengsd/gsd-graph query <term>` |

Agent skill (installed by `enable`): **`/skill:gsd-graph`**

---

## What gets indexed

**Auto corpus** (no config required):

- Dirs if present: `.planning`, `.planning/codebase`, `docs`, `doc`, `wiki`, `architecture`
- Files if present: `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`, …

Does **not** scan all of `src/` by default.

```bash
# add more roots
gsd-graph sync --corpus ./specs --full
```

Write structured links when you care about multi-hop offline quality, e.g.:

```markdown
[[Drought]] --causes--> [[Crop Failure]]
[[Crop Failure]] --causes--> [[Food Shortage]]
```

---

## Continuous update (optional)

`enable` sets in **`.gsd-graph/config.json`**:

```json
{
  "enabled": true,
  "auto_update": true
}
```

Wire your agent **PostToolUse** (Bash) to:

```text
.gsd-graph/hooks/gsd-graph-update.sh
```

After `git commit` (etc.) on the **default branch**, a detached process runs incremental `gsd-graph sync`. Status: `.gsd-graph/.last-sync-status.json`.

Or just run `sync` yourself after docs change.

---

## How AI uses the graph

1. **Question** → seed nodes by terms  
2. **Expand** hops / paths (typed edges)  
3. **Pack** subgraph + citations  
4. **Answer** only from that pack (or abstain if empty)

```bash
gsd-graph pack "how does A connect to B?"   # raw pack JSON
gsd-graph ask  "how does A connect to B?"   # cited markdown
```

---

## Common flags

```bash
gsd-graph --version              # package version JSON
gsd-graph --update               # npm update to latest (global or local)
gsd-graph enable --skip-sync     # install only
gsd-graph sync --full --report   # re-extract everything + GRAPH_REPORT
gsd-graph --dir ./my-store status
gsd-graph --json enable           # full JSON after enable/sync
gsd-graph --pretty status        # force multi-line JSON
gsd-graph --compact status       # single-line JSON
```

Stdout is **JSON** (pretty on TTY, compact when piped). Errors are JSON on stderr.

---

## Next

- Full reference: [FULL-GUIDE.md](./FULL-GUIDE.md)  
- System design: [DESIGN.md](./DESIGN.md)  
- Repo overview: [../README.md](../README.md)  
