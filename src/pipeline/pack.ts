// gsd-graph — packSubgraph: public query composition for grounded packs (PACK-01)

/**
 * packSubgraph is composition of public Query IR ops only (D-01, PACK-01, K21):
 *   tokenize/score (pack-layer only) → expandHops by seed id → path among top seeds
 *   → applyBudget → citation projection from remaining triples.
 *
 * No private BFS/dijkstra here — walks stay on exported query helpers.
 * SoT: opts.graph or loadGraphV1 via resolveStoreRoot — never projection (D-10).
 */

import { loadGraphV1Cached } from '../io/graph-cache';
import { resolveStoreRoot } from '../io/paths';
import type {
  GraphNode,
  GraphV1Document,
  PackCitation,
  PackCitationSource,
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
  return loadGraphV1Cached(storeRoot);
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

interface NodeFields {
  id: string;
  label: string;
  labelLen: number;
  description: string;
  aliases: string[];
}

function foldNodeFields(graph: GraphV1Document): NodeFields[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    label: n.label.normalize('NFKC').toLowerCase(),
    labelLen: n.label.length,
    description: (n.description ?? '').normalize('NFKC').toLowerCase(),
    aliases: (n.aliases ?? []).map((a) => a.normalize('NFKC').toLowerCase()),
  }));
}

/**
 * Score each node against tokens with IDF weighting (D-02, revised):
 *   per token, field hit weight — label ×3, alias ×2, description ×1 —
 *   multiplied by idf(token) = ln(1 + N / df), where df counts nodes matching
 *   the token in any field. Rare tokens dominate; a token matching most of the
 *   graph ("phase", "service") contributes little.
 * Top kSeeds by score desc; drop score 0; ties: shorter label then id asc.
 * Deterministic: no randomness, stable sort keys.
 */
export function scoreSeeds(
  graph: GraphV1Document,
  tokens: readonly string[],
  kSeeds: number,
): string[] {
  if (tokens.length === 0 || kSeeds <= 0) {
    return [];
  }

  const fields = foldNodeFields(graph);
  const n = fields.length;

  // Pass 1: document frequency per token (any-field match).
  const idf = new Map<string, number>();
  for (const token of tokens) {
    if (idf.has(token)) continue;
    let df = 0;
    for (const f of fields) {
      if (
        f.label.includes(token) ||
        f.description.includes(token) ||
        f.aliases.some((a) => a.includes(token))
      ) {
        df += 1;
      }
    }
    idf.set(token, df === 0 ? 0 : Math.log(1 + n / df));
  }

  // Pass 2: field-weighted IDF sum per node.
  const scored: ScoredSeed[] = [];
  for (const f of fields) {
    let score = 0;
    for (const token of tokens) {
      const w = idf.get(token) ?? 0;
      if (w === 0) continue;
      if (f.label.includes(token)) score += 3 * w;
      if (f.description.includes(token)) score += 1 * w;
      if (f.aliases.some((a) => a.includes(token))) score += 2 * w;
    }
    if (score > 0) {
      scored.push({ id: f.id, score, labelLen: f.labelLen });
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
    const cite: PackCitation = {
      triple_id: t.id,
      s: t.s,
      p: t.p,
      o: t.o,
    };

    // Project every distinct (path, span) provenance source — build maintains
    // the multiset union; citations must not discard it (D-02).
    const sources: PackCitationSource[] = [];
    const seen = new Set<string>();
    for (const e of t.provenance ?? []) {
      if (e.source_path === undefined || e.source_path.length === 0) continue;
      const key = `${e.source_path}\0${e.span?.start_line ?? ''}\0${e.span?.end_line ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const src: PackCitationSource = { source_path: e.source_path };
      if (e.extractor !== undefined) src.extractor = e.extractor;
      if (e.span?.start_line !== undefined) src.start_line = e.span.start_line;
      if (e.span?.end_line !== undefined) src.end_line = e.span.end_line;
      sources.push(src);
    }

    if (sources.length > 0) {
      cite.sources = sources;
      cite.source_path = sources[0]!.source_path;
      if (sources[0]!.start_line !== undefined) {
        cite.start_line = sources[0]!.start_line;
      }
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
