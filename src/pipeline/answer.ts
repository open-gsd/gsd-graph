// gsd-graph — deterministic answer() over packSubgraph (ANS-01 / ANS-02)

/**
 * Pure formatter over packSubgraph (D-03, D-04, D-05, D-10, D-11, D-12).
 * Non-empty pack → cited markdown (Seeds / Relationships / Paths / Citations).
 * Empty pack → mode abstain, abstained true — never invent edges (ANS-02).
 * Default path never calls an LLM (D-01, D-05, D-10).
 * Optional applyPromptResult / llmMode=http: fail-closed Ajv + citation subset (D-02).
 */

import { readFileSync } from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { loadGraphV1Cached } from '../io/graph-cache';
import { resolveStoreRoot } from '../io/paths';
import { promptApplyAnswer } from '../llm/apply';
import { loadPromptTemplate } from '../llm/prompt-templates';
import {
  httpChatCompletion,
  parseHttpPromptResultJson,
} from '../llm/http-client';
import type {
  AnswerOptions,
  Community,
  GraphV1Document,
  GroundedAnswer,
  PackCitation,
  QueryPath,
  SubgraphPack,
  Triple,
} from '../types';
import { detectCommunities } from './communities';
import { packSubgraph } from './pack';

function renderRelationship(t: Triple): string {
  return `- ${t.s} —${t.p}→ ${t.o} (\`${t.id}\`)`;
}

function renderPath(path: QueryPath): string {
  if (path.nodes.length === 0) {
    return '- (empty path)';
  }
  let line = path.nodes[0]!;
  for (let i = 0; i < path.predicates.length; i++) {
    const pred = path.predicates[i]!;
    const next = path.nodes[i + 1];
    if (next === undefined) break;
    line += ` -${pred}→ ${next}`;
  }
  return `- ${line}`;
}

function renderCitation(c: PackCitation): string {
  const core = `\`${c.triple_id}\`: ${c.s} —${c.p}→ ${c.o}`;
  // Trust signal: a 5-source EXTRACTED fact should not read like a lone
  // AMBIGUOUS one (D-02 spirit — confidence is part of the citation).
  const tier =
    c.confidence !== undefined
      ? ` [${c.confidence}${(c.source_count ?? 0) > 1 ? ` ×${c.source_count}` : ''}${c.superseded === true ? ' · superseded' : ''}]`
      : c.superseded === true
        ? ' [superseded]'
        : '';
  const sources = c.sources ?? [];
  if (sources.length === 0) {
    if (c.source_path !== undefined && c.source_path.length > 0) {
      return `- ${core}${tier} (${c.source_path})`;
    }
    return `- ${core}${tier}`;
  }
  const first = sources[0]!;
  const loc =
    first.start_line !== undefined
      ? `${first.source_path}:${first.start_line}`
      : first.source_path;
  const extra = sources.length > 1 ? ` +${sources.length - 1} more` : '';
  return `- ${core}${tier} (${loc}${extra})`;
}

/**
 * Build deterministic markdown from a non-empty pack (D-03 / RESEARCH Pattern 2).
 * Relationships and Citations iterate pack.triples only — never invent edges.
 */
export function formatDeterministicMarkdown(pack: SubgraphPack): string {
  const seedLines =
    pack.seeds.length === 0
      ? ['- (none)']
      : pack.seeds.map((id) => {
          const node = pack.nodes.find((n) => n.id === id);
          if (node !== undefined && node.label.length > 0) {
            return `- ${id} (${node.label})`;
          }
          return `- ${id}`;
        });

  const relLines =
    pack.triples.length === 0
      ? ['- (none)']
      : pack.triples.map(renderRelationship);

  const pathLines =
    pack.paths.length === 0 ? ['- (none)'] : pack.paths.map(renderPath);

  const citeLines =
    pack.citations.length === 0
      ? ['- (none)']
      : pack.citations.map(renderCitation);

  return [
    '## Seeds',
    ...seedLines,
    '',
    '## Relationships',
    ...relLines,
    '',
    '## Paths',
    ...pathLines,
    '',
    '## Citations',
    ...citeLines,
    '',
  ].join('\n');
}

