# Prompt: query (reserved)

<!-- gsd-graph — reserved NL→Query IR template; NOT applied in v0.1 (D-03) -->

## Status

**Reserved / documentation only.** Natural-language → Query IR application is **out of
scope for v0.1** (deferred). There is **no** `prompt apply query` path.

## Intended future use

Explain or draft a Query IR structure for a question — for human review only:

- seeds / terms
- hop depth
- path endpoints
- filters

Do **not** treat model output as executable query IR in this version.
Hosts must use structured CLI/MCP args (`query`, `path`, `pack`, `answer`) instead.
