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

/**
 * Grounded answer over packSubgraph (ANS-01, ANS-02).
 *
 * Default: packSubgraph + deterministic markdown — no LLM (D-01, D-05, D-10).
 * Opt-in: applyPromptResult applies Ajv-validated prompt result with citation gate.
 */
export function answer(opts: AnswerOptions): GroundedAnswer {
  const pack = packSubgraph(opts);

  if (pack.triples.length === 0) {
    // Empty pack is a successful abstain — do not throw GraphError (ANS-02, D-04).
    // Also skip apply: honesty preserved before any LLM markdown (D-02).
    return {
      pack,
      answer_markdown: '',
      mode: 'abstain',
      abstained: true,
      abstain_reason: GSD_GRAPH_REASON.EMPTY_SUBGRAPH,
    };
  }

  // Opt-in prompt apply (file exchange or in-memory result) — D-02, D-10.
  if (opts.applyPromptResult === true) {
    const resultObj = loadPromptResultObject(opts);
    const applied = promptApplyAnswer({ pack, result: resultObj });
    return {
      pack,
      answer_markdown: applied.answer_markdown,
      mode: 'prompt_pending',
      abstained: false,
      prompt_bundle: applied.result,
    };
  }

  // Opt-in http mode is wired in Task 3 via llmMode + fetchImpl.
  // Keep deterministic default when llmMode is absent or 'none' (D-01).
  if (opts.llmMode === 'http') {
    // Lazy require pattern avoided — Task 3 will import httpChatCompletion.
    // For now fail closed if http requested without the http apply path filled.
    // Task 3 replaces this branch with real http + same citation gates.
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'http llm mode requires http client wiring (enable after Task 3)',
    );
  }

  return {
    pack,
    answer_markdown: formatDeterministicMarkdown(pack),
    mode: 'deterministic',
    abstained: false,
  };
}