function loadPromptResultObject(opts: AnswerOptions): unknown {
  if (opts.promptResult !== undefined) {
    return opts.promptResult;
  }
  if (opts.promptResultPath !== undefined) {
    try {
      const raw = readFileSync(opts.promptResultPath, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `failed to read prompt result: ${message}`,
        { path: opts.promptResultPath },
      );
    }
  }
  throw new GraphError(
    GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
    'applyPromptResult requires promptResult or promptResultPath',
  );
}

/**
 * Abstain with a discriminating reason (ANS-02, revised):
 * - no_seeds_matched — the question's tokens matched no node at all
 * - seeds_disconnected — seeds matched but their neighborhood has no triples
 * - empty_subgraph — fallback (e.g. budget trimmed everything away)
 */
function abstainEmpty(pack: SubgraphPack): GroundedAnswer {
  let reason: string = GSD_GRAPH_REASON.EMPTY_SUBGRAPH;
  if (pack.seeds.length === 0) {
    reason = GSD_GRAPH_REASON.NO_SEEDS_MATCHED;
  } else if (pack.trimmed === null) {
    reason = GSD_GRAPH_REASON.SEEDS_DISCONNECTED;
  }
  const suggestions = (pack.seed_suggestions ?? []).map(
    (s) => `${s.label} (${s.id})`,
  );
  return {
    pack,
    answer_markdown: '',
    mode: 'abstain',
    abstained: true,
    abstain_reason: reason,
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

/**
 * Overview-shaped questions: the corpus-level asks a brownfield user opens
 * with. When such a question packs empty (or global is forced), community
 * themes answer instead of an abstain (GraphRAG-style global search).
 */
export const OVERVIEW_QUESTION_RE =
  /(overview|overall|high[- ]?level|architecture|structure|main\s+(?:areas|themes|topics|parts|components|concepts)|key\s+(?:areas|themes|topics|concepts)|themes|what\s+(?:is|are)\s+(?:this|the)\s+(?:project|repo|repository|codebase)\s*(?:about)?|about\s+this\s+(?:project|repo|repository|codebase))/i;

/** Max communities rendered in a global answer. */
const GLOBAL_ANSWER_TOP_K = 5;

/** Representative internal triples cited per community. */
const GLOBAL_ANSWER_CITES_PER_COMMUNITY = 2;

function distinctSources(t: Triple): number {
  const seen = new Set<string>();
  for (const e of t.provenance ?? []) {
    if (!e.source_path) continue;
    seen.add(`${e.source_path}\0${e.span?.start_line ?? ''}`);
  }
  return seen.size;
}

function citationOf(t: Triple): PackCitation {
  const cite: PackCitation = {
    triple_id: t.id,
    s: t.s,
    p: t.p,
    o: t.o,
    confidence: t.confidence,
    source_count: distinctSources(t),
  };
  const first = (t.provenance ?? []).find(
    (e) => e.source_path !== undefined && e.source_path.length > 0,
  );
  if (first !== undefined) {
    cite.source_path = first.source_path;
    if (first.span?.start_line !== undefined) {
      cite.start_line = first.span.start_line;
    }
    cite.sources = (t.provenance ?? [])
      .filter((e) => e.source_path)
      .map((e) => ({
        source_path: e.source_path,
        ...(e.extractor !== undefined ? { extractor: e.extractor } : {}),
        ...(e.span?.start_line !== undefined
          ? { start_line: e.span.start_line }
          : {}),
        ...(e.span?.end_line !== undefined ? { end_line: e.span.end_line } : {}),
      }));
  }
  return cite;
}

/**
 * Corpus-level theme answer from community detection (mode 'global').
 * Returns null when the graph yields no communities — caller abstains.
 */
function globalAnswer(
  graph: GraphV1Document,
  emptyPackShape: SubgraphPack,
): GroundedAnswer | null {
  const det = detectCommunities({ graph, write: false });
  if (det.communities.length === 0) return null;

  const top: Community[] = [...det.communities]
    .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id))
    .slice(0, GLOBAL_ANSWER_TOP_K);

  // Bucket internal triples per community for representative citations.
  const nodeCommunity = new Map<string, string>();
  for (const c of top) {
    for (const m of c.members) nodeCommunity.set(m, c.id);
  }
  const byCommunity = new Map<string, Triple[]>();
  for (const t of graph.triples) {
    const cs = nodeCommunity.get(t.s);
    if (cs === undefined || nodeCommunity.get(t.o) !== cs) continue;
    let list = byCommunity.get(cs);
    if (!list) {
      list = [];
      byCommunity.set(cs, list);
    }
    list.push(t);
  }

  const labelOf = (id: string): string => {
    const n = graph.nodes.find((x) => x.id === id);
    return n !== undefined && n.label.length > 0 ? n.label : id;
  };

  const lines: string[] = ['## Themes', ''];
  const citedTriples: Triple[] = [];
  for (const c of top) {
    lines.push(`### ${c.label} (${c.size} nodes)`);
    const topNodes = c.top_nodes
      .slice(0, 5)
      .map((n) => n.label || n.id)
      .join(', ');
    if (topNodes.length > 0) lines.push(`- Key nodes: ${topNodes}`);
    const preds = c.top_predicates
      .slice(0, 3)
      .map((p) => `${p.p} (${p.count})`)
      .join(', ');
    if (preds.length > 0) lines.push(`- Main relationships: ${preds}`);

    const reps = (byCommunity.get(c.id) ?? [])
      .sort(
        (a, b) =>
          distinctSources(b) - distinctSources(a) || a.id.localeCompare(b.id),
      )
      .slice(0, GLOBAL_ANSWER_CITES_PER_COMMUNITY);
    for (const t of reps) {
      lines.push(
        `- e.g. ${labelOf(t.s)} —${t.p}→ ${labelOf(t.o)} (\`${t.id}\`)`,
      );
      citedTriples.push(t);
    }
    lines.push('');
  }

  const citations = citedTriples.map(citationOf);
  lines.push('## Citations');
  for (const c of citations) {
    const tier = c.confidence !== undefined ? ` [${c.confidence}]` : '';
    const loc =
      c.source_path !== undefined
        ? ` (${c.source_path}${c.start_line !== undefined ? `:${c.start_line}` : ''})`
        : '';
    lines.push(`- \`${c.triple_id}\`: ${c.s} —${c.p}→ ${c.o}${tier}${loc}`);
  }
  lines.push('');

  const citedNodeIds = new Set<string>();
  for (const t of citedTriples) {
    citedNodeIds.add(t.s);
    citedNodeIds.add(t.o);
  }

  const pack: SubgraphPack = {
    ...emptyPackShape,
    nodes: graph.nodes.filter((n) => citedNodeIds.has(n.id)),
    triples: citedTriples,
    citations,
  };

  return {
    pack,
    answer_markdown: lines.join('\n'),
    mode: 'global',
    abstained: false,
  };
}

