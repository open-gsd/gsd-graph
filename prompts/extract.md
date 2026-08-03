# Prompt: extract

<!-- gsd-graph — optional LLM extract stage template (D-03 / LLM-01) -->
<!-- Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net> -->

You assist **gsd-graph** extraction. Return **JSON only** matching
`schemas/prompt-extract-result.schema.json`.

## Rules

1. Emit candidate `nodes` and `triples` constrained to the active ontology pack allowlists.
2. Prefer quote-backed claims; default confidence `INFERRED` unless a span is verified → `EXTRACTED`.
3. Never invent types or predicates outside the pack.
4. Include request `content_hash` / `built_at` fingerprints when present in the request bundle.
5. Fail closed: if unsure, omit the triple rather than guessing.

## Output shape

```json
{
  "nodes": [{ "id": "...", "type": "...", "label": "..." }],
  "triples": [{
    "id": "...",
    "s": "...",
    "p": "...",
    "o": "...",
    "confidence": "INFERRED",
    "provenance": [{
      "source_path": "...",
      "extractor": "llm/extract",
      "content_hash": "...",
      "confidence": "INFERRED"
    }]
  }],
  "content_hash": "..."
}
```

Write the result to `.prompt-extract-result.json` under the store (host applies via `prompt apply extract`).
