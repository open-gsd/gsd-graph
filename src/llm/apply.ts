// gsd-graph — fail-closed prompt-result apply (Ajv + citation honesty)

/**
 * Unified prompt apply for extract | normalize | answer | maintain (D-02, D-03).
 * Answer path: Ajv validate → cited_triple_ids ⊆ pack.triples[].id → markdown.
 * Query stage has no apply path (NL→IR deferred).
 */

import { GSD_GRAPH_REASON, GraphError } from '../errors';
import {
  formatAjvErrors,
  validatePromptAnswerResult,
  validatePromptExtractResult,
  validatePromptMaintainResult,
  validatePromptNormalizeResult,
} from '../schema/validators';
import type {
  GraphNode,
  PromptAnswerResult,
  PromptExtractResult,
  PromptMaintainResult,
  PromptNormalizeResult,
  PromptStage,
  SubgraphPack,
  Triple,
} from '../types';

/**
 * Enforce cited_triple_ids ⊆ pack.triples[].id (D-02, T-06-01).
 * Throws GraphError PROMPT_RESULT_INVALID on any id not present in the pack.
 */
export function assertCitationsInPack(
  pack: SubgraphPack,
  cited_triple_ids: readonly string[],
): void {
  const packIds = new Set(pack.triples.map((t) => t.id));
  for (const id of cited_triple_ids) {
    if (!packIds.has(id)) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `cited_triple_id not in pack: ${id}`,
        { cited_triple_id: id },
      );
    }
  }
}

export interface PromptApplyAnswerInput {
  pack: SubgraphPack;
  /** Already-parsed prompt result object (tests / library). */
  result: unknown;
}

export interface PromptApplyAnswerOutput {
  answer_markdown: string;
  cited_triple_ids: string[];
  result: PromptAnswerResult;
}

/**
 * Ajv-validate answer result then citation-subset-gate; return markdown (D-02).
 */
export function promptApplyAnswer(
  input: PromptApplyAnswerInput,
): PromptApplyAnswerOutput {
  const ok = validatePromptAnswerResult(input.result);
  if (!ok) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `answer prompt result schema invalid: ${formatAjvErrors(validatePromptAnswerResult.errors)}`,
      { errors: validatePromptAnswerResult.errors },
    );
  }
  const result = input.result as PromptAnswerResult;
  assertCitationsInPack(input.pack, result.cited_triple_ids);
  return {
    answer_markdown: result.answer_markdown,
    cited_triple_ids: [...result.cited_triple_ids],
    result,
  };
}

export interface PromptApplyOptions {
  stage: PromptStage;
  /** Parsed result object (required for answer/extract/normalize/maintain). */
  result?: unknown;
  /** Pack required for answer stage citation gate. */
  pack?: SubgraphPack;
  /**
   * Optional fingerprint from the request written earlier.
   * When both sides present, mismatch → PROMPT_RESULT_INVALID (pitfall 6).
   */
  expectedFingerprint?: {
    question?: string;
    content_hash?: string;
    built_at?: string;
  };
}

export type PromptApplyResult =
  | {
      stage: 'answer';
      answer_markdown: string;
      cited_triple_ids: string[];
      result: PromptAnswerResult;
    }
  | {
      stage: 'extract';
      nodes: GraphNode[];
      triples: Triple[];
      result: PromptExtractResult;
    }
  | {
      stage: 'normalize';
      nodes: GraphNode[];
      triples: Triple[];
      suggestions?: string[];
      result: PromptNormalizeResult;
    }
  | {
      stage: 'maintain';
      suggestions: string[];
      result: PromptMaintainResult;
    };

function checkFingerprint(
  result: {
    question?: string;
    content_hash?: string;
    built_at?: string;
  },
  expected?: PromptApplyOptions['expectedFingerprint'],
): void {
  if (expected === undefined) return;
  if (
    expected.question !== undefined &&
    result.question !== undefined &&
    result.question !== expected.question
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'prompt result question fingerprint mismatch',
      { expected: expected.question, actual: result.question },
    );
  }
  if (
    expected.content_hash !== undefined &&
    result.content_hash !== undefined &&
    result.content_hash !== expected.content_hash
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'prompt result content_hash fingerprint mismatch',
      { expected: expected.content_hash, actual: result.content_hash },
    );
  }
  if (
    expected.built_at !== undefined &&
    result.built_at !== undefined &&
    result.built_at !== expected.built_at
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'prompt result built_at fingerprint mismatch',
      { expected: expected.built_at, actual: result.built_at },
    );
  }
}

/**
 * Unified prompt apply entry (D-02, D-03).
 * Stages: extract | normalize | answer | maintain.
 * query → clear GraphError (not supported in v0.1).
 */
export function promptApply(opts: PromptApplyOptions): PromptApplyResult {
  const stage = opts.stage;

  if (stage === 'query') {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'query prompt apply is not supported (NL→IR deferred; D-03)',
      { stage },
    );
  }

  if (opts.result === undefined) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `prompt apply ${stage}: result object required`,
      { stage },
    );
  }

  if (stage === 'answer') {
    if (opts.pack === undefined) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        'prompt apply answer: pack required for citation gate',
      );
    }
    const applied = promptApplyAnswer({ pack: opts.pack, result: opts.result });
    checkFingerprint(applied.result, opts.expectedFingerprint);
    return {
      stage: 'answer',
      answer_markdown: applied.answer_markdown,
      cited_triple_ids: applied.cited_triple_ids,
      result: applied.result,
    };
  }

  if (stage === 'extract') {
    const ok = validatePromptExtractResult(opts.result);
    if (!ok) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `extract prompt result schema invalid: ${formatAjvErrors(validatePromptExtractResult.errors)}`,
        { errors: validatePromptExtractResult.errors },
      );
    }
    const result = opts.result as PromptExtractResult;
    checkFingerprint(result, opts.expectedFingerprint);
    return {
      stage: 'extract',
      nodes: result.nodes ?? [],
      triples: result.triples ?? [],
      result,
    };
  }

  if (stage === 'normalize') {
    const ok = validatePromptNormalizeResult(opts.result);
    if (!ok) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `normalize prompt result schema invalid: ${formatAjvErrors(validatePromptNormalizeResult.errors)}`,
        { errors: validatePromptNormalizeResult.errors },
      );
    }
    const result = opts.result as PromptNormalizeResult;
    checkFingerprint(result, opts.expectedFingerprint);
    return {
      stage: 'normalize',
      nodes: result.nodes ?? [],
      triples: result.triples ?? [],
      ...(result.suggestions !== undefined
        ? { suggestions: result.suggestions }
        : {}),
      result,
    };
  }

  if (stage === 'maintain') {
    const ok = validatePromptMaintainResult(opts.result);
    if (!ok) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `maintain prompt result schema invalid: ${formatAjvErrors(validatePromptMaintainResult.errors)}`,
        { errors: validatePromptMaintainResult.errors },
      );
    }
    const result = opts.result as PromptMaintainResult;
    checkFingerprint(result, opts.expectedFingerprint);
    // Maintain is suggestions only — never rewrite graph.v1 (DESIGN pitfall).
    return {
      stage: 'maintain',
      suggestions: result.suggestions ?? [],
      result,
    };
  }

  const _never: never = stage;
  throw new GraphError(
    GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
    `unknown prompt stage: ${String(_never)}`,
  );
}
