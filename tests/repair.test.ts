// gsd-graph — repair projection from graph.v1 only (REP-01, D-09, D-10)

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
    writeProjection?: boolean;
  }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
  };
  repair: (opts?: { dir?: string; writeProjection?: boolean }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
    projection_written: true;
    reason: string;
  };
  loadGraphV1: (storeRoot: string) => {
    schema_version: number;
    nodes: Array<{ id: string }>;
    triples: Array<{ id: string }>;
    stats?: { node_count?: number; triple_count?: number };
  };
  projectGraph: (v1: object) => {
    nodes: Array<{ id: string }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
  acquireBuildLock: (
    storeRoot: string,
    owner: 'cli' | 'lib' | 'mcp' | 'test',
  ) => { release(): void; lockPath: string };
  ensureStoreRoot: (storeRoot: string) => string;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string; details?: unknown };
  GSD_GRAPH_REASON: Record<string, string>;
  // Phase 3 façade completeness
  query: unknown;
  applyBudget: unknown;
  maintain: unknown;
  invalidateProvenance: unknown;
  snapshotSave: unknown;
  snapshotList: unknown;
  snapshotRestore: unknown;
  diff: unknown;
  confidenceRank: unknown;
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

describe('repair projection from v1 only (REP-01, D-09, D-10)', () => {
  it('repair creates graph.json when missing; edges.length === triple_count and edge ids ⊆ v1 triple ids', () => {
    const corpus = tempDir('gsd-rep-c-');
    const store = tempDir('gsd-rep-s-');
    copyFixture('structured-edges.md', corpus);

    const result = mod.build({
      corpus,
      dir: store,
      full: true,
      writeProjection: false,
    });
    assert.ok(result.triple_count >= 1);
    assert.equal(
      fs.existsSync(path.join(store, 'graph.json')),
      false,
      'default build must not write projection',
    );

    const repaired = mod.repair({ dir: store });
    assert.equal(repaired.projection_written, true);
    assert.equal(repaired.reason, mod.GSD_GRAPH_REASON.OK);
    assert.equal(repaired.triple_count, result.triple_count);
    assert.equal(repaired.node_count, result.node_count);
    assert.ok(
      repaired.store_dir.includes(store) ||
        fs.realpathSync.native(repaired.store_dir) ===
          fs.realpathSync.native(store),
    );

    const projPath = path.join(store, 'graph.json');
    assert.equal(fs.existsSync(projPath), true, 'repair must write graph.json');

    const proj = JSON.parse(fs.readFileSync(projPath, 'utf8')) as {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    };
    const v1 = mod.loadGraphV1(store);
    const tripleIds = new Set(v1.triples.map((t) => t.id));

    assert.equal(proj.edges.length, v1.triples.length);
    assert.equal(proj.edges.length, v1.stats?.triple_count ?? v1.triples.length);
    for (const e of proj.edges) {
      assert.ok(
        tripleIds.has(e.id),
        `edge id ${e.id} must be a v1 triple id (no invented edges)`,
      );
    }
    assert.equal(proj.nodes.length, v1.nodes.length);
  });

  it('repair does not invent triples; deleting graph.json and repairing restores projection only from v1', () => {
    const corpus = tempDir('gsd-rep2-c-');
    const store = tempDir('gsd-rep2-s-');
    copyFixture('multi-hop.jsonl', corpus);

    mod.build({ corpus, dir: store, full: true, writeProjection: true });
    const v1Before = mod.loadGraphV1(store);
    const tripleIdsBefore = v1Before.triples.map((t) => t.id).sort();

    // Corrupt projection with invented edge
    fs.writeFileSync(
      path.join(store, 'graph.json'),
      JSON.stringify({
        nodes: v1Before.nodes,
        edges: [
          {
            source: 'fake:s',
            target: 'fake:o',
            relation: 'related_to',
            label: 'related_to',
            confidence: 'EXTRACTED',
            id: 't_inventeddeadbeef01',
          },
        ],
      }),
      'utf8',
    );

    // Delete then repair — must restore from v1 only
    fs.unlinkSync(path.join(store, 'graph.json'));
    mod.repair({ dir: store });

    const v1After = mod.loadGraphV1(store);
    assert.deepEqual(
      v1After.triples.map((t) => t.id).sort(),
      tripleIdsBefore,
      'repair must not change graph.v1 triples',
    );

    const proj = JSON.parse(
      fs.readFileSync(path.join(store, 'graph.json'), 'utf8'),
    ) as { edges: Array<{ id: string }> };
    const edgeIds = proj.edges.map((e) => e.id).sort();
    assert.deepEqual(edgeIds, tripleIdsBefore);
    assert.ok(!edgeIds.includes('t_inventeddeadbeef01'));
  });

  it('missing graph.v1 throws SCHEMA_INVALID; never invents graph from projection', () => {
    const store = tempDir('gsd-rep-nov1-s-');
    mod.ensureStoreRoot(store);
    // Only a fake projection — no graph.v1
    fs.writeFileSync(
      path.join(store, 'graph.json'),
      JSON.stringify({
        nodes: [{ id: 'Concept:x', type: 'Concept', label: 'X' }],
        edges: [
          {
            source: 'Concept:x',
            target: 'Concept:y',
            relation: 'related_to',
            label: 'related_to',
            confidence: 'EXTRACTED',
            id: 't_fromprojection0001',
          },
        ],
      }),
      'utf8',
    );

    assert.throws(
      () => mod.repair({ dir: store }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        return true;
      },
    );

    // Still no graph.v1 invented
    assert.equal(fs.existsSync(path.join(store, 'graph.v1.json')), false);
  });

  it('repair holds build lock during publish and releases after (D-10)', () => {
    const corpus = tempDir('gsd-rep-lock-c-');
    const store = tempDir('gsd-rep-lock-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store, full: true });

    mod.repair({ dir: store });

    // Lock released — second acquire succeeds
    const lock = mod.acquireBuildLock(store, 'test');
    try {
      assert.ok(fs.existsSync(lock.lockPath));
    } finally {
      lock.release();
    }

    // While holding lock, repair must fail with BUILD_LOCKED
    const held = mod.acquireBuildLock(store, 'test');
    try {
      assert.throws(
        () => mod.repair({ dir: store }),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.equal(
            (err as { reason: string }).reason,
            mod.GSD_GRAPH_REASON.BUILD_LOCKED,
          );
          return true;
        },
      );
    } finally {
      held.release();
    }
  });
});

describe('Phase 3 library façade completeness (03-04)', () => {
  it('exports query, maintain, invalidateProvenance, projectGraph, snapshot*, diff, repair, confidenceRank', () => {
    const required = [
      'query',
      'applyBudget',
      'maintain',
      'invalidateProvenance',
      'projectGraph',
      'snapshotSave',
      'snapshotList',
      'snapshotRestore',
      'diff',
      'repair',
      'confidenceRank',
    ] as const;
    for (const name of required) {
      assert.equal(
        typeof (mod as Record<string, unknown>)[name],
        'function',
        `public export ${name} must be a function`,
      );
    }
  });
});
