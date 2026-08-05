// gsd-graph — load prompt stage templates from prompts/*.md with overrides

/**
 * The shipped prompts/*.md files are the tunable half of every LLM stage —
 * they load from disk (never hardcoded strings) so users can adjust the main
 * quality lever. Resolution order per stage:
 *   1. <store>/prompts/<stage>.md   — project-local override
 *   2. <packageRoot>/prompts/<stage>.md — shipped default
 * The template's content hash becomes prompt_version, recorded in the
 * provenance of everything the prompt produced.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { confineUnderRoot, resolveStoreRoot } from '../io/paths';
import { getPackageRoot } from '../schema/validators';
import type { PromptStage } from '../types';

export interface LoadedPromptTemplate {
  stage: PromptStage;
  /** Full markdown template text. */
  text: string;
  /** Where it resolved from. */
  source: 'store' | 'package';
  /** Absolute path of the resolved file. */
  path: string;
  /** `sha256:<12 hex>` of the template bytes — recorded as prompt_version. */
  version: string;
}

const VALID_STAGES: ReadonlySet<string> = new Set([
  'extract',
  'normalize',
  'query',
  'answer',
  'maintain',
]);

function versionOf(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)}`;
}

export interface LoadPromptTemplateOptions {
  /** Store directory override for the project-local override lookup. */
  dir?: string;
}

/** Load the template for a stage (store override → shipped default). */
export function loadPromptTemplate(
  stage: PromptStage,
  opts?: LoadPromptTemplateOptions,
): LoadedPromptTemplate {
  if (!VALID_STAGES.has(stage)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `unknown prompt stage: ${stage}`,
    );
  }

  // 1. Store-local override
  try {
    const storeRoot = resolveStoreRoot(
      opts?.dir !== undefined ? { dir: opts.dir } : {},
    );
    const overridePath = confineUnderRoot(
      storeRoot,
      path.join('prompts', `${stage}.md`),
    );
    if (fs.existsSync(overridePath)) {
      const text = fs.readFileSync(overridePath, 'utf8');
      return {
        stage,
        text,
        source: 'store',
        path: overridePath,
        version: versionOf(text),
      };
    }
  } catch {
    // fall through to the shipped default
  }

  // 2. Shipped default
  const shippedPath = path.join(getPackageRoot(), 'prompts', `${stage}.md`);
  let text: string;
  try {
    text = fs.readFileSync(shippedPath, 'utf8');
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `prompt template missing for stage ${stage}: ${err instanceof Error ? err.message : String(err)}`,
      { path: shippedPath },
    );
  }
  return {
    stage,
    text,
    source: 'package',
    path: shippedPath,
    version: versionOf(text),
  };
}
