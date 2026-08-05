// gsd-graph — shared public types mirroring graph.v1 schema (schema is authority)

/**
 * TypeScript mirrors of schemas/graph-v1.schema.json.
 * Schema remains the on-disk authority (D-09); these interfaces do not replace it.
 */

/** Opaque node identifier (string id in graph.v1). */
export type NodeId = string;

/** Triple / provenance confidence tier. */
export type Confidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface ProvenanceSpan {
  start_line?: number;
  end_line?: number;
}

export interface ProvenanceEntry {
  source_path: string;
  extractor: string;
  content_hash: string;
  confidence: Confidence;
  score?: number;
  span?: ProvenanceSpan;
}

export interface GraphNode {
  id: NodeId;
  type: string;
  label: string;
  description?: string;
  aliases?: string[];
}

/** Canonical triple fields mirror schema (s/p/o, not subject/predicate/object). */
export interface Triple {
  id: string;
  s: NodeId;
  p: string;
  o: NodeId;
  confidence: Confidence;
  score?: number;
  provenance: ProvenanceEntry[];
}

export interface GraphStats {
  node_count?: number;
  triple_count?: number;
}

/** Diagnostic from extract / discover stages (EXT-01/03). */
export interface ExtractDiagnostic {
  path: string;
  code: string;
  message: string;
}

/** Candidate nodes/triples from a single source extract (Phase 2). */
export interface ExtractResult {
  nodes: GraphNode[];
  triples: Triple[];
  diagnostics: ExtractDiagnostic[];
}

/** graph.v1 document — SoT shape for future store publish (01-03). */
export interface GraphV1Document {
  schema_version: 1;
  engine: 'gsd-graph';
  engine_version: string;
  ontology_pack_id: string;
  ontology_version: string;
  built_at: string;
  built_at_commit?: string | null;
  nodes: GraphNode[];
  triples: Triple[];
  communities?: unknown[];
  stats?: GraphStats;
}

// --- Review queue (REV-01 / D-08) — schema is authority ---

/** Review queue item kinds (DESIGN review queue table). */
export type ReviewKind =
  | 'entity_merge'
  | 'predicate_unknown'
  | 'type_unknown'
  | 'schema_drift';

/** Decision embedded on a resolved review item. */
export interface ReviewItemDecision {
  action: 'accept' | 'reject';
  at: string;
  extend_ontology?: boolean;
}

/** Single review-queue item (pending or resolved). */
export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string | null;
  payload: Record<string, unknown>;
  decision: ReviewItemDecision | null;
}

/** Append-only decision log entry on the queue document. */
export interface ReviewDecisionRecord {
  id: string;
  action: 'accept' | 'reject';
  at: string;
  extend_ontology?: boolean;
}

/** review-queue.json document (store sidecar; schema authority). */
export interface ReviewQueueDocument {
  schema_version: 1;
  items: ReviewItem[];
  decisions: ReviewDecisionRecord[];
}

// --- Build orchestrator + status (STAT-01 / EXT-03) ---

/** Options for the offline build() orchestrator (D-09). */
/** Optional human progress callback (CLI spinner; never writes stdout). */
export type GraphProgress = (message: string) => void;

export interface BuildOptions {
  /** Corpus root(s) to discover under. */
  corpus: string | string[];
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Ontology pack id or path (default `general`). */
  ontology?: string;
  /**
   * When false (default), skip extract for sources whose content_hash still
   * matches sources.manifest.json (D-04, EXT-03). When true, re-extract all.
   */
  full?: boolean;
  /** Dual-write projection; default DEFAULT_WRITE_PROJECTION (false). */
  writeProjection?: boolean;
  /**
   * When true, write disposable GRAPH_REPORT.md after successful publish (RPT-01).
   * Default false; when undefined, falls through to config.report.write_on_build.
   * Report failure is diagnostic-only and never fails the build (D-08, T-06-13).
   */
  writeReportOnBuild?: boolean;
  /** Optional discover globs (default md/txt/markdown/json/jsonl). */
  globs?: string[];
  /** Progress updates for long builds (CLI spinner on stderr). */
  onProgress?: GraphProgress;
  /**
   * Test-only hook: mutates normalized nodes/triples before caps + publish.
   * Used to exercise LIMIT_EXCEEDED without multi-GB fixtures.
   * @internal
   */
  _afterNormalize?: (state: {
    nodes: GraphNode[];
    triples: Triple[];
  }) => { nodes: GraphNode[]; triples: Triple[] };
}

