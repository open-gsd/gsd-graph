// gsd-graph — offline build orchestrator under lock (D-09, EXT-03, STAT-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Composes discover → extract → normalize → review merge → publish.
 *
 * Incremental strategy (Phase 2 / EXT-03 — not full M1–M5):
 * - Load prior graph.v1 + sources.manifest when present.
 * - Fingerprint each discovered file; when !full and hash matches manifest,
 *   skip re-extract (sources_skipped_fresh++).
 * - Strip prior triples whose provenance references re-extracted paths, then
 *   union re-extracted candidates and always re-normalize so best_tier/merge
 *   stay correct.
 * - Caps: nodes > 100_000 or triples > 250_000 → LIMIT_EXCEEDED before publish.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import {
  DEFAULT_WRITE_PROJECTION,
  publishGraphFiles,
} from '../io/atomic-publish';
import { loadGraphV1 } from '../io/load-graph';
import { acquireBuildLock } from '../io/lock';
import { ensureStoreRoot, resolveStoreRoot, storeFile } from '../io/paths';
import { readJsonFile } from '../io/safe-json';
import { loadOntologyPack } from '../ontology/load-pack';
import type { LoadedOntology } from '../ontology/types';
import { getPackageRoot } from '../schema/validators';
import { discoverSources } from '../sources/discover';
import { fingerprintFile } from '../sources/fingerprint';
import type {
  BuildOptions,
  BuildResult,
  ExtractDiagnostic,
  GraphNode,
  GraphV1Document,
  SourceManifestEntry,
  SourcesManifest,
  Triple,
} from '../types';
import { extractByPath } from './extract';
import { bestTier } from './ids';
import { normalize } from './normalize';
import {
  emptyReviewQueue,
  loadReviewQueue,
  mergeReviewItems,
} from './review';

/** Hard cap on published node count (DESIGN / T-02-12). */
export const MAX_NODES = 100_000;
/** Hard cap on published triple count (DESIGN / T-02-12). */
export const MAX_TRIPLES = 250_000;

const MANIFEST_BASENAME = 'sources.manifest.json';
const QUEUE_BASENAME = 'review-queue.json';
const ONTOLOGY_LOCK_BASENAME = 'ontology.lock.json';

/**
 * Throw LIMIT_EXCEEDED when normalized graph exceeds hard caps.
 * Exported for unit tests without multi-GB fixtures.
 */
export function assertGraphCaps(
  nodes: readonly GraphNode[],
  triples: readonly Triple[],
): void {
  if (nodes.length > MAX_NODES || triples.length > MAX_TRIPLES) {
    throw new GraphError(
      GSD_GRAPH_REASON.LIMIT_EXCEEDED,
      `graph exceeds caps: nodes=${nodes.length} (max ${MAX_NODES}), triples=${triples.length} (max ${MAX_TRIPLES})`,
      {
        node_count: nodes.length,
        triple_count: triples.length,
        max_nodes: MAX_NODES,
        max_triples: MAX_TRIPLES,
      },
    );
  }
}

