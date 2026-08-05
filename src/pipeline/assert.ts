// gsd-graph — agent/user write path: assert + retract facts via episodes.jsonl

/**
 * The graph is built from documents, but agents and humans learn facts
 * mid-session that belong in it without a doc-editing detour. `assertFact`
 * merges a candidate triple through the normal normalize/ontology/review
 * gates and records the act in an append-only `episodes.jsonl` under the
 * store; `build` replays episodes so asserted facts survive full rebuilds.
 * `retractFact` removes a triple and records the retraction — the episode
 * log is the audit trail (who, when, why).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { publishGraphFiles } from '../io/atomic-publish';
import { loadGraphV1 } from '../io/load-graph';
import { acquireBuildLock } from '../io/lock';
import { confineUnderRoot, ensureStoreRoot, resolveStoreRoot } from '../io/paths';
import type {
  Confidence,
  GraphNode,
  ProvenanceEntry,
  Triple,
} from '../types';
import { mergeCandidates } from './build';
import { nodeId, tripleId } from './ids';
import { supersede } from './supersede';
import { resolveNodeTerm } from './why';

export const EPISODES_BASENAME = 'episodes.jsonl';

/** One append-only episode record (assert or retract). */
export interface EpisodeRecord {
  at: string;
  actor: string;
  action: 'assert' | 'retract';
  s: string;
  p: string;
  o: string;
  s_label?: string;
  o_label?: string;
  s_type?: string;
  o_type?: string;
  confidence?: Confidence;
  note?: string;
  supersedes?: string;
}

export interface AssertFactOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Subject: node id, label, or alias — resolved; created as needed. */
  s: string;
  /** Predicate id — gated by the active ontology (unknown → review queue). */
  p: string;
  /** Object: node id, label, or alias — resolved; created as needed. */
  o: string;
  /** Node type when the subject must be created (default Concept). */
  sType?: string;
  /** Node type when the object must be created (default Concept). */
  oType?: string;
  /** Confidence of the assertion (default INFERRED — it is a claim, not an extraction). */
  confidence?: Confidence;
  /** Who asserts: 'user/assert' (CLI default) or 'agent/<host>'. */
  actor?: string;
  /** Free-text evidence note recorded in the episode log. */
  note?: string;
  /** Triple id this assertion supersedes (records the reversal verdict). */
  supersedes?: string;
  /** Optional fixed clock for tests. */
  now?: string;
}

export interface AssertFactResult {
  store_dir: string;
  triple_id: string;
  s: string;
  p: string;
  o: string;
  created_nodes: string[];
  review_pending: number;
  /** True when the ontology gated the predicate into the review queue. */
  gated_to_review: boolean;
  superseded: string | null;
}

export interface RetractFactOptions {
  dir?: string;
  /** Triple id to retract. */
  tripleId: string;
  actor?: string;
  note?: string;
  now?: string;
}

export interface RetractFactResult {
  store_dir: string;
  triple_id: string;
  removed: boolean;
}

function episodesPath(storeRoot: string): string {
  return confineUnderRoot(storeRoot, EPISODES_BASENAME);
}

function appendEpisode(storeRoot: string, record: EpisodeRecord): void {
  fs.appendFileSync(episodesPath(storeRoot), `${JSON.stringify(record)}\n`, 'utf8');
}

function episodeHash(record: EpisodeRecord): string {
  return createHash('sha256')
    .update(JSON.stringify(record), 'utf8')
    .digest('hex');
}

/** Provenance entry representing an episode assertion. */
function episodeProvenance(record: EpisodeRecord): ProvenanceEntry {
  return {
    source_path: EPISODES_BASENAME,
    extractor: record.actor,
    content_hash: episodeHash(record),
    confidence: record.confidence ?? 'INFERRED',
    first_seen: record.at,
    last_seen: record.at,
  };
}

interface ResolvedEndpoint {
  id: string;
  created: GraphNode | null;
}

function resolveEndpoint(
  graphNodes: readonly GraphNode[],
  term: string,
  type: string,
): ResolvedEndpoint {
  const graphish = {
    nodes: [...graphNodes],
    triples: [],
  } as unknown as Parameters<typeof resolveNodeTerm>[0];
  const hit = resolveNodeTerm(graphish, term);
  if (hit !== null) return { id: hit, created: null };
  const id = nodeId(type, term);
  return { id, created: { id, type, label: term } };
}

/**
 * Assert a fact into the graph (write path). Runs through mergeCandidates —
 * ontology policy, review queue, provenance union, and caps all apply.
 */
