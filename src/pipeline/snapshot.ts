// gsd-graph — snapshot save/list/restore of full graph.v1 under store/snapshots (SNAP-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Snapshot lifecycle for graph.v1 (SNAP-01, D-07, D-10, D-12).
 *
 * Layout (OQ-3 / DESIGN):
 *   store/snapshots/<iso>-<name>.json
 *   store/snapshots/.last-diff-base.json  — written by build; list skips it
 *
 * Name resolution (restore):
 *   - Logical name (e.g. 'pre-edit') matches files ending with `-<name>.json`;
 *     when multiple exist, newest mtime wins.
 *   - Full fileName (e.g. '2026-08-03T12-00-00.000Z-pre-edit.json') exact match.
 *
 * Restore scope: replaces graph.v1.json via publishGraphFiles. Optionally
 * rewrites disposable graph.json from the restored v1 via projectGraph when
 * writeProjection is desired by caller defaults — this module restores v1 and
 * rewrites projection from the snapshot body only (no invented triples).
 * Does NOT roll back sources.manifest, review-queue, or other sidecars (A2).
 *
 * Security: sanitizeSnapshotName rejects empty, '..', separators, and anything
 * outside /^[A-Za-z0-9._-]+$/ → PATH_ESCAPE. All file paths go through
 * confineUnderRoot (STORE-05). Mutating ops hold acquireBuildLock (D-10).
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { publishGraphFiles } from '../io/atomic-publish';
import { loadGraphV1 } from '../io/load-graph';
import { acquireBuildLock } from '../io/lock';
import {
  confineUnderRoot,
  ensureStoreRoot,
  resolveStoreRoot,
} from '../io/paths';
import { readJsonFile, writeJsonAtomicTemp } from '../io/safe-json';
import {
  formatAjvErrors,
  validateGraphV1,
} from '../schema/validators';
import type {
  GraphV1Document,
  SnapshotInfo,
  SnapshotListOptions,
  SnapshotRestoreOptions,
  SnapshotResult,
  SnapshotSaveOptions,
} from '../types';
import { projectGraph } from './project';

/** Snapshot directory basename under the store root (OQ-3). */
export const SNAP_DIR = 'snapshots';

/** Auto baseline basename written by build — list must skip (OQ-3). */
export const LAST_DIFF_BASE = '.last-diff-base.json';

const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Sanitize a logical snapshot name.
 * Rejects empty, path traversal, separators, and unsafe chars → PATH_ESCAPE.
 */
export function sanitizeSnapshotName(name: string): string {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.includes('..') ||
    name.includes('/') ||
    name.includes('\\') ||
    !SAFE_NAME_RE.test(name)
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `invalid snapshot name: ${String(name)}`,
      { name },
    );
  }
  return name;
}

/**
 * Save full graph.v1 to snapshots/<iso>-<name>.json under lock (SNAP-01, D-07).
 */
export function snapshotSave(opts: SnapshotSaveOptions): SnapshotResult {
  if (opts == null || typeof opts.name !== 'string') {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      'invalid snapshot name: (missing)',
      { name: opts?.name },
    );
  }
  const safe = sanitizeSnapshotName(opts.name);
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const graph = loadGraphV1(storeRoot);
    const iso = new Date().toISOString().replace(/:/g, '-');
    const fileName = `${iso}-${safe}.json`;
    const snapshotsDir = confineUnderRoot(storeRoot, SNAP_DIR);
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const finalPath = confineUnderRoot(
      storeRoot,
      path.join(SNAP_DIR, fileName),
    );
    const tmpPath = confineUnderRoot(
      storeRoot,
      path.join(SNAP_DIR, `${fileName}.tmp-${process.pid}-${Date.now()}`),
    );
    writeJsonAtomicTemp(tmpPath, graph);
    fs.renameSync(tmpPath, finalPath);
    return { name: safe, fileName, path: finalPath };
  } finally {
    lock.release();
  }
}

