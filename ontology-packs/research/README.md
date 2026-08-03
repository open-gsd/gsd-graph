# research ontology pack

Example **replace-only** research literature pack for `@opengsd/gsd-graph`.

- Closed allowlists for papers, authors, methods, datasets, and claims (DESIGN research pack).
- Domain predicates: `cites`, `evaluates`, `uses_method`, plus practical baselines (`related_to`, `authored`, `about`, `supports`, `contradicts`, `same_as`).
- Default unknown type/predicate policy: **`review`** (do not write unknowns).
- **v0.1 is replace-only:** copy this pack and point config/`packIdOrPath` at the copy. Pack composition via `extends` is not supported (ONT-03 / D-09).

## Customize

1. Copy `ontology.json` to your project (for example `./ontology/my-research.json`).
2. Edit `id`, `title`, `node_types`, and `predicates` as needed.
3. Load with `loadOntologyPack({ packIdOrPath: './ontology/my-research.json' })` or the future CLI `--ontology` path.

Do **not** add an `extends` field — the loader rejects pack composition in v0.1.
