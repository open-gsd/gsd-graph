// gsd-graph — SeedScorer seam: pluggable fallback seed selection

/**
 * The lexical scorer stays the deterministic default. A SeedScorer is only
 * consulted as a FALLBACK when lexical seeding finds nothing; whatever it
 * returns still flows through the ordinary deterministic expand → budget →
 * cite pipeline, so grounding never depends on the scorer.
 */

import type { GraphV1Document } from '../types';
import { semanticSeedCandidates, type SemanticSeedOptions } from './sidecar';

export interface SeedScorerCandidate {
  id: string;
  score: number;
}

export interface SeedScorer {
  id: string;
  /** Candidate seeds for a question; [] = no opinion. May be async. */
  score(
    graph: GraphV1Document,
    question: string,
    k: number,
  ): SeedScorerCandidate[] | Promise<SeedScorerCandidate[]>;
}

let registered: SeedScorer | null = null;

/** Register the fallback scorer (null clears). Library-level, process-global. */
export function setSeedScorer(scorer: SeedScorer | null): void {
  registered = scorer;
}

/** Currently registered fallback scorer, if any. */
export function getSeedScorer(): SeedScorer | null {
  return registered;
}

/** Built-in scorer over the embedding sidecar (opt-in wiring). */
export function embeddingSeedScorer(
  opts?: Omit<SemanticSeedOptions, 'k'>,
): SeedScorer {
  return {
    id: 'embeddings-sidecar',
    score: async (_graph, question, k) =>
      semanticSeedCandidates(question, { ...(opts ?? {}), k }),
  };
}
