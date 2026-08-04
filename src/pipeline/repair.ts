// gsd-graph — repair: regenerate disposable projection from graph.v1 only (REP-01)

/**
 * repair regenerates graph.json from loadGraphV1 + projectGraph only (REP-01, D-09).
 *
 * - graph.v1 is the sole input (D-04) — never reads projection as SoT
 * - invents no triples or nodes beyond v1
 * - holds acquireBuildLock during publish (D-10)
 * - always writeProjection: true (repair's job is to materialize projection)
 */

import { GSD_GRAPH_REASON } from '../errors';
import { publishGraphFiles } from '../io/atomic-publish';
import { loadGraphV1 } from '../io/load-graph';
import { acquireBuildLock } from '../io/lock';
import { ensureStoreRoot, resolveStoreRoot } from '../io/paths';
import type { RepairOptions, RepairResult } from '../types';
import { projectGraph } from './project';

/**
 * Regenerate disposable graph.json from graph.v1 only (REP-01, D-09, D-10).
 */
export function repair(opts?: RepairOptions): RepairResult {
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts?.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    // Sole input — missing/invalid → SCHEMA_INVALID (never invent from projection)
    const graphV1 = loadGraphV1(storeRoot);
    const projection = projectGraph(graphV1);

    // Always materialize projection; writeProjection:false is ignored (repair contract)
    publishGraphFiles({
      storeRoot,
      graphV1,
      projection,
      writeProjection: true,
    });

    return {
      store_dir: storeRoot,
      node_count: graphV1.nodes.length,
      triple_count: graphV1.triples.length,
      projection_written: true,
      reason: GSD_GRAPH_REASON.OK,
    };
  } finally {
    lock.release();
  }
}
