# general ontology pack

Default **replace-only** general knowledge pack for `@opengsd/gsd-graph`.

- Closed allowlists of node types and predicates (DESIGN general pack).
- Default unknown type/predicate policy: **`review`** (do not write unknowns).
- **v0.1 is replace-only:** copy this pack and point config/`packIdOrPath` at the copy. Pack composition via `extends` is not supported (ONT-03 / D-05).

## Customize

1. Copy `ontology.json` to your project (for example `./ontology/my-domain.json`).
2. Edit `id`, `title`, `node_types`, and `predicates` as needed.
3. Load with `loadOntologyPack({ packIdOrPath: './ontology/my-domain.json' })` or the future CLI `--ontology` path.

Do **not** add an `extends` field — the loader rejects pack composition in v0.1.
