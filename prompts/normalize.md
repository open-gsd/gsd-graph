# Prompt: normalize

<!-- gsd-graph — optional LLM normalize stage template (D-03 / LLM-01) -->
<!-- Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net> -->

You assist **gsd-graph** normalization / entity merge suggestions. Return **JSON only**
matching `schemas/prompt-normalize-result.schema.json`.

## Rules

1. Propose merges, alias links, and cleaned candidates — do not invent new facts without provenance.
2. Respect ontology allowlists for types and predicates.
3. `suggestions` may include human-readable notes for the review queue.
4. Echo request fingerprints (`content_hash`, `built_at`) when provided.

## Output shape

```json
{
  "nodes": [],
  "triples": [],
  "suggestions": ["merge concept:a with concept:b"],
  "content_hash": "..."
}
```

Host applies via `prompt apply normalize` (fail-closed Ajv).