/** Result of a successful build() (D-10). */
export interface BuildResult {
  store_dir: string;
  node_count: number;
  triple_count: number;
  review_pending: number;
  sources_total: number;
  sources_extracted: number;
  sources_skipped_fresh: number;
  diagnostics: ExtractDiagnostic[];
  engine: 'gsd-graph';
  engine_version: string;
  built_at: string;
}

/** Per-source fingerprint entry in sources.manifest.json (OQ-3, EXT-03). */
export interface SourceManifestEntry {
  content_hash: string;
  mtime_ms: number;
  bytes: number;
  last_extracted_at: string;
  extractor: string;
}

/** sources.manifest.json document (store sidecar). */
export interface SourcesManifest {
  schema_version: 1;
  sources: Record<string, SourceManifestEntry>;
}

/** status() read-path result (STAT-01, D-10). Never uses graph.json as SoT. */
export interface StatusResult {
  exists: boolean;
  store_dir: string;
  engine: 'gsd-graph';
  schema_version?: number;
  ontology_pack_id?: string;
  engine_version?: string;
  node_count?: number;
  triple_count?: number;
  /** Alias of triple_count for STAT-01 edge_count field. */
  edge_count?: number;
  last_build?: string;
  /** True when a manifest path is missing on disk or content_hash mismatches (if checked). */
  stale?: boolean;
  /** Hours since graph.v1 built_at (store-only freshness). */
  age_hours?: number;
  build_in_progress?: boolean;
  review_queue_count?: number;
  /** True when writeProjection was off / graph.json absent — projection is never SoT. */
  projection_stale?: boolean;
  last_build_status?: {
    status?: string;
    reason?: string;
    finished_at?: string;
    [key: string]: unknown;
  } | null;
  reason?: string | null;
}

/** Options for status() (STAT-01). */
export interface StatusOptions {
  /** Store directory override. */
  dir?: string;
  /**
   * Optional corpus root(s). When provided, re-fingerprint manifest paths
   * under those roots to set `stale` on hash mismatch / missing files.
   */
  corpus?: string | string[];
}

// --- Query IR (QRY-01 / QRY-02 / D-01) ---

/** Structured Query IR ops — no NL→IR in v0.1 (D-01, K10). */
export type QueryIR =
  | { op: 'seed_expand'; term: string; hops: number }
  | { op: 'path'; from: string; to: string; maxDepth: number }
  | { op: 'neighborhood'; id: string; hops: number }
  | {
      op: 'filter';
      types?: string[];
      predicates?: string[];
      confidenceMin?: Confidence;
    };

/** One materialized multi-hop path with directed triple predicates. */
export interface QueryPath {
  nodes: string[];
  predicates: string[];
}

/**
 * Ergonomic query bag (maps to QueryIR). Prefer structured fields only (D-01).
 * `graph` skips disk and never reads projection (D-04).
 */
export interface QueryOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** seed_expand term (id/label/alias substring, case-folded). */
  term?: string;
  /** Hop count for seed_expand (default 2) or neighborhood (default 1); clamped ≤16. */
  hops?: number;
  /**
   * Token budget for applyBudget: ceil(JSON.stringify({nodes,triples}).length/4).
   * null/undefined skips trim (QRY-02).
   */
  budget?: number | null;
  /** path op */
  path?: { from: string; to: string; maxDepth?: number };
  /** neighborhood seed node id */
  id?: string;
  /** filter: node types allowlist */
  types?: string[];
  /** filter: predicate allowlist */
  predicates?: string[];
  /** filter: minimum confidence tier (shared ranks with bestTier) */
  confidenceMin?: Confidence;
  /** In-memory graph for tests — skips loadGraphV1 (D-04). */
  graph?: GraphV1Document;
}

/** Result of query() after optional budget trim. */
export interface QueryResult {
  nodes: GraphNode[];
  triples: Triple[];
  paths: QueryPath[];
  seeds: string[];
  trimmed: string | null;
  budget_tokens: number | null;
}

// --- Snapshots (SNAP-01 / D-07) ---

/** Options for snapshotSave / snapshotRestore. */
export interface SnapshotSaveOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Logical snapshot name — sanitized; becomes suffix of fileName. */
  name: string;
}

/** Options for snapshotRestore (same shape as save). */
export type SnapshotRestoreOptions = SnapshotSaveOptions;

/** Options for snapshotList. */
export interface SnapshotListOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
}

