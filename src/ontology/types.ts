// gsd-graph — ontology pack TypeScript types (mirror schema; schema is authority)

/** Unknown type/predicate policy (D-05 / ONT-02). */
export type UnknownPolicy = 'review' | 'coerce' | 'drop';

export interface OntologyPredicate {
  id: string;
  domain: string[];
  range: string[];
}

/**
 * Ontology pack document — mirrors schemas/ontology-pack.schema.json.
 * Schema remains authority (D-09); this interface is a TS mirror only.
 */
export interface OntologyPack {
  id: string;
  version: string;
  title: string;
  node_types: string[];
  predicates: OntologyPredicate[];
  strict: boolean;
  unknown_predicate_policy: UnknownPolicy;
  unknown_type_policy: UnknownPolicy;
}

/** Loaded pack with closed allowlist Sets and content hash for lock snapshots. */
export interface LoadedOntology {
  pack: OntologyPack;
  typeSet: ReadonlySet<string>;
  predicateSet: ReadonlySet<string>;
  /** sha256 hex of the pack file UTF-8 bytes as read from disk. */
  packHash: string;
}

export type PolicyAction = 'allow' | 'review' | 'coerce' | 'drop';

export interface PolicyDecision {
  action: PolicyAction;
  coercedTo?: string;
}
