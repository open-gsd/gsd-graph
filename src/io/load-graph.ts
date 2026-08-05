// gsd-graph — load graph.v1.json as sole source of truth

import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import type { GraphV1Document } from '../types';
import {
  formatAjvErrors,
  validateGraphV1,
} from '../schema/validators';
import { migrateGraphDocument } from './migrations';
import { storeFile } from './paths';
import { readJsonFile } from './safe-json';

/**
 * Load the canonical graph.v1.json from the store.
 *
 * Never falls back to graph.json (D-04, STORE-02, STORE-03).
 * Missing or invalid SoT → SCHEMA_INVALID.
 */
export function loadGraphV1(storeRoot: string): GraphV1Document {
  // First-run friendliness: a missing store directory is not an escape or a
  // schema problem — tell the user how to create one (STORE_NOT_FOUND).
  if (!fs.existsSync(storeRoot)) {
    throw new GraphError(
      GSD_GRAPH_REASON.STORE_NOT_FOUND,
      `no graph found at ${storeRoot} — run \`gsd-graph enable\` to build one (or \`gsd-graph sync\`)`,
      { store_dir: storeRoot },
    );
  }

  const v1Path = storeFile(storeRoot, 'graph.v1.json');

  if (!fs.existsSync(v1Path)) {
    throw new GraphError(
      GSD_GRAPH_REASON.STORE_NOT_FOUND,
      `no graph found at ${storeRoot} — run \`gsd-graph enable\` to build one (or \`gsd-graph sync\`)`,
      { path: v1Path, store_dir: storeRoot },
    );
  }

  let data: unknown;
  try {
    data = readJsonFile(v1Path);
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `graph.v1.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { path: v1Path },
    );
  }

  // Forward-only store migrations (older stores upgrade in memory; newer fail closed).
  data = migrateGraphDocument(data).doc;

  if (!validateGraphV1(data)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `graph.v1.json schema invalid: ${formatAjvErrors(validateGraphV1.errors)}`,
      { path: v1Path, errors: validateGraphV1.errors },
    );
  }

  return data as GraphV1Document;
}