/**
 * List named snapshots under store/snapshots (newest mtime first).
 * Excludes .last-diff-base.json. No auto-prune (A5).
 */
export function snapshotList(opts?: SnapshotListOptions): SnapshotInfo[] {
  const storeRoot = resolveStoreRoot(
    opts?.dir !== undefined ? { dir: opts.dir } : {},
  );
  if (!fs.existsSync(storeRoot)) {
    return [];
  }
  const rootReal = fs.realpathSync.native(storeRoot);
  const snapshotsDir = path.join(rootReal, SNAP_DIR);
  if (!fs.existsSync(snapshotsDir)) {
    return [];
  }
  // Confinement check on the directory itself
  confineUnderRoot(rootReal, SNAP_DIR);

  const entries = fs.readdirSync(snapshotsDir, { withFileTypes: true });
  const infos: SnapshotInfo[] = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const fileName = ent.name;
    if (!fileName.endsWith('.json')) continue;
    if (fileName === LAST_DIFF_BASE) continue;
    // Skip temp files
    if (fileName.includes('.tmp-')) continue;

    const absPath = confineUnderRoot(
      rootReal,
      path.join(SNAP_DIR, fileName),
    );
    let mtime_ms: number | undefined;
    try {
      mtime_ms = fs.statSync(absPath).mtimeMs;
    } catch {
      continue;
    }

    const name = logicalNameFromFileName(fileName);
    let built_at: string | undefined;
    try {
      const raw = readJsonFile(absPath) as { built_at?: unknown };
      if (typeof raw.built_at === 'string') {
        built_at = raw.built_at;
      }
    } catch {
      // list is best-effort for body fields
    }

    infos.push({
      name,
      fileName,
      path: absPath,
      ...(mtime_ms !== undefined ? { mtime_ms } : {}),
      ...(built_at !== undefined ? { built_at } : {}),
    });
  }

  infos.sort((a, b) => (b.mtime_ms ?? 0) - (a.mtime_ms ?? 0));
  return infos;
}

/**
 * Restore graph.v1 from a named snapshot under lock (SNAP-01, D-07, D-10).
 * Validates with validateGraphV1 before publish — corrupt files do not replace SoT.
 */
export function snapshotRestore(opts: SnapshotRestoreOptions): SnapshotResult {
  if (opts == null || typeof opts.name !== 'string') {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      'invalid snapshot name: (missing)',
      { name: opts?.name },
    );
  }
  // Full fileName may contain ISO colons→hyphens already and ends with .json;
  // sanitize only the logical portion when not a full fileName.
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const resolved = resolveSnapshotFile(storeRoot, opts.name);
    const graphV1 = readAndValidateSnapshot(resolved.path);

    // Rewrite projection from restored v1 only (no invented triples).
    const projection = projectGraph(graphV1);
    publishGraphFiles({
      storeRoot,
      graphV1,
      writeProjection: true,
      projection,
    });

    return {
      name: resolved.name,
      fileName: resolved.fileName,
      path: resolved.path,
    };
  } finally {
    lock.release();
  }
}

/** Parse logical name from `<iso>-<name>.json` (last `-` segment before .json is not enough when name has hyphens — use suffix after first ISO-like prefix). */
function logicalNameFromFileName(fileName: string): string {
  // fileName: 2026-08-03T12-00-00.000Z-pre-edit.json
  // ISO with colons→hyphens ends at Z- then name
  const base = fileName.endsWith('.json')
    ? fileName.slice(0, -'.json'.length)
    : fileName;
  const zIdx = base.indexOf('Z-');
  if (zIdx >= 0) {
    return base.slice(zIdx + 2);
  }
  // Fallback: strip leading timestamp-ish prefix up to last long segment
  const dash = base.indexOf('-');
  if (dash < 0) return base;
  // Prefer everything after the Z-marker style; else return full base
  return base;
}

interface ResolvedSnapshot {
  name: string;
  fileName: string;
  path: string;
}

