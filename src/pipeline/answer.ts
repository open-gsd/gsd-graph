// gsd-graph — deterministic answer() over packSubgraph (ANS-01 / ANS-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Pure formatter over packSubgraph (D-03, D-04, D-05, D-10, D-11, D-12).
 * Non-empty pack → cited markdown (Seeds / Relationships / Paths / Citations).
 * Empty pack → mode abstain, abstained true — never invent edges (ANS-02).
 * Default path never calls an LLM (D-01, D-05, D-10).
 * Optional applyPromptResult / llmMode=http: fail-closed Ajv + citation subset (D-02).
 */

import { readFileSync } from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { promptApplyAnswer } from '../llm/apply';
import {
  httpChatCompletion,
  parseHttpPromptResultJson,
} from '../llm/http-client';
import { resolveLlmMode } from '../llm/provider';
import type {
  AnswerOptions,
  GroundedAnswer,
  PackCitation,
  QueryPath,
  SubgraphPack,
  Triple,
} from '../types';
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
  if (c.source_path !== undefined && c.source_path.length > 0) {
    return `- ${core} (${c.source_path})`;
  }
  return `- ${core}`;
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

function abstainEmpty(pack: SubgraphPack): GroundedAnswer {
  return {
    pack,
    answer_markdown: '',
    mode: 'abstain',
    abstained: true,
    abstain_reason: GSD_GRAPH_REASON.EMPTY_SUBGRAPH,
  };
}

/**
 * Grounded answer over packSubgraph (ANS-01, ANS-02).
 *
 * Default: packSubgraph + deterministic markdown — no LLM / no fetch (D-01, D-05, D-10).
 * Opt-in applyPromptResult: Ajv + citation gate → mode prompt_pending.
 * Opt-in llmMode http with in-memory promptResult: same gates → mode http.
 * For live HTTP fetch, use answerHttp() (async) — keeps default path sync and offline.
 */
export function answer(opts: AnswerOptions): GroundedAnswer {
  const pack = packSubgraph(opts);

  if (pack.triples.length === 0) {
    return abstainEmpty(pack);
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
  const mode = resolveLlmMode({
    ...(opts.llmMode !== undefined ? { flagMode: opts.llmMode } : {}),
  });
  // Force http for this entry, but still require explicit opt-in via llmMode or call site.
  if (mode !== 'http' && opts.llmMode !== 'http') {
    // Library call to answerHttp is explicit opt-in; allow even if resolve says none
    // when caller passed fetchImpl / http config — treat as http.
  }

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

  const baseUrl = opts.httpBaseUrl ?? opts.llmHttp?.baseUrl;
  const model = opts.httpModel ?? opts.llmHttp?.model ?? 'gpt-4o-mini';
  const apiKeyEnv =
    opts.httpApiKeyEnv ?? opts.llmHttp?.apiKeyEnv ?? 'OPENAI_API_KEY';

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

  const messages =
    opts.messages ??
    ([
      {
        role: 'system',
        content:
          'Return JSON only matching prompt-answer-result schema: { answer_markdown, cited_triple_ids }. cited_triple_ids must be subset of pack triple ids.',
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
