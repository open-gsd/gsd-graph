// gsd-graph — mark one triple as superseding another (decision reversals)

/**
 * Planning corpora reverse decisions; without supersession both sides of a
 * reversal cite forever with equal weight. `supersede` records the human
 * verdict: winner.supersedes += loser, loser.superseded_by += winner.
 * Superseded triples stay in the graph (provenance is history, not garbage)
 * but rank below fresh facts and render flagged in citations.
 */

import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { publishGraphFiles } from '../io/atomic-publish';
import { loadGraphV1 } from '../io/load-graph';
import { acquireBuildLock } from '../io/lock';
import { ensureStoreRoot, resolveStoreRoot } from '../io/paths';
import type { Triple } from '../types';

export interface SupersedeOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Triple id that wins (the current fact). */
  winner: string;
  /** Triple id that is superseded (the stale fact). */
  loser: string;
  /** Optional fixed clock for tests. */
  now?: string;
}

export interface SupersedeResult {
  store_dir: string;
  winner: string;
  loser: string;
}

function findTriple(triples: Triple[], id: string): Triple {
  const t = triples.find((x) => x.id === id);
  if (t === undefined) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `triple not found: ${id}`,
      { id },
    );
  }
  return t;
}

/** Record that `winner` supersedes `loser` and republish the store. */
export function supersede(opts: SupersedeOptions): SupersedeResult {
  if (opts.winner === opts.loser) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      'a triple cannot supersede itself',
      { id: opts.winner },
    );
  }
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const graph = loadGraphV1(storeRoot);
    const winner = findTriple(graph.triples, opts.winner);
    const loser = findTriple(graph.triples, opts.loser);

    winner.supersedes = [
      ...new Set([...(winner.supersedes ?? []), loser.id]),
    ];
    loser.superseded_by = [
      ...new Set([...(loser.superseded_by ?? []), winner.id]),
    ];

    graph.built_at = opts.now ?? new Date().toISOString();

    publishGraphFiles({
      storeRoot,
      graphV1: graph,
      writeProjection: false,
      projection: null,
    });

    return { store_dir: storeRoot, winner: winner.id, loser: loser.id };
  } finally {
    lock.release();
  }
}
