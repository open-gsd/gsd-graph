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
  ReviewKind,
  ReviewItemDecision,
  ReviewItem,
  ReviewDecisionRecord,
  ReviewQueueDocument,
  BuildOptions,
  BuildResult,
  StatusResult,
  StatusOptions,
  SourcesManifest,
  SourceManifestEntry,
  QueryIR,
  QueryPath,
  QueryOptions,
  QueryResult,
  SnapshotSaveOptions,
  SnapshotRestoreOptions,
  SnapshotListOptions,
  SnapshotResult,
  SnapshotInfo,
  DiffOptions,
  DiffResult,
  RepairOptions,
  RepairResult,
  InitOptions,
  InitResult,
} from './types';

export {
  validateGraphV1,
  validateOntologyPack,
  validateReviewQueue,
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
  confidenceRank,
  stableStringify,
  reviewItemId,
} from './pipeline/ids';

// Query IR (03-01 / QRY-01 / QRY-02)
export {
  query,
  buildAdjacencyMap,
  findShortestPath,
  matchTermSeeds,
  expandHops,
  seedAndExpand,
  filterGraph,
  applyBudget,
  MAX_QUERY_DEPTH,
  DEFAULT_PATH_MAX_DEPTH,
  DEFAULT_SEED_HOPS,
  DEFAULT_NEIGHBORHOOD_HOPS,
} from './pipeline/query';
export type { AdjacencyEdge, AdjacencyMap } from './pipeline/query';

export { fingerprintFile } from './sources/fingerprint';
export { extractMarkdown } from './sources/markdown';
export { extractJsonl } from './sources/jsonl';
export { extractByPath } from './pipeline/extract';
export type { ExtractByPathOptions } from './pipeline/extract';
export { redactSecrets } from './sources/redact';
export { discoverSources, DEFAULT_MAX_BYTES } from './sources/discover';
export type {
  DiscoverSourcesOptions,
  DiscoverSourcesResult,
} from './sources/discover';

// Normalize + review (02-03)
export { normalize } from './pipeline/normalize';
export type {
  NormalizeInput,
  NormalizeOutput,
} from './pipeline/normalize';

export {
  emptyReviewQueue,
  loadReviewQueue,
  mergeReviewItems,
  reviewResolve,
} from './pipeline/review';
export type { ReviewResolveOptions } from './pipeline/review';

// Build orchestrator + status (02-04)
export { build, assertGraphCaps, MAX_NODES, MAX_TRIPLES } from './pipeline/build';
export { status } from './pipeline/status';

// Maintain invalidation (03-02 / MNT-01)
export {
  invalidateProvenance,
  maintain,
  normPathKey,
} from './pipeline/maintain';

// Projection helper (03-02 / REP-01 prep / D-09)
export { projectGraph } from './pipeline/project';
export type { GraphProjection, ProjectionEdge } from './pipeline/project';

// Snapshots (03-03 / SNAP-01)
export {
  snapshotSave,
  snapshotList,
  snapshotRestore,
  sanitizeSnapshotName,
  resolveNamedSnapshot,
  SNAP_DIR,
  LAST_DIFF_BASE,
} from './pipeline/snapshot';

// Diff (03-04 / DIFF-01)
export { diff, resolveBaseline } from './pipeline/diff';

// Repair (03-04 / REP-01)
export { repair } from './pipeline/repair';

// Init (04-01 / CLI-03)
export { init } from './pipeline/init';
