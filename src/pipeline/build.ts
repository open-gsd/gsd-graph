// gsd-graph — offline build orchestrator under lock (D-09, EXT-03, STAT-01)

/**
 * Composes discover → extract → normalize → review merge → publish.
 *
 * Incremental strategy (MNT-01 / EXT-03):
 * - Load prior graph.v1 + sources.manifest when present.
 * - Fingerprint each discovered file; when !full and hash matches manifest,
 *   skip re-extract (sources_skipped_fresh++).
 * - pathsToDrop = changed ∪ removed (manifest keys absent from discover).
 * - Always invalidateProvenance on prior triples when !full && priorGraph,
 *   even if zero files re-extract (deleted-source gap fix, D-06).
 * - Union re-extracted candidates and always re-normalize so best_tier/merge
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
import {
  confineUnderRoot,
  ensureStoreRoot,
  resolveStoreRoot,
  storeFile,
} from '../io/paths';
import { readJsonFile, writeJsonAtomicTemp } from '../io/safe-json';
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
import { invalidateProvenance, normPathKey } from './maintain';
import { normalize } from './normalize';
import { projectGraph } from './project';
import { writeGraphReport } from './report';
import {
  emptyReviewQueue,
  loadReviewQueue,
  mergeReviewItems,
} from './review';

/** Auto baseline for DIFF-01 under store/snapshots (OQ-3). */
const LAST_DIFF_BASE_REL = path.join('snapshots', '.last-diff-base.json');

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

/**
 * Current git HEAD commit for build provenance (built_at_commit).
 * Null outside a git work tree or when git is unavailable — never fails a build.
 */
