// gsd-graph — shared public types mirroring graph.v1 schema (schema is authority)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

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
  /** Optional discover globs (default md/txt/markdown/json/jsonl). */
  globs?: string[];
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
