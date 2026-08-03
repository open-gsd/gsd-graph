// gsd-graph — pure-TS label-propagation community detection (COM-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Deterministic asynchronous label propagation over an undirected projection of
 * EXTRACTED|INFERRED triples (D-01, D-02, D-03, D-05, D-10).
 *
 * Pipeline: projectCommunityEdges → labelPropagation → finalizeCommunities.
 * No graphology / Louvain / Leiden. When opts.graph is injected and write is
 * false, this module is pure in-memory (no FS).
 */

import { createHash } from 'node:crypto';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { loadGraphV1 } from '../io/load-graph';
import { resolveStoreRoot } from '../io/paths';
import type {
  Community,
  DetectCommunitiesOptions,
  DetectCommunitiesResult,
  GraphNode,
  GraphV1Document,
  Triple,
} from '../types';
import { confidenceRank } from './ids';

/** Hard cap on LPA iterations (D-02, T-07-02). */
export const COMMUNITY_MAX_ITERATIONS = 20;

/** Drop communities smaller than this (D-02). */
export const COMMUNITY_MIN_SIZE = 3;

const MIN_EDGE_RANK = confidenceRank('INFERRED');

/** True when a triple may form a community edge (EXTRACTED | INFERRED). */
export function isCommunityEdge(t: Triple): boolean {
  return confidenceRank(t.confidence) >= MIN_EDGE_RANK;
}

export interface CommunityProjection {
  /** Sorted unique endpoints of filtered edges. */
  nodes: string[];
  /** Undirected unique neighbor lists (sorted). */
  neighbors: Map<string, string[]>;
  /** Unique undirected edge count {a,b} with a < b. */
  edges_considered: number;
}

/**
 * Build undirected unique adjacency from EXTRACTED|INFERRED triples only (D-03).
 * Isolates with no qualifying edges are omitted (cannot form size≥3 alone).
 */
export function projectCommunityEdges(graph: GraphV1Document): CommunityProjection {
  const neighborSets = new Map<string, Set<string>>();
  const undirected = new Set<string>();

  const ensure = (id: string): Set<string> => {
    let s = neighborSets.get(id);
    if (!s) {
      s = new Set();
      neighborSets.set(id, s);
    }
    return s;
  };

  for (const t of graph.triples) {
    if (!isCommunityEdge(t)) continue;
    if (t.s === t.o) continue;
    ensure(t.s).add(t.o);
    ensure(t.o).add(t.s);
    const a = t.s < t.o ? t.s : t.o;
    const b = t.s < t.o ? t.o : t.s;
    undirected.add(`${a}\0${b}`);
  }

  const nodes = [...neighborSets.keys()].sort((a, b) => a.localeCompare(b));
  const neighbors = new Map<string, string[]>();
  for (const id of nodes) {
    const list = [...(neighborSets.get(id) ?? [])].sort((a, b) =>
      a.localeCompare(b),
    );
    neighbors.set(id, list);
  }

  return {
    nodes,
    neighbors,
    edges_considered: undirected.size,
  };
}

export interface LabelPropagationResult {
  labels: Map<string, string>;
  iterations: number;
  stopped_reason: 'converged' | 'max_iterations';
}

/**
 * Majority label among neighbors; frequency ties → lexicographically smallest
 * label (discretion A1 / D-05). Empty neighbor list keeps current label.
 */
function majorityNeighborLabel(
  v: string,
  neighbors: readonly string[],
  labels: Map<string, string>,
): string {
  if (neighbors.length === 0) {
    return labels.get(v) ?? v;
  }
  const counts = new Map<string, number>();
  for (const n of neighbors) {
    const lab = labels.get(n) ?? n;
    counts.set(lab, (counts.get(lab) ?? 0) + 1);
  }
  let bestCount = -1;
  let bestLabel = labels.get(v) ?? v;
  for (const [lab, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && lab.localeCompare(bestLabel) < 0)
    ) {
      bestCount = count;
      bestLabel = lab;
    }
  }
  return bestLabel;
}