export function readGitHeadCommit(cwd?: string): string | null {
  try {
    const { execFileSync } = require('node:child_process') as
      typeof import('node:child_process');
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
      encoding: 'utf8',
    }).trim();
    return /^[0-9a-fA-F]{4,40}$/.test(out) ? out : null;
  } catch {
    return null;
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

function cloneNode(n: GraphNode): GraphNode {
  return {
    id: n.id,
    type: n.type,
    label: n.label,
    ...(n.description !== undefined ? { description: n.description } : {}),
    ...(n.aliases !== undefined ? { aliases: [...n.aliases] } : {}),
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
  const progress = opts.onProgress;

  progress?.(full ? 'Discovering corpus (full rebuild)…' : 'Discovering corpus…');

  const ontology = loadOntologyPack({
    packIdOrPath: opts.ontology ?? readConfigOntology(storeRoot) ?? 'general',
  });

  const discovered = discoverSources(
    opts.corpus,
    opts.globs !== undefined ? { globs: opts.globs } : {},
  );
  diagnostics.push(...discovered.diagnostics);
  progress?.(
    `Found ${discovered.files.length} source file${discovered.files.length === 1 ? '' : 's'}…`,
  );

  const priorManifest = loadPriorManifest(storeRoot);
  const priorGraph = loadPriorGraph(storeRoot);

  const toExtract: string[] = [];
  let sources_skipped_fresh = 0;
  const changedPaths = new Set<string>();
  const discoveredKeys = new Set<string>();

  for (const file of discovered.files) {
    const key = normPathKey(file);
    discoveredKeys.add(key);
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

  // Manifest keys present previously but absent from current discover (D-06).
  const removedPaths = new Set<string>();
  if (!full && priorManifest) {
    for (const srcKey of Object.keys(priorManifest.sources)) {
      const nk = normPathKey(srcKey);
      if (!discoveredKeys.has(nk)) {
        removedPaths.add(nk);
      }
    }
  }

  const pathsToDrop = new Set<string>([...changedPaths, ...removedPaths]);

  let workingNodes: GraphNode[] = [];
  let workingTriples: Triple[] = [];

  // Always invalidate when reusing prior graph — even if only removals and
  // zero re-extracts (deleted-source gap / RESEARCH Pitfall 1).
  if (!full && priorGraph) {
    workingNodes = priorGraph.nodes.map(cloneNode);
    workingTriples = invalidateProvenance(priorGraph.triples, pathsToDrop);
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

  if (sources_extracted === 0) {
    progress?.(
      `All ${discovered.files.length} source(s) fresh — skipping extract…`,
    );
  }

  for (let i = 0; i < toExtract.length; i++) {
    const file = toExtract[i]!;
    const base = path.basename(file);
    progress?.(
      `Extracting ${i + 1}/${toExtract.length}: ${base}`,
    );
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

  progress?.(
    `Normalizing ${workingNodes.length.toLocaleString('en-US')} nodes · ${workingTriples.length.toLocaleString('en-US')} triples…`,
  );
  let normalized = normalize({
    ontology,
    nodes: workingNodes,
    triples: workingTriples,
    now: built_at,
    ...(progress !== undefined ? { onProgress: progress } : {}),
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
    built_at_commit: readGitHeadCommit(),
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

  progress?.(
    `Publishing graph (${normalized.nodes.length} nodes, ${normalized.triples.length} triples)…`,
  );
  const writeProjection = opts.writeProjection ?? DEFAULT_WRITE_PROJECTION;
  const projection = writeProjection ? projectGraph(graphV1) : null;

  publishGraphFiles({
    storeRoot,
    graphV1,
    writeProjection,
    projection,
    sidecars: {
      [MANIFEST_BASENAME]: manifest,
      [QUEUE_BASENAME]: reviewQueue,
      [ONTOLOGY_LOCK_BASENAME]: ontologyLock,
    },
  });

  // DIFF-01 prep: full graph.v1 copy as last-diff-base while lock still held (D-10, OQ-3).
  writeLastDiffBase(storeRoot, graphV1);

  // Optional disposable report after successful publish (RPT-01, D-08).
  // Default false; report errors never fail the build (T-06-13).
  if (shouldWriteReportOnBuild(storeRoot, opts)) {
    try {
      writeGraphReport({ dir: storeRoot });
    } catch (err) {
      diagnostics.push({
        path: 'GRAPH_REPORT.md',
        code: 'REPORT_WRITE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
    diagnostics: capDiagnostics(diagnostics),
    engine: 'gsd-graph',
    engine_version,
    built_at,
  };
}

/** Keep CLI/enable JSON readable when corpora contain noisy non-field-map JSON. */
const MAX_BUILD_DIAGNOSTICS = 40;

function capDiagnostics(
  diagnostics: ExtractDiagnostic[],
): ExtractDiagnostic[] {
  if (diagnostics.length <= MAX_BUILD_DIAGNOSTICS) return diagnostics;
  const head = diagnostics.slice(0, MAX_BUILD_DIAGNOSTICS);
  const suppressed = diagnostics.length - MAX_BUILD_DIAGNOSTICS;
  head.push({
    path: '(build)',
    code: 'DIAGNOSTICS_TRUNCATED',
    message: `Suppressed ${suppressed} additional diagnostics (showing first ${MAX_BUILD_DIAGNOSTICS}). Common cause: large pretty-printed .json under docs/ is not field-map JSONL.`,
  });
  return head;
}

/**
 * Resolve report.write_on_build: explicit BuildOptions wins, else config, else false.
 */
function shouldWriteReportOnBuild(
  storeRoot: string,
  opts: BuildOptions,
): boolean {
  if (opts.writeReportOnBuild === true) return true;
  if (opts.writeReportOnBuild === false) return false;
  return readReportWriteOnBuild(storeRoot);
}

/**
 * Read config.json `ontology` so builds honor the init-time pack choice.
 * Explicit BuildOptions.ontology always wins; missing/invalid config → null.
 */
function readConfigOntology(storeRoot: string): string | null {
  const configPath = storeFile(storeRoot, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = readJsonFile(configPath) as { ontology?: unknown };
    if (typeof raw?.ontology === 'string' && raw.ontology.length > 0) {
      return raw.ontology;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Read config.json report.write_on_build (default false). */
function readReportWriteOnBuild(storeRoot: string): boolean {
  const configPath = storeFile(storeRoot, 'config.json');
  if (!fs.existsSync(configPath)) return false;
  try {
    const raw = readJsonFile(configPath) as {
      report?: { write_on_build?: unknown };
    };
    return raw?.report?.write_on_build === true;
  } catch {
    return false;
  }
}

export interface MergeCandidatesOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Candidate nodes to merge (e.g. LLM extract output). */
  nodes: GraphNode[];
  /** Candidate triples to merge; ontology policy gating still applies. */
  triples: Triple[];
  /** Ontology pack override; default config.json ontology, else general. */
  ontology?: string;
  /** Optional fixed clock for tests. */
  now?: string;
  onProgress?: (message: string) => void;
}

export interface MergeCandidatesResult {
  store_dir: string;
  node_count: number;
  triple_count: number;
  review_pending: number;
  candidate_nodes: number;
  candidate_triples: number;
}

/**
 * Merge candidate nodes/triples (e.g. validated LLM extract output) into the
 * published graph under the build lock. Everything still flows through
 * normalize: ontology policy gate, review queue, provenance union, caps.
 * Sources manifest is untouched — candidates are additive, not corpus state.
 */
export function mergeCandidates(
  opts: MergeCandidatesOptions,
): MergeCandidatesResult {
  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const lock = acquireBuildLock(storeRoot, 'lib');
  try {
    const built_at = opts.now ?? new Date().toISOString();
    const engine_version = readEngineVersion();
    const ontology = loadOntologyPack({
      packIdOrPath:
        opts.ontology ?? readConfigOntology(storeRoot) ?? 'general',
    });
    const prior = loadPriorGraph(storeRoot);

    const workingNodes = [
      ...(prior?.nodes.map(cloneNode) ?? []),
      ...opts.nodes,
    ];
    const workingTriples = [...(prior?.triples ?? []), ...opts.triples];

    opts.onProgress?.(
      `Merging ${opts.triples.length} candidate triple(s) into graph…`,
    );
    const normalized = normalize({
      ontology,
      nodes: workingNodes,
      triples: workingTriples,
      now: built_at,
    });

    assertGraphCaps(normalized.nodes, normalized.triples);

    const graphV1: GraphV1Document = {
      schema_version: 1,
      engine: 'gsd-graph',
      engine_version,
      ontology_pack_id: ontology.pack.id,
      ontology_version: ontology.pack.version,
      built_at,
      built_at_commit: readGitHeadCommit(),
      nodes: normalized.nodes,
      triples: normalized.triples,
      stats: {
        node_count: normalized.nodes.length,
        triple_count: normalized.triples.length,
      },
    };

    const existingQueue = loadReviewQueue(storeRoot);
    const reviewQueue = mergeReviewItems(existingQueue, normalized.reviewItems);

    publishGraphFiles({
      storeRoot,
      graphV1,
      writeProjection: false,
      projection: null,
      sidecars: {
        [QUEUE_BASENAME]: reviewQueue,
        [ONTOLOGY_LOCK_BASENAME]: buildOntologyLock(ontology),
      },
    });
    writeLastDiffBase(storeRoot, graphV1);

    return {
      store_dir: storeRoot,
      node_count: normalized.nodes.length,
      triple_count: normalized.triples.length,
      review_pending: reviewQueue.items.filter((i) => i.status === 'pending')
        .length,
      candidate_nodes: opts.nodes.length,
      candidate_triples: opts.triples.length,
    };
  } finally {
    lock.release();
  }
}

/**
 * Write snapshots/.last-diff-base.json as a full graph.v1 copy under confinement.
 * Called while build still holds .build.lock (D-10).
 */
function writeLastDiffBase(storeRoot: string, graphV1: GraphV1Document): void {
  const snapshotsDir = confineUnderRoot(storeRoot, 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });
  const finalPath = confineUnderRoot(storeRoot, LAST_DIFF_BASE_REL);
  const tmpPath = confineUnderRoot(
    storeRoot,
    path.join(
      'snapshots',
      `.last-diff-base.json.tmp-${process.pid}-${Date.now()}`,
    ),
  );
  writeJsonAtomicTemp(tmpPath, graphV1);
  fs.renameSync(tmpPath, finalPath);
}
