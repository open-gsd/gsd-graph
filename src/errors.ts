// gsd-graph — typed reason codes and GraphError
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Machine-readable reason codes for CLI/library failures (DESIGN § Reason codes).
 * Values are lowercase snake_case strings.
 */
export const GSD_GRAPH_REASON = Object.freeze({
  OK: 'ok',
  BUILD_LOCKED: 'build_locked',
  BUILD_FAILED: 'build_failed',
  SCHEMA_INVALID: 'schema_invalid',
  ONTOLOGY_INVALID: 'ontology_invalid',
  EMPTY_SUBGRAPH: 'empty_subgraph',
  PROMPT_RESULT_INVALID: 'prompt_result_invalid',
  CORPUS_NOT_FOUND: 'corpus_not_found',
  PATH_ESCAPE: 'path_escape',
  LIMIT_EXCEEDED: 'limit_exceeded',
  NO_BASELINE: 'no_baseline',
} as const);

export type GraphReasonCode =
  (typeof GSD_GRAPH_REASON)[keyof typeof GSD_GRAPH_REASON];

/**
 * Typed operational error carrying a GSD_GRAPH_REASON code.
 */
export class GraphError extends Error {
  readonly reason: string;
  readonly details?: unknown;

  constructor(reason: string, message: string, details?: unknown) {
    super(message);
    this.name = 'GraphError';
    this.reason = reason;
    if (details !== undefined) {
      this.details = details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