/**
 * Resolve snapshot by exact fileName or logical name (`*-<name>.json`, newest).
 */
function resolveSnapshotFile(
  storeRoot: string,
  nameOrFile: string,
): ResolvedSnapshot {
  if (
    typeof nameOrFile !== 'string' ||
    nameOrFile.length === 0 ||
    nameOrFile.includes('..') ||
    nameOrFile.includes('/') ||
    nameOrFile.includes('\\')
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `invalid snapshot name: ${String(nameOrFile)}`,
      { name: nameOrFile },
    );
  }

  const snapshotsDirRel = SNAP_DIR;
  const snapshotsDir = confineUnderRoot(storeRoot, snapshotsDirRel);

  // Exact fileName match (must stay a single basename under snapshots/)
  if (nameOrFile.endsWith('.json')) {
    if (!SAFE_NAME_RE.test(nameOrFile.replace(/\.json$/, '')) &&
        !/^[A-Za-z0-9._-]+\.json$/.test(nameOrFile)) {
      throw new GraphError(
        GSD_GRAPH_REASON.PATH_ESCAPE,
        `invalid snapshot name: ${nameOrFile}`,
        { name: nameOrFile },
      );
    }
    // fileName includes dots and hyphens from ISO — allow full basename pattern
    if (!/^[A-Za-z0-9._-]+$/.test(nameOrFile)) {
      throw new GraphError(
        GSD_GRAPH_REASON.PATH_ESCAPE,
        `invalid snapshot name: ${nameOrFile}`,
        { name: nameOrFile },
      );
    }
    if (nameOrFile === LAST_DIFF_BASE) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `snapshot not found: ${nameOrFile}`,
        { name: nameOrFile },
      );
    }
    const abs = confineUnderRoot(
      storeRoot,
      path.join(SNAP_DIR, nameOrFile),
    );
    if (!fs.existsSync(abs)) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `snapshot not found: ${nameOrFile}`,
        { name: nameOrFile, path: abs },
      );
    }
    return {
      name: logicalNameFromFileName(nameOrFile),
      fileName: nameOrFile,
      path: abs,
    };
  }

  // Logical name — sanitize then match *-<name>.json newest
  const safe = sanitizeSnapshotName(nameOrFile);
  if (!fs.existsSync(snapshotsDir)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `snapshot not found: ${safe}`,
      { name: safe },
    );
  }

  const suffix = `-${safe}.json`;
  const matches: Array<{ fileName: string; path: string; mtime: number }> = [];
  for (const ent of fs.readdirSync(snapshotsDir, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const fileName = ent.name;
    if (fileName === LAST_DIFF_BASE) continue;
    if (fileName.includes('.tmp-')) continue;
    if (!fileName.endsWith(suffix) && fileName !== `${safe}.json`) continue;
    // Prefer ISO-prefixed form: ends with -safe.json
    if (!fileName.endsWith(suffix)) continue;
    const abs = confineUnderRoot(
      storeRoot,
      path.join(SNAP_DIR, fileName),
    );
    let mtime = 0;
    try {
      mtime = fs.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    matches.push({ fileName, path: abs, mtime });
  }

  if (matches.length === 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `snapshot not found: ${safe}`,
      { name: safe },
    );
  }

  matches.sort((a, b) => b.mtime - a.mtime);
  const best = matches[0]!;
  return {
    name: safe,
    fileName: best.fileName,
    path: best.path,
  };
}

/** Read snapshot JSON and validate as graph.v1 — never publish invalid docs. */
function readAndValidateSnapshot(absPath: string): GraphV1Document {
  let data: unknown;
  try {
    data = readJsonFile(absPath);
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `snapshot is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { path: absPath },
    );
  }

  if (!validateGraphV1(data)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `snapshot graph.v1 schema invalid: ${formatAjvErrors(validateGraphV1.errors)}`,
      { path: absPath, errors: validateGraphV1.errors },
    );
  }

  return data as GraphV1Document;
}
