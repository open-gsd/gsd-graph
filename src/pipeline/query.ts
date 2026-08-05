// gsd-graph — pure-TS Query IR (path, seed_expand, neighborhood, filter, budget)

/**
 * Dispatch order (exclusive):
 *   1. path          if opts.path
 *   2. neighborhood  if opts.id
 *   3. filter        if types | predicates | confidenceMin (and no term)
 *   4. seed_expand   if term !== undefined
 *   else GraphError usage
 *
 * When term is set with filter fields, term seed_expand wins (filter ignored).
 *
 * Path / neighborhood / seed expansion walk the graph as undirected for
 * connectivity while preserving directed triple predicates on returned edges
 * (OQ-4, D-03).
 *
 * SoT: opts.graph or loadGraphV1 only — never graph.json (D-04).
 */

import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { loadGraphV1Cached } from '../io/graph-cache';
import { resolveStoreRoot } from '../io/paths';
import type {
  GraphNode,
  GraphV1Document,
  QueryOptions,
  QueryPath,
  QueryResult,
  Triple,
} from '../types';
import { confidenceRank } from './ids';

/** Hard clamp for hops / maxDepth (T-03-01). */
export const MAX_QUERY_DEPTH = 16;

/** Default path maxDepth when omitted. */
export const DEFAULT_PATH_MAX_DEPTH = 6;

/** Default seed_expand hops. */
export const DEFAULT_SEED_HOPS = 2;

/** Default neighborhood hops. */
export const DEFAULT_NEIGHBORHOOD_HOPS = 1;

/** One undirected adjacency edge with the directed triple it came from. */
export interface AdjacencyEdge {
  neighbor: string;
  predicate: string;
  tripleId: string;
  /** True when walking s→o (forward); false when walking o→s (reverse). */
  forward: boolean;
  /** Subject of the directed triple. */
  s: string;
  /** Object of the directed triple. */
  o: string;
}

export type AdjacencyMap = Map<string, AdjacencyEdge[]>;

/**
 * Adjacency memo per loaded document. Documents are immutable after load
 * (write paths publish fresh files), so identity keying is safe; WeakMap
 * lets rebuilt graphs and their maps be collected together.
 */
const adjacencyMemo = new WeakMap<GraphV1Document, AdjacencyMap>();

/**
 * Index undirected edges for traversal while preserving directed triple fields.
 * Memoized per document — repeated walks (pack path pairs, MCP server calls)
 * reuse the same map instead of re-indexing every triple.
 */
export function buildAdjacencyMap(graph: GraphV1Document): AdjacencyMap {
  const memo = adjacencyMemo.get(graph);
  if (memo !== undefined) return memo;
  const adj: AdjacencyMap = new Map();

  const push = (from: string, edge: AdjacencyEdge): void => {
    let list = adj.get(from);
    if (!list) {
      list = [];
      adj.set(from, list);
    }
    list.push(edge);
  };

  for (const t of graph.triples) {
    push(t.s, {
      neighbor: t.o,
      predicate: t.p,
      tripleId: t.id,
      forward: true,
      s: t.s,
      o: t.o,
    });
    push(t.o, {
      neighbor: t.s,
      predicate: t.p,
      tripleId: t.id,
      forward: false,
      s: t.s,
      o: t.o,
    });
  }

  // Ensure isolated nodes appear in the map (empty neighbor lists).
  for (const n of graph.nodes) {
    if (!adj.has(n.id)) {
      adj.set(n.id, []);
    }
  }

  adjacencyMemo.set(graph, adj);
  return adj;
}

function clampDepth(value: number | undefined, fallback: number): number {
  const raw = value === undefined || Number.isNaN(value) ? fallback : value;
  if (raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_QUERY_DEPTH);
}

interface BfsParent {
  prev: string;
  edge: AdjacencyEdge;
}

/**
 * Undirected BFS shortest path. Fewer edges wins; tie-break smaller predicate
 * then neighbor id. Returns directed predicates on the triples used.
 */
