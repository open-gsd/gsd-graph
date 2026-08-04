# Token Savings Benchmark Estimate

**Status:** preliminary estimate, not a production benchmark

**Measured:** 2026-08-04

**Scope:** retrieval input context for `gsd-graph pack`; output-generation tokens are excluded

## Executive estimate

For answerable relationship queries in this repository, graph packs reduced the
estimated retrieval context by **99.3–99.8% compared with loading the full source
corpus**. Compared with reading two to five average-sized project documents, the
estimated reduction is **about 70–95%**.

A reasonable working estimate for agent workflows is:

- **90–99% less retrieved input context** for answerable graph queries.
- **30–70% lower total input-token use** when retrieval context accounts for a
  substantial share of the prompt.
- **Little or no savings** for simple tasks already confined to one small file.

These ranges are hypotheses to validate against session-level baselines. They
should not be presented as measured model-billing reductions.

## Benchmark snapshot

The local graph was built from the repository's planning and documentation
corpus.

| Measurement | Value |
| --- | ---: |
| Source files | 99 |
| Source bytes | 1,113,282 |
| Estimated source tokens | 278,321 |
| Graph nodes | 1,807 |
| Graph triples | 332 |
| Estimated full-graph tokens, compact JSON | 146,570 |

Token estimates use the engine's current approximation:
`ceil(serialized_characters / 4)`. This is intentionally comparable with the
budget implementation, but it is not a provider-specific tokenizer.

## Query results

The table reports the complete serialized pack, including nodes, triples, paths,
and citations. No explicit budget was applied.

| Question | Nodes | Triples | Paths | Estimated pack tokens | Reduction vs corpus |
| --- | ---: | ---: | ---: | ---: | ---: |
| Why is phase 4 blocked by phase 3? | 6 | 2 | 0 | 1,821 | 99.35% |
| How does `packSubgraph` use query? | 6 | 1 | 0 | 564 | 99.80% |
| What requirements depend on Phase 5? | 6 | 2 | 1 | 1,125 | 99.60% |
| How are graph answers grounded with citations? | 0 | 0 | 0 | 90 | Abstained |
| What changed in global themes 0.2? | 6 | 3 | 1 | 836 | 99.70% |

The four answerable queries used **564–1,821 estimated tokens**, averaging
**1,087** and with a median of **981**. The abstaining query is excluded from
savings claims because it returned no supporting relationships.

## What the estimate means

### Full-corpus comparison

The observed answerable packs were 0.20–0.65% of the estimated full source
corpus. This produces the 99.3–99.8% retrieval-context reduction.

Loading the complete graph would itself reduce compact serialized context by
about 47% versus the source corpus, but that is not the intended query path. The
large reduction comes from seed selection, bounded traversal, and subgraph
packing—not merely converting documents into graph JSON.

### Targeted-document proxy

An average source document in this snapshot is approximately 2,811 estimated
tokens. Reading two to five average documents would therefore cost roughly
5,600–14,100 tokens. Against that proxy, the observed packs save approximately
68–96%, rounded to **70–95%** in the executive estimate.

This is not yet a direct comparison with lexical search, vector RAG, or an agent
using `rg`; those baselines must be measured separately.

### Total workflow estimate

Graph retrieval does not reduce every token in an agent run. A simple model is:

```text
total input savings = retrieval share of prompt × retrieval reduction
```

If retrieval represents 40–80% of input context and graph packs reduce that
portion by about 90%, total input-token savings would be approximately 36–72%.
That supports the provisional **30–70%** workflow range.

## Budget caveat

The current token budget is enforced against `{ nodes, triples }`, while the
returned pack also contains paths and citations. In this sample, complete packs
were **11–57% larger** than their budgeted subgraph estimate.

Small budgets can also remove every triple. A 500-token budget caused two sample
questions to abstain; a 1,000-token budget still caused one to abstain. A lower
token count is not a saving when it removes the evidence needed to answer.

Before treating `--budget` as a hard model-context limit, budgeting should count
the final serialized pack or use the target model's tokenizer.

## Cost boundaries

- Default graph construction and deterministic answering are offline, so they
  consume no model tokens.
- Optional LLM extraction or answer generation adds model input and output costs.
- The estimate covers retrieved input context only; it does not claim shorter
  answers or lower wall-clock latency.
- Graph quality controls usefulness. Missing relationships can produce a cheap
  abstention rather than a useful answer.

## Recommended external claim

Until broader benchmarks exist, use qualified language:

> Early repository measurements show 90–99% retrieval-context reduction for
> answerable relationship queries. We estimate 30–70% total input-token savings
> in retrieval-heavy agent workflows.

Always label these numbers as preliminary estimates and link to this methodology.

## Next benchmark

For a publishable claim, replay at least 30 representative tasks through three
matched paths:

1. No graph: agent reads files using normal repository search.
2. Chunk retrieval: fixed top-k lexical or vector chunks.
3. Graph retrieval: `packSubgraph` with identical task questions.

Record actual tokenizer counts, answer correctness, citation coverage,
abstention rate, latency, and total session input/output tokens. Report savings
only for quality-matched answers.
