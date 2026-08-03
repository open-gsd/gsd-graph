// gsd-graph — Ajv compile-once validators for graph.v1 and ontology packs
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

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

/** Compile once at module load (D-09) — do not recompile per call. */
export const validateGraphV1: ValidateFunction = ajv.compile(graphV1Schema);

/** Compile once at module load (D-09) — do not recompile per call. */
export const validateOntologyPack: ValidateFunction =
  ajv.compile(ontologyPackSchema);

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