export function findShortestPath(
  adj: AdjacencyMap,
  from: string,
  to: string,
  maxDepth: number,
): QueryPath | null {
  if (from === to) {
    return { nodes: [from], predicates: [] };
  }

  const depthLimit = clampDepth(maxDepth, DEFAULT_PATH_MAX_DEPTH);
  // parent[node] = how we first reached node (BFS level = shortest)
  const parent = new Map<string, BfsParent>();
  const depth = new Map<string, number>();
  depth.set(from, 0);

  // Process level-by-level; within a level, prefer lex smaller predicate then neighbor
  let frontier: string[] = [from];

  while (frontier.length > 0) {
    // Collect candidate expansions, sort for deterministic first-visit
    type Cand = { from: string; edge: AdjacencyEdge };
    const cands: Cand[] = [];
    for (const u of frontier) {
      const d = depth.get(u) ?? 0;
      if (d >= depthLimit) continue;
      const edges = adj.get(u) ?? [];
      for (const edge of edges) {
        cands.push({ from: u, edge });
      }
    }

    cands.sort((a, b) => {
      const dp = a.edge.predicate.localeCompare(b.edge.predicate);
      if (dp !== 0) return dp;
      const dn = a.edge.neighbor.localeCompare(b.edge.neighbor);
      if (dn !== 0) return dn;
      return a.from.localeCompare(b.from);
    });

    const nextFrontier: string[] = [];
    for (const { from: u, edge } of cands) {
      const v = edge.neighbor;
      if (depth.has(v)) continue;
      const ud = depth.get(u) ?? 0;
      depth.set(v, ud + 1);
      parent.set(v, { prev: u, edge });
      nextFrontier.push(v);
      if (v === to) {
        return reconstructPath(from, to, parent);
      }
    }
    frontier = nextFrontier;
  }

  return null;
}

function reconstructPath(
  from: string,
  to: string,
  parent: Map<string, BfsParent>,
): QueryPath {
  const nodesRev: string[] = [to];
  const predsRev: string[] = [];
  let cur = to;
  while (cur !== from) {
    const step = parent.get(cur);
    if (!step) {
      // Defensive — should not happen if BFS reached `to`
      return { nodes: [from], predicates: [] };
    }
    predsRev.push(step.edge.predicate);
    nodesRev.push(step.prev);
    cur = step.prev;
  }
  nodesRev.reverse();
  predsRev.reverse();
  return { nodes: nodesRev, predicates: predsRev };
}

function materializeFromIds(
  graph: GraphV1Document,
  nodeIds: ReadonlySet<string>,
  tripleIds: ReadonlySet<string>,
): { nodes: GraphNode[]; triples: Triple[] } {
  const nodes = graph.nodes.filter((n) => nodeIds.has(n.id));
  const triples = graph.triples.filter((t) => tripleIds.has(t.id));
  return { nodes, triples };
}

function materializePath(
  graph: GraphV1Document,
  found: QueryPath | null,
): { nodes: GraphNode[]; triples: Triple[]; seeds: Set<string> } {
  if (!found || found.nodes.length === 0) {
    return { nodes: [], triples: [], seeds: new Set() };
  }
  const nodeIds = new Set(found.nodes);
  const tripleIds = new Set<string>();
  // Match consecutive path edges to graph triples (undirected match on endpoints).
  // Indexed by (s,p,o) so path materialization stays linear in graph size.
  const bySpo = new Map<string, string>();
  for (const t of graph.triples) {
    bySpo.set(`${t.s}\0${t.p}\0${t.o}`, t.id);
  }
  for (let i = 0; i < found.predicates.length; i++) {
    const a = found.nodes[i]!;
    const b = found.nodes[i + 1]!;
    const p = found.predicates[i]!;
    const match = bySpo.get(`${a}\0${p}\0${b}`) ?? bySpo.get(`${b}\0${p}\0${a}`);
    if (match !== undefined) tripleIds.add(match);
  }
  const { nodes, triples } = materializeFromIds(graph, nodeIds, tripleIds);
  return { nodes, triples, seeds: new Set(found.nodes) };
}

/**
 * Case-folded substring match against node id, label, and aliases.
 */
export function matchTermSeeds(
  graph: GraphV1Document,
  term: string,
): Set<string> {
  const needle = term.normalize('NFKC').toLowerCase();
  const seeds = new Set<string>();
  if (needle.length === 0) return seeds;

  for (const n of graph.nodes) {
    const id = n.id.normalize('NFKC').toLowerCase();
    const label = n.label.normalize('NFKC').toLowerCase();
    if (id.includes(needle) || label.includes(needle)) {
      seeds.add(n.id);
      continue;
    }
    for (const alias of n.aliases ?? []) {
      if (alias.normalize('NFKC').toLowerCase().includes(needle)) {
        seeds.add(n.id);
        break;
      }
    }
  }
  return seeds;
}

