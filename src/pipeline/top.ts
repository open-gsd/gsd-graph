// gsd-graph — central-node analytics: degree + PageRank (pure TS, no deps)

/**
 * "What are the central concepts?" — the KG-toolkit table stakes question.
 * Degree = undirected edge count. PageRank = standard damped iteration over
 * the directed triple graph (dangling mass redistributed uniformly).
 * Deterministic: fixed iteration cap, stable tie-breaks by id.
 */

import { loadGraphV1Cached } from '../io/graph-cache';
import { resolveStoreRoot } from '../io/paths';
import type { GraphV1Document } from '../types';

export const PAGERANK_DAMPING = 0.85;
export const PAGERANK_MAX_ITERATIONS = 50;
export const PAGERANK_EPSILON = 1e-9;

export interface TopNodeEntry {
  id: string;
  label: string;
  type: string;
  degree: number;
  pagerank: number;
}

export interface TopNodesOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** In-memory graph — skips store load. */
  graph?: GraphV1Document;
  /** Rows returned (default 20). */
  k?: number;
  /** Ranking metric (default 'pagerank'). */
  metric?: 'degree' | 'pagerank';
}

export interface TopNodesResult {
  metric: 'degree' | 'pagerank';
  nodes: TopNodeEntry[];
  iterations: number;
  node_count: number;
  triple_count: number;
}

/** PageRank over directed triples. Returns id → score (sums to ~1). */
export function pagerank(
  graph: GraphV1Document,
): { scores: Map<string, number>; iterations: number } {
  const ids = graph.nodes.map((n) => n.id);
  const n = ids.length;
  const scores = new Map<string, number>();
  if (n === 0) return { scores, iterations: 0 };

  const index = new Map<string, number>(ids.map((id, i) => [id, i]));
  const outLinks: number[][] = Array.from({ length: n }, () => []);
  const outDegree = new Array<number>(n).fill(0);
  for (const t of graph.triples) {
    const s = index.get(t.s);
    const o = index.get(t.o);
    if (s === undefined || o === undefined) continue;
    outLinks[s]!.push(o);
    outDegree[s]! += 1;
  }

  let rank = new Array<number>(n).fill(1 / n);
  let iterations = 0;
  for (let iter = 0; iter < PAGERANK_MAX_ITERATIONS; iter++) {
    iterations = iter + 1;
    const next = new Array<number>(n).fill(0);
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      if (outDegree[i] === 0) {
        danglingMass += rank[i]!;
        continue;
      }
      const share = rank[i]! / outDegree[i]!;
      for (const j of outLinks[i]!) next[j]! += share;
    }
    const base = (1 - PAGERANK_DAMPING) / n + (PAGERANK_DAMPING * danglingMass) / n;
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const v = base + PAGERANK_DAMPING * next[i]!;
      delta += Math.abs(v - rank[i]!);
      next[i] = v;
    }
    rank = next;
    if (delta < PAGERANK_EPSILON) break;
  }

  for (let i = 0; i < n; i++) scores.set(ids[i]!, rank[i]!);
  return { scores, iterations };
}

/** Undirected degree per node id. */
export function degreeCounts(graph: GraphV1Document): Map<string, number> {
  const deg = new Map<string, number>();
  for (const node of graph.nodes) deg.set(node.id, 0);
  for (const t of graph.triples) {
    deg.set(t.s, (deg.get(t.s) ?? 0) + 1);
    deg.set(t.o, (deg.get(t.o) ?? 0) + 1);
  }
  return deg;
}

/** Rank nodes by centrality (degree or PageRank). */
export function topNodes(opts?: TopNodesOptions): TopNodesResult {
  const graph =
    opts?.graph ??
    loadGraphV1Cached(
      resolveStoreRoot(opts?.dir !== undefined ? { dir: opts.dir } : {}),
    );
  const k = opts?.k ?? 20;
  const metric = opts?.metric ?? 'pagerank';

  const deg = degreeCounts(graph);
  const { scores, iterations } = pagerank(graph);

  const entries: TopNodeEntry[] = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
    degree: deg.get(node.id) ?? 0,
    pagerank: scores.get(node.id) ?? 0,
  }));

  entries.sort((a, b) => {
    const d =
      metric === 'degree' ? b.degree - a.degree : b.pagerank - a.pagerank;
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  return {
    metric,
    nodes: entries.slice(0, Math.max(0, k)),
    iterations,
    node_count: graph.nodes.length,
    triple_count: graph.triples.length,
  };
}
