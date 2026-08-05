// gsd-graph — store migration registry + first-run STORE_NOT_FOUND tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  CURRENT_GRAPH_SCHEMA_VERSION: number;
  migrateGraphDocument: (raw: unknown) => { doc: unknown; applied: number[] };
  registerGraphMigration: (
    from: number,
    fn: (doc: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
  listGraphMigrations: () => number[];
  loadGraphV1: (storeRoot: string) => { schema_version: number };
  ensureStoreRoot: (storeRoot: string) => string;
  build: (opts: { corpus: string; dir?: string }) => { store_dir: string };
  GraphError: new (reason: string, message: string) => Error & {
    reason: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('migrateGraphDocument (store migration registry)', () => {
  it('passes current-version documents through untouched', () => {
    const doc = { schema_version: mod.CURRENT_GRAPH_SCHEMA_VERSION, nodes: [] };
    const out = mod.migrateGraphDocument(doc);
    assert.equal(out.doc, doc);
    assert.deepEqual(out.applied, []);
  });

  it('fails closed on documents from a newer engine', () => {
    assert.throws(
      () =>
        mod.migrateGraphDocument({
          schema_version: mod.CURRENT_GRAPH_SCHEMA_VERSION + 1,
        }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        assert.match((err as Error).message, /newer/);
        return true;
      },
    );
  });

  it('throws when an older version has no registered migration', () => {
    assert.throws(
      () => mod.migrateGraphDocument({ schema_version: 0 }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.match((err as Error).message, /no migration registered/);
        return true;
      },
    );
  });

  it('applies a registered step chain in order', () => {
    mod.registerGraphMigration(0, (doc) => ({
      ...doc,
      schema_version: 1,
      upgraded: true,
    }));
    try {
      const out = mod.migrateGraphDocument({ schema_version: 0 });
      assert.deepEqual(out.applied, [0]);
      assert.equal(
        (out.doc as { schema_version: number }).schema_version,
        mod.CURRENT_GRAPH_SCHEMA_VERSION,
      );
      assert.equal((out.doc as { upgraded?: boolean }).upgraded, true);
      assert.ok(mod.listGraphMigrations().includes(0));
    } finally {
      // Leave a passthrough that still bumps correctly for other tests in this
      // process — registry is module-global.
      mod.registerGraphMigration(0, (doc) => ({ ...doc, schema_version: 1 }));
    }
  });
});

describe('first-run store errors (STORE_NOT_FOUND)', () => {
  it('loadGraphV1 on a missing store dir gives actionable STORE_NOT_FOUND, not path_escape', () => {
    const cwd = tempDir('gsd-migrations-firstrun-');
    const missingStore = path.join(cwd, '.gsd-graph');
    try {
      assert.throws(
        () => mod.loadGraphV1(missingStore),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.equal(
            (err as { reason: string }).reason,
            mod.GSD_GRAPH_REASON.STORE_NOT_FOUND,
          );
          assert.match((err as Error).message, /gsd-graph enable/);
          return true;
        },
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('built_at_commit provenance', () => {
  it('build stamps built_at_commit inside a git repo (null otherwise)', () => {
    const cwd = tempDir('gsd-migrations-commit-');
    const corpus = path.join(cwd, 'docs');
    fs.mkdirSync(corpus, { recursive: true });
    fs.writeFileSync(
      path.join(corpus, 'a.md'),
      '# Doc\n\n[[Alpha]] --depends_on--> [[Beta]]\n',
      'utf8',
    );
    const store = path.join(cwd, '.gsd-graph');
    try {
      mod.build({ corpus, dir: store });
      const raw = JSON.parse(
        fs.readFileSync(path.join(store, 'graph.v1.json'), 'utf8'),
      ) as { built_at_commit?: string | null };
      // This test process runs somewhere unknown relative to a git repo;
      // assert only the shape contract: present, and either null or a hex sha.
      assert.ok('built_at_commit' in raw);
      const v = raw.built_at_commit;
      assert.ok(v === null || /^[0-9a-fA-F]{4,40}$/.test(v ?? ''));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