function loadAnswerGraph(opts: AnswerOptions): GraphV1Document {
  if (opts.graph !== undefined) return opts.graph;
  return loadGraphV1Cached(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
}

/**
 * Grounded answer over packSubgraph (ANS-01, ANS-02).
 *
 * Default: packSubgraph + deterministic markdown — no LLM / no fetch (D-01, D-05, D-10).
 * Overview-shaped questions with an empty pack (or opts.global) answer from
 * community themes (mode 'global') instead of abstaining.
 * Opt-in applyPromptResult: Ajv + citation gate → mode prompt_pending.
 * Opt-in llmMode http with in-memory promptResult: same gates → mode http.
 * For live HTTP fetch, use answerHttp() (async) — keeps default path sync and offline.
 */
export function answer(opts: AnswerOptions): GroundedAnswer {
  const pack = packSubgraph(opts);

  if (opts.global === true || pack.triples.length === 0) {
    const wantsGlobal =
      opts.global === true || OVERVIEW_QUESTION_RE.test(opts.question);
    if (wantsGlobal) {
      const g = globalAnswer(loadAnswerGraph(opts), {
        ...pack,
        nodes: [],
        triples: [],
        paths: [],
        citations: [],
      });
      if (g !== null) return g;
    }
    if (pack.triples.length === 0) {
      return abstainEmpty(pack);
    }
  }

  // Opt-in prompt file / in-memory apply (D-02, D-10).
  if (opts.applyPromptResult === true) {
    const resultObj = loadPromptResultObject(opts);
    const applied = promptApplyAnswer({ pack, result: resultObj });
    const mode =
      opts.llmMode === 'http' ? ('http' as const) : ('prompt_pending' as const);
    return {
      pack,
      answer_markdown: applied.answer_markdown,
      mode,
      abstained: false,
      prompt_bundle: applied.result,
    };
  }

  // Sync http path: caller already obtained structured result (e.g. tests).
  if (opts.llmMode === 'http' && opts.promptResult !== undefined) {
    const applied = promptApplyAnswer({ pack, result: opts.promptResult });
    return {
      pack,
      answer_markdown: applied.answer_markdown,
      mode: 'http',
      abstained: false,
      prompt_bundle: applied.result,
    };
  }

  // llmMode http without result → must use answerHttp (async fetch).
  if (opts.llmMode === 'http') {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'llmMode http without promptResult: use answerHttp() for network fetch, or pass promptResult',
    );
  }

  return {
    pack,
    answer_markdown: formatDeterministicMarkdown(pack),
    mode: 'deterministic',
    abstained: false,
  };
}