function readEngineVersion(): string {
  try {
    const pkgPath = path.join(getPackageRoot(), 'package.json');
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return typeof raw.version === 'string' && raw.version.length > 0
      ? raw.version
      : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function loadPriorManifest(storeRoot: string): SourcesManifest | null {
  const p = storeFile(storeRoot, MANIFEST_BASENAME);
  if (!fs.existsSync(p)) return null;
  try {
    const data = readJsonFile(p) as SourcesManifest;
    if (data?.schema_version !== 1 || typeof data.sources !== 'object') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function loadPriorGraph(storeRoot: string): GraphV1Document | null {
  const p = storeFile(storeRoot, 'graph.v1.json');
  if (!fs.existsSync(p)) return null;
  try {
    return loadGraphV1(storeRoot);
  } catch {
    return null;
  }
}

function extractorForPath(absPath: string): string {
  const ext = path.extname(absPath).toLowerCase();
  switch (ext) {
    case '.md':
    case '.markdown':
    case '.txt':
      return 'markdown';
    case '.json':
    case '.jsonl':
      return 'jsonl';
    default:
      return 'unknown';
  }
}

function normPathKey(p: string): string {
  try {
    return fs.realpathSync.native(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

/**
 * Drop provenance entries (and triples left empty) whose source_path is in
 * `changedPaths`. Recomputes confidence via bestTier.
 */
function stripChangedSources(
  nodes: GraphNode[],
  triples: Triple[],
  changedPaths: ReadonlySet<string>,
): { nodes: GraphNode[]; triples: Triple[] } {
  if (changedPaths.size === 0) {
    return { nodes: nodes.map(cloneNode), triples: triples.map(cloneTriple) };
  }

  const kept: Triple[] = [];
  for (const t of triples) {
    const provenance = (t.provenance ?? []).filter(
      (e) => !changedPaths.has(normPathKey(e.source_path)),
    );
    if (provenance.length === 0) continue;
    kept.push({
      ...t,
      provenance,
      confidence: bestTier(provenance),
    });
  }
  return {
    nodes: nodes.map(cloneNode),
    triples: kept,
  };
}

function cloneNode(n: GraphNode): GraphNode {
  return {
    id: n.id,
    type: n.type,
    label: n.label,
    ...(n.description !== undefined ? { description: n.description } : {}),
    ...(n.aliases !== undefined ? { aliases: [...n.aliases] } : {}),
  };
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

function buildOntologyLock(ontology: LoadedOntology): Record<string, unknown> {
  const { pack, packHash } = ontology;
  return {
    pack_id: pack.id,
    version: pack.version,
    packHash,
    node_types: [...pack.node_types],
    predicates: pack.predicates.map((p) => p.id),
  };
}

function fingerprintStat(absPath: string): {
  content_hash: string;
  mtime_ms: number;
  bytes: number;
} {
  const st = fs.statSync(absPath);
  return {
    content_hash: fingerprintFile(absPath),
    mtime_ms: Math.trunc(st.mtimeMs),
    bytes: st.size,
  };
}

/**
 * Offline build: discover → extract → normalize → publish under lock (D-09).
 */
export function build(opts: BuildOptions): BuildResult {
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    return runBuild(storeRoot, opts);
  } finally {
    lock.release();
  }
}

function runBuild(storeRoot: string, opts: BuildOptions): BuildResult {
  const engine_version = readEngineVersion();
  const built_at = new Date().toISOString();
  const full = opts.full === true;
  const diagnostics: ExtractDiagnostic[] = [];

  const ontology = loadOntologyPack({
    packIdOrPath: opts.ontology ?? 'general',
  });

  const discovered = discoverSources(
    opts.corpus,
    opts.globs !== undefined ? { globs: opts.globs } : {},
  );
  diagnostics.push(...discovered.diagnostics);

  const priorManifest = loadPriorManifest(storeRoot);
  const priorGraph = loadPriorGraph(storeRoot);

  const toExtract: string[] = [];
  let sources_skipped_fresh = 0;
  const changedPaths = new Set<string>();

  for (const file of discovered.files) {
    const key = normPathKey(file);
    const { content_hash } = fingerprintStat(file);
    const prior = priorManifest?.sources?.[file] ?? priorManifest?.sources?.[key];
    if (
      !full &&
      prior &&
      prior.content_hash === content_hash &&
      priorGraph
    ) {
      sources_skipped_fresh += 1;
      continue;
    }
    toExtract.push(file);
    changedPaths.add(key);
  }

  let workingNodes: GraphNode[] = [];
  let workingTriples: Triple[] = [];

  if (!full && priorGraph && sources_skipped_fresh > 0) {
    const stripped = stripChangedSources(
      priorGraph.nodes,
      priorGraph.triples,
      changedPaths,
    );
    workingNodes = stripped.nodes;
    workingTriples = stripped.triples;
  }

  const sources_extracted = toExtract.length;
  const newManifestSources: Record<string, SourceManifestEntry> = {};

  // Preserve skipped entries from prior manifest
  if (!full && priorManifest) {
    for (const file of discovered.files) {
      const key = normPathKey(file);
      if (changedPaths.has(key)) continue;
      const prior =
        priorManifest.sources[file] ?? priorManifest.sources[key];
      if (prior) {
        newManifestSources[file] = { ...prior };
      }
    }
  }

  for (const file of toExtract) {
    const fp = fingerprintStat(file);
    let extracted;
    try {
      extracted = extractByPath(file, { contentHash: fp.content_hash });
    } catch (err) {
      diagnostics.push({
        path: file,
        code: 'EXTRACT_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    diagnostics.push(...extracted.diagnostics);
    workingNodes.push(...extracted.nodes);
    workingTriples.push(...extracted.triples);
    newManifestSources[file] = {
      content_hash: fp.content_hash,
      mtime_ms: fp.mtime_ms,
      bytes: fp.bytes,
      last_extracted_at: built_at,
      extractor: extractorForPath(file),
    };
  }

  // Also record fingerprint for skipped files if missing (first-time consistency)
  for (const file of discovered.files) {
    if (newManifestSources[file]) continue;
    const fp = fingerprintStat(file);
    newManifestSources[file] = {
      content_hash: fp.content_hash,
      mtime_ms: fp.mtime_ms,
      bytes: fp.bytes,
      last_extracted_at:
        priorManifest?.sources?.[file]?.last_extracted_at ?? built_at,
      extractor:
        priorManifest?.sources?.[file]?.extractor ?? extractorForPath(file),
    };
  }

  let normalized = normalize({
    ontology,
    nodes: workingNodes,
    triples: workingTriples,
    now: built_at,
  });
  diagnostics.push(...normalized.diagnostics);

  if (opts._afterNormalize) {
    const injected = opts._afterNormalize({
      nodes: normalized.nodes,
      triples: normalized.triples,
    });
    normalized = {
      ...normalized,
      nodes: injected.nodes,
      triples: injected.triples,
    };
  }

  assertGraphCaps(normalized.nodes, normalized.triples);

  const graphV1: GraphV1Document = {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version,
    ontology_pack_id: ontology.pack.id,
    ontology_version: ontology.pack.version,
    built_at,
    nodes: normalized.nodes,
    triples: normalized.triples,
    stats: {
      node_count: normalized.nodes.length,
      triple_count: normalized.triples.length,
    },
  };

  const existingQueue = loadReviewQueue(storeRoot);
  const queueDoc = mergeReviewItems(existingQueue, normalized.reviewItems);
  // Ensure empty queue still has schema shape even with zero items
  const reviewQueue =
    queueDoc.items.length === 0 && queueDoc.decisions.length === 0
      ? emptyReviewQueue()
      : queueDoc;

  const manifest: SourcesManifest = {
    schema_version: 1,
    sources: newManifestSources,
  };

  const ontologyLock = buildOntologyLock(ontology);

  publishGraphFiles({
    storeRoot,
    graphV1,
    writeProjection: opts.writeProjection ?? DEFAULT_WRITE_PROJECTION,
    sidecars: {
      [MANIFEST_BASENAME]: manifest,
      [QUEUE_BASENAME]: reviewQueue,
      [ONTOLOGY_LOCK_BASENAME]: ontologyLock,
    },
  });

  const review_pending = reviewQueue.items.filter(
    (i) => i.status === 'pending',
  ).length;

  return {
    store_dir: storeRoot,
    node_count: normalized.nodes.length,
    triple_count: normalized.triples.length,
    review_pending,
    sources_total: discovered.files.length,
    sources_extracted,
    sources_skipped_fresh,
    diagnostics,
    engine: 'gsd-graph',
    engine_version,
    built_at,
  };
}
