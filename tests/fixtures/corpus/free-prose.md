# Free Prose Honesty Seed

This note is intentionally unstructured narrative. It talks about causal-sounding
relationships in natural language only — no wiki links, no edge lines, and no
JSON field maps — so offline extract must not invent typed multi-hop edges.

When rainfall increases, soil moisture often rises, which in many regions seems
to cause higher crop yields. Farmers argue that fertilizer supports growth and
that drought contradicts optimistic forecasts. Logistics teams say shipping
delays precede stockouts, and ops depends on those forecasts for staffing.

None of the sentences above are structured edge grammar. A GraphRAG-style system
might infer causes or depends_on chains from this prose, but gsd-graph Phase 2
extract must remain honest offline: free prose alone yields no EXTRACTED
triples with predicates causes, supports, contradicts, precedes, or depends_on.
