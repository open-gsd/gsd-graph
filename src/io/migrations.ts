// gsd-graph — forward-only graph.v1 document migration registry

import { GSD_GRAPH_REASON, GraphError } from '../errors';

/** Schema version this engine reads and writes. */
export const CURRENT_GRAPH_SCHEMA_VERSION = 1;

/**
 * One store migration step: transforms a document at `fromVersion` into a
 * document at `fromVersion + 1`. Must return a new/updated object with
 * `schema_version` bumped; pure and synchronous.
 */
export type GraphMigration = (
  doc: Record<string, unknown>,
) => Record<string, unknown>;

const registry = new Map<number, GraphMigration>();

/**
 * Register a migration from `fromVersion` → `fromVersion + 1`.
 * Registering the same step twice replaces the earlier registration.
 */
export function registerGraphMigration(
  fromVersion: number,
  fn: GraphMigration,
): void {
  registry.set(fromVersion, fn);
}

/** Registered step versions (ascending) — mostly for diagnostics/tests. */
export function listGraphMigrations(): number[] {
  return [...registry.keys()].sort((a, b) => a - b);
}

export interface MigrateGraphResult {
  doc: unknown;
  /** Versions whose step ran, in order (empty when already current). */
  applied: number[];
}

/**
 * Bring a raw graph.v1.json document up to CURRENT_GRAPH_SCHEMA_VERSION by
 * chaining registered steps. Documents already at current version pass
 * through untouched; documents from a NEWER engine fail closed rather than
 * being misread.
 */
export function migrateGraphDocument(raw: unknown): MigrateGraphResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { doc: raw, applied: [] };
  }
  let doc = raw as Record<string, unknown>;
  const version = doc.schema_version;
  if (typeof version !== 'number') {
    return { doc, applied: [] };
  }
  if (version === CURRENT_GRAPH_SCHEMA_VERSION) {
    return { doc, applied: [] };
  }
  if (version > CURRENT_GRAPH_SCHEMA_VERSION) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `graph store schema_version ${version} is newer than this engine supports (${CURRENT_GRAPH_SCHEMA_VERSION}) — update @opengsd/gsd-graph`,
      { schema_version: version, supported: CURRENT_GRAPH_SCHEMA_VERSION },
    );
  }

  const applied: number[] = [];
  let cursor = version;
  while (cursor < CURRENT_GRAPH_SCHEMA_VERSION) {
    const step = registry.get(cursor);
    if (step === undefined) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `no migration registered from graph schema_version ${cursor} — cannot upgrade store to ${CURRENT_GRAPH_SCHEMA_VERSION}`,
        { schema_version: cursor, supported: CURRENT_GRAPH_SCHEMA_VERSION },
      );
    }
    doc = step(doc);
    const next = doc.schema_version;
    if (typeof next !== 'number' || next !== cursor + 1) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `migration from schema_version ${cursor} did not produce ${cursor + 1}`,
        { schema_version: cursor, produced: next },
      );
    }
    applied.push(cursor);
    cursor = next;
  }
  return { doc, applied };
}
