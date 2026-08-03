// gsd-graph — disposable graph.json projection from graph.v1 (REP-01 prep, D-09)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * projectGraph maps graph.v1 triples → edges only. Never invents triples.
 * Projection is disposable; graph.v1 remains source of truth (D-04 / D-09).
 */

import type { Confidence, GraphNode, GraphV1Document } from '../types';

/** Disposable projection edge derived from a single triple. */
export interface ProjectionEdge {
  source: string;
  target: string;
  relation: string;
  label: string;
  confidence: Confidence;
  id: string;
}

/** Disposable graph.json document shape (nodes + edges from triples only). */
export interface GraphProjection {
  nodes: GraphNode[];
  edges: ProjectionEdge[];
}

/**
 * Project graph.v1 into a disposable edges document.
 * Each edge is { source: s, target: o, relation: p, label: p, confidence, id }.
 */
export function projectGraph(v1: GraphV1Document): GraphProjection {
  return {
    nodes: v1.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      ...(n.description !== undefined ? { description: n.description } : {}),
      ...(n.aliases !== undefined ? { aliases: [...n.aliases] } : {}),
    })),
    edges: v1.triples.map((t) => ({
      source: t.s,
      target: t.o,
      relation: t.p,
      label: t.p,
      confidence: t.confidence,
      id: t.id,
    })),
  };
}
