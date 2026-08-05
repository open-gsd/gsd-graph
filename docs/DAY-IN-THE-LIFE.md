# gsd-graph — Day in the life (agent workflow)

How to run **@opengsd/gsd-graph** day to day: setup, continuous update, and when agents should call **ask** vs **query** vs **Memtrace** (or other code graphs).

| Related | Purpose |
|---------|---------|
| [QUICK-GUIDE.md](./QUICK-GUIDE.md) | Install and 3-command start |
| [FULL-GUIDE.md](./FULL-GUIDE.md) | Full CLI / MCP / corpus reference |
| [TOKEN-SAVINGS-ESTIMATE.md](./TOKEN-SAVINGS-ESTIMATE.md) | Pack vs full-corpus context size |

---

## Solid use case

The strongest fit is **not** “search my docs.” It is:

> Keep a living relationship graph of project knowledge so an agent can answer multi-hop dependency questions from a tiny cited subgraph instead of re-reading the whole planning corpus.

Pipeline:

```text
extract → normalize → store → query → ground → maintain
```

| Question type | Chunk RAG | gsd-graph |
|---------------|-----------|-----------|
| “Find the paragraph about X” | Fine | Overkill |
| “Why is Y blocked?” | Weak (co-occurrence, no chain) | Strong (typed multi-hop) |
| “How does A connect to B?” | Weak | Explicit path / neighborhood |
| “What are the themes?” | Weak | Communities |
| “What changed?” | Re-embed everything | Incremental triple invalidation |

**Best one-liner:** project knowledge graph as the agent’s dependency brain — continuously synced from planning/docs, queried for multi-hop “why / blocked / depends” answers with citations.

### Where it pays off

1. **AI coding agents on large planning/docs sets** — continuous `sync` after commits; skill/MCP `graph_answer` before plan/execute  
2. **Onboarding / status** — “what blocks shipping X?” without reading the whole roadmap  
3. **Decision archaeology** — “why did we choose this; what depends on it?” with citations  
4. **Research / domain corpora** (ontology packs) — causal chains queried offline  

### What it is *not* ideal for

- Full source-code call graphs (does **not** scan all of `src/` by default)  
- One-file lookups already in context  
- Pure keyword “find this sentence”  

---

## 0. Install once, enable per clone

```bash
# once per machine
npm install -g @opengsd/gsd-graph

# once in each project clone
gsd-graph enable
# install-only: enable --skip-sync
```

Zero-install (scoped package):

```bash
npx -y @opengsd/gsd-graph enable
```

What `enable` does:

1. Skill → `~/.agents/skills/gsd-graph` (and Claude skills path)  
2. Hooks → `.gsd-graph/hooks/`  
3. Config → `.gsd-graph/config.json` (`enabled`, `auto_update`)  
4. Optional mirror → `.planning/config.json` → `gsd_graph` (only if that file already exists)  
5. **Full** brownfield sync over auto corpus (unless `--skip-sync`)  

**Auto corpus:** `.planning/`, `docs/`, README, CHANGELOG, AGENTS, and similar top-level markdown.  
**Not** full `src/` — intentional. Override with `sync --corpus <path>`.

Wire the agent **PostToolUse (Bash)** to:

```text
.gsd-graph/hooks/gsd-graph-update.sh
```

Agent skill (installed by `enable`): **`/skill:gsd-graph`**

---

## 1. Morning: is the graph alive?

```bash
gsd-graph status
# optional: cat .gsd-graph/.last-sync-status.json
```

| Status | Agent action |
|--------|----------------|
| Fresh, reasonable node/triple counts | Proceed |
| Stale after big doc edits on a feature branch | `gsd-graph sync` (hooks only fire on default branch) |
| Weird / empty after ontology or corpus change | `gsd-graph sync --full` |

**Agent rule:** do **not** dump `graph.v1.json` into model context. Use pack / ask.

Only **`graph.v1.json`** is the source of truth. Treat `graph.json` and `GRAPH_REPORT.md` as disposable projections.

---

## 2. Continuous update (background)

Hooks run a **detached incremental `sync`** after HEAD-advancing Bash commands:

