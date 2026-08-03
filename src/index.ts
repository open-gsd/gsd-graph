// gsd-graph — public library façade
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

export { GSD_GRAPH_REASON, GraphError } from './errors';
export type { GraphReasonCode } from './errors';

export type {
  NodeId,
  Confidence,
  ProvenanceSpan,
  ProvenanceEntry,
  GraphNode,
  Triple,
  GraphStats,
  GraphV1Document,
} from './types';

export {
  validateGraphV1,
  validateOntologyPack,
  formatAjvErrors,
} from './schema/validators';

export { loadOntologyPack } from './ontology/load-pack';
export type { LoadOntologyPackOptions } from './ontology/load-pack';

export { applyUnknownPolicy } from './ontology/policy';

export type {
  UnknownPolicy,
  OntologyPredicate,
  OntologyPack,
  LoadedOntology,
  PolicyAction,
  PolicyDecision,
} from './ontology/types';
