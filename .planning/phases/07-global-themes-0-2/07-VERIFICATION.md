---
phase: 07-global-themes-0-2
verified: 2026-08-03T20:23:53Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 7: Global themes 0.2 Verification Report

**Phase Goal:** Users can discover corpus-level themes via community detection (v0.2.0)  
**Verified:** 2026-08-03T20:23:53Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Pure-TS label-propagation communities produce artifacts under the store without becoming SoT | ✓ VERIFIED | `src/pipeline/communities.ts` implements pure LPA (`projectCommunityEdges` → `labelPropagation` → `finalizeCommunities`); `writeCommunityArtifacts` only writes `communities/index.json` + `community-c_NNNN.md` under `confineUnderRoot`; no `graph.v1` write path. Test: `loads via loadGraphV1, writes index + community-*.md, leaves SoT unchanged` (triple set + content hash stable). No graphology/Louvain/Leiden deps. |
| 2 | Community/theme reports summarize clusters; LLM prose for reports is opt-in only | ✓ VERIFIED | `renderCommunityMarkdown` is deterministic (top nodes / predicates / members + non-authoritative header). No LLM imports/calls in communities pipeline or CLI `communities` commands. CHANGELOG: “Optional LLM community prose remains out of scope.” Tests assert `Non-authoritative theme report` + section headers. |
| 3 | Package version can ship as 0.2.0 with communities documented as the global-search differentiator | ✓ VERIFIED | `package.json` version `0.2.0`; description mentions community detection; CHANGELOG `## [0.2.0]` documents communities as global-search differentiator; README positions v0.2.0 global themes + CLI. Test: `package version is 0.2.0 (global themes milestone, D-07)`. |
| 4 | `detectCommunities` on synthetic two-clique graph returns exactly two communities of size ≥3 with correct partition | ✓ VERIFIED | Test: `returns two communities partitioning a* vs b* with c_NNNN ids` — pass. |
| 5 | Only EXTRACTED and INFERRED triples form undirected community edges; AMBIGUOUS bridges never merge cliques | ✓ VERIFIED | `isCommunityEdge` gates via `confidenceRank >= INFERRED`. Test: `AMBIGUOUS-only bridge does not merge the two cliques (D-03)` — pass. |
| 6 | Label propagation is pure TypeScript, max 20 iterations default, min community size 3 default, deterministic across two runs | ✓ VERIFIED | Constants `COMMUNITY_MAX_ITERATIONS=20`, `COMMUNITY_MIN_SIZE=3`; clamp caps at 20. Tests: constants export, max-iter clamp, `two consecutive runs deep-equal on communities` — pass. |
| 7 | Public façade exports `detectCommunities`, constants, and Community types with copyright headers on new sources | ✓ VERIFIED | `src/index.ts` re-exports API; live `require('./dist/index.js')` yields functions + constants; copyright header on `communities.ts` (asserted by test). |
| 8 | `detectCommunities` without injected graph loads SoT only via `loadGraphV1`; missing graph.v1 yields SCHEMA_INVALID | ✓ VERIFIED | Production path calls `loadGraphV1(storeRoot)` only. Test: `missing graph.v1 yields SCHEMA_INVALID (D-08)` — pass. |
| 9 | When write is true, `store/communities/index.json` and `community-c_NNNN.md` are written under `confineUnderRoot` | ✓ VERIFIED | `writeCommunityArtifacts` uses `confineUnderRoot` + `assertSafeCommunityId` (`/^c_\d{4}$/`). Store I/O test confirms paths and files exist. |
| 10 | `writeCommunityReports` rewrites markdown from last index.json or provided communities; fails clearly if index absent | ✓ VERIFIED | Tests: rewrite from index, missing index → SCHEMA_INVALID without mutating SoT, in-memory communities without LPA — all pass. |
| 11 | `gsd-graph communities detect` exits 0 with K22 JSON (`ok`, `community_count`, communities summary, `index_path`) | ✓ VERIFIED | CLI wired in `src/cli.ts` → `detectCommunities({ write: true, ... })` + `writeOk`. Test: `communities detect returns K22 JSON with ok, community_count, index_path` — pass (`community_count === 2`). |
| 12 | `gsd-graph communities report` rewrites markdown from index and prints JSON paths; missing index maps to non-zero GraphError exit | ✓ VERIFIED | CLI → `writeCommunityReports`. Tests: report after detect exit 0 with paths; report without detect non-zero — pass. |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/pipeline/communities.ts` | Pure-TS LPA + FS sidecars + reports | ✓ VERIFIED | ~733 lines; full pipeline; copyright header; no SoT mutation |
| `src/types.ts` | Community / DetectCommunities* / WriteCommunityReports* types | ✓ VERIFIED | Community types present (~L558+) |
| `src/index.ts` | Public re-exports | ✓ VERIFIED | detectCommunities, writeCommunityReports, constants exported |
| `tests/communities.test.ts` | Two-clique, filter, store I/O, reports | ✓ VERIFIED | Substantive suite; all green under `npm test` |
| `src/cli.ts` | Nested `communities detect\|report` | ✓ VERIFIED | Thin K22 adapters at ~L363–421 |
| `package.json` | version 0.2.0 | ✓ VERIFIED | `"version": "0.2.0"` |
| `CHANGELOG.md` | 0.2.0 communities release notes | ✓ VERIFIED | `## [0.2.0] - 2026-08-03` + global-search differentiator |
| `README.md` | CLI + product blurb for global themes | ✓ VERIFIED | v0.2.0 global themes pitch; detect/report docs; non-SoT honesty |
| `tests/cli-commands.test.ts` | communities detect/report smoke | ✓ VERIFIED | Nested describe blocks green |
| `tests/package-identity.test.ts` | version 0.2.0 gate | ✓ VERIFIED | asserts `pkg.version === '0.2.0'` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `detectCommunities({ graph })` | project → LPA → finalize | pure in-memory pipeline when write false | ✓ WIRED | L697–704 |
| `projectCommunityEdges` | `confidenceRank >= INFERRED` | `ids.ts` shared tier table | ✓ WIRED | `isCommunityEdge` |
| `finalizeCommunities` | `c_NNNN` + sha256 `stable_key` | size desc then min(memberId) asc | ✓ WIRED | L266–287 |
| `detectCommunities({ dir })` | `loadGraphV1(storeRoot)` | resolveStoreRoot then SoT only | ✓ WIRED | L680–682 |
| write path | `confineUnderRoot(..., communities/...)` | basenames from `c_NNNN` only | ✓ WIRED | L481–514 |
| `community-*.md` | non-authoritative header | `renderCommunityMarkdown` | ✓ WIRED | L421–425 |
| CLI `communities detect` | `detectCommunities({ write: true })` | thin adapter + `writeOk` | ✓ WIRED | cli.ts L377–405 |
| CLI `communities report` | `writeCommunityReports` | thin adapter + `mapCliError` path | ✓ WIRED | cli.ts L415–420 |
| `package.json` version | engine stamp consumers | version 0.2.0 live | ✓ WIRED | package-identity test + live require |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `detectCommunities` | `communities[]` | LPA over `graph.triples` (injected or `loadGraphV1`) | Yes — members from projected EXTRACTED\|INFERRED edges | ✓ FLOWING |
| `writeCommunityArtifacts` | `index.json` / markdown | `Community[]` from detect result | Yes — full Community objects + deterministic template | ✓ FLOWING |
| CLI detect JSON | `community_count`, summaries | library result fields | Yes — not hardcoded empty | ✓ FLOWING |
| CLI report JSON | `index_path`, `report_paths` | `writeCommunityReports` return | Yes — real paths under store | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite green | `npm test` | 311 pass / 0 fail | ✓ PASS |
| Production build | `npm run build` | `tsc -p tsconfig.build.json` exit 0 | ✓ PASS |
| Package version | `node -e "require('./package.json').version"` | `0.2.0` | ✓ PASS |
| Public exports | `require('./dist/index.js')` | detectCommunities/writeCommunityReports functions; maxIter=20; minSize=3; DIR=communities | ✓ PASS |
| Two-clique + SoT + CLI communities | named tests inside `npm test` | all communities.* + cli-commands communities.* green | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No phase-declared `scripts/**/probe-*.sh` | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| COM-01 | 07-01, 07-02, 07-03 | Community detection (label propagation) and community/theme reports | ✓ SATISFIED | Library LPA + store sidecars + CLI detect/report + 0.2.0 docs; REQUIREMENTS maps COM-01 → Phase 7 Complete |

No orphaned Phase 7 requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in phase-touched sources | — | — |

Notes (info only, not gaps):
- CLI `--help` for nested commands surfaces as K22 `{ok:false,reason:usage}` JSON — pre-existing CLI honesty pattern, not a Phase 7 regression (detect/report functional paths tested).
- No graphology / ngraph / Louvain / Leiden dependencies in `package.json`.

### Human Verification Required

None. All roadmap success criteria and plan must-haves have automated proof. Optional visual polish of `community-*.md` on a real corpus is non-blocking per `07-VALIDATION.md` and is already content-asserted in unit tests.

### Gaps Summary

No gaps. Phase goal achieved:

1. Pure-TS label propagation writes disposable `communities/` artifacts and never becomes SoT.
2. Theme reports are deterministic cluster summaries with non-authoritative headers; LLM community prose is not on the default path (out of scope for 0.2.0).
3. Package is shippable as **0.2.0** with CHANGELOG + README documenting communities as the global-search differentiator and CLI `communities detect|report` wired.

---

_Verified: 2026-08-03T20:23:53Z_  
_Verifier: Claude (gsd-verifier)_
