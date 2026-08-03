// gsd-graph — shared public type stubs
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Minimal shared type placeholders for Phase 1 bootstrap.
 * Full GraphNode / Triple models land with schema plan 01-02.
 */

/** Opaque node identifier (string id in graph.v1). */
export type NodeId = string;

/** Minimal node stub — expanded in plan 01-02. */
export interface GraphNode {
  id: NodeId;
  type: string;
  label: string;
}

/** Minimal triple stub — expanded in plan 01-02. */
export interface Triple {
  subject: NodeId;
  predicate: string;
  object: NodeId;
}
