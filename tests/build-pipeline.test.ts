// gsd-graph — offline build orchestrator integration tests (D-09, EXT-03)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'corpus');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  build: (opts: {
    corpus: string | string[];
    dir?: string;
    ontology?: string;
    full?: boolean;
    writeProjection?: boolean;
    _afterNormalize?: (state: {
      nodes: unknown[];
      triples: unknown[];
    }) => { nodes: unknown[]; triples: unknown[] };
  }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
    review_pending: number;
    sources_total: number;
    sources_extracted: number;
    sources_skipped_fresh: number;
    diagnostics: unknown[];
    engine: string;
    engine_version: string;
    built_at: string;
  };
  loadGraphV1: (storeRoot: string) => {
    schema_version: number;
    engine: string;
    engine_version: string;
    nodes: unknown[];
    triples: Array<{ s: string; p: string; o: string; provenance: unknown[] }>;
    stats?: { node_count?: number; triple_count?: number };
  };
  acquireBuildLock: (
    storeRoot: string,
    owner: 'cli' | 'lib' | 'mcp' | 'test',
  ) => { release(): void; lockPath: string };
  assertGraphCaps: (nodes: unknown[], triples: unknown[]) => void;
  MAX_NODES: number;
  MAX_TRIPLES: number;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
  GSD_GRAPH_REASON: Record<string, string>;
  ensureStoreRoot: (storeRoot: string) => string;
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}

function copyFixture(name: string, destDir: string): string {
  fs.mkdirSync(destDir, { recursive: true });
  const src = path.join(fixtures, name);
  const dest = path.join(destDir, name);
  fs.copyFileSync(src, dest);
  return dest;
}

