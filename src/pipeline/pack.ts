// gsd-graph — packSubgraph: public query composition for grounded packs (PACK-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * packSubgraph is composition of public Query IR ops only (D-01, PACK-01, K21):
 *   tokenize/score (pack-layer only) → expandHops by seed id → path among top seeds
 *   → applyBudget → citation projection from remaining triples.
 *
 * No private BFS/dijkstra here — walks stay on exported query helpers.
 * SoT: opts.graph or loadGraphV1 via resolveStoreRoot — never projection (D-10).
 */

import { loadGraphV1 } from '../io/load-graph';
import { resolveStoreRoot } from '../io/paths';
import type {
  GraphNode,
  GraphV1Document,
  PackCitation,
  PackOptions,
  QueryPath,
  SubgraphPack,
  Triple,
} from '../types';
import {
  applyBudget,
  buildAdjacencyMap,
  DEFAULT_SEED_HOPS,
  expandHops,
  query,
} from './query';

/**
 * DESIGN stopword set (exact, no extras in 0.1.0 — RESEARCH OQ-R2).
 * Exported for golden stability.
 */
export const PACK_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'why',
  'how',
  'what',
  'is',
  'are',
  'did',
  'does',
  'do',
]);

function loadPackGraph(opts: PackOptions): GraphV1Document {
  if (opts.graph !== undefined) {
    return opts.graph;
  }
  const storeRoot =
    opts.dir !== undefined
      ? resolveStoreRoot({ dir: opts.dir })
      : resolveStoreRoot();
  return loadGraphV1(storeRoot);
}

/**
 * Tokenize question: NFKC-lower, split non-alphanumeric, drop stopwords, keep len ≥ 2.
 */
export function tokenizeQuestion(question: string): string[] {
  const folded = question.normalize('NFKC').toLowerCase();
  const raw = folded.split(/[^a-z0-9]+/u).filter((t) => t.length >= 2);
  return raw.filter((t) => !PACK_STOPWORDS.has(t));
}

interface ScoredSeed {
  id: string;
  score: number;
  labelLen: number;
}

/**
 * Score each node against tokens (D-02):
 *   label substring +3, alias substring +2, description substring +1 (summed).
 * Top kSeeds by score desc; drop score 0; ties: shorter label then id asc.
 */
export function scoreSeeds(
  graph: GraphV1Document,
  tokens: readonly string[],
  kSeeds: number,
): string[] {
  if (tokens.length === 0 || kSeeds <= 0) {
    return [];
  }

  const scored: ScoredSeed[] = [];
  for (const n of graph.nodes) {
    const label = n.label.normalize('NFKC').toLowerCase();
    const description = (n.description ?? '').normalize('NFKC').toLowerCase();
    const aliases = (n.aliases ?? []).map((a) =>
      a.normalize('NFKC').toLowerCase(),
    );

    let score = 0;
    for (const token of tokens) {
      if (label.includes(token)) score += 3;
      if (description.includes(token)) score += 1;
      if (aliases.some((a) => a.includes(token))) score += 2;
    }

    if (score > 0) {
      scored.push({ id: n.id, score, labelLen: n.label.length });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.labelLen !== b.labelLen) return a.labelLen - b.labelLen;
    return a.id.localeCompare(b.id);
  });

  return scored.slice(0, kSeeds).map((s) => s.id);
}

function emptyPack(
  question: string,
  seeds: string[],
  budget: number | null,
  trimmed: string | null = null,
): SubgraphPack {
  return {
    question,
    seeds,
    nodes: [],
    triples: [],
    paths: [],
    citations: [],
    trimmed,
    budget_tokens: budget,
  };
}

function projectCitations(triples: readonly Triple[]): PackCitation[] {
  return triples.map((t) => {
    const source_path = t.provenance?.[0]?.source_path;
    const cite: PackCitation = {
      triple_id: t.id,
      s: t.s,
      p: t.p,
      o: t.o,
    };
    if (source_path !== undefined && source_path.length > 0) {
      cite.source_path = source_path;
    }
    return cite;
  });
}

/**
 * Pack a grounded subgraph for a natural-language question (PACK-01).
 *
 * Composition only: expandHops / query({ path }) / applyBudget — no private walk.
 */
export function packSubgraph(opts: PackOptions): SubgraphPack {
  const graph = loadPackGraph(opts);
  const hops = opts.hops ?? DEFAULT_SEED_HOPS;
  const kSeeds = opts.kSeeds ?? 5;
  const budget = opts.budget ?? null;
  const question = opts.question;

  const tokens = tokenizeQuestion(question);
  const seeds = scoreSeeds(graph, tokens, kSeeds);

  if (seeds.length === 0) {
    return emptyPack(question, seeds, budget);
  }

  const adj = buildAdjacencyMap(graph);
  const nodeById = new Map<string, GraphNode>();
  const tripleById = new Map<string, Triple>();

  // Expand by concrete seed id (D-02 pitfall 3: do not seedAndExpand by label).
  for (const seedId of seeds) {
    const expanded = expandHops(adj, graph, new Set([seedId]), hops);
    for (const n of expanded.nodes) nodeById.set(n.id, n);
    for (const t of expanded.triples) tripleById.set(t.id, t);
  }

  const paths: QueryPath[] = [];
  // Path pairs among top min(3, seeds) via public query path op (D-01, D-02).
  if (seeds.length >= 2) {
    const top = seeds.slice(0, Math.min(3, seeds.length));
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const from = top[i]!;
        const to = top[j]!;
        const pathResult = query({
          graph,
          path: { from, to, maxDepth: hops + 2 },
        });
        for (const p of pathResult.paths) {
          paths.push(p);
        }
        for (const n of pathResult.nodes) nodeById.set(n.id, n);
        for (const t of pathResult.triples) tripleById.set(t.id, t);
      }
    }
  }

  let nodes = [...nodeById.values()].sort((a, b) => a.id.localeCompare(b.id));
  let triples = [...tripleById.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  if (triples.length === 0) {
    return emptyPack(question, seeds, budget);
  }

  const seedIdSet = new Set(seeds);
  const budgeted = applyBudget(nodes, triples, budget, seedIdSet);
  nodes = budgeted.nodes;
  triples = budgeted.triples;

  if (triples.length === 0) {
    return emptyPack(question, seeds, budget, budgeted.trimmed);
  }

  return {
    question,
    seeds,
    nodes,
    triples,
    paths,
    citations: projectCitations(triples),
    trimmed: budgeted.trimmed,
    budget_tokens: budget,
  };
}
