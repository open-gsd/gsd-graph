// gsd-graph — why: label-friendly path finding with prose explanation

/**
 * `gsd-graph why <a> <b>` — resolve two human terms to nodes, find the
 * shortest relationship path, and explain it as cited prose. Composition of
 * public query ops only (D-01); abstains honestly when no path exists.
 */

import { loadGraphV1Cached } from '../io/graph-cache';
import { resolveStoreRoot } from '../io/paths';
import type { GraphV1Document, PackCitationSource, Triple } from '../types';
import { matchTermSeeds, query } from './query';

export interface WhyOptions {
  /** Store directory override (resolveStoreRoot) when graph absent. */
  dir?: string;
  /** In-memory graph — skips loadGraphV1 (tests). */
  graph?: GraphV1Document;
  from: string;
  to: string;
  maxDepth?: number;
}

export interface WhyCitation {
  triple_id: string;
  s: string;
  p: string;
  o: string;
  /** Confidence tier of the cited triple (trust signal). */
  confidence?: string;
  sources: PackCitationSource[];
}

export interface WhyResult {
  from_term: string;
  to_term: string;
  from_id: string | null;
  to_id: string | null;
  found: boolean;
  reason: string | null;
  path: { nodes: string[]; predicates: string[] } | null;
  explanation_markdown: string;
  citations: WhyCitation[];
}

/**
 * Resolve a term to a node id: exact id match wins, else the best
 * label/alias substring match (shortest label, then id asc — deterministic).
 */
export function resolveNodeTerm(
  graph: GraphV1Document,
  term: string,
): string | null {
  if (graph.nodes.some((n) => n.id === term)) {
    return term;
  }
  const seeds = matchTermSeeds(graph, term);
  if (seeds.size === 0) return null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const candidates = [...seeds].sort((a, b) => {
    const la = byId.get(a)?.label.length ?? Number.MAX_SAFE_INTEGER;
    const lb = byId.get(b)?.label.length ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    return a.localeCompare(b);
  });
  return candidates[0] ?? null;
}

/** "depends_on" → "depends on" (prose-friendly predicate). */
function prosePredicate(p: string): string {
  return p.replace(/_/g, ' ');
}

function labelOf(graph: GraphV1Document, id: string): string {
  const node = graph.nodes.find((n) => n.id === id);
  return node !== undefined && node.label.length > 0 ? node.label : id;
}

function citeSources(t: Triple): PackCitationSource[] {
  const out: PackCitationSource[] = [];
  const seen = new Set<string>();
  for (const e of t.provenance) {
    if (!e.source_path) continue;
    const key = `${e.source_path}\0${e.span?.start_line ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const src: PackCitationSource = { source_path: e.source_path };
    if (e.extractor !== undefined) src.extractor = e.extractor;
    if (e.span?.start_line !== undefined) src.start_line = e.span.start_line;
    if (e.span?.end_line !== undefined) src.end_line = e.span.end_line;
    out.push(src);
  }
  return out;
}

/**
 * Explain how `from` connects to `to` through the graph.
 */
export function why(opts: WhyOptions): WhyResult {
  const graph =
    opts.graph ??
    loadGraphV1Cached(
      resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
    );

  const fromId = resolveNodeTerm(graph, opts.from);
  const toId = resolveNodeTerm(graph, opts.to);

  const base: Omit<
    WhyResult,
    'found' | 'reason' | 'path' | 'explanation_markdown' | 'citations'
  > = {
    from_term: opts.from,
    to_term: opts.to,
    from_id: fromId,
    to_id: toId,
  };

  if (fromId === null || toId === null) {
    const missing = [
      ...(fromId === null ? [opts.from] : []),
      ...(toId === null ? [opts.to] : []),
    ];
    return {
      ...base,
      found: false,
      reason: `no node matches: ${missing.join(', ')}`,
      path: null,
      explanation_markdown: '',
      citations: [],
    };
  }

  const result = query({
    graph,
    path: {
      from: fromId,
      to: toId,
      ...(opts.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
    },
  });

  const found = result.paths[0];
  if (found === undefined || found.predicates.length === 0) {
    const same = fromId === toId;
    return {
      ...base,
      found: false,
      reason: same
        ? 'both terms resolve to the same node'
        : 'no path connects these nodes',
      path: null,
      explanation_markdown: '',
      citations: [],
    };
  }

  // Sentence per hop, honoring stored edge direction when recoverable.
  const tripleByEndpoints = new Map<string, Triple>();
  for (const t of result.triples) {
    tripleByEndpoints.set(`${t.s}\0${t.p}\0${t.o}`, t);
  }

  const sentences: string[] = [];
  const citations: WhyCitation[] = [];
  for (let i = 0; i < found.predicates.length; i++) {
    const a = found.nodes[i]!;
    const b = found.nodes[i + 1]!;
    const p = found.predicates[i]!;
    const forward = tripleByEndpoints.get(`${a}\0${p}\0${b}`);
    const backward = tripleByEndpoints.get(`${b}\0${p}\0${a}`);
    const t = forward ?? backward;
    const subj = forward !== undefined ? a : b;
    const obj = forward !== undefined ? b : a;
    let sentence = `**${labelOf(graph, subj)}** ${prosePredicate(p)} **${labelOf(graph, obj)}**`;
    if (t !== undefined) {
      sentence += ` (\`${t.id}\`)`;
      citations.push({
        triple_id: t.id,
        s: t.s,
        p: t.p,
        o: t.o,
        confidence: t.confidence,
        sources: citeSources(t),
      });
    }
    sentences.push(sentence);
  }

  const chain = found.nodes.map((id) => labelOf(graph, id)).join(' → ');
  const citeLines = citations.map((c) => {
    const first = c.sources[0];
    const loc =
      first === undefined
        ? '(no source)'
        : first.start_line !== undefined
          ? `${first.source_path}:${first.start_line}`
          : first.source_path;
    const extra = c.sources.length > 1 ? ` +${c.sources.length - 1} more` : '';
    const tier = c.confidence !== undefined ? ` [${c.confidence}]` : '';
    return `- \`${c.triple_id}\`: ${c.s} —${c.p}→ ${c.o}${tier} (${loc}${extra})`;
  });

  const explanation = [
    `**${labelOf(graph, fromId)}** connects to **${labelOf(graph, toId)}** in ${found.predicates.length} hop${found.predicates.length === 1 ? '' : 's'}: ${chain}`,
    '',
    ...sentences.map((s) => `- ${s}`),
    '',
    '## Citations',
    ...(citeLines.length > 0 ? citeLines : ['- (none)']),
    '',
  ].join('\n');

  return {
    ...base,
    found: true,
    reason: null,
    path: found,
    explanation_markdown: explanation,
    citations,
  };
}