/** Result of snapshotSave / snapshotRestore. */
export interface SnapshotResult {
  /** Logical sanitized name (e.g. pre-edit). */
  name: string;
  /** On-disk basename under snapshots/ (e.g. 2026-08-03T12-00-00.000Z-pre-edit.json). */
  fileName: string;
  /** Absolute path to the snapshot JSON file. */
  path: string;
}

/** One entry from snapshotList (newest first). */
export interface SnapshotInfo {
  /** Logical name parsed from fileName suffix. */
  name: string;
  /** On-disk basename under snapshots/. */
  fileName: string;
  /** Absolute path to the snapshot JSON file. */
  path: string;
  /** File mtime in ms since epoch (for sort/debug). */
  mtime_ms?: number;
  /** graph.v1 built_at if readable from snapshot body. */
  built_at?: string;
}

// --- Diff (DIFF-01 / D-08) ---

/** Options for diff() — current graph.v1 vs snapshot or last-diff-base. */
export interface DiffOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /**
   * Named snapshot (logical name or full fileName under snapshots/).
   * When omitted, uses snapshots/.last-diff-base.json (NO_BASELINE if missing).
   */
  snapshot?: string;
}

/** Id-set arithmetic result (DESIGN DiffResult; K25). */
export interface DiffResult {
  /** Baseline path or snapshot name used for comparison. */
  baseline: string;
  nodes: { added: string[]; removed: string[]; changed: string[] };
  triples: { added: string[]; removed: string[]; changed: string[] };
  counts: {
    nodes_added: number;
    nodes_removed: number;
    triples_added: number;
    triples_removed: number;
  };
}

// --- Repair (REP-01 / D-09) ---

/** Options for repair() — regenerate disposable projection from v1 only. */
export interface RepairOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /**
   * Always materializes graph.json when true (default true for repair).
   * Explicit false is ignored — repair's job is to write the projection.
   */
  writeProjection?: boolean;
}

/** Result of repair() after projecting graph.v1 → graph.json. */
export interface RepairResult {
  store_dir: string;
  node_count: number;
  triple_count: number;
  projection_written: true;
  reason: string;
}

// --- Init (CLI-03 / D-05) ---

/** Options for init() — create store layout + optional gitignore append. */
export interface InitOptions {
  /** Store directory override (absolute or relative to cwd). */
  dir?: string;
  /** Ontology pack id or path recorded in config (default: general). */
  ontology?: string;
  /** Working directory for relative resolution and .gitignore lookup. */
  cwd?: string;
}

/**
 * Result of init() — JSON-serializable for CLI stdout (K22).
 * `created` is true when the store root was newly created or config.json
 * was written on this call.
 */
export interface InitResult {
  store_dir: string;
  created: boolean;
  gitignore_appended: boolean;
  ontology: string;
}

// --- Project sync (brownfield + continuous update) ---

/** Options for projectSync() — init + build project corpus roots. */
export interface ProjectSyncOptions {
  /** Working directory (default process.cwd()). */
  cwd?: string;
  /** Store directory override. */
  dir?: string;
  /** Force full re-extract (default false = incremental). */
  full?: boolean;
  /** Explicit corpus roots; when omitted uses auto brownfield resolve. */
  corpus?: string[];
  /** Extra roots merged into auto resolve. */
  extraCorpus?: string[];
  /** Run communities detect after build (default: config gsd_graph.communities_on_sync). */
  communities?: boolean;
  /** Write GRAPH_REPORT after build (default: config gsd_graph.report_on_sync). */
  report?: boolean;
  /** Progress updates for long sync (CLI spinner on stderr). */
  onProgress?: GraphProgress;
}

/** Result of projectSync() — JSON-serializable for CLI/hooks. */
export interface ProjectSyncResult {
  store_dir: string;
  corpus: string[];
  init: InitResult;
  build: BuildResult;
  communities_written: boolean;
  report_written: boolean;
  full: boolean;
}

// --- Enable (one-shot install + full brownfield sync) ---

/** Options for enable() — skill, hooks, config, full sync. */
export interface EnableOptions {
  cwd?: string;
  dir?: string;
  /** Default true — write auto_update flags. */
  autoUpdate?: boolean;
  /** Default true — write GRAPH_REPORT on first sync. */
  report?: boolean;
  /** Default false — also run communities detect. */
  communities?: boolean;
  /** Skip corpus sync (install-only). */
  skipSync?: boolean;
  /** Override package root (skills/hooks source); auto-detected when omitted. */
  packageRoot?: string;
  /** Progress updates for long enable (CLI spinner on stderr). */
  onProgress?: GraphProgress;
  /**
   * Register MCP with Claude/Codex/Cursor + project .mcp.json.
   * Default false; CLI may pass true for interactive enable --mcp.
   */
  mcp?: boolean;
}

