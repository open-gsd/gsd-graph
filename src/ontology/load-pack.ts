// gsd-graph — replace-only ontology pack loader (ONT-01, ONT-03, D-05)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import {
  formatAjvErrors,
  getPackageRoot,
  validateOntologyPack,
} from '../schema/validators';
import type {
  LoadedOntology,
  OntologyPack,
  OntologyPredicate,
  UnknownPolicy,
} from './types';

export interface LoadOntologyPackOptions {
  /** Pack id (`general`) or filesystem path to a `.json` pack file. Default: `general`. */
  packIdOrPath?: string;
  /** Base directory for relative path packs. Default: process.cwd(). */
  baseDir?: string;
}

function resolvePackFilePath(
  packIdOrPath: string,
  baseDir: string,
  packageRoot: string,
): string {
  if (isAbsolute(packIdOrPath)) {
    return packIdOrPath;
  }

  const looksLikePath =
    packIdOrPath.endsWith('.json') ||
    packIdOrPath.includes('/') ||
    packIdOrPath.includes('\\');

  if (looksLikePath) {
    return resolve(baseDir, packIdOrPath);
  }

  // Pack id → package-shipped ontology-packs/<id>/ontology.json (not cwd store).
  return join(packageRoot, 'ontology-packs', packIdOrPath, 'ontology.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePolicy(
  value: unknown,
  strict: boolean,
): UnknownPolicy {
  if (value === 'review' || value === 'coerce' || value === 'drop') {
    return value;
  }
  // DESIGN: strict defaults both policies to review when omitted.
  if (strict) return 'review';
  // Non-strict default when omitted is coerce (DESIGN policy table).
  return 'coerce';
}

function toOntologyPack(raw: Record<string, unknown>): OntologyPack {
  const strict = typeof raw.strict === 'boolean' ? raw.strict : true;
  const predicates = (raw.predicates as OntologyPredicate[]).map((p) => ({
    id: p.id,
    domain: [...p.domain],
    range: [...p.range],
  }));

  return {
    id: raw.id as string,
    version: raw.version as string,
    title: raw.title as string,
    node_types: [...(raw.node_types as string[])],
    predicates,
    strict,
    unknown_predicate_policy: normalizePolicy(
      raw.unknown_predicate_policy,
      strict,
    ),
    unknown_type_policy: normalizePolicy(raw.unknown_type_policy, strict),
  };
}

/**
 * Load + Ajv-validate an ontology pack.
 *
 * Replace-only (ONT-03 / D-05): packs with own-property `extends` are rejected.
 * No multi-pack merge API exists in v0.1.
 *
 * packHash: sha256 hex of the UTF-8 file bytes as read from disk (not
 * re-serialized). Stable for the same on-disk bytes; reformatting the file
 * changes the hash intentionally.
 */
export function loadOntologyPack(
  opts: LoadOntologyPackOptions = {},
): LoadedOntology {
  const packIdOrPath = opts.packIdOrPath ?? 'general';
  const baseDir = opts.baseDir ?? process.cwd();
  const packageRoot = getPackageRoot();
  const filePath = resolvePackFilePath(packIdOrPath, baseDir, packageRoot);

  let fileBytes: Buffer;
  try {
    fileBytes = readFileSync(filePath);
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      `failed to read ontology pack: ${filePath}`,
      { cause: err, path: filePath },
    );
  }

  // packHash of raw file bytes (documented above) — keep tests stable.
  const packHash = createHash('sha256').update(fileBytes).digest('hex');

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileBytes.toString('utf8')) as unknown;
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      `ontology pack is not valid JSON: ${filePath}`,
      { cause: err, path: filePath },
    );
  }

  if (!isRecord(parsed)) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      `ontology pack must be a JSON object: ${filePath}`,
      { path: filePath },
    );
  }

  // ONT-03 / D-05: replace-only — reject pack composition before schema pass.
  // Covers extends as string or array (or any other value); no merge API in v0.1.
  if (Object.prototype.hasOwnProperty.call(parsed, 'extends')) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      'ontology pack composition via extends is not supported in v0.1 (replace-only); copy the pack and load the copy by path',
      { path: filePath, extends: parsed.extends },
    );
  }

  const valid = validateOntologyPack(parsed);
  if (!valid) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      `ontology pack failed schema validation: ${formatAjvErrors(validateOntologyPack.errors)}`,
      { path: filePath, errors: validateOntologyPack.errors },
    );
  }

  const pack = Object.freeze(toOntologyPack(parsed));
  const typeSet: ReadonlySet<string> = new Set(pack.node_types);
  const predicateSet: ReadonlySet<string> = new Set(
    pack.predicates.map((p) => p.id),
  );

  return {
    pack,
    typeSet,
    predicateSet,
    packHash,
  };
}

/** @internal test helper — package-relative path join without I/O. */
export function _packageOntologyPath(packId: string): string {
  return join(getPackageRoot(), 'ontology-packs', packId, 'ontology.json').split(
    sep,
  ).join(sep);
}
