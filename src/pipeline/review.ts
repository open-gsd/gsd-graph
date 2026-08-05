// gsd-graph — review queue load/save + accept/reject resolve (REV-01, D-08)

import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { publishGraphFiles } from '../io/atomic-publish';
import { loadGraphV1 } from '../io/load-graph';
import { acquireBuildLock } from '../io/lock';
import { ensureStoreRoot, storeFile } from '../io/paths';
import { readJsonFile } from '../io/safe-json';
import {
  formatAjvErrors,
  validateReviewQueue,
} from '../schema/validators';
import type {
  GraphNode,
  GraphV1Document,
  ReviewItem,
  ReviewQueueDocument,
  Triple,
} from '../types';
import { bestTier, nodeId, tripleId } from './ids';

const QUEUE_BASENAME = 'review-queue.json';
const ONTOLOGY_LOCK_BASENAME = 'ontology.lock.json';

/** Empty default queue when file is missing. */
export function emptyReviewQueue(): ReviewQueueDocument {
  return {
    schema_version: 1,
    items: [],
    decisions: [],
  };
}

/**
 * Load review-queue.json from the store. Missing file → empty document.
 * Invalid JSON/schema → SCHEMA_INVALID.
 */
export function loadReviewQueue(storeRoot: string): ReviewQueueDocument {
  const root = ensureStoreRoot(storeRoot);
  const path = storeFile(root, QUEUE_BASENAME);
  if (!fs.existsSync(path)) {
    return emptyReviewQueue();
  }

  let data: unknown;
  try {
    data = readJsonFile(path);
  } catch (err) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `review-queue.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { path },
    );
  }

  if (!validateReviewQueue(data)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `review-queue.json schema invalid: ${formatAjvErrors(validateReviewQueue.errors)}`,
      { path, errors: validateReviewQueue.errors },
    );
  }

  return data as ReviewQueueDocument;
}

/**
 * Merge incoming pending review items into an existing queue.
 *
 * - By id: do not reset accepted/rejected to pending when decisions contain id
 * - Prior decision for same id prevents re-opening pending on identical payload
 *   rebuild (Pitfall 3 / D-08)
 */
export function mergeReviewItems(
  existing: ReviewQueueDocument,
  incoming: ReviewItem[],
): ReviewQueueDocument {
  const decidedIds = new Set(existing.decisions.map((d) => d.id));
  const byId = new Map<string, ReviewItem>();
  for (const item of existing.items) {
    byId.set(item.id, item);
  }

  for (const inc of incoming) {
    const prior = byId.get(inc.id);
    if (prior) {
      // Never reopen accepted/rejected when a decision exists for this id
      if (
        prior.status !== 'pending' ||
        decidedIds.has(inc.id) ||
        prior.decision != null
      ) {
        continue;
      }
      // Keep existing pending (preserve created_at)
      continue;
    }
    if (decidedIds.has(inc.id)) {
      // Decision without item row — retain decision; do not re-open as pending
      continue;
    }
    byId.set(inc.id, { ...inc, status: 'pending', decision: null });
  }

  return {
    schema_version: 1,
    items: [...byId.values()],
    decisions: [...existing.decisions],
  };
}

export interface ReviewResolveOptions {
  storeRoot: string;
  id: string;
  action: 'accept' | 'reject';
  /**
   * When true, accept of predicate_unknown / type_unknown may extend
   * ontology.lock.json and write the contested draft. Never ambient (T-02-08).
   */
  extendOntology?: boolean;
  /** Optional fixed clock for tests. */
  now?: string;
  /** writeProjection for publish; default false. */
  writeProjection?: boolean;
}

/**
 * Accept or reject a review item under the build lock (D-08, D-09).
 *
 * - reject: record decision; do not write contested draft
 * - accept entity_merge: rewrite triples s/o drop→keep; merge aliases; delete drop
 * - accept predicate_unknown: extendOntology → lock + write triple; else coerce to related_to or fail closed
 * - accept type_unknown: extendOntology → lock + write node; else coerce Concept
 * - accept schema_drift: record only
 */
export function reviewResolve(opts: ReviewResolveOptions): void {
  const storeRoot = ensureStoreRoot(opts.storeRoot);
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const now = opts.now ?? new Date().toISOString();
    const queue = loadReviewQueue(storeRoot);
    const item = queue.items.find((i) => i.id === opts.id);
    if (!item) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `review item not found: ${opts.id}`,
        { id: opts.id },
      );
    }
    if (item.status !== 'pending') {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `review item ${opts.id} is already ${item.status}`,
        { id: opts.id, status: item.status },
      );
    }

    const graph = loadGraphV1(storeRoot);
    let ontologyLock = loadOntologyLock(storeRoot);

    if (opts.action === 'reject') {
      item.status = 'rejected';
      item.updated_at = now;
      item.decision = { action: 'reject', at: now };
      queue.decisions.push({ id: item.id, action: 'reject', at: now });
    } else {
      // accept
      const extend = opts.extendOntology === true;
      applyAccept(item, graph, {
        extendOntology: extend,
        now,
        ontologyLock,
        setOntologyLock: (next) => {
          ontologyLock = next;
        },
      });
      item.status = 'accepted';
      item.updated_at = now;
      item.decision = {
        action: 'accept',
        at: now,
        ...(extend ? { extend_ontology: true } : {}),
      };
      queue.decisions.push({
        id: item.id,
        action: 'accept',
        at: now,
        ...(extend ? { extend_ontology: true } : {}),
      });
    }

    // Refresh stats
    graph.stats = {
      node_count: graph.nodes.length,
      triple_count: graph.triples.length,
    };

    const sidecars: Record<string, object> = {
      [QUEUE_BASENAME]: queue,
    };
    if (ontologyLock) {
      sidecars[ONTOLOGY_LOCK_BASENAME] = ontologyLock;
    }

    publishGraphFiles({
      storeRoot,
      graphV1: graph,
      writeProjection: opts.writeProjection === true,
      sidecars,
    });
  } finally {
    lock.release();
  }
}

export interface ReviewResolveBatchOptions {
  storeRoot: string;
  action: 'accept' | 'reject';
  /** Resolve every pending item (subject to kind/predicate filters). */
  all?: boolean;
  /** Only items of this kind. */
  kind?: ReviewItem['kind'];
  /** Only predicate_unknown items proposing this predicate. */
  predicate?: string;
  /** Explicit ids to resolve (combined with filters when both given). */
  ids?: string[];
  /** See ReviewResolveOptions.extendOntology. */
  extendOntology?: boolean;
  /** Optional fixed clock for tests. */
  now?: string;
  writeProjection?: boolean;
}

export interface ReviewResolveBatchResult {
  resolved: string[];
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * Resolve many pending review items under a single build lock + publish.
 *
 * Selection: pending items ∩ (ids when given) ∩ (kind when given) ∩
 * (predicate when given, predicate_unknown only). `all` with no filters
 * selects every pending item. Individual apply failures are recorded in
 * `skipped` and never abort the batch.
 */
export function reviewResolveBatch(
  opts: ReviewResolveBatchOptions,
): ReviewResolveBatchResult {
  const storeRoot = ensureStoreRoot(opts.storeRoot);
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const now = opts.now ?? new Date().toISOString();
    const queue = loadReviewQueue(storeRoot);
    const graph = loadGraphV1(storeRoot);
    let ontologyLock = loadOntologyLock(storeRoot);

    const idFilter = opts.ids !== undefined ? new Set(opts.ids) : null;
    const selected = queue.items.filter((item) => {
      if (item.status !== 'pending') return false;
      if (idFilter !== null && !idFilter.has(item.id)) return false;
      if (opts.kind !== undefined && item.kind !== opts.kind) return false;
      if (opts.predicate !== undefined) {
        if (item.kind !== 'predicate_unknown') return false;
        if (String(item.payload.proposed_p ?? '') !== opts.predicate) {
          return false;
        }
      }
      return true;
    });

    if (
      selected.length === 0 ||
      (idFilter === null &&
        opts.all !== true &&
        opts.kind === undefined &&
        opts.predicate === undefined)
    ) {
      return { resolved: [], skipped: [] };
    }

    const resolved: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    const extend = opts.extendOntology === true;

    for (const item of selected) {
      if (opts.action === 'reject') {
        item.status = 'rejected';
        item.updated_at = now;
        item.decision = { action: 'reject', at: now };
        queue.decisions.push({ id: item.id, action: 'reject', at: now });
        resolved.push(item.id);
        continue;
      }
      try {
        applyAccept(item, graph, {
          extendOntology: extend,
          now,
          ontologyLock,
          setOntologyLock: (next) => {
            ontologyLock = next;
          },
        });
      } catch (err) {
        skipped.push({
          id: item.id,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      item.status = 'accepted';
      item.updated_at = now;
      item.decision = {
        action: 'accept',
        at: now,
        ...(extend ? { extend_ontology: true } : {}),
      };
      queue.decisions.push({
        id: item.id,
        action: 'accept',
        at: now,
        ...(extend ? { extend_ontology: true } : {}),
      });
      resolved.push(item.id);
    }

    graph.stats = {
      node_count: graph.nodes.length,
      triple_count: graph.triples.length,
    };

    const sidecars: Record<string, object> = {
      [QUEUE_BASENAME]: queue,
    };
    if (ontologyLock) {
      sidecars[ONTOLOGY_LOCK_BASENAME] = ontologyLock;
    }

    publishGraphFiles({
      storeRoot,
      graphV1: graph,
      writeProjection: opts.writeProjection === true,
      sidecars,
    });

    return { resolved, skipped };
  } finally {
    lock.release();
  }
}

interface OntologyLockDoc {
  pack_id?: string;
  pack_version?: string;
  pack_hash?: string;
  node_types?: string[];
  predicates?: Array<{ id: string; domain?: string[]; range?: string[] }>;
  extended?: boolean;
  [key: string]: unknown;
}

function loadOntologyLock(storeRoot: string): OntologyLockDoc | null {
  const path = storeFile(storeRoot, ONTOLOGY_LOCK_BASENAME);
  if (!fs.existsSync(path)) return null;
  try {
    return readJsonFile(path) as OntologyLockDoc;
  } catch {
    return null;
  }
}

function applyAccept(
  item: ReviewItem,
  graph: GraphV1Document,
  ctx: {
    extendOntology: boolean;
    now: string;
    ontologyLock: OntologyLockDoc | null;
    setOntologyLock: (doc: OntologyLockDoc) => void;
  },
): void {
  switch (item.kind) {
    case 'entity_merge':
      acceptEntityMerge(item, graph);
      return;
    case 'predicate_unknown':
      acceptPredicateUnknown(item, graph, ctx);
      return;
    case 'type_unknown':
      acceptTypeUnknown(item, graph, ctx);
      return;
    case 'schema_drift':
      // Record-only accept (DESIGN table)
      return;
    default: {
      const _exhaustive: never = item.kind;
      void _exhaustive;
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `unknown review kind: ${String(item.kind)}`,
      );
    }
  }
}

function acceptEntityMerge(item: ReviewItem, graph: GraphV1Document): void {
  const keepId = String(
    item.payload.keep_id ?? item.payload.keep ?? '',
  );
  const dropId = String(
    item.payload.drop_id ?? item.payload.drop ?? '',
  );
  if (!keepId || !dropId) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      'entity_merge accept requires keep_id and drop_id in payload',
      { payload: item.payload },
    );
  }

  const keep = graph.nodes.find((n) => n.id === keepId);
  const drop = graph.nodes.find((n) => n.id === dropId);
  if (!keep || !drop) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `entity_merge nodes missing: keep=${keepId} drop=${dropId}`,
    );
  }

  // Merge aliases into keeper
  const aliasSet = new Set<string>(keep.aliases ?? []);
  aliasSet.add(drop.label);
  if (drop.aliases) {
    for (const a of drop.aliases) aliasSet.add(a);
  }
  keep.aliases = [...aliasSet];
  if (!keep.description && drop.description) {
    keep.description = drop.description;
  }

  // Rewrite triples s/o drop→keep, then dedup
  const rewritten: Triple[] = [];
  for (const t of graph.triples) {
    const s = t.s === dropId ? keepId : t.s;
    const o = t.o === dropId ? keepId : t.o;
    rewritten.push({
      ...t,
      s,
      o,
      id: tripleId(s, t.p, o),
    });
  }
  graph.triples = dedupTriples(rewritten);
  graph.nodes = graph.nodes.filter((n) => n.id !== dropId);
}

function acceptPredicateUnknown(
  item: ReviewItem,
  graph: GraphV1Document,
  ctx: {
    extendOntology: boolean;
    ontologyLock: OntologyLockDoc | null;
    setOntologyLock: (doc: OntologyLockDoc) => void;
  },
): void {
  const proposed = String(item.payload.proposed_p ?? '');
  const draft = item.payload.triple as
    | {
        s?: string;
        p?: string;
        o?: string;
        provenance?: Triple['provenance'];
        confidence?: Triple['confidence'];
        score?: number;
      }
    | undefined;

  if (!draft || !draft.s || !draft.o) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      'predicate_unknown accept requires payload.triple with s/o',
      { payload: item.payload },
    );
  }

  let p = proposed || draft.p || 'related_to';

  if (ctx.extendOntology) {
    // Extend lock + write with proposed predicate
    const lock = ctx.ontologyLock ?? {
      pack_id: graph.ontology_pack_id,
      pack_version: graph.ontology_version,
      node_types: [],
      predicates: [],
      extended: true,
    };
    const preds = [...(lock.predicates ?? [])];
    if (!preds.some((x) => x.id === p)) {
      preds.push({ id: p, domain: ['*'], range: ['*'] });
    }
    lock.predicates = preds;
    lock.extended = true;
    ctx.setOntologyLock(lock);
  } else {
    // Fail closed without ambient expand: coerce to related_to (D-07 / D-08)
    p = 'related_to';
  }

  const provenance = draft.provenance ?? [];
  const triple: Triple = {
    id: tripleId(draft.s, p, draft.o),
    s: draft.s,
    p,
    o: draft.o,
    confidence: bestTier(provenance),
    provenance: [...provenance],
  };
  if (draft.score !== undefined) triple.score = draft.score;

  graph.triples = dedupTriples([...graph.triples, triple]);
}

function acceptTypeUnknown(
  item: ReviewItem,
  graph: GraphV1Document,
  ctx: {
    extendOntology: boolean;
    ontologyLock: OntologyLockDoc | null;
    setOntologyLock: (doc: OntologyLockDoc) => void;
  },
): void {
  const proposed = String(item.payload.proposed_type ?? '');
  const draft = item.payload.node as
    | {
        id?: string;
        type?: string;
        label?: string;
        description?: string;
        aliases?: string[];
      }
    | undefined;

  if (!draft || !draft.label) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      'type_unknown accept requires payload.node with label',
      { payload: item.payload },
    );
  }

  let type = proposed || draft.type || 'Concept';

  if (ctx.extendOntology) {
    const lock = ctx.ontologyLock ?? {
      pack_id: graph.ontology_pack_id,
      pack_version: graph.ontology_version,
      node_types: [],
      predicates: [],
      extended: true,
    };
    const types = [...(lock.node_types ?? [])];
    if (!types.includes(type)) types.push(type);
    lock.node_types = types;
    lock.extended = true;
    ctx.setOntologyLock(lock);
  } else {
    // Coerce to Concept without ambient lock expand
    type = 'Concept';
  }

  const id = draft.id && draft.id.length > 0 ? draft.id : nodeId(type, draft.label);
  const node: GraphNode = {
    id,
    type,
    label: draft.label,
  };
  if (draft.description !== undefined) node.description = draft.description;
  if (draft.aliases !== undefined) node.aliases = [...draft.aliases];

  if (!graph.nodes.some((n) => n.id === id)) {
    graph.nodes.push(node);
  }
}

function dedupTriples(triples: Triple[]): Triple[] {
  const map = new Map<string, Triple>();
  for (const t of triples) {
    const key = `${t.s}\0${t.p}\0${t.o}`;
    const existing = map.get(key);
    if (existing) {
      const seen = new Set(
        existing.provenance.map(
          (e) =>
            `${e.source_path}\0${e.extractor}\0${e.content_hash}\0${e.confidence}`,
        ),
      );
      for (const e of t.provenance) {
        const k = `${e.source_path}\0${e.extractor}\0${e.content_hash}\0${e.confidence}`;
        if (!seen.has(k)) {
          existing.provenance.push(e);
          seen.add(k);
        }
      }
      existing.confidence = bestTier(existing.provenance);
    } else {
      map.set(key, {
        ...t,
        id: tripleId(t.s, t.p, t.o),
        provenance: [...t.provenance],
      });
    }
  }
  return [...map.values()];
}
