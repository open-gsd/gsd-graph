// gsd-graph — load graph.v1.json as sole source of truth
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import type { GraphV1Document } from '../types';
import {
  formatAjvErrors,
  validateGraphV1,
} from '../schema/validators';
import { storeFile } from './paths';
import { readJsonFile } from './safe-json';

/**
 * Load the canonical graph.v1.json from the store.
 *
 * Never falls back to graph.json (D-04, STORE-02, STORE-03).
 * Missing or invalid SoT → SCHEMA_INVALID.
 */
export function loadGraphV1(storeRoot: string): GraphV1Document {
  const v1Path = storeFile(storeRoot, 'graph.v1.json');

  if (!fs.existsSync(v1Path)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      'graph.v1.json missing — projection is not source of truth',
      { path: v1Path },
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

  if (!validateGraphV1(data)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `graph.v1.json schema invalid: ${formatAjvErrors(validateGraphV1.errors)}`,
      { path: v1Path, errors: validateGraphV1.errors },
    );
  }

  return data as GraphV1Document;
}
