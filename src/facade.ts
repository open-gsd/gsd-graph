// gsd-graph — GsdGraph.open(): ergonomic embedding facade over the read pipeline

/**
 * One handle per store for programmatic consumers (editors, bots, MCP hosts):
 *
 *   const g = GsdGraph.open({ dir: '/repo/.gsd-graph' });
 *   g.ask('why is phase 4 blocked?');
 *   g.why('auth service', 'ledger');
 *
 * Reads go through the mtime-keyed document cache, so a long-lived process
 * pays parse + validate once per publish instead of once per call. All
 * methods stay thin over the same public pipeline functions.
 */

import { loadGraphV1Cached } from './io/graph-cache';
import { resolveStoreRoot } from './io/paths';
import { answer } from './pipeline/answer';
import { detectCommunities } from './pipeline/communities';
import { packSubgraph } from './pipeline/pack';
import { query } from './pipeline/query';
import { status } from './pipeline/status';
import { why } from './pipeline/why';
import type {
  AnswerOptions,
  DetectCommunitiesOptions,
  DetectCommunitiesResult,
  GraphV1Document,
  GroundedAnswer,
  PackOptions,
  QueryOptions,
  QueryResult,
  StatusOptions,
  StatusResult,
  SubgraphPack,
} from './types';
import type { WhyOptions, WhyResult } from './pipeline/why';

export interface GsdGraphOpenOptions {
  /** Store directory (absolute or relative to cwd). Default resolution applies. */
  dir?: string;
  /** Working directory for relative resolution; defaults to process.cwd(). */
  cwd?: string;
  /** Env map for GSD_GRAPH_DIR; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export class GsdGraph {
  /** Resolved absolute store root this handle reads from. */
  readonly storeRoot: string;

  private constructor(storeRoot: string) {
    this.storeRoot = storeRoot;
  }

  /** Open a handle on a store (does not touch disk until first read). */
  static open(opts?: GsdGraphOpenOptions): GsdGraph {
    const storeRoot = resolveStoreRoot({
      ...(opts?.dir !== undefined ? { dir: opts.dir } : {}),
      ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
      ...(opts?.env !== undefined ? { env: opts.env } : {}),
    });
    return new GsdGraph(storeRoot);
  }

  /** Parsed graph.v1 document (cached until the store republishes). */
  load(): GraphV1Document {
    return loadGraphV1Cached(this.storeRoot);
  }

  /** Store status/freshness (never uses projection as SoT). */
  status(opts?: Omit<StatusOptions, 'dir'>): StatusResult {
    return status({ ...(opts ?? {}), dir: this.storeRoot });
  }

  /** Structured Query IR over the cached document. */
  query(opts: Omit<QueryOptions, 'dir' | 'graph'>): QueryResult {
    return query({ ...opts, graph: this.load() });
  }

  /** Grounded subgraph pack for a natural-language question. */
  pack(
    question: string,
    opts?: Omit<PackOptions, 'dir' | 'graph' | 'question'>,
  ): SubgraphPack {
    return packSubgraph({ ...(opts ?? {}), question, graph: this.load() });
  }

  /** Grounded answer (deterministic by default; honest abstain). */
  ask(
    question: string,
    opts?: Omit<AnswerOptions, 'dir' | 'graph' | 'question'>,
  ): GroundedAnswer {
    return answer({ ...(opts ?? {}), question, graph: this.load() });
  }

  /** Cited prose path between two human terms. */
  why(
    from: string,
    to: string,
    opts?: Omit<WhyOptions, 'dir' | 'graph' | 'from' | 'to'>,
  ): WhyResult {
    return why({ ...(opts ?? {}), from, to, graph: this.load() });
  }

  /** Community detection over the cached document (write needs the store). */
  communities(
    opts?: Omit<DetectCommunitiesOptions, 'dir' | 'graph'>,
  ): DetectCommunitiesResult {
    return detectCommunities({
      ...(opts ?? {}),
      graph: this.load(),
      dir: this.storeRoot,
    });
  }
}