describe('build() orchestrator (D-09, EXT-03)', () => {
  it('builds structured-edges.md → graph.v1 loadable via loadGraphV1; releases lock', () => {
    const corpus = tempDir('gsd-build-corpus-');
    const store = tempDir('gsd-build-store-');
    copyFixture('structured-edges.md', corpus);

    const result = mod.build({ corpus, dir: store });

    assert.equal(result.engine, 'gsd-graph');
    assert.equal(typeof result.engine_version, 'string');
    assert.ok(result.engine_version.length > 0);
    assert.ok(result.node_count > 0);
    assert.ok(result.triple_count > 0);
    assert.equal(result.sources_total, 1);
    assert.equal(result.sources_extracted, 1);
    assert.equal(result.sources_skipped_fresh, 0);
    assert.match(result.built_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(result.store_dir, mod.ensureStoreRoot(store));

    const graph = mod.loadGraphV1(store);
    assert.equal(graph.schema_version, 1);
    assert.equal(graph.engine, 'gsd-graph');
    assert.equal(graph.nodes.length, result.node_count);
    assert.equal(graph.triples.length, result.triple_count);
    assert.ok(
      graph.triples.some((t) => t.p === 'related_to'),
      'expected related_to from structured edges',
    );

    // Lock released — second acquire succeeds
    const lock = mod.acquireBuildLock(store, 'test');
    try {
      assert.ok(lock.lockPath);
    } finally {
      lock.release();
    }

    // Projection not required (DEFAULT_WRITE_PROJECTION false)
    assert.equal(fs.existsSync(path.join(store, 'graph.json')), false);
    assert.equal(fs.existsSync(path.join(store, 'graph.v1.json')), true);
    // DIFF-01 prep: last-diff-base written under lock after successful build
    const lastDiff = path.join(store, 'snapshots', '.last-diff-base.json');
    assert.equal(fs.existsSync(lastDiff), true);
    const base = JSON.parse(fs.readFileSync(lastDiff, 'utf8')) as {
      schema_version: number;
      nodes: unknown[];
      triples: unknown[];
    };
    assert.equal(base.schema_version, 1);
    assert.equal(base.nodes.length, result.node_count);
    assert.equal(base.triples.length, result.triple_count);
  });

  it('writes sources.manifest.json, review-queue.json, ontology.lock.json sidecars', () => {
    const corpus = tempDir('gsd-build-side-c-');
    const store = tempDir('gsd-build-side-s-');
    copyFixture('structured-edges.md', corpus);

    const result = mod.build({ corpus, dir: store });

    const manifestPath = path.join(store, 'sources.manifest.json');
    const queuePath = path.join(store, 'review-queue.json');
    const lockPath = path.join(store, 'ontology.lock.json');

    assert.equal(fs.existsSync(manifestPath), true);
    assert.equal(fs.existsSync(queuePath), true);
    assert.equal(fs.existsSync(lockPath), true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      schema_version: number;
      sources: Record<
        string,
        {
          content_hash: string;
          mtime_ms: number;
          bytes: number;
          last_extracted_at: string;
          extractor: string;
        }
      >;
    };
    assert.equal(manifest.schema_version, 1);
    const entries = Object.values(manifest.sources);
    assert.ok(entries.length >= 1);
    const e = entries[0]!;
    assert.match(e.content_hash, /^sha256:[0-9a-f]+$/);
    assert.equal(typeof e.mtime_ms, 'number');
    assert.equal(typeof e.bytes, 'number');
    assert.equal(typeof e.last_extracted_at, 'string');
    assert.equal(e.extractor, 'markdown');

    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) as {
      schema_version: number;
      items: unknown[];
      decisions: unknown[];
    };
    assert.equal(queue.schema_version, 1);
    assert.ok(Array.isArray(queue.items));
    // depends_on is unknown → at least one pending review from structured fixture
    assert.ok(result.review_pending >= 1);

    const olock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as {
      pack_id: string;
      version: string;
      packHash: string;
      node_types: string[];
      predicates: string[];
    };
    assert.equal(olock.pack_id, 'general');
    assert.equal(typeof olock.version, 'string');
    assert.equal(typeof olock.packHash, 'string');
    assert.ok(olock.node_types.includes('Concept'));
    assert.ok(olock.predicates.includes('related_to'));
  });

  it('incremental full:false skips unchanged fingerprints (sources_skipped_fresh ≥ 1)', () => {
    const corpus = tempDir('gsd-build-inc-c-');
    const store = tempDir('gsd-build-inc-s-');
    copyFixture('structured-edges.md', corpus);

    const first = mod.build({ corpus, dir: store, full: true });
    assert.equal(first.sources_extracted, 1);
    assert.equal(first.sources_skipped_fresh, 0);

    const second = mod.build({ corpus, dir: store, full: false });
    assert.ok(
      second.sources_skipped_fresh >= 1,
      `expected skip, got ${second.sources_skipped_fresh}`,
    );
    assert.equal(second.sources_extracted, 0);
    assert.equal(second.node_count, first.node_count);
    assert.equal(second.triple_count, first.triple_count);

    const graph = mod.loadGraphV1(store);
    assert.equal(graph.nodes.length, second.node_count);
    assert.equal(graph.engine, 'gsd-graph');
  });

  it('full:true forces re-extract even when fingerprints match', () => {
    const corpus = tempDir('gsd-build-full-c-');
    const store = tempDir('gsd-build-full-s-');
    copyFixture('structured-edges.md', corpus);

    mod.build({ corpus, dir: store });
    const again = mod.build({ corpus, dir: store, full: true });
    assert.equal(again.sources_extracted, 1);
    assert.equal(again.sources_skipped_fresh, 0);
  });

  it('JSONL multi-hop fixture alone builds EXTRACTED causes chain into graph.v1', () => {
    const corpus = tempDir('gsd-build-jsonl-c-');
    const store = tempDir('gsd-build-jsonl-s-');
    copyFixture('multi-hop.jsonl', corpus);

    const result = mod.build({ corpus, dir: store });
    assert.ok(result.node_count >= 3);
    assert.ok(result.triple_count >= 2);

    const graph = mod.loadGraphV1(store);
    const causes = graph.triples.filter((t) => t.p === 'causes');
    assert.ok(causes.length >= 2, 'expected causes chain from multi-hop.jsonl');
  });

  it('combined MD + JSONL corpus merges via normalize multiset', () => {
    const corpus = tempDir('gsd-build-mix-c-');
    const store = tempDir('gsd-build-mix-s-');
    copyFixture('structured-edges.md', corpus);
    copyFixture('multi-hop.jsonl', corpus);

    const result = mod.build({ corpus, dir: store });
    assert.equal(result.sources_total, 2);
    assert.equal(result.sources_extracted, 2);

    const graph = mod.loadGraphV1(store);
    assert.ok(graph.triples.some((t) => t.p === 'related_to'));
    assert.ok(graph.triples.some((t) => t.p === 'causes'));
  });

  it('missing corpus root → CORPUS_NOT_FOUND', () => {
    const store = tempDir('gsd-build-missing-s-');
    const missing = path.join(os.tmpdir(), `gsd-no-corpus-${Date.now()}`);
    assert.throws(
      () => mod.build({ corpus: missing, dir: store }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as Error & { reason: string }).reason,
          mod.GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
        );
        return true;
      },
    );
  });

  it('nodes/triples over caps → LIMIT_EXCEEDED before publish', () => {
    const corpus = tempDir('gsd-build-cap-c-');
    const store = tempDir('gsd-build-cap-s-');
    copyFixture('structured-edges.md', corpus);

    assert.throws(
      () =>
        mod.build({
          corpus,
          dir: store,
          _afterNormalize: () => {
            const nodes = Array.from({ length: mod.MAX_NODES + 1 }, (_, i) => ({
              id: `Concept:n-${i}`,
              type: 'Concept',
              label: `N${i}`,
            }));
            return { nodes, triples: [] };
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as Error & { reason: string }).reason,
          mod.GSD_GRAPH_REASON.LIMIT_EXCEEDED,
        );
        return true;
      },
    );

    // Caps helper unit path
    assert.throws(
      () =>
        mod.assertGraphCaps(
          Array.from({ length: 1 }, () => ({
            id: 'x',
            type: 'Concept',
            label: 'x',
          })),
          Array.from({ length: mod.MAX_TRIPLES + 1 }, (_, i) => ({
            id: `t_${i.toString(16).padStart(16, '0')}`,
            s: 'a',
            p: 'related_to',
            o: 'b',
            confidence: 'EXTRACTED',
            provenance: [],
          })),
        ),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as Error & { reason: string }).reason,
          mod.GSD_GRAPH_REASON.LIMIT_EXCEEDED,
        );
        return true;
      },
    );
  });

  it('prior pending review decisions are not re-opened as pending', () => {
    const corpus = tempDir('gsd-build-rev-c-');
    const store = tempDir('gsd-build-rev-s-');
    copyFixture('structured-edges.md', corpus);

    const first = mod.build({ corpus, dir: store });
    assert.ok(first.review_pending >= 1);

    // Mark all pending as rejected via direct queue edit + rebuild merge
    const queuePath = path.join(store, 'review-queue.json');
    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) as {
      schema_version: number;
      items: Array<{
        id: string;
        status: string;
        decision: null | { action: string; at: string };
      }>;
      decisions: Array<{ id: string; action: string; at: string }>;
    };
    const now = new Date().toISOString();
    for (const item of queue.items) {
      if (item.status === 'pending') {
        item.status = 'rejected';
        item.decision = { action: 'reject', at: now };
        queue.decisions.push({ id: item.id, action: 'reject', at: now });
      }
    }
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n');

    const second = mod.build({ corpus, dir: store, full: true });
    const queue2 = JSON.parse(fs.readFileSync(queuePath, 'utf8')) as {
      items: Array<{ id: string; status: string }>;
      decisions: Array<{ id: string }>;
    };
    // Previously decided ids must not be pending again
    for (const d of queue.decisions) {
      const item = queue2.items.find((i) => i.id === d.id);
      if (item) {
        assert.notEqual(item.status, 'pending');
      }
    }
    assert.ok(queue2.decisions.length >= queue.decisions.length);
    // review_pending may be 0 if all known items decided
    assert.ok(second.review_pending >= 0);
  });

  it('free-prose corpus builds graph without inventing typed causes chain', () => {
    const corpus = tempDir('gsd-build-prose-c-');
    const store = tempDir('gsd-build-prose-s-');
    copyFixture('free-prose.md', corpus);

    const result = mod.build({ corpus, dir: store });
    const graph = mod.loadGraphV1(store);
    const causes = graph.triples.filter((t) => t.p === 'causes');
    assert.equal(
      causes.length,
      0,
      'free prose must not invent causes triples offline',
    );
    assert.ok(result.node_count >= 0);
  });
});
