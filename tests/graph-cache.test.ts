// gsd-graph — mtime-keyed graph cache + GsdGraph.open() facade tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  build: (opts: { corpus: string; dir?: string }) => {
    store_dir: string;
    triple_count: number;
  };
  loadGraphV1Cached: (storeRoot: string) => {
    built_at: string;
    nodes: unknown[];
    triples: unknown[];
  };
  clearGraphV1Cache: () => void;
  GsdGraph: {
    open: (opts?: { dir?: string; cwd?: string }) => {
      storeRoot: string;
      load: () => { nodes: unknown[] };
      status: () => { exists: boolean; node_count?: number };
      query: (opts: { term: string }) => { seeds: string[] };
      pack: (q: string) => { seeds: string[] };
      ask: (q: string) => { abstained: boolean; answer_markdown: string };
      why: (a: string, b: string) => { found: boolean };
      communities: (opts?: { write?: boolean }) => {
        communities: unknown[];
      };
    };
  };
  GraphError: new (reason: string, message: string) => Error & {
    reason: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedStore(): { cwd: string; store: string } {
  const cwd = tempDir('gsd-cache-');
  const corpus = path.join(cwd, 'docs');
  fs.mkdirSync(corpus, { recursive: true });
  fs.writeFileSync(
    path.join(corpus, 'a.md'),
    '# Doc\n\n[[Alpha]] --causes--> [[Beta]]\n[[Beta]] --supports--> [[Gamma]]\n',
    'utf8',
  );
  const store = path.join(cwd, '.gsd-graph');
  mod.build({ corpus, dir: store });
  return { cwd, store };
}

describe('loadGraphV1Cached (mtime-keyed reuse)', () => {
  it('returns the same parsed document until the file is republished', () => {
    const { cwd, store } = seedStore();
    try {
      mod.clearGraphV1Cache();
      const a = mod.loadGraphV1Cached(store);
      const b = mod.loadGraphV1Cached(store);
      assert.equal(a, b, 'expected identical object from cache');

      // Rewrite the file (different mtime/ino via copy+rename like publish)
      const p = path.join(store, 'graph.v1.json');
      const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        built_at: string;
      };
      doc.built_at = new Date(Date.now() + 5000).toISOString();
      const tmp = `${p}.tmp-test`;
      fs.writeFileSync(tmp, JSON.stringify(doc), 'utf8');
      fs.renameSync(tmp, p);

      const c = mod.loadGraphV1Cached(store);
      assert.notEqual(a, c, 'expected fresh parse after republish');
      assert.equal(c.built_at, doc.built_at);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('missing store still raises STORE_NOT_FOUND through the cache', () => {
    const cwd = tempDir('gsd-cache-miss-');
    try {
      assert.throws(
        () => mod.loadGraphV1Cached(path.join(cwd, '.gsd-graph')),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.equal(
            (err as { reason: string }).reason,
            mod.GSD_GRAPH_REASON.STORE_NOT_FOUND,
          );
          return true;
        },
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('GsdGraph.open() facade', () => {
  it('opens a store and serves status/query/pack/ask/why from one handle', () => {
    const { cwd, store } = seedStore();
    try {
      const g = mod.GsdGraph.open({ dir: store });
      assert.equal(g.storeRoot, fs.realpathSync.native(store));

      const st = g.status();
      assert.equal(st.exists, true);
      assert.ok((st.node_count ?? 0) > 0);

      const q = g.query({ term: 'alpha' });
      assert.ok(q.seeds.length > 0);

      const pack = g.pack('why does alpha cause beta?');
      assert.ok(pack.seeds.length > 0);

      const ans = g.ask('why does alpha cause beta?');
      assert.equal(ans.abstained, false);
      assert.ok(ans.answer_markdown.includes('causes'));

      const w = g.why('Alpha', 'Gamma');
      assert.equal(w.found, true);

      const com = g.communities();
      assert.ok(Array.isArray(com.communities));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
