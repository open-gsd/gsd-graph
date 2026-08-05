// gsd-graph — public library façade

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
  ProjectSyncOptions,
  ProjectSyncResult,
  Community,
  DetectCommunitiesOptions,
  DetectCommunitiesResult,
  WriteCommunityReportsOptions,
  WriteCommunityReportsResult,
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

export {
  CURRENT_GRAPH_SCHEMA_VERSION,
  registerGraphMigration,
  listGraphMigrations,
  migrateGraphDocument,
} from './io/migrations';
export type { GraphMigration, MigrateGraphResult } from './io/migrations';

export { loadGraphV1Cached, clearGraphV1Cache } from './io/graph-cache';

export { GsdGraph } from './facade';
export type { GsdGraphOpenOptions } from './facade';

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
export {
  extractYaml,
  parseFlatYaml,
  splitFrontmatter,
  YAML_RELATIONAL_KEYS,
} from './sources/yaml';
export type {
  FlatYamlEntry,
  ParseFlatYamlResult,
  YamlExtractOptions,
} from './sources/yaml';
export { extractByPath } from './pipeline/extract';
export type { ExtractByPathOptions } from './pipeline/extract';
export {
  registerExtractor,
  extractorForExtension,
  listExtractors,
  registeredExtensions,
} from './pipeline/extractors';
export type {
  Extractor,
  RegisterExtractorOptions,
} from './pipeline/extractors';
export { redactSecrets } from './sources/redact';
export { discoverSources, DEFAULT_MAX_BYTES } from './sources/discover';
export type {
  DiscoverSourcesOptions,
  DiscoverSourcesResult,
} from './sources/discover';

// Normalize + review (02-03)
export { normalize, DIRECTIONAL_PREDICATES } from './pipeline/normalize';
export { supersede } from './pipeline/supersede';
export type { SupersedeOptions, SupersedeResult } from './pipeline/supersede';

// Agent/user write path — assert/retract + episode replay
export {
  assertFact,
  retractFact,
  loadEpisodeCandidates,
  EPISODES_BASENAME,
} from './pipeline/assert';
export type {
  AssertFactOptions,
  AssertFactResult,
  RetractFactOptions,
  RetractFactResult,
  EpisodeRecord,
  EpisodeCandidates,
} from './pipeline/assert';
export type {
  NormalizeInput,
  NormalizeOutput,
} from './pipeline/normalize';

export {
  emptyReviewQueue,
  loadReviewQueue,
  mergeReviewItems,
  reviewResolve,
  reviewResolveBatch,
} from './pipeline/review';
export type {
  ReviewResolveOptions,
  ReviewResolveBatchOptions,
  ReviewResolveBatchResult,
} from './pipeline/review';

// Build orchestrator + status (02-04)
export {
  build,
  mergeCandidates,
  assertGraphCaps,
  MAX_NODES,
  MAX_TRIPLES,
} from './pipeline/build';
export type {
  MergeCandidatesOptions,
  MergeCandidatesResult,
} from './pipeline/build';
export { status } from './pipeline/status';

// Project sync — brownfield + continuous update
export {
  projectSync,
  resolveProjectCorpus,
  readPlanningGraphConfig,
  readGraphProjectConfig,
  DEFAULT_PROJECT_CORPUS_DIRS,
  DEFAULT_PROJECT_CORPUS_FILES,
} from './pipeline/project-sync';
export type { GraphProjectConfig } from './pipeline/project-sync';

// One-shot enable
export {
  enable,
  installSkill,
  installHooks,
  writeEnableConfig,
  resolvePackageRoot,
} from './pipeline/enable';

// CLI progress helper (library-safe; no-op without TTY)
export { createCliSpinner, withSpinner } from './cli/spinner';
export type { CliSpinner, ProgressReporter } from './cli/spinner';
export { printEnableWrapup, printSyncWrapup } from './cli/summary';
export {
  readPackageMeta,
  getVersionInfo,
  selfUpdate,
  detectInstallKind,
  fetchLatestVersion,
} from './cli/self-update';
export type {
  PackageMeta,
  VersionInfo,
  UpdateResult,
  InstallKind,
} from './cli/self-update';
export {
  mcpInstall,
  mcpDoctor,
  resolveMcpLaunch,
  resolveMcpStoreDir,
  upsertCodexMcpServer,
} from './cli/mcp-install';
export type {
  McpHostId,
  McpInstallResult,
  McpDoctorResult,
  McpLaunch,
} from './cli/mcp-install';

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

// Export projections + why explanations (disposable, never SoT)
export {
  exportGraph,
  isExportFormat,
  renderMermaid,
  renderGraphml,
  renderCypher,
  renderHtml,
} from './pipeline/export';
export type {
  ExportFormat,
  ExportOptions,
  ExportResult,
} from './pipeline/export';

export { why, resolveNodeTerm } from './pipeline/why';
export type { WhyOptions, WhyResult, WhyCitation } from './pipeline/why';

// Init (04-01 / CLI-03)
export { init } from './pipeline/init';

// Pack / grounded subgraph (05-01 / PACK-01)
export {
  packSubgraph,
  PACK_STOPWORDS,
  tokenizeQuestion,
  scoreSeeds,
  singularizeToken,
  tokenVariants,
  suggestSeeds,
  packRelevanceScore,
} from './pipeline/pack';

// Deterministic grounded answer (05-02 / ANS-01 / ANS-02)
export {
  answer,
  answerHttp,
  formatDeterministicMarkdown,
  OVERVIEW_QUESTION_RE,
} from './pipeline/answer';
export type { AnswerHttpOptions } from './pipeline/answer';

// Minimal GRAPH_REPORT from published v1 (06-03 / RPT-01 / D-08)
export { writeGraphReport } from './pipeline/report';
export type {
  WriteGraphReportOptions,
  WriteGraphReportResult,
} from './pipeline/report';

// Community detection LPA + disposable communities/ artifacts (07 / COM-01 / D-01..D-05, D-08)
export {
  detectCommunities,
  writeCommunityReports,
  writeCommunityArtifacts,
  renderCommunityMarkdown,
  loadCommunityIndex,
  projectCommunityEdges,
  labelPropagation,
  finalizeCommunities,
  isCommunityEdge,
  COMMUNITY_MAX_ITERATIONS,
  COMMUNITY_MIN_SIZE,
  COMMUNITIES_DIR,
} from './pipeline/communities';
export type {
  CommunityProjection,
  LabelPropagationResult,
  CommunityIndexDocument,
  CommunityWriteMeta,
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
  defaultApiKeyEnv,
} from './llm/http-client';
export type {
  HttpChatCompletionOptions,
  HttpChatCompletionResult,
  LlmHttpProvider,
} from './llm/http-client';

export {
  collectLlmSources,
  sanitizeExtractCandidates,
  llmExtractHttp,
  writeExtractPromptRequest,
  buildExtractSystemPrompt,
  LLM_EXTRACT_MAX_SOURCES,
  LLM_EXTRACT_MAX_SOURCE_BYTES,
} from './llm/extract';
export type {
  LlmSourceFile,
  CollectLlmSourcesResult,
  SanitizedCandidates,
  LlmExtractHttpOptions,
  LlmExtractHttpResult,
  WriteExtractRequestOptions,
  WriteExtractRequestOutput,
} from './llm/extract';

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
