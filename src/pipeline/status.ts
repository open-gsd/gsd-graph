// gsd-graph — status read path over graph.v1 + lock + queue (STAT-01, D-10)

/**
 * Composes honest store status without treating graph.json as SoT (D-09, D-10).
 * Reads graph.v1 via loadGraphV1 only; projection absence may set projection_stale.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadGraphV1Cached } from '../io/graph-cache';
import { STALE_MS } from '../io/lock';
import { resolveStoreRoot, storeFile } from '../io/paths';
import { readJsonFile } from '../io/safe-json';
import { fingerprintFile } from '../sources/fingerprint';
import type {
  SourcesManifest,
  StatusOptions,
  StatusResult,
} from '../types';
import { loadReviewQueue } from './review';

interface LockPayloadLite {
  pid?: number;
  started_at?: string;
}

interface LastBuildStatus {
  status?: string;
  reason?: string;
  finished_at?: string;
  [key: string]: unknown;
}

function readLastBuildStatus(storeRoot: string): LastBuildStatus | null {
  const p = storeFile(storeRoot, '.last-build-status.json');
  if (!fs.existsSync(p)) return null;
  try {
    return readJsonFile(p) as LastBuildStatus;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * build_in_progress when .build.lock exists.
 * Stale locks (age > STALE_MS or dead PID) still report true if the file exists
 * (Phase 2: presence-based; steal is build's job).
 */
function lockInProgress(storeRoot: string): boolean {
  const lockPath = storeFile(storeRoot, '.build.lock');
  if (!fs.existsSync(lockPath)) return false;
  // Presence is enough for status; optionally annotate via payload parse
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const payload = JSON.parse(raw) as LockPayloadLite;
    if (typeof payload.started_at === 'string') {
      const started = Date.parse(payload.started_at);
      if (Number.isFinite(started) && Date.now() - started > STALE_MS) {
        // Still in progress from reader's POV if file remains (steal not run)
        return true;
      }
    }
    if (typeof payload.pid === 'number' && !isPidAlive(payload.pid)) {
      return true;
    }
  } catch {
    // unreadable lock still means a build may be/was in progress
  }
  return true;
}

function loadManifest(storeRoot: string): SourcesManifest | null {
  const p = storeFile(storeRoot, 'sources.manifest.json');
  if (!fs.existsSync(p)) return null;
  try {
    const data = readJsonFile(p) as SourcesManifest;
    if (data?.schema_version !== 1 || typeof data.sources !== 'object') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Freshness: if any manifest path is missing on disk → stale.
 * When corpus option is provided, also re-fingerprint and compare content_hash.
 */
function computeStale(
  manifest: SourcesManifest | null,
  corpus?: string | string[],
): boolean {
  if (!manifest) return false;

  for (const [srcPath, entry] of Object.entries(manifest.sources)) {
    if (!fs.existsSync(srcPath)) {
      return true;
    }
    if (corpus !== undefined) {
      try {
        const hash = fingerprintFile(srcPath);
        if (hash !== entry.content_hash) return true;
      } catch {
        return true;
      }
    }
  }

  // Optional: if corpus roots given, ensure they exist (missing root → stale signal)
  if (corpus !== undefined) {
    const roots = Array.isArray(corpus) ? corpus : [corpus];
    for (const root of roots) {
      if (!fs.existsSync(path.resolve(root))) return true;
    }
  }

  return false;
}

/**
 * Read-only status over the store (STAT-01).
 * Never opens graph.json as source of truth (D-09, D-10).
 */
export function status(opts?: StatusOptions): StatusResult {
  const storeRoot = resolveStoreRoot(
    opts?.dir !== undefined ? { dir: opts.dir } : {},
  );
  const base: StatusResult = {
    exists: false,
    store_dir: storeRoot,
    engine: 'gsd-graph',
  };

  const v1Path = path.join(storeRoot, 'graph.v1.json');
  // Avoid ensureStoreRoot side effects — status is read-only
  if (!fs.existsSync(storeRoot) || !fs.existsSync(v1Path)) {
    return {
      ...base,
      build_in_progress: fs.existsSync(storeRoot)
        ? lockInProgress(storeRoot)
        : false,
      last_build_status: fs.existsSync(storeRoot)
        ? readLastBuildStatus(storeRoot)
        : null,
      reason: 'graph.v1.json missing',
    };
  }

  // loadGraphV1 validates schema; never falls back to projection
  const graph = loadGraphV1Cached(storeRoot);
  const lastStatus = readLastBuildStatus(storeRoot);
  const manifest = loadManifest(storeRoot);

  let review_queue_count = 0;
  try {
    const queue = loadReviewQueue(storeRoot);
    review_queue_count = queue.items.filter((i) => i.status === 'pending').length;
  } catch {
    review_queue_count = 0;
  }

  const node_count = graph.stats?.node_count ?? graph.nodes.length;
  const triple_count = graph.stats?.triple_count ?? graph.triples.length;

  const builtAtMs = Date.parse(graph.built_at);

  const projectionPath = path.join(storeRoot, 'graph.json');
  const projection_stale = !fs.existsSync(projectionPath);

  const last_build =
    typeof lastStatus?.finished_at === 'string'
      ? lastStatus.finished_at
      : graph.built_at;

  const result: StatusResult = {
    exists: true,
    store_dir: storeRoot,
    engine: 'gsd-graph',
    schema_version: graph.schema_version,
    ontology_pack_id: graph.ontology_pack_id,
    engine_version: graph.engine_version,
    node_count,
    triple_count,
    edge_count: triple_count,
    last_build,
    stale:
      opts?.corpus !== undefined
        ? computeStale(manifest, opts.corpus)
        : computeStale(manifest),
    build_in_progress: lockInProgress(storeRoot),
    review_queue_count,
    projection_stale,
    last_build_status: lastStatus,
    reason: lastStatus?.reason ?? null,
  };

  if (Number.isFinite(builtAtMs)) {
    result.age_hours = (Date.now() - builtAtMs) / (1000 * 60 * 60);
  }

  return result;
}
