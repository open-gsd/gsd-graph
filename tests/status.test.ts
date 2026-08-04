// gsd-graph — status() STAT-01 field gates (D-10)

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
    full?: boolean;
  }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
    review_pending: number;
    engine: string;
    built_at: string;
  };
  status: (opts?: { dir?: string; corpus?: string | string[] }) => {
    exists: boolean;
    store_dir: string;
    engine: string;
    schema_version?: number;
    ontology_pack_id?: string;
    engine_version?: string;
    node_count?: number;
    triple_count?: number;
    edge_count?: number;
    last_build?: string;
    stale?: boolean;
    age_hours?: number;
    build_in_progress?: boolean;
    review_queue_count?: number;
    projection_stale?: boolean;
    last_build_status?: {
      status?: string;
      reason?: string;
      finished_at?: string;
    } | null;
    reason?: string | null;
  };
  loadGraphV1: (storeRoot: string) => {
    nodes: unknown[];
    triples: unknown[];
    built_at: string;
  };
  acquireBuildLock: (
    storeRoot: string,
    owner: 'cli' | 'lib' | 'mcp' | 'test',
  ) => { release(): void; lockPath: string };
  // Public Phase 2 surface smoke
  discoverSources: (corpus: string | string[]) => { files: string[] };
  fingerprintFile: (absPath: string) => string;
  extractMarkdown: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => unknown;
  extractJsonl: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => unknown;
  extractByPath: (absPath: string) => unknown;
  normalize: (input: unknown) => unknown;
  reviewResolve: (opts: unknown) => void;
  bestTier: (entries: unknown[]) => string;
  validateReviewQueue: (data: unknown) => boolean;
  slugifyLabel: (label: string) => string;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
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

function copyFixture(name: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(fixtures, name), path.join(destDir, name));
}

describe('status() STAT-01', () => {
  it('empty store: exists false; no throw', () => {
    const store = tempDir('gsd-status-empty-');
    const s = mod.status({ dir: store });
    assert.equal(s.exists, false);
    assert.equal(s.engine, 'gsd-graph');
    assert.equal(typeof s.store_dir, 'string');
  });

  it('after build: counts match graph; engine gsd-graph; last_build set', () => {
    const corpus = tempDir('gsd-status-c-');
    const store = tempDir('gsd-status-s-');
    copyFixture('structured-edges.md', corpus);

    const built = mod.build({ corpus, dir: store });
    const s = mod.status({ dir: store });

    assert.equal(s.exists, true);
    assert.equal(s.engine, 'gsd-graph');
    assert.equal(s.node_count, built.node_count);
    assert.equal(s.triple_count, built.triple_count);
    assert.equal(s.edge_count, s.triple_count);
    assert.equal(s.ontology_pack_id, 'general');
    assert.equal(typeof s.engine_version, 'string');
    assert.ok(s.last_build, 'last_build should be set');
    assert.equal(typeof s.age_hours, 'number');
    assert.equal(s.build_in_progress, false);

    // Never requires graph.json
    assert.equal(fs.existsSync(path.join(store, 'graph.json')), false);
    assert.equal(s.projection_stale, true);

    const graph = mod.loadGraphV1(store);
    assert.equal(graph.nodes.length, s.node_count);
    assert.equal(graph.triples.length, s.triple_count);

    assert.ok(s.last_build_status);
    assert.equal(s.last_build_status?.status, 'ok');
    assert.equal(typeof s.last_build_status?.finished_at, 'string');
  });

  it('review_queue_count reflects pending items when unknown predicates queued', () => {
    const corpus = tempDir('gsd-status-rq-c-');
    const store = tempDir('gsd-status-rq-s-');
    copyFixture('structured-edges.md', corpus);

    const built = mod.build({ corpus, dir: store });
    const s = mod.status({ dir: store });
    assert.equal(s.review_queue_count, built.review_pending);
    assert.ok(
      (s.review_queue_count ?? 0) >= 1,
      'structured-edges has depends_on → review',
    );
  });

  it('build_in_progress true when .build.lock held', () => {
    const corpus = tempDir('gsd-status-lock-c-');
    const store = tempDir('gsd-status-lock-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store });

    const lock = mod.acquireBuildLock(store, 'test');
    try {
      const s = mod.status({ dir: store });
      assert.equal(s.build_in_progress, true);
      assert.equal(s.exists, true);
    } finally {
      lock.release();
    }

    const after = mod.status({ dir: store });
    assert.equal(after.build_in_progress, false);
  });

  it('stale true when a manifest source path is missing on disk', () => {
    const corpus = tempDir('gsd-status-stale-c-');
    const store = tempDir('gsd-status-stale-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store });

    // Delete corpus file referenced by manifest
    const file = path.join(corpus, 'structured-edges.md');
    fs.unlinkSync(file);

    const s = mod.status({ dir: store });
    assert.equal(s.exists, true);
    assert.equal(s.stale, true);
  });

  it('stale true when corpus option sees content_hash mismatch', () => {
    const corpus = tempDir('gsd-status-hash-c-');
    const store = tempDir('gsd-status-hash-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store });

    // Mutate source bytes
    const file = path.join(corpus, 'structured-edges.md');
    fs.appendFileSync(file, '\n\n// mutated for stale check\n');

    const s = mod.status({ dir: store, corpus });
    assert.equal(s.stale, true);
  });

  it('public Phase 2 façade exports are present', () => {
    assert.equal(typeof mod.discoverSources, 'function');
    assert.equal(typeof mod.fingerprintFile, 'function');
    assert.equal(typeof mod.extractMarkdown, 'function');
    assert.equal(typeof mod.extractJsonl, 'function');
    assert.equal(typeof mod.extractByPath, 'function');
    assert.equal(typeof mod.normalize, 'function');
    assert.equal(typeof mod.reviewResolve, 'function');
    assert.equal(typeof mod.build, 'function');
    assert.equal(typeof mod.status, 'function');
    assert.equal(typeof mod.bestTier, 'function');
    assert.equal(typeof mod.slugifyLabel, 'function');
    assert.equal(typeof mod.nodeId, 'function');
    assert.equal(typeof mod.tripleId, 'function');
    assert.equal(typeof mod.validateReviewQueue, 'function');
  });
});
