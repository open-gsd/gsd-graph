// gsd-graph — replace-only ontology pack loader (ONT-01, ONT-03, D-05)

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

  // Pack id → project-local ontology-packs/<id>/ontology.json wins, then the
  // package-shipped pack. A project can therefore fork or add packs without
  // touching node_modules.
  const projectPack = join(
    baseDir,
    'ontology-packs',
    packIdOrPath,
    'ontology.json',
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  if (fs.existsSync(projectPack)) {
    return projectPack;
  }
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

  const valid = validateOntologyPack(parsed);
  if (!valid) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      `ontology pack failed schema validation: ${formatAjvErrors(validateOntologyPack.errors)}`,
      { path: filePath, errors: validateOntologyPack.errors },
    );
  }

  let effective: Record<string, unknown> = parsed;
  let effectiveHash = packHash;

  // Single-level extends (collision-error semantics): the child adds node
  // types (deduped) and predicates (duplicate ids are an error, never a
  // silent shadow); child id/version/title/strict/policies win. The base may
  // not itself extend.
  if (Object.prototype.hasOwnProperty.call(parsed, 'extends')) {
    const ext = parsed.extends;
    if (typeof ext !== 'string' || ext.length === 0) {
      throw new GraphError(
        GSD_GRAPH_REASON.ONTOLOGY_INVALID,
        'extends must be a base pack id or path string',
        { path: filePath, extends: ext },
      );
    }
    const basePath = resolvePackFilePath(ext, baseDir, packageRoot);
    let baseBytes: Buffer;
    try {
      baseBytes = readFileSync(basePath);
    } catch (err) {
      throw new GraphError(
        GSD_GRAPH_REASON.ONTOLOGY_INVALID,
        `failed to read base pack for extends "${ext}": ${basePath}`,
        { cause: err, path: basePath },
      );
    }
    let baseParsed: unknown;
    try {
      baseParsed = JSON.parse(baseBytes.toString('utf8')) as unknown;
    } catch (err) {
      throw new GraphError(
        GSD_GRAPH_REASON.ONTOLOGY_INVALID,
        `base pack is not valid JSON: ${basePath}`,
        { cause: err, path: basePath },
      );
    }
    if (!isRecord(baseParsed)) {
      throw new GraphError(
        GSD_GRAPH_REASON.ONTOLOGY_INVALID,
        `base pack must be a JSON object: ${basePath}`,
        { path: basePath },
      );
    }
    if (Object.prototype.hasOwnProperty.call(baseParsed, 'extends')) {
      throw new GraphError(
        GSD_GRAPH_REASON.ONTOLOGY_INVALID,
        `extends is single-level: base pack "${ext}" may not itself extend`,
        { path: basePath },
      );
    }
    if (!validateOntologyPack(baseParsed)) {
      throw new GraphError(
        GSD_GRAPH_REASON.ONTOLOGY_INVALID,
        `base pack failed schema validation: ${formatAjvErrors(validateOntologyPack.errors)}`,
        { path: basePath, errors: validateOntologyPack.errors },
      );
    }

    const basePreds = baseParsed.predicates as OntologyPredicate[];
    const childPreds = parsed.predicates as OntologyPredicate[];
    const baseIds = new Set(basePreds.map((p) => p.id));
    for (const p of childPreds) {
      if (baseIds.has(p.id)) {
        throw new GraphError(
          GSD_GRAPH_REASON.ONTOLOGY_INVALID,
          `extends collision: predicate "${p.id}" already defined by base pack "${ext}" — rename or remove it from the extending pack`,
          { path: filePath, predicate: p.id },
        );
      }
    }

    effective = {
      ...parsed,
      node_types: [
        ...new Set([
          ...(baseParsed.node_types as string[]),
          ...(parsed.node_types as string[]),
        ]),
      ],
      predicates: [...basePreds, ...childPreds],
    };
    delete effective.extends;

    const baseHash = createHash('sha256').update(baseBytes).digest('hex');
    effectiveHash = createHash('sha256')
      .update(packHash + baseHash, 'utf8')
      .digest('hex');
  }

  const pack = Object.freeze(toOntologyPack(effective));
  const typeSet: ReadonlySet<string> = new Set(pack.node_types);
  const predicateSet: ReadonlySet<string> = new Set(
    pack.predicates.map((p) => p.id),
  );

  return {
    pack,
    typeSet,
    predicateSet,
    packHash: effectiveHash,
  };
}

/** @internal test helper — package-relative path join without I/O. */
export function _packageOntologyPath(packId: string): string {
  return join(getPackageRoot(), 'ontology-packs', packId, 'ontology.json').split(
    sep,
  ).join(sep);
}