- Matches: `git commit` / `merge` / `pull` / `rebase --continue` / `cherry-pick` (or `gsd-tools query commit`)  
- Requires `enabled && auto_update` in `.gsd-graph/config.json` (or mirrored planning flags)  
- Only on the **default branch** (`main` / `master` / `trunk`, or planning `git.base_branch`)  
- Not in CI; always exits 0 — **never blocks** the user-facing tool call  

Loop:

```text
edit docs / planning → commit on main → hook syncs triples → agents see a fresher graph
```

On a **feature branch:** hooks no-op. After merging planning docs, either merge to main (hook) or run `gsd-graph sync` before dependency Q&A.

| Trigger | Mode |
|---------|------|
| `gsd-graph enable` | Full extract |
| `gsd-graph sync` | Incremental (default) |
| `gsd-graph sync --full` | Full re-extract |
| Hook after HEAD-advancing Bash | Detached incremental `sync` |
| Agent `/skill:gsd-graph sync` | Same as CLI |

Status after hook: `.gsd-graph/.last-sync-status.json`.

---

## 3. Decision tree: which tool?

```text
What am I trying to know?
│
├─ Relationships in PROJECT DOCS / planning
│  (phases, requirements, decisions, ADRs, “why blocked”)
│  │
│  ├─ Natural multi-hop question → ask / graph_answer
│  ├─ “Show me neighborhood of X” → query / graph_query
│  ├─ “Path from A to B” (known node ids) → path
│  ├─ “Give me the raw subgraph, I’ll reason” → pack / graph_pack
│  └─ “What are corpus themes?” → communities detect
│
└─ CODE structure
   (callers, blast radius, “who uses this function”, history)
   → Memtrace (or your code graph) — not gsd-graph
```

### `ask` / MCP `graph_answer` — default for agents

**Use when:** the question is multi-hop and you want a grounded answer + citations.

```bash
gsd-graph ask "why is phase 4 blocked by phase 3?"
gsd-graph ask "what requirements depend on Phase 5?"
```

- Packs seeds → hops → budgeted triples → deterministic answer (optional `--llm`)  
- Empty pack → **abstain** (does not invent edges)  
- Best for plan-phase, progress, “why is X blocked?”, onboarding  

### `query` / MCP `graph_query` — explore / seed-expand

**Use when:** you have a **term**, not a full question — browsing the graph.

```bash
gsd-graph query blocked --hops 2
gsd-graph query packSubgraph --hops 1 --budget 500
```

- Substring match on labels/ids → expand neighborhood  
- Good for “what do we know around *Phase 5* / *MCP* / *continuous update*?”  
- Not a prose answer; structured IR / subgraph  

Also via query IR: neighborhood by id, path, type/predicate filters.

### `pack` / MCP `graph_pack` — intermediate

**Use when:** the agent will write its own answer but must stay grounded.

```bash
gsd-graph pack "how are graph answers grounded with citations?"
```

Returns seeds, nodes, triples, paths, citations, trim info.  
`ask` = pack + grounded render. Prefer `ask` unless you need the JSON pack.

### `path` — known endpoints

```bash
gsd-graph path Concept:a Concept:b
```

Only when you already have node ids (from status/query).

### Memtrace (or any code graph) — not doc relationships

| Question | Tool |
|----------|------|
| “Why is phase 4 blocked by phase 3?” | **gsd-graph ask** |
| “What docs say depends on auth redesign?” | **gsd-graph** |
| “Who calls `packSubgraph`?” | **Memtrace** (code graph) |
| “Blast radius of changing `answer()`?” | **Memtrace get_impact** |
| “What co-changes with `query.ts`?” | **Memtrace** |
| “Find symbol `graph_answer`” | **Memtrace find_symbol** |

| Layer | Indexes | Answers |
|-------|---------|---------|
| **gsd-graph** | Project knowledge (docs, planning) | Why / blocked-by / depends-on / themes |
| **Memtrace** | Source AST / call graph | Callers, impact, evolution, symbols |

They compose; they do not replace each other.

---

## 4. Full-day scenarios

### A. Resume planning work

