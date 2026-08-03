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
  ExtractDiagnostic,
  ExtractResult,
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

// Store IO (01-03)
export {
  DEFAULT_STORE_DIR,
  resolveStoreRoot,
  ensureStoreRoot,
  confineUnderRoot,
  storeFile,
} from './io/paths';
export type { ResolveStoreRootOptions, StoreBasename } from './io/paths';

export {
  DEFAULT_WRITE_PROJECTION,
  publishGraphFiles,
} from './io/atomic-publish';
export type { PublishPlan } from './io/atomic-publish';

export { loadGraphV1 } from './io/load-graph';

export { acquireBuildLock, STALE_MS } from './io/lock';
export type {
  BuildLockOwner,
  BuildLockPayload,
  LockHandle,
  AcquireBuildLockOptions,
} from './io/lock';

// Pipeline ids + sources (02-01)
export {
  slugifyLabel,
  nodeId,
  tripleId,
  bestTier,
  stableStringify,
  reviewItemId,
} from './pipeline/ids';

export { fingerprintFile } from './sources/fingerprint';
export { extractMarkdown } from './sources/markdown';
export { extractJsonl } from './sources/jsonl';
export { redactSecrets } from './sources/redact';
export { discoverSources, DEFAULT_MAX_BYTES } from './sources/discover';
export type {
  DiscoverSourcesOptions,
  DiscoverSourcesResult,
} from './sources/discover';