export interface AnswerHttpOptions extends AnswerOptions {
  /** System + user messages for chat completions. Built from pack when omitted. */
  messages?: Array<{ role: string; content: string }>;
  /** Required for live http: base URL (no ambient default network). */
  httpBaseUrl?: string;
  httpModel?: string;
  httpApiKeyEnv?: string;
  /** Env map for API key lookup in tests (D-05). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Async grounded answer via OpenAI-compatible HTTP (D-05, D-02).
 * Only runs network when resolveLlmMode is http (flag/config) — never ambient.
 * Parses JSON content through the same Ajv + citation gates as prompt apply.
 */
export async function answerHttp(
  opts: AnswerHttpOptions,
): Promise<GroundedAnswer> {
  // Calling answerHttp() is itself the explicit http opt-in (D-01) — no extra
  // mode resolution needed here; CLI callers resolve flags before dispatch.
  const pack = packSubgraph(opts);
  if (pack.triples.length === 0) {
    return abstainEmpty(pack);
  }

  // If structured result already provided, skip network (tests).
  if (opts.promptResult !== undefined) {
    const applied = promptApplyAnswer({ pack, result: opts.promptResult });
    return {
      pack,
      answer_markdown: applied.answer_markdown,
      mode: 'http',
      abstained: false,
      prompt_bundle: applied.result,
    };
  }

  const provider = opts.llmHttp?.provider ?? 'openai';
  const baseUrl = opts.httpBaseUrl ?? opts.llmHttp?.baseUrl;
  const model =
    opts.httpModel ??
    opts.llmHttp?.model ??
    (provider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o-mini');
  const apiKeyEnv =
    opts.httpApiKeyEnv ??
    opts.llmHttp?.apiKeyEnv ??
    (provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY');

  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'answerHttp requires httpBaseUrl or llmHttp.baseUrl (no ambient endpoint)',
    );
  }

  const packJson = JSON.stringify(
    {
      question: pack.question,
      seeds: pack.seeds,
      triples: pack.triples.map((t) => ({
        id: t.id,
        s: t.s,
        p: t.p,
        o: t.o,
      })),
      citations: pack.citations,
    },
    null,
    2,
  );

  // System prompt: prompts/answer.md template (store override → shipped
  // default) + the non-negotiable wire contract.
  let answerTemplate = '';
  try {
    answerTemplate = loadPromptTemplate('answer', {
      ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
    }).text.trim();
  } catch {
    // contract line below is self-sufficient
  }
  const messages =
    opts.messages ??
    ([
      {
        role: 'system',
        content: [
          ...(answerTemplate.length > 0 ? [answerTemplate, ''] : []),
          'Return JSON only matching prompt-answer-result schema: { answer_markdown, cited_triple_ids }. cited_triple_ids must be subset of pack triple ids.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Question: ${opts.question}\n\nPack:\n${packJson}`,
      },
    ] as Array<{ role: string; content: string }>);

  const completion = await httpChatCompletion({
    baseUrl,
    model,
    messages,
    apiKeyEnv,
    provider,
    ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
  });

  const resultObj = parseHttpPromptResultJson(completion.content);
  const applied = promptApplyAnswer({ pack, result: resultObj });
  return {
    pack,
    answer_markdown: applied.answer_markdown,
    mode: 'http',
    abstained: false,
    prompt_bundle: applied.result,
  };
}
