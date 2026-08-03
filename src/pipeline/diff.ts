// gsd-graph — diff current graph.v1 vs snapshot / last-diff-base by id (DIFF-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Diff current graph.v1 against a baseline (DIFF-01, D-08, D-04, K25).
 *
 * Baseline resolution order (DESIGN):
 *   1. opts.snapshot → named snapshot under store/snapshots/ (shared path confinement)
 *   2. else snapshots/.last-diff-base.json if present
 *   3. else GraphError NO_BASELINE
 *
 * Current graph is always loadGraphV1 — never graph.json (D-04).
 * ± arithmetic is by node/triple id; "changed" = same id, stable payload differs
 * (nodes: type/label/aliases/description; triples: s/p/o/confidence/provenance).
 * Document-level fields (built_at, engine_version) are excluded from payload compare.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { loadGraphV1 } from '../io/load-graph';
import { confineUnderRoot, resolveStoreRoot } from '../io/paths';
import { readJsonFile } from '../io/safe-json';
import {
  formatAjvErrors,
  validateGraphV1,
} from '../schema/validators';
import type {
  DiffOptions,
  DiffResult,
  GraphNode,
  GraphV1Document,
  Triple,
} from '../types';
import { stableStringify } from './ids';
import {
  LAST_DIFF_BASE,
  SNAP_DIR,
  resolveNamedSnapshot,
} from './snapshot';

interface ResolvedBaseline {
  /** Absolute path to baseline JSON. */
  path: string;
  /** Label for DiffResult.baseline (path or name). */
  label: string;
}

/**
 * Resolve baseline file for diff (D-08).
 * snapshot arg → last-diff-base → NO_BASELINE.
 */
export function resolveBaseline(
  storeRoot: string,
  snapshot?: string,
): ResolvedBaseline {
  if (snapshot !== undefined && snapshot !== '') {
    const resolved = resolveNamedSnapshot(storeRoot, snapshot);
    return { path: resolved.path, label: resolved.fileName };
  }

  // Prefer realpath when store exists so confinement is consistent
  let rootForJoin = storeRoot;
  if (fs.existsSync(storeRoot)) {
    try {
      rootForJoin = fs.realpathSync.native(storeRoot);
    } catch {
      rootForJoin = storeRoot;
    }
  }

  const baselineRel = path.join(SNAP_DIR, LAST_DIFF_BASE);
  // Confine when store root exists; otherwise path is for existence check only
  let baselinePath: string;
  if (fs.existsSync(rootForJoin)) {
    try {
      baselinePath = confineUnderRoot(rootForJoin, baselineRel);
    } catch {
      baselinePath = path.join(rootForJoin, baselineRel);
    }
  } else {
    baselinePath = path.join(rootForJoin, baselineRel);
  }

  if (!fs.existsSync(baselinePath)) {
    throw new GraphError(
      GSD_GRAPH_REASON.NO_BASELINE,
      'no diff baseline: provide --snapshot or run a successful build (snapshots/.last-diff-base.json)',
      { path: baselinePath, storeRoot },
    );
  }

  return { path: baselinePath, label: baselinePath };
}

/**
 * Load and validate a baseline graph.v1 document from disk.
 */
function loadBaselineGraph(baselinePath: string): GraphV1Document {
  let data: unknown;
  try {
    data = readJsonFile(baselinePath);
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `baseline is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { path: baselinePath },
    );
  }

  if (!validateGraphV1(data)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `baseline graph.v1 schema invalid: ${formatAjvErrors(validateGraphV1.errors)}`,
      { path: baselinePath, errors: validateGraphV1.errors },
    );
  }

  return data as GraphV1Document;
}

/** Stable comparable payload for a node (excludes volatile store-level fields). */
function nodePayload(n: GraphNode): string {
  return stableStringify({
    type: n.type,
    label: n.label,
    ...(n.description !== undefined ? { description: n.description } : {}),
    ...(n.aliases !== undefined ? { aliases: n.aliases } : {}),
  });
}

/** Stable comparable payload for a triple (s/p/o/confidence/provenance). */
function triplePayload(t: Triple): string {
  return stableStringify({
    s: t.s,
    p: t.p,
    o: t.o,
    confidence: t.confidence,
    ...(t.score !== undefined ? { score: t.score } : {}),
    provenance: t.provenance,
  });
}

interface IdSetDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

function diffById<T extends { id: string }>(
  baseline: T[],
  current: T[],
  payloadOf: (item: T) => string,
): IdSetDiff {
  const baseMap = new Map(baseline.map((x) => [x.id, x]));
  const curMap = new Map(current.map((x) => [x.id, x]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const id of curMap.keys()) {
    if (!baseMap.has(id)) {
      added.push(id);
    }
  }
  for (const id of baseMap.keys()) {
    if (!curMap.has(id)) {
      removed.push(id);
    }
  }
  for (const id of curMap.keys()) {
    const b = baseMap.get(id);
    const c = curMap.get(id);
    if (b !== undefined && c !== undefined) {
      if (payloadOf(b) !== payloadOf(c)) {
        changed.push(id);
      }
    }
  }

  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed };
}

/**
 * Compare current graph.v1 to named snapshot or last-diff-base (DIFF-01).
 */
export function diff(opts?: DiffOptions): DiffResult {
  const storeRoot = resolveStoreRoot(
    opts?.dir !== undefined ? { dir: opts.dir } : {},
  );

  // Baseline first so empty stores without baseline yield NO_BASELINE (D-08)
  const baseline = resolveBaseline(storeRoot, opts?.snapshot);
  const baselineGraph = loadBaselineGraph(baseline.path);

  // Current SoT only — never projection (D-04)
  const current = loadGraphV1(storeRoot);

  const nodes = diffById(baselineGraph.nodes, current.nodes, nodePayload);
  const triples = diffById(
    baselineGraph.triples,
    current.triples,
    triplePayload,
  );

  return {
    baseline: baseline.label,
    nodes,
    triples,
    counts: {
      nodes_added: nodes.added.length,
      nodes_removed: nodes.removed.length,
      triples_added: triples.added.length,
      triples_removed: triples.removed.length,
    },
  };
}