export function assertFact(opts: AssertFactOptions): AssertFactResult {
  if (!opts.s || !opts.p || !opts.o) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      'assert requires s, p, and o',
    );
  }
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const now = opts.now ?? new Date().toISOString();
  const actor = opts.actor ?? 'user/assert';

  let priorNodes: GraphNode[] = [];
  try {
    priorNodes = loadGraphV1(storeRoot).nodes;
  } catch {
    // Empty/missing store: assert bootstraps it.
  }

  const sRes = resolveEndpoint(priorNodes, opts.s, opts.sType ?? 'Concept');
  const oRes = resolveEndpoint(priorNodes, opts.o, opts.oType ?? 'Concept');

  const record: EpisodeRecord = {
    at: now,
    actor,
    action: 'assert',
    s: sRes.id,
    p: opts.p,
    o: oRes.id,
    ...(sRes.created !== null ? { s_label: opts.s, s_type: sRes.created.type } : {}),
    ...(oRes.created !== null ? { o_label: opts.o, o_type: oRes.created.type } : {}),
    ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}),
    ...(opts.note !== undefined ? { note: opts.note } : {}),
    ...(opts.supersedes !== undefined ? { supersedes: opts.supersedes } : {}),
  };

  const provenance = episodeProvenance(record);
  const candidate: Triple = {
    id: tripleId(sRes.id, opts.p, oRes.id),
    s: sRes.id,
    p: opts.p,
    o: oRes.id,
    confidence: provenance.confidence,
    provenance: [provenance],
  };

  const candidateNodes: GraphNode[] = [];
  if (sRes.created !== null) candidateNodes.push(sRes.created);
  if (oRes.created !== null) candidateNodes.push(oRes.created);

  const merged = mergeCandidates({
    dir: storeRoot,
    nodes: candidateNodes,
    triples: [candidate],
    now,
  });

  // Episode is recorded regardless of gating — the log is the audit trail.
  appendEpisode(storeRoot, record);

  // Gated when the published graph does not contain the triple id.
  const graph = loadGraphV1(storeRoot);
  const published = graph.triples.some((t) => t.id === candidate.id);

  let supersededId: string | null = null;
  if (published && opts.supersedes !== undefined) {
    try {
      supersede({
        dir: storeRoot,
        winner: candidate.id,
        loser: opts.supersedes,
        now,
      });
      supersededId = opts.supersedes;
    } catch {
      supersededId = null; // loser id unknown — episode still records intent
    }
  }

  return {
    store_dir: storeRoot,
    triple_id: candidate.id,
    s: sRes.id,
    p: opts.p,
    o: oRes.id,
    created_nodes: candidateNodes.map((n) => n.id),
    review_pending: merged.review_pending,
    gated_to_review: !published,
    superseded: supersededId,
  };
}

/**
 * Retract a triple by id: remove from the published graph and record the
 * retraction episode. Rebuilds honor the retraction (last action per key wins).
 */
export function retractFact(opts: RetractFactOptions): RetractFactResult {
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const now = opts.now ?? new Date().toISOString();
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const graph = loadGraphV1(storeRoot);
    const triple = graph.triples.find((t) => t.id === opts.tripleId);
    if (triple === undefined) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `triple not found: ${opts.tripleId}`,
        { id: opts.tripleId },
      );
    }
    graph.triples = graph.triples.filter((t) => t.id !== opts.tripleId);
    graph.stats = {
      node_count: graph.nodes.length,
      triple_count: graph.triples.length,
    };
    graph.built_at = now;

    publishGraphFiles({
      storeRoot,
      graphV1: graph,
      writeProjection: false,
      projection: null,
    });

    appendEpisode(storeRoot, {
      at: now,
      actor: opts.actor ?? 'user/retract',
      action: 'retract',
      s: triple.s,
      p: triple.p,
      o: triple.o,
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    });

    return { store_dir: storeRoot, triple_id: opts.tripleId, removed: true };
  } finally {
    lock.release();
  }
}

export interface EpisodeCandidates {
  nodes: GraphNode[];
  triples: Triple[];
  /** (s\0p\0o) keys whose LAST episode action is retract — drop post-normalize. */
  retractKeys: Set<string>;
  episode_count: number;
}

/**
 * Replay episodes.jsonl into build candidates. Last action per (s,p,o) wins:
 * assert contributes a candidate triple (and endpoint nodes when the episode
 * created them); retract contributes a post-normalize drop key.
 */
export function loadEpisodeCandidates(storeRoot: string): EpisodeCandidates {
  const out: EpisodeCandidates = {
    nodes: [],
    triples: [],
    retractKeys: new Set(),
    episode_count: 0,
  };
  const p = episodesPath(storeRoot);
  if (!fs.existsSync(p)) return out;

  let lines: string[];
  try {
    lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  } catch {
    return out;
  }

  const lastAction = new Map<string, EpisodeRecord>();
  const nodesById = new Map<string, GraphNode>();
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    let rec: EpisodeRecord;
    try {
      rec = JSON.parse(line) as EpisodeRecord;
    } catch {
      continue; // append-only log tolerates torn writes at the tail
    }
    if (!rec.s || !rec.p || !rec.o || !rec.action) continue;
    out.episode_count += 1;
    lastAction.set(`${rec.s}\0${rec.p}\0${rec.o}`, rec);
    if (rec.action === 'assert') {
      if (rec.s_label !== undefined) {
        nodesById.set(rec.s, {
          id: rec.s,
          type: rec.s_type ?? 'Concept',
          label: rec.s_label,
        });
      }
      if (rec.o_label !== undefined) {
        nodesById.set(rec.o, {
          id: rec.o,
          type: rec.o_type ?? 'Concept',
          label: rec.o_label,
        });
      }
    }
  }

  for (const [key, rec] of lastAction) {
    if (rec.action === 'retract') {
      out.retractKeys.add(key);
      continue;
    }
    const provenance = episodeProvenance(rec);
    out.triples.push({
      id: tripleId(rec.s, rec.p, rec.o),
      s: rec.s,
      p: rec.p,
      o: rec.o,
      confidence: provenance.confidence,
      provenance: [provenance],
    });
  }
  out.nodes = [...nodesById.values()];
  return out;
}
