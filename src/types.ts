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
