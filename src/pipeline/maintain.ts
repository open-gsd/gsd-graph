// gsd-graph — pure multiset provenance invalidation + maintain alias (MNT-01)

/**
 * M1–M5 multiset provenance invalidation (D-05, D-06).
 *
 * Normative incremental API is build({ full: false }) which calls
 * invalidateProvenance with pathsToDrop = changed ∪ removed (OQ-1).
 * maintain() is a documented alias only — no second orchestrator.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BuildOptions, BuildResult, Triple } from '../types';
import { bestTier } from './ids';

/**
 * Normalize a path key consistently with build fingerprint matching:
 * realpath when the path exists, else path.resolve.
 */
export function normPathKey(p: string): string {
  try {
    return fs.realpathSync.native(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

function cloneTriple(t: Triple): Triple {
  return {
    id: t.id,
    s: t.s,
    p: t.p,
    o: t.o,
    confidence: t.confidence,
    ...(t.score !== undefined ? { score: t.score } : {}),
    provenance: t.provenance.map((e) => ({ ...e })),
  };
}

/**
 * Drop provenance entries whose source_path normalizes into pathsToDrop;
 * recompute confidence via bestTier; omit triples left with empty provenance.
 *
 * When pathsToDrop is empty, returns a deep clone without mutating inputs.
 */
export function invalidateProvenance(
  triples: readonly Triple[],
  pathsToDrop: ReadonlySet<string>,
): Triple[] {
  if (pathsToDrop.size === 0) {
    return triples.map(cloneTriple);
  }

  const kept: Triple[] = [];
  for (const t of triples) {
    const provenance = (t.provenance ?? []).filter(
      (e) => !pathsToDrop.has(normPathKey(e.source_path)),
    );
    if (provenance.length === 0) continue;
    kept.push({
      ...t,
      provenance,
      confidence: bestTier(provenance),
    });
  }
  return kept;
}

/**
 * Documented alias of build({ ...opts, full: false }) (RESEARCH OQ-1).
 * Lazy require avoids circular init with build.ts importing this module.
 */
export function maintain(opts: BuildOptions): BuildResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { build } = require('./build') as typeof import('./build');
  return build({ ...opts, full: false });
}