/**
 * Undirected BFS hop expansion from seeds. Collects reachable nodes and
 * incident triples along the expansion (edges used to discover a neighbor).
 */
export function expandHops(
  adj: AdjacencyMap,
  graph: GraphV1Document,
  seeds: ReadonlySet<string>,
  hops: number,
): { nodes: GraphNode[]; triples: Triple[] } {
  const depthLimit = clampDepth(hops, 0);
  const reached = new Set<string>(seeds);
  const tripleIds = new Set<string>();
  let frontier = [...seeds];

  for (let d = 0; d < depthLimit; d++) {
    const next: string[] = [];
    for (const u of frontier) {
      for (const edge of adj.get(u) ?? []) {
        tripleIds.add(edge.tripleId);
        if (!reached.has(edge.neighbor)) {
          reached.add(edge.neighbor);
          next.push(edge.neighbor);
        }
      }
    }
    frontier = next;
  }

  // Include all triples fully contained in the reached node set that touch seeds
  // expansion — prefer incident triples collected during walk (already in tripleIds).
  // Also add any triple whose both endpoints are reached and that was walked.
  return materializeFromIds(graph, reached, tripleIds);
}

/**
 * seedAndExpand: match term seeds then expand hops (pack composition helper).
 */
export function seedAndExpand(
  graph: GraphV1Document,
  term: string,
  hops: number = DEFAULT_SEED_HOPS,
): { seeds: string[]; nodes: GraphNode[]; triples: Triple[] } {
  const adj = buildAdjacencyMap(graph);
  const seedSet = matchTermSeeds(graph, term);
  const { nodes, triples } = expandHops(adj, graph, seedSet, hops);
  return { seeds: [...seedSet].sort(), nodes, triples };
}

/**
 * Filter triples by predicates / confidenceMin; restrict nodes by types.
 * Triples kept only when both endpoints remain after type filter (or types omitted).
 */
export function filterGraph(
  graph: GraphV1Document,
  opts: Pick<QueryOptions, 'types' | 'predicates' | 'confidenceMin'>,
): { nodes: GraphNode[]; triples: Triple[] } {
  const minRank =
    opts.confidenceMin !== undefined
      ? confidenceRank(opts.confidenceMin)
      : Number.NEGATIVE_INFINITY;

  let triples = graph.triples.filter((t) => {
    if (opts.predicates !== undefined && !opts.predicates.includes(t.p)) {
      return false;
    }
    if (confidenceRank(t.confidence) < minRank) {
      return false;
    }
    return true;
  });

  let nodeIds = new Set<string>();
  for (const t of triples) {
    nodeIds.add(t.s);
    nodeIds.add(t.o);
  }
  // Also include typed matches that may have no remaining edges
  if (opts.types !== undefined) {
    const typeSet = new Set(opts.types);
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const n of graph.nodes) {
      if (typeSet.has(n.type)) {
        nodeIds.add(n.id);
      }
    }
    // Restrict to typed nodes
    nodeIds = new Set(
      [...nodeIds].filter((id) => {
        const node = nodeById.get(id);
        return node !== undefined && typeSet.has(node.type);
      }),
    );
    triples = triples.filter((t) => nodeIds.has(t.s) && nodeIds.has(t.o));
  }

  const nodes = graph.nodes.filter((n) => nodeIds.has(n.id));
  return { nodes, triples };
}

/**
 * Drop triples worst-first, then id asc. Default order is confidence tier
 * (AMBIGUOUS → INFERRED → EXTRACTED); callers may pass a relevance scorer
 * (higher = keep longer) — pack uses seed proximity + predicate weight +
 * provenance count, with confidence still the dominant term.
 * Token unit: ceil(JSON.stringify({nodes,triples}).length / 4) (QRY-02, OQ-2).
 * Seed nodes retained when rebuilding the node set.
 */