/** Result of enable() — JSON-serializable for CLI. */
export interface EnableResult {
  store_dir: string;
  skills_installed: string[];
  hooks_dir: string;
  store_config: string;
  planning_config: string | null;
  auto_update: boolean;
  sync: ProjectSyncResult | null;
  /** Present when enable ran MCP host registration. */
  mcp?: {
    store_dir: string;
    launch: { command: string; args: string[] };
    hosts: Array<{
      host: string;
      ok: boolean;
      action: string;
      path?: string;
      message: string;
    }>;
    next: string[];
  };
  next: {
    ask: string;
    sync: string;
    status: string;
    hook: string;
    mcp?: string;
  };
}

// --- Pack / grounded answer (PACK-01 / D-01 / D-02) ---

/** One citation projected from a remaining pack triple after budget. */
export interface PackCitation {
  triple_id: string;
  s: NodeId;
  p: string;
  o: NodeId;
  /** First provenance source_path when present. */
  source_path?: string;
}

/**
 * Result of packSubgraph — seeds, neighborhood union, paths, and citations
 * projected only from remaining triples (D-02).
 */
export interface SubgraphPack {
  question: string;
  /** Top-k seed node ids by score (score order; score 0 dropped). */
  seeds: string[];
  nodes: GraphNode[];
  triples: Triple[];
  /** Same shape as QueryPath. */
  paths: QueryPath[];
  citations: PackCitation[];
  trimmed: string | null;
  budget_tokens: number | null;
}

/** Options for packSubgraph (PACK-01). Prefer in-memory graph for tests (D-10). */
export interface PackOptions {
  /** Natural-language question to tokenize and score against nodes. */
  question: string;
  /** Store directory override (resolveStoreRoot) when graph is absent. */
  dir?: string;
  /** In-memory graph — skips loadGraphV1 (D-10). */
  graph?: GraphV1Document;
  /** Hop expansion depth (default DEFAULT_SEED_HOPS = 2). */
  hops?: number;
  /** Max seed count after scoring (default 5). */
  kSeeds?: number;
  /**
   * Token budget for applyBudget (ceil JSON length / 4).
   * null/undefined skips trim (QRY-02).
   */
  budget?: number | null;
}

// --- Optional LLM modes (LLM-01 / D-01) ---

/** LLM provider mode — never ambient; default none (D-01). */
export type LlmMode = 'none' | 'prompt' | 'http';

/** Prompt pipeline stage names (D-03). query is reserved — no apply in v0.1. */
export type PromptStage =
  | 'extract'
  | 'normalize'
  | 'query'
  | 'answer'
  | 'maintain';

/** Validated answer prompt-result shape (schemas/prompt-answer-result.schema.json). */
export interface PromptAnswerResult {
  answer_markdown: string;
  cited_triple_ids: string[];
  question?: string;
  content_hash?: string;
  built_at?: string;
}

/** Validated extract prompt-result shape. */
export interface PromptExtractResult {
  nodes: GraphNode[];
  triples: Triple[];
  content_hash?: string;
  built_at?: string;
}

/** Validated normalize prompt-result shape. */
export interface PromptNormalizeResult {
  nodes: GraphNode[];
  triples: Triple[];
  suggestions?: string[];
  content_hash?: string;
  built_at?: string;
}

/** Validated maintain prompt-result shape (suggestions only). */
export interface PromptMaintainResult {
  suggestions: string[];
  content_hash?: string;
  built_at?: string;
}

// --- Grounded answer (ANS-01 / ANS-02 / D-03 / D-04 / D-05) ---

/**
 * Result of answer() — deterministic markdown over packSubgraph, or honest abstain.
 * Phase 5 only sets mode 'deterministic' | 'abstain'; prompt_pending/http reserved (D-05).
 */
