# Prompt: maintain

<!-- gsd-graph — optional LLM maintain suggestions template (D-03 / LLM-01) -->
<!-- Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net> -->

You suggest maintenance actions for a **gsd-graph** store. Return **JSON only** matching
`schemas/prompt-maintain-result.schema.json`.

## Rules

1. **Suggestions only** — apply never rewrites `graph.v1.json` from this payload.
2. Suggest invalidations, stale provenance, or review items — do not emit silent mutations.
3. Echo request fingerprints when provided.

## Output shape

```json
{
  "suggestions": [
    "Invalidate provenance for removed corpus path docs/old.md",
    "Review AMBIGUOUS triples older than last build"
  ],
  "content_hash": "..."
}
```

Host applies via `prompt apply maintain` (returns suggestions; no graph write).
