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
  PackCitation,
  SubgraphPack,
  PackOptions,
  GroundedAnswer,
  AnswerOptions,
  LlmMode,
  PromptStage,
  PromptAnswerResult,
  PromptExtractResult,
  PromptNormalizeResult,
  PromptMaintainResult,
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
  Community,
  DetectCommunitiesOptions,
  DetectCommunitiesResult,
} from './types';

export {
  validateGraphV1,
  validateOntologyPack,
  validateReviewQueue,
  validatePromptAnswerResult,
  validatePromptExtractResult,
  validatePromptNormalizeResult,
  validatePromptMaintainResult,
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

// Pack / grounded subgraph (05-01 / PACK-01)
export { packSubgraph, PACK_STOPWORDS, tokenizeQuestion, scoreSeeds } from './pipeline/pack';

// Deterministic grounded answer (05-02 / ANS-01 / ANS-02)
export { answer, answerHttp, formatDeterministicMarkdown } from './pipeline/answer';
export type { AnswerHttpOptions } from './pipeline/answer';

// Minimal GRAPH_REPORT from published v1 (06-03 / RPT-01 / D-08)
export { writeGraphReport } from './pipeline/report';
export type {
  WriteGraphReportOptions,
  WriteGraphReportResult,
} from './pipeline/report';

// Community detection LPA (07-01 / COM-01 / D-01..D-03)
export {
  detectCommunities,
  projectCommunityEdges,
  labelPropagation,
  finalizeCommunities,
  isCommunityEdge,
  COMMUNITY_MAX_ITERATIONS,
  COMMUNITY_MIN_SIZE,
} from './pipeline/communities';
export type {
  CommunityProjection,
  LabelPropagationResult,
} from './pipeline/communities';

// Optional LLM providers (06-01 / LLM-01 / D-01..D-05)
export {
  assertCitationsInPack,
  promptApply,
  promptApplyAnswer,
} from './llm/apply';
export type {
  PromptApplyOptions,
  PromptApplyResult,
  PromptApplyAnswerInput,
  PromptApplyAnswerOutput,
} from './llm/apply';

export { resolveLlmMode } from './llm/provider';
export type { ResolveLlmModeInput } from './llm/provider';

export {
  httpChatCompletion,
  parseHttpPromptResultJson,
} from './llm/http-client';
export type {
  HttpChatCompletionOptions,
  HttpChatCompletionResult,
} from './llm/http-client';

export {
  writePromptRequest,
  readPromptResult,
  resolvePromptResultPath,
  promptRequestBasename,
  promptResultBasename,
  isPromptFileStage,
  requirePromptFileStage,
  assertSafePromptBasename,
} from './llm/prompt-files';
export type {
  PromptFileStage,
  PromptRequestEnvelope,
  WritePromptRequestOptions,
  WritePromptRequestResult,
  ReadPromptResultOptions,
} from './llm/prompt-files';
