// gsd-graph — materialize the active ontology (+ lock extensions) as a local pack

/**
 * Review-queue accepts with --extend-ontology accumulate in ontology.lock.json
 * — real vocabulary decisions stuck in a store sidecar nobody versions.
 * `ontology eject` materializes the active pack plus those accepted
 * extensions into a committable project-local pack under
 * <cwd>/ontology-packs/<id>-local/ and points the store config at it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { resolveStoreRoot, storeFile } from '../io/paths';
import { loadOntologyPack } from './load-pack';
import type { OntologyPack, OntologyPredicate } from './types';

export interface OntologyEjectOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Project root for the local pack (default process.cwd()). */
  cwd?: string;
  /** Output directory override (default <cwd>/ontology-packs/<id>-local). */
  out?: string;
}

export interface OntologyEjectResult {
  pack_path: string;
  pack_id: string;
  node_types: number;
  predicates: number;
  /** Types/predicates absorbed from ontology.lock extensions. */
  absorbed_types: string[];
  absorbed_predicates: string[];
  config_updated: boolean;
}

interface OntologyLockDoc {
  node_types?: string[];
  predicates?: Array<{ id: string; domain?: string[]; range?: string[] }>;
  extended?: boolean;
}

function readConfig(storeRoot: string): Record<string, unknown> {
  const p = storeFile(storeRoot, 'config.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Materialize active pack + lock extensions into a project-local pack. */
export function ontologyEject(
  opts?: OntologyEjectOptions,
): OntologyEjectResult {
  const cwd = opts?.cwd ?? process.cwd();
  const storeRoot = resolveStoreRoot({
    ...(opts?.dir !== undefined ? { dir: opts.dir } : {}),
    cwd,
  });

  const config = readConfig(storeRoot);
  const activeId =
    typeof config.ontology === 'string' && config.ontology.length > 0
      ? config.ontology
      : 'general';

  const loaded = loadOntologyPack({ packIdOrPath: activeId, baseDir: cwd });
  const base: OntologyPack = loaded.pack;

  // Absorb ontology.lock extensions (accepted review items).
  let lock: OntologyLockDoc | null = null;
  const lockPath = storeFile(storeRoot, 'ontology.lock.json');
  if (fs.existsSync(lockPath)) {
    try {
      lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as OntologyLockDoc;
    } catch {
      lock = null;
    }
  }

  const typeSet = new Set(base.node_types);
  const predIds = new Set(base.predicates.map((p) => p.id));
  const absorbedTypes: string[] = [];
  const absorbedPredicates: string[] = [];
  const predicates: OntologyPredicate[] = base.predicates.map((p) => ({
    id: p.id,
    domain: [...p.domain],
    range: [...p.range],
  }));

  if (lock !== null) {
    for (const t of lock.node_types ?? []) {
      if (typeof t === 'string' && t.length > 0 && !typeSet.has(t)) {
        typeSet.add(t);
        absorbedTypes.push(t);
      }
    }
    for (const p of lock.predicates ?? []) {
      if (typeof p?.id === 'string' && p.id.length > 0 && !predIds.has(p.id)) {
        predIds.add(p.id);
        predicates.push({
          id: p.id,
          domain: p.domain !== undefined && p.domain.length > 0 ? [...p.domain] : ['*'],
          range: p.range !== undefined && p.range.length > 0 ? [...p.range] : ['*'],
        });
        absorbedPredicates.push(p.id);
      }
    }
  }

  const localId = base.id.endsWith('-local') ? base.id : `${base.id}-local`;
  const outDir =
    opts?.out !== undefined
      ? path.resolve(cwd, opts.out)
      : path.join(cwd, 'ontology-packs', localId);
  fs.mkdirSync(outDir, { recursive: true });
  const packPath = path.join(outDir, 'ontology.json');

  const ejected: OntologyPack = {
    id: localId,
    version: `${base.version}+local`,
    title: `${base.title} (local)`,
    node_types: [...typeSet],
    predicates,
    strict: base.strict,
    unknown_predicate_policy: base.unknown_predicate_policy,
    unknown_type_policy: base.unknown_type_policy,
  };
  fs.writeFileSync(packPath, `${JSON.stringify(ejected, null, 2)}\n`, 'utf8');

  // Point the store at the local pack (relative path when under cwd).
  let configUpdated = false;
  try {
    const rel = path.relative(cwd, packPath);
    const nextRef = rel.startsWith('..') ? packPath : rel;
    const configPath = storeFile(storeRoot, 'config.json');
    const next = { ...config, ontology: nextRef };
    if (fs.existsSync(storeRoot)) {
      fs.writeFileSync(
        configPath,
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8',
      );
      configUpdated = true;
    }
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.ONTOLOGY_INVALID,
      `ejected pack written but config update failed: ${err instanceof Error ? err.message : String(err)}`,
      { pack_path: packPath },
    );
  }

  return {
    pack_path: packPath,
    pack_id: localId,
    node_types: ejected.node_types.length,
    predicates: ejected.predicates.length,
    absorbed_types: absorbedTypes,
    absorbed_predicates: absorbedPredicates,
    config_updated: configUpdated,
  };
}
