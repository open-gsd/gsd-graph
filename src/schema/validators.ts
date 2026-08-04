// gsd-graph — Ajv compile-once validators for graph.v1, ontology packs, review-queue

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

/**
 * Package root: from dist/schema → ../.. ; from src/schema (tsx) same depth.
 * Schemas ship in package `files` as schemas/*.schema.json (D-09).
 */
const PACKAGE_ROOT = join(__dirname, '..', '..');

function loadSchema(name: string): object {
  const path = join(PACKAGE_ROOT, 'schemas', name);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as object;
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});
addFormats(ajv);

const graphV1Schema = loadSchema('graph-v1.schema.json');
const ontologyPackSchema = loadSchema('ontology-pack.schema.json');
const reviewQueueSchema = loadSchema('review-queue.schema.json');
const promptAnswerResultSchema = loadSchema('prompt-answer-result.schema.json');
const promptExtractResultSchema = loadSchema(
  'prompt-extract-result.schema.json',
);
const promptNormalizeResultSchema = loadSchema(
  'prompt-normalize-result.schema.json',
);
const promptMaintainResultSchema = loadSchema(
  'prompt-maintain-result.schema.json',
);

/** Compile once at module load (D-09) — do not recompile per call. */
export const validateGraphV1: ValidateFunction = ajv.compile(graphV1Schema);

/** Compile once at module load (D-09) — do not recompile per call. */
export const validateOntologyPack: ValidateFunction =
  ajv.compile(ontologyPackSchema);

/** Compile once at module load (D-09 / OQ-4) — review-queue.json authority. */
export const validateReviewQueue: ValidateFunction =
  ajv.compile(reviewQueueSchema);

/** Compile once — answer prompt result (D-02 / LLM-01). */
export const validatePromptAnswerResult: ValidateFunction = ajv.compile(
  promptAnswerResultSchema,
);

/** Compile once — extract prompt result (D-02 / LLM-01). */
export const validatePromptExtractResult: ValidateFunction = ajv.compile(
  promptExtractResultSchema,
);

/** Compile once — normalize prompt result (D-02 / LLM-01). */
export const validatePromptNormalizeResult: ValidateFunction = ajv.compile(
  promptNormalizeResultSchema,
);

/** Compile once — maintain prompt result (D-02 / LLM-01). */
export const validatePromptMaintainResult: ValidateFunction = ajv.compile(
  promptMaintainResultSchema,
);

/** Human-readable Ajv error summary for GraphError details. */
export function formatAjvErrors(
  errors: ErrorObject[] | null | undefined,
): string {
  if (!errors || errors.length === 0) return 'unknown schema error';
  return errors
    .map((e) => {
      const path = e.instancePath || '(root)';
      return `${path} ${e.message ?? 'invalid'}`.trim();
    })
    .join('; ');
}

/** Resolved package root used to locate schemas/ and ontology-packs/. */
export function getPackageRoot(): string {
  return PACKAGE_ROOT;
}