export function applyBudget(
  nodes: GraphNode[],
  triples: Triple[],
  budgetTokens: number | null | undefined,
  seedIds: ReadonlySet<string>,
  scoreOf?: (t: Triple) => number,
): { nodes: GraphNode[]; triples: Triple[]; trimmed: string | null } {
  if (budgetTokens == null || budgetTokens <= 0) {
    return { nodes, triples, trimmed: null };
  }

  const score = scoreOf ?? ((t: Triple) => confidenceRank(t.confidence));
  const ordered = [...triples].sort((a, b) => {
    const dr = score(a) - score(b);
    if (dr !== 0) return dr;
    return a.id.localeCompare(b.id);
  });

  // Incremental length accounting: dropping array element i from compact
  // JSON.stringify removes exactly its serialization plus one comma while the
  // array stays non-empty. Keeps trim O(n) instead of re-serializing per drop.
  const dropped: string[] = [];
  let serializedLen = JSON.stringify({ nodes, triples: ordered }).length;
  let start = 0;
  while (
    start < ordered.length &&
    Math.ceil(serializedLen / 4) > budgetTokens
  ) {
    const victim = ordered[start]!;
    const remaining = ordered.length - start;
    serializedLen -=
      JSON.stringify(victim).length + (remaining > 1 ? 1 : 0);
    dropped.push(`${victim.id} (${victim.confidence})`);
    start += 1;
  }
  const kept = start === 0 ? ordered : ordered.slice(start);
  const trimmed: string | null =
    dropped.length > 0 ? `dropped ${dropped.join(', ')}` : null;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const keepNodeIds = new Set<string>(seedIds);
  for (const t of kept) {
    keepNodeIds.add(t.s);
    keepNodeIds.add(t.o);
  }
  const nextNodes = [...keepNodeIds]
    .map((id) => nodeById.get(id))
    .filter((n): n is GraphNode => n !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));

  return { nodes: nextNodes, triples: kept, trimmed };
}

function loadQueryGraph(opts: QueryOptions): GraphV1Document {
  if (opts.graph !== undefined) {
    return opts.graph;
  }
  const storeRoot =
    opts.dir !== undefined
      ? resolveStoreRoot({ dir: opts.dir })
      : resolveStoreRoot();
  return loadGraphV1Cached(storeRoot);
}

/**
 * Structured Query IR entry point (QRY-01, QRY-02).
 */
export function query(opts: QueryOptions): QueryResult {
  const graph = loadQueryGraph(opts);
  const adj = buildAdjacencyMap(graph);
  const budget = opts.budget ?? null;

  let nodes: GraphNode[] = [];
  let triples: Triple[] = [];
  let paths: QueryPath[] = [];
  let seeds = new Set<string>();

  if (opts.path !== undefined) {
    const maxDepth = clampDepth(
      opts.path.maxDepth,
      DEFAULT_PATH_MAX_DEPTH,
    );
    const found = findShortestPath(
      adj,
      opts.path.from,
      opts.path.to,
      maxDepth,
    );
    paths = found ? [found] : [];
    const mat = materializePath(graph, found);
    nodes = mat.nodes;
    triples = mat.triples;
    seeds = mat.seeds;
  } else if (opts.id !== undefined) {
    seeds = new Set([opts.id]);
    const hops = clampDepth(opts.hops, DEFAULT_NEIGHBORHOOD_HOPS);
    const expanded = expandHops(adj, graph, seeds, hops);
    nodes = expanded.nodes;
    triples = expanded.triples;
  } else if (
    opts.term === undefined &&
    (opts.types !== undefined ||
      opts.predicates !== undefined ||
      opts.confidenceMin !== undefined)
  ) {
    const filtered = filterGraph(graph, opts);
    nodes = filtered.nodes;
    triples = filtered.triples;
    seeds = new Set();
  } else if (opts.term !== undefined) {
    seeds = matchTermSeeds(graph, opts.term);
    const hops = clampDepth(opts.hops, DEFAULT_SEED_HOPS);
    const expanded = expandHops(adj, graph, seeds, hops);
    nodes = expanded.nodes;
    triples = expanded.triples;
  } else {
    throw new GraphError(
      GSD_GRAPH_REASON.BUILD_FAILED,
      'query requires one of: term (seed_expand), path, id (neighborhood), or filter fields (types | predicates | confidenceMin)',
      { opts: { hasTerm: false, hasPath: false, hasId: false } },
    );
  }

  const budgeted = applyBudget(nodes, triples, budget, seeds);
  return {
    nodes: budgeted.nodes,
    triples: budgeted.triples,
    paths,
    seeds: [...seeds].sort(),
    trimmed: budgeted.trimmed,
    budget_tokens: budget,
  };
}