/** True when every node's label is a max-frequency neighbor label (or isolate). */
function isMajorityStable(
  nodes: readonly string[],
  neighbors: Map<string, string[]>,
  labels: Map<string, string>,
): boolean {
  for (const v of nodes) {
    const nbrs = neighbors.get(v) ?? [];
    if (nbrs.length === 0) continue;
    const current = labels.get(v) ?? v;
    const next = majorityNeighborLabel(v, nbrs, labels);
    if (next !== current) return false;
  }
  return true;
}

/**
 * Deterministic async LPA: nodes processed in ascending id order each iteration;
 * updates apply immediately so later nodes see earlier updates (Pattern 1).
 */
export function labelPropagation(
  neighbors: Map<string, string[]>,
  maxIterations: number,
): LabelPropagationResult {
  const nodes = [...neighbors.keys()].sort((a, b) => a.localeCompare(b));
  const labels = new Map<string, string>();
  for (const v of nodes) {
    labels.set(v, v);
  }

  if (maxIterations <= 0 || nodes.length === 0) {
    return {
      labels,
      iterations: 0,
      stopped_reason: 'max_iterations',
    };
  }

  let iterations = 0;
  let stopped_reason: 'converged' | 'max_iterations' = 'max_iterations';

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterations = iter;
    let changed = false;

    for (const v of nodes) {
      const nbrs = neighbors.get(v) ?? [];
      const next = majorityNeighborLabel(v, nbrs, labels);
      if (next !== (labels.get(v) ?? v)) {
        labels.set(v, next);
        changed = true;
      }
    }

    if (!changed || isMajorityStable(nodes, neighbors, labels)) {
      stopped_reason = 'converged';
      break;
    }
  }

  return { labels, iterations, stopped_reason };
}

function bfsComponent(
  start: string,
  memberSet: Set<string>,
  neighbors: Map<string, string[]>,
  visited: Set<string>,
): string[] {
  const out: string[] = [];
  const queue: string[] = [start];
  visited.add(start);
  while (queue.length > 0) {
    const v = queue.shift()!;
    out.push(v);
    for (const n of neighbors.get(v) ?? []) {
      if (!memberSet.has(n) || visited.has(n)) continue;
      visited.add(n);
      queue.push(n);
    }
  }
  return out;
}

/**
 * Split same-label groups into connected components on the undirected edge set
 * (Raghavan §V), drop small communities, assign stable ids (Pattern 1).
 */