```text
1. gsd-graph status
2. ask "what is blocking the next phase?"
3. ask "which requirements touch MCP / continuous update?"
4. If code change needed → Memtrace preflight on the symbol
5. Implement; if you edited docs only → commit (hook syncs on main)
```

### B. Design / plan-phase before coding

```text
1. sync if docs changed on a feature branch
2. ask "how does enable relate to continuous update?"
3. query continuous-update --hops 2   # expand if answer is thin
4. pack "..." if you want raw triples in a design note
5. Memtrace only when the plan touches existing modules
```

### C. PR / change review of docs + product story

```text
1. After merge to main, hook refreshes the graph
2. ask "what changed about answer grounding?"  # if written into docs/triples
3. For code risk: Memtrace get_evolution / get_impact
```

### D. Onboarding a new agent session

```text
1. status  (freshness)
2. ask 2–3 multi-hop questions about current goals/blockers
3. communities detect  (optional theme map — not per-question Q&A)
4. Then Memtrace list_communities / find_central_symbols for the code map
```

---

## 5. Agent protocol (copy-paste mental model)

```text
1. status / .last-sync-status.json  → graph healthy?
2. sync if corpus dirty and hook didn’t run
3. ask | query | pack               → relationship retrieval only
4. Answer ONLY from pack/citations; respect abstain
5. For code edit/delete/refactor    → Memtrace (find → impact → decision)
6. Never load full graph.v1.json as prompt context
7. Never treat graph.json / GRAPH_REPORT.md as SoT
```

**MCP (read by default):** `graph_status`, `graph_query`, `graph_pack`, `graph_answer`, `graph_review_list`  
**Writes gated:** `graph_build`, `graph_review_resolve`

How AI should leverage the graph:

```text
1. status / last-sync     → is the graph fresh?
2. sync (if needed)       → update from corpus
3. ask / pack / query     → retrieve subgraph for the question
4. answer only from pack  → cite triples; abstain if empty
```

Default answer path is **deterministic** (no API key). Optional LLM answers must still cite pack triple ids only (fail-closed).

---

## 6. Write corpus so the graph stays useful

Extraction is stronger when docs make relationships explicit:

```markdown
[[Phase 3]] --blocks--> [[Phase 4]]
[[Auth redesign]] --depends-on--> [[Session store]]
```

Free prose still extracts (weaker confidence: **EXTRACTED** > **INFERRED** > **AMBIGUOUS**). Budgeted pack drops weak triples first.

After large ontology/schema churn: `gsd-graph review list` → resolve → maybe `sync --full`.

---

## 7. Anti-patterns

| Don’t | Do instead |
|-------|------------|
| Multi-step install | `enable` |
| Grep 20 planning files for “blocked by” | `ask` |
| Use gsd-graph for call graphs | Memtrace / code graph |
| Use Memtrace for phase dependency narrative | gsd-graph |
| Expect feature-branch hooks | manual `sync` |
| Trust empty pack + invent edges | abstain is correct |
| Put whole graph in the prompt | pack / ask |
| Treat `graph.json` / `GRAPH_REPORT.md` as SoT | only `graph.v1.json` |
| Block the user on hook rebuilds | hooks are detached; never wait on them |

---

## One-screen summary

```text
enable once → hooks keep main fresh → status then ask

ask  = multi-hop Q&A with citations (default agent path)
query = term neighborhood / IR exploration
pack  = raw subgraph for custom reasoning
Memtrace = code symbols, impact, history

gsd-graph = project relationship brain (docs)
Memtrace  = code relationship brain (AST)
```

---

## CLI cheat sheet

| When | Command |
|------|---------|
| First-time setup | `gsd-graph enable` |
| Incremental refresh | `gsd-graph sync` |
| Force re-extract | `gsd-graph sync --full` |
| Question | `gsd-graph ask "…"` |
| Term search | `gsd-graph query <term>` |
| Path between ids | `gsd-graph path <fromId> <toId>` |
| Subgraph only | `gsd-graph pack "…"` |
| Health | `gsd-graph status` |
| Themes | `gsd-graph communities detect` |

Successful CLI commands print **JSON on stdout** (machine contract). Errors go to stderr with non-zero exit.
