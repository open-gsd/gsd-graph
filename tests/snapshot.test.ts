// gsd-graph — snapshot save/list/restore tests (SNAP-01, D-07, D-10)

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
  snapshotSave: (opts: {
    dir?: string;
    name: string;
  }) => { name: string; fileName: string; path: string };
  snapshotList: (opts?: { dir?: string }) => Array<{
    name: string;
    fileName: string;
    path: string;
    mtime_ms?: number;
    built_at?: string;
  }>;
  snapshotRestore: (opts: {
    dir?: string;
    name: string;
  }) => { name: string; fileName: string; path: string };
  loadGraphV1: (storeRoot: string) => {
    schema_version: number;
    nodes: Array<{ id: string }>;
    triples: Array<{ id: string; s: string; p: string; o: string }>;
    built_at?: string;
  };
  publishGraphFiles: (plan: {
    storeRoot: string;
    graphV1: object;
    writeProjection: boolean;
    projection?: object | null;
  }) => void;
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

function tripleIds(store: string): string[] {
  const g = mod.loadGraphV1(store);
  return g.triples.map((t) => t.id).sort();
}

function nodeIds(store: string): string[] {
  const g = mod.loadGraphV1(store);
  return g.nodes.map((n) => n.id).sort();
}

describe('snapshot save/list/restore round-trip (SNAP-01, D-07, D-10)', () => {
  it('snapshotSave creates snapshots/<iso>-name.json with full graph.v1; list includes it; restore recovers triple ids', () => {
    const corpus = tempDir('gsd-snap-corpus-');
    const store = tempDir('gsd-snap-store-');
    copyFixture('structured-edges.md', corpus);

    mod.build({ corpus, dir: store, full: true });
    const beforeTriples = tripleIds(store);
    const beforeNodes = nodeIds(store);
    assert.ok(beforeTriples.length > 0, 'build must produce triples');

    const saved = mod.snapshotSave({ dir: store, name: 'pre-edit' });
    assert.equal(saved.name, 'pre-edit');
    assert.ok(saved.fileName.endsWith('-pre-edit.json'));
    assert.ok(saved.fileName.endsWith('.json'));
    assert.match(saved.fileName, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(fs.existsSync(saved.path));
    assert.ok(
      saved.path.includes(`${path.sep}snapshots${path.sep}`),
      'snapshot must live under store/snapshots/',
    );

    // Full graph.v1 document on disk
    const snapRaw = JSON.parse(fs.readFileSync(saved.path, 'utf8')) as {
      schema_version: number;
      engine: string;
      nodes: unknown[];
      triples: Array<{ id: string }>;
    };
    assert.equal(snapRaw.schema_version, 1);
    assert.equal(snapRaw.engine, 'gsd-graph');
    assert.deepEqual(
      snapRaw.triples.map((t) => t.id).sort(),
      beforeTriples,
    );

    // list includes saved snapshot; excludes .last-diff-base.json; newest first
    const listed = mod.snapshotList({ dir: store });
    assert.ok(listed.length >= 1);
    assert.ok(
      listed.every((s) => s.fileName !== '.last-diff-base.json'),
      'list must exclude .last-diff-base.json',
    );
    assert.ok(
      listed.some(
        (s) => s.name === 'pre-edit' || s.fileName === saved.fileName,
      ),
      'list must include saved snapshot',
    );
    // mtime descending
    for (let i = 1; i < listed.length; i++) {
      const prev = listed[i - 1]!.mtime_ms ?? 0;
      const cur = listed[i]!.mtime_ms ?? 0;
      assert.ok(prev >= cur, 'list ordered newest first');
    }

    // Mutate store graph via second build with different corpus content
    fs.writeFileSync(
      path.join(corpus, 'structured-edges.md'),
      '# Mutated\n\n[[Omega]] --related_to--> [[Zeta]]\n',
      'utf8',
    );
    mod.build({ corpus, dir: store, full: true });
    const afterMutate = tripleIds(store);
    assert.notDeepEqual(
      afterMutate,
      beforeTriples,
      'mutation must change triple set',
    );

    // Restore by logical name
    const restored = mod.snapshotRestore({ dir: store, name: 'pre-edit' });
    assert.equal(restored.name, 'pre-edit');
    assert.ok(fs.existsSync(restored.path));

    assert.deepEqual(tripleIds(store), beforeTriples);
    assert.deepEqual(nodeIds(store), beforeNodes);

    // Lock released after restore — second acquire succeeds
    const lock = mod.acquireBuildLock(store, 'test');
    try {
      assert.ok(fs.existsSync(lock.lockPath));
    } finally {
      lock.release();
    }
  });

  it('snapshotSave holds lock during write and releases it (second acquire succeeds)', () => {
    const corpus = tempDir('gsd-snap-lock-c-');
    const store = tempDir('gsd-snap-lock-s-');
    copyFixture('multi-hop.jsonl', corpus);
    mod.build({ corpus, dir: store, full: true });

    mod.snapshotSave({ dir: store, name: 'baseline' });

    const lock = mod.acquireBuildLock(store, 'test');
    try {
      assert.ok(true, 'lock available after snapshotSave');
    } finally {
      lock.release();
    }
  });
});

describe('snapshot name confinement + restore validation (SNAP-01, D-07, STORE-05)', () => {
  it('snapshotSave rejects traversal-like names with PATH_ESCAPE', () => {
    const corpus = tempDir('gsd-snap-esc-c-');
    const store = tempDir('gsd-snap-esc-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store, full: true });

    const badNames = ['..', '../x', 'a/b', 'a\\b', ''];
    for (const name of badNames) {
      assert.throws(
        () => mod.snapshotSave({ dir: store, name }),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError, `expected GraphError for ${JSON.stringify(name)}`);
          assert.equal(
            (err as { reason: string }).reason,
            mod.GSD_GRAPH_REASON.PATH_ESCAPE,
            `PATH_ESCAPE for ${JSON.stringify(name)}`,
          );
          return true;
        },
      );
    }
  });

  it('snapshotRestore of missing name throws SCHEMA_INVALID (not silent success)', () => {
    const corpus = tempDir('gsd-snap-miss-c-');
    const store = tempDir('gsd-snap-miss-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store, full: true });

    assert.throws(
      () => mod.snapshotRestore({ dir: store, name: 'does-not-exist' }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        assert.match((err as Error).message, /not found/i);
        return true;
      },
    );

    // Lock released after failed restore
    const lock = mod.acquireBuildLock(store, 'test');
    lock.release();
  });

  it('corrupt snapshot failing Ajv does not publish; prior graph.v1 intact', () => {
    const corpus = tempDir('gsd-snap-corr-c-');
    const store = tempDir('gsd-snap-corr-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store, full: true });

    const before = tripleIds(store);
    const beforeRaw = fs.readFileSync(
      path.join(store, 'graph.v1.json'),
      'utf8',
    );

    // Plant a corrupt snapshot file that looks like a named snapshot
    const snapDir = path.join(store, 'snapshots');
    fs.mkdirSync(snapDir, { recursive: true });
    const corruptName = '2026-01-01T00-00-00.000Z-corrupt-snap.json';
    fs.writeFileSync(
      path.join(snapDir, corruptName),
      JSON.stringify({ schema_version: 1, not: 'a-valid-graph' }),
      'utf8',
    );

    assert.throws(
      () => mod.snapshotRestore({ dir: store, name: 'corrupt-snap' }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        return true;
      },
    );

    assert.deepEqual(tripleIds(store), before);
    assert.equal(
      fs.readFileSync(path.join(store, 'graph.v1.json'), 'utf8'),
      beforeRaw,
      'prior graph.v1 must remain byte-identical after failed restore',
    );

    // Lock released after failed restore
    const lock = mod.acquireBuildLock(store, 'test');
    lock.release();
  });

  it('snapshotRestore rejects PATH_ESCAPE names and releases lock', () => {
    const corpus = tempDir('gsd-snap-rest-esc-c-');
    const store = tempDir('gsd-snap-rest-esc-s-');
    copyFixture('structured-edges.md', corpus);
    mod.build({ corpus, dir: store, full: true });

    assert.throws(
      () => mod.snapshotRestore({ dir: store, name: '../x' }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PATH_ESCAPE,
        );
        return true;
      },
    );

    const lock = mod.acquireBuildLock(store, 'test');
    lock.release();
  });
});
