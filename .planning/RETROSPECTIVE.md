# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.2.0 — Global Themes

**Shipped:** 2026-08-16 (built 2026-08-02 → 2026-08-05)
**Phases:** 7 | **Plans:** 25 | **Tasks:** 61

### What Was Built
- Installable `@opengsd/gsd-graph` package (CJS + types) with a validated, replace-only ontology contract and a realpath-confined, lock-serialized file store
- Full build pipeline: deterministic Markdown/JSONL extract → multiset provenance normalize → review queue → published `graph.v1.json`
- Multi-hop Query IR (term/path/neighborhood/filter), incremental maintain (M1–M5 invalidation), snapshots, diff, and repair
- `gsd-graph` CLI with a machine-readable JSON contract (K22 exit codes) covering the full library surface
- `packSubgraph` + deterministic `answer()` grounding with triple citations and honest abstain on empty packs; offline goldens proved 0.1.0-releasable
- Optional LLM providers (`none`/`prompt`/`http`, fail-closed), MCP read-tool server, minimal report writer, and example ontology packs
- Pure-TS label-propagation community detection with disposable `communities/` sidecars and theme reports (v0.2.0)

### What Worked
- Verification-gated phases (VERIFICATION.md with a must-haves score) caught issues before moving on — every one of the 7 phases finished at 100% (5/5, 4/4, 4/4, 9/9, 14/14, 12/12, 5/5)
- Keeping communities/projections strictly disposable (never SoT) avoided a whole class of consistency bugs during the store/query phases
- Deterministic, offline-first goldens (G0/G1) gave a real regression signal without needing API keys or network in CI

### What Was Inefficient
- The milestone-close readiness tooling (`init.manager` plan/summary counting) had a false-negative bug: `PLAN-CHECK.md` files were being counted as plan files, making every phase look incomplete even though all `VERIFICATION.md` reports showed `status: passed`. Worth a fix upstream in gsd-core's plan-counting glob.
- `.planning/config.json` carried an unrecognized `gsd_graph` key throughout the milestone, producing a warning on every `gsd-tools.cjs` invocation — harmless but noisy.

### Patterns Established
- Multiset provenance + `best_tier` scoring as the standard way to reconcile conflicting extraction evidence per triple
- Thin CLI adapters over already-tested library exports (Phase 4/5 pattern) kept the CLI surface low-risk to add
- Sidecar artifacts (projection, reports, communities) are always regenerable from `graph.v1` and never authoritative

### Key Lessons
1. When an automated readiness gate disagrees with the actual artifact contents (e.g. VERIFICATION.md), check the raw files before trusting the gate — a counting bug can produce a convincing false negative.
2. Locking file-store mutations under a single `.build.lock` scaled cleanly across build, maintain, snapshot, and repair without needing per-operation locks.
3. Deferring NL→query, ontology inheritance, and Neo4j export out of scope kept v0.1/v0.2 focused; they're now explicitly tracked (QRY-03, ONT-05, EXP-01) for a future milestone rather than silently forgotten.

### Cost Observations
- Sessions: milestone built across a small number of focused sessions over 3 calendar days (2026-08-02 → 2026-08-05)
- Notable: 177 commits / 267 files / ~61k insertions delivered a fully offline, dependency-light TypeScript library — no infra cost, no LLM cost on the default path

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.2.0 | — | 7 | First milestone; established verification-gated phase workflow |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v0.2.0 | 311/311 | — | Pure-TS label propagation (no clustering lib dependency) |

### Top Lessons (Verified Across Milestones)

1. Verification-gated phases (must-haves score in VERIFICATION.md) are a reliable completeness signal — trust the artifact over a buggy counting tool.
2. Keep derived/sidecar data (projections, reports, communities) strictly non-authoritative; regenerate from the single source of truth.
