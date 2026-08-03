# engineering ontology pack

Example **replace-only** engineering systems pack for `@opengsd/gsd-graph`.

- Closed allowlists for services, APIs, incidents, decisions, and changes (DESIGN engineering pack).
- Domain predicates: `depends_on`, `owns`, `mitigates`, `deploys`, plus practical baselines (`related_to`, `causes`, `about`, `part_of`, `same_as`).
- Default unknown type/predicate policy: **`review`** (do not write unknowns).
- **v0.1 is replace-only:** copy this pack and point config/`packIdOrPath` at the copy. Pack composition via `extends` is not supported (ONT-03 / D-09).

## Customize

1. Copy `ontology.json` to your project (for example `./ontology/my-engineering.json`).
2. Edit `id`, `title`, `node_types`, and `predicates` as needed.
3. Load with `loadOntologyPack({ packIdOrPath: './ontology/my-engineering.json' })` or the future CLI `--ontology` path.

Do **not** add an `extends` field — the loader rejects pack composition in v0.1.
