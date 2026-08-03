// gsd-graph — realpath-confined prompt request/result file I/O (D-04)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Prompt file exchange under store root via storeFile basenames only.
 * Path separators rejected by storeFile (D-04, T-06-05).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { resolveStoreRoot, storeFile } from '../io/paths';
import type { PromptStage } from '../types';

/** Stages that have request/result file pairs (query reserved — no files). */
export type PromptFileStage = 'extract' | 'normalize' | 'answer' | 'maintain';

const REQUEST_BASENAMES: Record<PromptFileStage, string> = {
  extract: '.prompt-extract.json',
  normalize: '.prompt-normalize.json',
  answer: '.prompt-answer.json',
  maintain: '.prompt-maintain.json',
};

const RESULT_BASENAMES: Record<PromptFileStage, string> = {
  extract: '.prompt-extract-result.json',
  normalize: '.prompt-normalize-result.json',
  answer: '.prompt-answer-result.json',
  maintain: '.prompt-maintain-result.json',
};

export function isPromptFileStage(stage: string): stage is PromptFileStage {
  return (
    stage === 'extract' ||
    stage === 'normalize' ||
    stage === 'answer' ||
    stage === 'maintain'
  );
}

export function promptRequestBasename(stage: PromptFileStage): string {
  return REQUEST_BASENAMES[stage];
}

export function promptResultBasename(stage: PromptFileStage): string {
  return RESULT_BASENAMES[stage];
}

export interface PromptRequestEnvelope {
  stage: PromptFileStage;
  /** Question (answer) or free-form context. */
  question?: string;
  /** Content / corpus fingerprint for stale-result rejection (pitfall 6). */
  content_hash?: string;
  /** Graph built_at fingerprint. */
  built_at?: string;
  /** Arbitrary stage payload (pack summary, extract chunks, etc.). */
  payload?: unknown;
  written_at: string;
}

export interface WritePromptRequestOptions {
  stage: PromptFileStage;
  dir?: string;
  cwd?: string;
  question?: string;
  content_hash?: string;
  built_at?: string;
  payload?: unknown;
}

export interface WritePromptRequestResult {
  path: string;
  basename: string;
  envelope: PromptRequestEnvelope;
}

/**
 * Write `.prompt-<stage>.json` under store root (D-04).
 */
export function writePromptRequest(
  opts: WritePromptRequestOptions,
): WritePromptRequestResult {
  if (!isPromptFileStage(opts.stage)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `prompt request stage not supported: ${String(opts.stage)}`,
    );
  }
  const storeRoot = resolveStoreRoot({
    ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  mkdirSync(storeRoot, { recursive: true });
  const basename = promptRequestBasename(opts.stage);
  const path = storeFile(storeRoot, basename);
  const envelope: PromptRequestEnvelope = {
    stage: opts.stage,
    written_at: new Date().toISOString(),
    ...(opts.question !== undefined ? { question: opts.question } : {}),
    ...(opts.content_hash !== undefined
      ? { content_hash: opts.content_hash }
      : {}),
    ...(opts.built_at !== undefined ? { built_at: opts.built_at } : {}),
    ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
  };
  writeFileSync(path, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
  return { path, basename, envelope };
}

export interface ReadPromptResultOptions {
  stage: PromptFileStage;
  dir?: string;
  cwd?: string;
  /** Absolute path override (still must be readable); default store basename. */
  path?: string;
}

/**
 * Read `.prompt-<stage>-result.json` from store (D-04).
 * Parses JSON; does not Ajv-validate (callers use promptApply).
 */
export function readPromptResult(opts: ReadPromptResultOptions): unknown {
  if (!isPromptFileStage(opts.stage)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `prompt result stage not supported: ${String(opts.stage)}`,
    );
  }
  let path: string;
  if (opts.path !== undefined) {
    path = opts.path;
  } else {
    const storeRoot = resolveStoreRoot({
      ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    });
    path = storeFile(storeRoot, promptResultBasename(opts.stage));
  }
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `failed to read prompt result for ${opts.stage}: ${message}`,
      { path },
    );
  }
}

/**
 * Resolve store path for a prompt result basename (confined).
 * Rejects path separators via storeFile (D-04).
 */
export function resolvePromptResultPath(
  stage: PromptFileStage,
  opts?: { dir?: string; cwd?: string },
): string {
  const storeRoot = resolveStoreRoot({
    ...(opts?.dir !== undefined ? { dir: opts.dir } : {}),
    ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  return storeFile(storeRoot, promptResultBasename(stage));
}

/**
 * Reject unsafe basenames explicitly (tests / defense in depth).
 * storeFile already rejects separators; this surfaces PATH_ESCAPE clearly.
 */
export function assertSafePromptBasename(name: string): void {
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name === '..' ||
    name.includes('..')
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `invalid store basename: ${name}`,
    );
  }
  // Touch dirname to keep import used if tree-shaken elsewhere — no-op reference
  void dirname;
}

/** Map PromptStage including query to file stage or throw. */
export function requirePromptFileStage(stage: PromptStage | string): PromptFileStage {
  if (stage === 'query') {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'query prompt apply is not supported (NL→IR deferred; D-03)',
      { stage },
    );
  }
  if (!isPromptFileStage(stage)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `unknown prompt stage: ${String(stage)}`,
      { stage },
    );
  }
  return stage;
}