export function finalizeCommunities(
  graph: GraphV1Document,
  labels: Map<string, string>,
  neighbors: Map<string, string[]>,
  minSize: number,
): { communities: Community[]; dropped_small_count: number } {
  const byLabel = new Map<string, string[]>();
  for (const [node, lab] of labels) {
    let list = byLabel.get(lab);
    if (!list) {
      list = [];
      byLabel.set(lab, list);
    }
    list.push(node);
  }

  const rawGroups: string[][] = [];
  for (const members of byLabel.values()) {
    const memberSet = new Set(members);
    const visited = new Set<string>();
    const sortedMembers = [...members].sort((a, b) => a.localeCompare(b));
    for (const m of sortedMembers) {
      if (visited.has(m)) continue;
      rawGroups.push(bfsComponent(m, memberSet, neighbors, visited));
    }
  }

  let dropped_small_count = 0;
  const kept: string[][] = [];
  for (const g of rawGroups) {
    if (g.length < minSize) {
      dropped_small_count += 1;
      continue;
    }
    kept.push(g);
  }

  // size desc, then min(memberId) asc
  kept.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const minA = a.reduce((m, x) => (x.localeCompare(m) < 0 ? x : m));
    const minB = b.reduce((m, x) => (x.localeCompare(m) < 0 ? x : m));
    return minA.localeCompare(minB);
  });

  const nodeById = new Map<string, GraphNode>();
  for (const n of graph.nodes) {
    nodeById.set(n.id, n);
  }

  const communities: Community[] = kept.map((members, i) => {
    const membersSorted = [...members].sort((a, b) => a.localeCompare(b));
    const memberSet = new Set(membersSorted);
    const id = `c_${String(i + 1).padStart(4, '0')}`;
    const stable_key = createHash('sha256')
      .update(membersSorted.join('\0'), 'utf8')
      .digest('hex')
      .slice(0, 16);

    let internal_triple_count = 0;
    const predCounts = new Map<string, number>();
    const degree = new Map<string, number>();
    for (const m of membersSorted) {
      degree.set(m, 0);
    }

    // Internal undirected degree from projected neighbors
    for (const m of membersSorted) {
      for (const n of neighbors.get(m) ?? []) {
        if (memberSet.has(n) && m < n) {
          degree.set(m, (degree.get(m) ?? 0) + 1);
          degree.set(n, (degree.get(n) ?? 0) + 1);
        }
      }
    }

    for (const t of graph.triples) {
      if (!isCommunityEdge(t)) continue;
      if (!memberSet.has(t.s) || !memberSet.has(t.o)) continue;
      if (t.s === t.o) continue;
      internal_triple_count += 1;
      predCounts.set(t.p, (predCounts.get(t.p) ?? 0) + 1);
    }

    const top_predicates = [...predCounts.entries()]
      .map(([p, count]) => ({ p, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.p.localeCompare(b.p);
      });

    const top_nodes = membersSorted
      .map((nid) => ({
        id: nid,
        label: nodeById.get(nid)?.label ?? nid,
        degree: degree.get(nid) ?? 0,
      }))
      .sort((a, b) => {
        if (b.degree !== a.degree) return b.degree - a.degree;
        return a.id.localeCompare(b.id);
      });

    const label =
      top_nodes.length > 0 && top_nodes[0]!.label
        ? top_nodes[0]!.label
        : `Community ${id}`;

    return {
      id,
      stable_key,
      label,
      members: membersSorted,
      size: membersSorted.length,
      internal_triple_count,
      top_predicates,
      top_nodes,
    };
  });

  return { communities, dropped_small_count };
}

function clampMaxIterations(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return COMMUNITY_MAX_ITERATIONS;
  }
  return Math.min(Math.floor(value), COMMUNITY_MAX_ITERATIONS);
}

function clampMinSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return COMMUNITY_MIN_SIZE;
  }
  return Math.floor(value);
}

/**
 * Detect communities via pure-TS LPA (COM-01).
 * Inject graph + write:false for offline tests (D-10). Does not mutate graph.
 */
export function detectCommunities(
  opts: DetectCommunitiesOptions = {},
): DetectCommunitiesResult {
  let graph: GraphV1Document;
  if (opts.graph !== undefined) {
    graph = opts.graph;
  } else {
    const storeRoot =
      opts.dir !== undefined
        ? resolveStoreRoot({ dir: opts.dir })
        : resolveStoreRoot();
    try {
      graph = loadGraphV1(storeRoot);
    } catch (err) {
      if (err instanceof GraphError) throw err;
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        err instanceof Error ? err.message : 'failed to load graph.v1',
        { cause: err },
      );
    }
  }

  // Never mutate caller's graph.communities (A4 / D-04 spirit).
  const maxIterations = clampMaxIterations(opts.maxIterations);
  const minSize = clampMinSize(opts.minSize);

  const projection = projectCommunityEdges(graph);
  const lp = labelPropagation(projection.neighbors, maxIterations);
  const { communities, dropped_small_count } = finalizeCommunities(
    graph,
    lp.labels,
    projection.neighbors,
    minSize,
  );

  // write artifacts deferred to plan 07-02; skip FS when write is false/omitted.
  if (opts.write === true) {
    throw new GraphError(
      GSD_GRAPH_REASON.BUILD_FAILED,
      'community artifact writes are not implemented in this plan (see 07-02)',
    );
  }

  return {
    communities,
    iterations: lp.iterations,
    stopped_reason: lp.stopped_reason,
    nodes_considered: projection.nodes.length,
    edges_considered: projection.edges_considered,
    dropped_small_count,
  };
}
