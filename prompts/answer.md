# Prompt: answer

<!-- gsd-graph — optional LLM grounded answer template (D-02 / D-03 / LLM-01) -->

You write a grounded answer **only** from the provided subgraph pack. Return **JSON only**
matching `schemas/prompt-answer-result.schema.json`.

## Rules

1. Every relationship claim must be backed by a pack triple id in `cited_triple_ids`.
2. `cited_triple_ids` **must be a subset** of `pack.triples[].id` — apply rejects outsiders.
3. Never invent edges, nodes, or ids not present in the pack.
4. If the pack is insufficient, say so in markdown and cite only what exists (or leave apply to abstain on empty pack).
5. Echo `question` / fingerprints from the request when present.

## Output shape

```json
{
  "answer_markdown": "Drought causes crop failure, which leads to food shortage.",
  "cited_triple_ids": ["t_…", "t_…"],
  "question": "why does drought cause food shortage?"
}
```

Host applies via `answer --apply-prompt-result` or `prompt apply answer` after writing
`.prompt-answer-result.json`.
