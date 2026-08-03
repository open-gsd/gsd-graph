// gsd-graph — store path resolve + realpath confinement
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';

/** Default store directory under cwd (STORE-01, D-02). */
export const DEFAULT_STORE_DIR = '.gsd-graph';

/** Known basenames allowed under the store root. */
export const STORE_BASENAMES = Object.freeze([
  'graph.v1.json',
  'graph.json',
  '.build.lock',
  '.last-build-status.json',
] as const);

export type StoreBasename = (typeof STORE_BASENAMES)[number];

export interface ResolveStoreRootOptions {
  /** Explicit store directory (absolute or relative to cwd). */
  dir?: string;
  /** Env map; defaults to process.env. Honors GSD_GRAPH_DIR. */
  env?: NodeJS.ProcessEnv;
  /** Working directory for relative resolution; defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Resolve the absolute store root path.
 *
 * Precedence: opts.dir → env.GSD_GRAPH_DIR → DEFAULT_STORE_DIR ('.gsd-graph').
 * If the path already exists, return fs.realpathSync.native(abs).
 * If missing, return the resolved absolute path without requiring realpath
 * (caller uses ensureStoreRoot to create it).
 */
export function resolveStoreRoot(opts?: ResolveStoreRootOptions): string {
  const env = opts?.env ?? process.env;
  const cwd = opts?.cwd ?? process.cwd();
  const raw = opts?.dir ?? env.GSD_GRAPH_DIR ?? DEFAULT_STORE_DIR;
  const abs = path.resolve(cwd, raw);
  if (fs.existsSync(abs)) {
    return fs.realpathSync.native(abs);
  }
  return abs;
}

/** Create store root directory recursively if missing. */
export function ensureStoreRoot(storeRoot: string): string {
  fs.mkdirSync(storeRoot, { recursive: true });
  return fs.realpathSync.native(storeRoot);
}

/**
 * Confine a candidate path under a realpath store root.
 * Rejects `..` and symlink escape with PATH_ESCAPE (STORE-05, D-07).
 *
 * For not-yet-created children: path.normalize + relative/prefix checks
 * without requiring the child to exist.
 */
export function confineUnderRoot(rootReal: string, candidate: string): string {
  const root = path.resolve(rootReal);
  // Prefer realpath of root when it exists
  let rootResolved = root;
  if (fs.existsSync(root)) {
    rootResolved = fs.realpathSync.native(root);
  }

  const absCandidate = path.resolve(rootResolved, candidate);

  // Reject obvious .. escapes via normalized relative path before create
  const rel = path.relative(rootResolved, absCandidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `path escapes store root: ${candidate}`,
      { root: rootResolved, candidate, resolved: absCandidate },
    );
  }

  // If candidate (or intermediate) exists, realpath and re-check prefix
  if (fs.existsSync(absCandidate)) {
    const resolved = fs.realpathSync.native(absCandidate);
    const prefix = rootResolved.endsWith(path.sep)
      ? rootResolved
      : rootResolved + path.sep;
    if (resolved !== rootResolved && !resolved.startsWith(prefix)) {
      throw new GraphError(
        GSD_GRAPH_REASON.PATH_ESCAPE,
        `path escapes store root: ${candidate}`,
        { root: rootResolved, candidate, resolved },
      );
    }
    return resolved;
  }

  // For non-existent paths, walk up to nearest existing ancestor and realpath it
  let cursor = path.dirname(absCandidate);
  while (cursor !== path.dirname(cursor)) {
    if (fs.existsSync(cursor)) {
      const ancestorReal = fs.realpathSync.native(cursor);
      const prefix = rootResolved.endsWith(path.sep)
        ? rootResolved
        : rootResolved + path.sep;
      if (ancestorReal !== rootResolved && !ancestorReal.startsWith(prefix)) {
        throw new GraphError(
          GSD_GRAPH_REASON.PATH_ESCAPE,
          `path escapes store root: ${candidate}`,
          { root: rootResolved, candidate, ancestor: ancestorReal },
        );
      }
      // Reconstruct candidate under realpath ancestor
      const tail = path.relative(cursor, absCandidate);
      return path.join(ancestorReal, tail);
    }
    cursor = path.dirname(cursor);
  }

  // Fallback: normalized absolute under root
  const prefix = rootResolved.endsWith(path.sep)
    ? rootResolved
    : rootResolved + path.sep;
  if (absCandidate !== rootResolved && !absCandidate.startsWith(prefix)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `path escapes store root: ${candidate}`,
      { root: rootResolved, candidate, resolved: absCandidate },
    );
  }
  return absCandidate;
}

/**
 * Resolve a known store basename under storeRoot with confinement.
 */
export function storeFile(storeRoot: string, name: string): string {
  // Reject path separators / parent refs in basename
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name === '..' ||
    name.includes('..')
  ) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `invalid store basename: ${name}`,
    );
  }
  return confineUnderRoot(storeRoot, name);
}
