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
import { confidenceRank } from './ids';
import {
  applyBudget,
  buildAdjacencyMap,
  DEFAULT_SEED_HOPS,
  expandHops,
  query,
  type AdjacencyMap,
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

/**
 * Preferred singular form ("dependencies" → "dependency", "phases" → "phase").
 * Conservative plural rules only — no verb stemming, no dictionary.
 */
export function singularizeToken(t: string): string {
  if (t.length >= 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length >= 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/**
 * All plural-strip variants of a word (including itself). English plurals are
 * ambiguous without a dictionary ("phases"→phase but "buses"→bus), so both
 * sides of a match contribute every variant and a hit is any intersection.
 */
export function tokenVariants(t: string): string[] {
  const out = new Set([t]);
  if (t.length >= 4 && t.endsWith('ies')) out.add(`${t.slice(0, -3)}y`);
  if (t.length >= 4 && t.endsWith('es')) out.add(t.slice(0, -2));
  if (t.length >= 3 && t.endsWith('s') && !t.endsWith('ss')) out.add(t.slice(0, -1));
  return [...out];
}

function wordStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.split(/[^a-z0-9]+/u)) {
    if (w.length < 2) continue;
    for (const v of tokenVariants(w)) out.add(v);
  }
  return out;
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
  labelStems: Set<string>;
  descriptionStems: Set<string>;
  aliasStems: Set<string>;
}

function foldNodeFields(graph: GraphV1Document): NodeFields[] {
  return graph.nodes.map((n) => {
    const label = n.label.normalize('NFKC').toLowerCase();
    const description = (n.description ?? '').normalize('NFKC').toLowerCase();
    const aliases = (n.aliases ?? []).map((a) => a.normalize('NFKC').toLowerCase());
    const aliasStems = new Set<string>();
    for (const a of aliases) {
      for (const s of wordStems(a)) aliasStems.add(s);
    }
    return {
      id: n.id,
      label,
      labelLen: n.label.length,
      description,
      aliases,
      labelStems: wordStems(label),
      descriptionStems: wordStems(description),
      aliasStems,
    };
  });
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

  // Field hit = substring match (original behavior) OR stem-variant word match
  // ("phases" tokens hit a node labeled "phase" and vice versa).
  const anyVariant = (set: Set<string>, variants: readonly string[]): boolean =>
    variants.some((v) => set.has(v));
  const labelHit = (f: NodeFields, token: string, variants: readonly string[]): boolean =>
    f.label.includes(token) || anyVariant(f.labelStems, variants);
  const descHit = (f: NodeFields, token: string, variants: readonly string[]): boolean =>
    f.description.includes(token) || anyVariant(f.descriptionStems, variants);
  const aliasHit = (f: NodeFields, token: string, variants: readonly string[]): boolean =>
    f.aliases.some((a) => a.includes(token)) || anyVariant(f.aliasStems, variants);

  // Pass 1: document frequency per token (any-field match).
  const idf = new Map<string, number>();
  for (const token of tokens) {
    if (idf.has(token)) continue;
    const variants = tokenVariants(token);
    let df = 0;
    for (const f of fields) {
      if (labelHit(f, token, variants) || descHit(f, token, variants) || aliasHit(f, token, variants)) {
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
      const variants = tokenVariants(token);
      if (labelHit(f, token, variants)) score += 3 * w;
      if (descHit(f, token, variants)) score += 1 * w;
      if (aliasHit(f, token, variants)) score += 2 * w;
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

/** Bounded Levenshtein distance; returns limit+1 when exceeded (early exit). */
function boundedEditDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (cur[j]! < rowMin) rowMin = cur[j]!;
    }
    if (rowMin > limit) return limit + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/**
 * "Did you mean" candidates for a question that matched no seeds:
 * nodes whose label/alias words are within a small edit distance of some
 * question token. Deterministic ranking: total distance asc, label length
 * asc, id asc. Exported for direct use in abstain UIs.
 */
export function suggestSeeds(
  graph: GraphV1Document,
  tokens: readonly string[],
  k = 5,
): Array<{ id: string; label: string }> {
  const usable = tokens.filter((t) => t.length >= 3);
  if (usable.length === 0) return [];
  const fields = foldNodeFields(graph);
  const ranked: Array<{
    id: string;
    label: string;
    dist: number;
    labelLen: number;
  }> = [];

  for (const f of fields) {
    let total = 0;
    let hits = 0;
    for (const token of usable) {
      const stem = singularizeToken(token);
      const limit = stem.length >= 6 ? 2 : 1;
      let best = limit + 1;
      for (const w of f.labelStems) {
        const d = boundedEditDistance(stem, w, limit);
        if (d < best) best = d;
        if (best === 0) break;
      }
      if (best > limit) {
        for (const w of f.aliasStems) {
          const d = boundedEditDistance(stem, w, limit);
          if (d < best) best = d;
          if (best === 0) break;
        }
      }
      if (best <= limit) {
        total += best;
        hits += 1;
      }
    }
    if (hits > 0) {
      const node = graph.nodes.find((n) => n.id === f.id);
      ranked.push({
        id: f.id,
        label: node?.label ?? f.id,
        dist: total + (usable.length - hits) * 3,
        labelLen: f.labelLen,
      });
    }
  }

  ranked.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    if (a.labelLen !== b.labelLen) return a.labelLen - b.labelLen;
    return a.id.localeCompare(b.id);
  });
  return ranked.slice(0, k).map(({ id, label }) => ({ id, label }));
}

function emptyPack(
  question: string,
  seeds: string[],
  budget: number | null,
  trimmed: string | null = null,
  seedSuggestions?: Array<{ id: string; label: string }>,
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
    ...(seedSuggestions !== undefined && seedSuggestions.length > 0
      ? { seed_suggestions: seedSuggestions }
      : {}),
  };
}

/** BFS depth of every node from the nearest seed (capped at maxHops). */
function seedDistances(
  adj: AdjacencyMap,
  seeds: readonly string[],
  maxHops: number,
): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier: string[] = [];
  for (const s of seeds) {
    dist.set(s, 0);
    frontier.push(s);
  }
  for (let d = 1; d <= maxHops && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const u of frontier) {
      for (const edge of adj.get(u) ?? []) {
        if (!dist.has(edge.neighbor)) {
          dist.set(edge.neighbor, d);
          next.push(edge.neighbor);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Relevance for budget trimming (higher = keep longer). Confidence stays the
 * dominant term (AMBIGUOUS always drops before EXTRACTED); seed proximity,
 * non-noise predicates, and multi-source provenance break ties so the budget
 * stops evicting the one triple that answers the question.
 */
export function packRelevanceScore(
  t: Triple,
  distances: ReadonlyMap<string, number>,
): number {
  const conf = confidenceRank(t.confidence) * 100;
  const dS = distances.get(t.s) ?? 99;
  const dO = distances.get(t.o) ?? 99;
  const d = Math.min(dS, dO);
  const proximity = Math.max(0, 12 - 4 * Math.min(d, 3));
  const predicate = t.p === 'mentions' ? 0 : 4;
  const sources = new Set(
    (t.provenance ?? []).map((e) => `${e.source_path}\0${e.span?.start_line ?? ''}`),
  ).size;
  const provenance = Math.min(sources, 5) * 2;
  // Superseded facts drop below one full confidence tier — history, not garbage.
  const superseded =
    t.superseded_by !== undefined && t.superseded_by.length > 0 ? -150 : 0;
  return conf + proximity + predicate + provenance + superseded;
}

function distinctSourceCount(t: Triple): number {
  const seen = new Set<string>();
  for (const e of t.provenance ?? []) {
    if (!e.source_path) continue;
    seen.add(`${e.source_path}\0${e.span?.start_line ?? ''}\0${e.span?.end_line ?? ''}`);
  }
  return seen.size;
}

function projectCitations(triples: readonly Triple[]): PackCitation[] {
  return triples.map((t) => {
    const cite: PackCitation = {
      triple_id: t.id,
      s: t.s,
      p: t.p,
      o: t.o,
      confidence: t.confidence,
      source_count: distinctSourceCount(t),
      ...(t.superseded_by !== undefined && t.superseded_by.length > 0
        ? { superseded: true }
        : {}),
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
  let seeds = scoreSeeds(graph, tokens, kSeeds);

  // Fallback seeds (semantic scorer / caller anchors) only when lexical
  // scoring found nothing — the deterministic path always wins when it can.
  if (seeds.length === 0 && opts.extraSeeds !== undefined) {
    const known = new Set(graph.nodes.map((n) => n.id));
    seeds = opts.extraSeeds.filter((id) => known.has(id)).slice(0, kSeeds);
  }

  if (seeds.length === 0) {
    return emptyPack(
      question,
      seeds,
      budget,
      null,
      suggestSeeds(graph, tokens),
    );
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
  const distances = seedDistances(adj, seeds, hops + 2);
  const budgeted = applyBudget(nodes, triples, budget, seedIdSet, (t) =>
    packRelevanceScore(t, distances),
  );
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
