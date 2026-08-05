// gsd-graph — mtime-keyed in-process cache over loadGraphV1 (read paths only)

/**
 * Long-lived processes (MCP server, watch mode, library embedders) hit the
 * store on every read op; parsing + Ajv-validating a large graph.v1.json per
 * call dominates latency well before the 250k-triple cap. This cache keys on
 * (mtimeMs, size, ino) of graph.v1.json so any atomic republish (rename)
 * invalidates it, while repeated reads return the same parsed document.
 *
 * Loaded documents are treated as immutable — mutating a cached document is a
 * bug (all write paths publish a fresh file, which rotates the cache entry).
 */

import fs from 'node:fs';
import type { GraphV1Document } from '../types';
import { loadGraphV1 } from './load-graph';
import { storeFile } from './paths';

interface CacheEntry {
  mtimeMs: number;
  size: number;
  ino: number;
  doc: GraphV1Document;
}

const cache = new Map<string, CacheEntry>();

/** Drop all cached documents (tests / explicit invalidation). */
export function clearGraphV1Cache(): void {
  cache.clear();
}

/**
 * loadGraphV1 with mtime-keyed reuse. Fingerprint mismatch or stat failure
 * falls through to a fresh load (which raises the proper typed error).
 */
export function loadGraphV1Cached(storeRoot: string): GraphV1Document {
  let v1Path: string;
  let st: fs.Stats;
  try {
    v1Path = storeFile(storeRoot, 'graph.v1.json');
    st = fs.statSync(v1Path);
  } catch {
    // Missing store/file: let loadGraphV1 produce STORE_NOT_FOUND et al.
    return loadGraphV1(storeRoot);
  }

  const hit = cache.get(v1Path);
  if (
    hit !== undefined &&
    hit.mtimeMs === st.mtimeMs &&
    hit.size === st.size &&
    hit.ino === st.ino
  ) {
    return hit.doc;
  }

  const doc = loadGraphV1(storeRoot);
  cache.set(v1Path, {
    mtimeMs: st.mtimeMs,
    size: st.size,
    ino: st.ino,
    doc,
  });
  return doc;
}