export interface GroundedAnswer {
  /** Pack produced by packSubgraph for the same options (D-03, D-10). */
  pack: SubgraphPack;
  /** Cited markdown (Seeds / Relationships / Paths / Citations) or empty/abstain note. */
  answer_markdown: string;
  /**
   * Answer production mode.
   * Phase 5: 'deterministic' | 'abstain' only; 'prompt_pending' | 'http' for Phase 6 (D-05).
   */
  mode: 'deterministic' | 'prompt_pending' | 'http' | 'abstain';
  /** True when pack has no triples — no fabricated relationships (ANS-02, D-04). */
  abstained: boolean;
  /** Machine-readable reason when abstained (e.g. GSD_GRAPH_REASON.EMPTY_SUBGRAPH). */
  abstain_reason?: string;
  /** Reserved for Phase 6 LLM prompt apply — unused in Phase 5 (D-05). */
  prompt_bundle?: object;
}

/**
 * Options for answer() — extends PackOptions with optional LLM apply flags (D-01, D-05, D-10).
 * Default path (no apply flags) remains deterministic Phase 5 behavior.
 * Loads graph only via packSubgraph (opts.graph or loadGraphV1) (D-10).
 */
export interface AnswerOptions extends PackOptions {
  /**
   * When true, apply a validated prompt answer result (in-memory or file) after pack.
   * Empty pack still abstains before apply (ANS-02).
   */
  applyPromptResult?: boolean;
  /**
   * Explicit LLM mode for this call. Prefer resolveLlmMode for flag/config precedence.
   * 'http' requires fetchImpl / config (Task 3); 'prompt' uses promptResult / file.
   */
  llmMode?: LlmMode;
  /** In-memory prompt-answer-result object (tests / library; RESEARCH OQ-6). */
  promptResult?: unknown;
  /**
   * Absolute path or store-relative path to `.prompt-answer-result.json`.
   * Prefer store basename I/O via prompt-files helpers when under store root.
   */
  promptResultPath?: string;
  /** Injectable fetch for http mode tests (D-05, D-12). */
  fetchImpl?: typeof fetch;
  /** Optional HTTP LLM config override (base URL, model, api key env name). */
  llmHttp?: {
    baseUrl?: string;
    model?: string;
    apiKeyEnv?: string;
  };
}

// --- Community detection (COM-01 / D-01..D-03 / D-10) ---

/** One community / theme cluster from label propagation. */
export interface Community {
  /** Stable display id after sort: c_0001, c_0002, … */
  id: string;
  /** First 16 hex of sha256(membersSorted.join('\\0')). */
  stable_key: string;
  /** Deterministic theme title (top internal-degree label or Community ${id}). */
  label: string;
  /** Sorted node ids in this community. */
  members: string[];
  size: number;
  /** Count of EXTRACTED|INFERRED triples with both endpoints in members. */
  internal_triple_count: number;
  /** Internal predicate frequencies (count desc, then p asc). */
  top_predicates: Array<{ p: string; count: number }>;
  /** Members ranked by undirected internal degree (degree desc, id asc). */
  top_nodes: Array<{ id: string; label: string; degree: number }>;
}

/** Options for detectCommunities (COM-01). Prefer graph injection for tests (D-10). */
export interface DetectCommunitiesOptions {
  /** Store directory override when graph is absent (loadGraphV1). */
  dir?: string;
  /** In-memory graph — skips loadGraphV1 (D-10). */
  graph?: GraphV1Document;
  /** Max LPA iterations (default COMMUNITY_MAX_ITERATIONS = 20; clamped). */
  maxIterations?: number;
  /** Drop communities smaller than this (default COMMUNITY_MIN_SIZE = 3). */
  minSize?: number;
  /**
   * When true, write disposable communities/ sidecars under the store (D-04).
   * Default: true when loading from store (no graph); false when graph is injected.
   */
  write?: boolean;
}

/** Result of detectCommunities — pure algorithm fields always present. */
export interface DetectCommunitiesResult {
  communities: Community[];
  /** Iterations actually executed (0 when maxIterations was 0). */
  iterations: number;
  stopped_reason: 'converged' | 'max_iterations';
  nodes_considered: number;
  edges_considered: number;
  /** Communities dropped for members.length < minSize. */
  dropped_small_count: number;
  /** Absolute path to communities/index.json when artifacts are written. */
  index_path?: string;
  /** Absolute paths to community-c_NNNN.md reports when written. */
  report_paths?: string[];
}

/** Options for writeCommunityReports (D-05, A2). */
export interface WriteCommunityReportsOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /**
   * When provided, write index + markdown from this array without re-running LPA.
   * When omitted, load communities/index.json (errors if missing).
   */
  communities?: Community[];
}

/** Result of writeCommunityReports — disposable sidecars only (D-04). */
export interface WriteCommunityReportsResult {
  index_path: string;
  report_paths: string[];
}
