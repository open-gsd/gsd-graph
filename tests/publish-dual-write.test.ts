// gsd-graph — dual-write publish + loadGraphV1 tests (STORE-02/03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  DEFAULT_WRITE_PROJECTION: boolean;
  publishGraphFiles: (plan: {
    storeRoot: string;
    graphV1: object;
    projection?: object | null;
    sidecars?: Record<string, object>;
    writeProjection: boolean;
    _afterV1Rename?: () => void;
    _renameSync?: (from: string, to: string) => void;
  }) => void;
  loadGraphV1: (storeRoot: string) => {
    schema_version: number;
    engine: string;
    nodes: unknown[];
  };
  ensureStoreRoot: (storeRoot: string) => string;
  GraphError: new (reason: string, message: string, details?: unknown) => Error & {
    reason: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
  validateGraphV1: (data: unknown) => boolean;
};

function minimalGraph(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-08-02T12:00:00.000Z',
    nodes: [
      {
        id: 'concept:graph-engineering',
        type: 'Concept',
        label: 'Graph Engineering',
      },
    ],
    triples: [
      {
        id: 't_0123456789abcdef',
        s: 'document:intro',
        p: 'about',
        o: 'concept:graph-engineering',
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'corpus/article.md',
            extractor: 'markdown/heading',
            content_hash: 'sha256:deadbeef',
            confidence: 'EXTRACTED',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeStore(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-graph-publish-'));
  return mod.ensureStoreRoot(dir);
}

const stores: string[] = [];

afterEach(() => {
  while (stores.length > 0) {
    const s = stores.pop();
    if (s) fs.rmSync(s, { recursive: true, force: true });
  }
});

function trackStore(): string {
  const s = makeStore();
  stores.push(s);
  return s;
}

describe('DEFAULT_WRITE_PROJECTION', () => {
  it('is false (product default)', () => {
    assert.equal(mod.DEFAULT_WRITE_PROJECTION, false);
  });
});

describe('publishGraphFiles + loadGraphV1 (STORE-02/03)', () => {
  it('writes graph.v1.json only when writeProjection is false', () => {
    const store = trackStore();
    const graph = minimalGraph();
    assert.equal(mod.validateGraphV1(graph), true);

    mod.publishGraphFiles({
      storeRoot: store,
      graphV1: graph,
      writeProjection: false,
    });

    assert.ok(fs.existsSync(path.join(store, 'graph.v1.json')));
    assert.equal(fs.existsSync(path.join(store, 'graph.json')), false);

    const loaded = mod.loadGraphV1(store);
    assert.equal(loaded.schema_version, 1);
    assert.equal(loaded.engine, 'gsd-graph');
    assert.equal(loaded.nodes.length, 1);

    const status = JSON.parse(
      fs.readFileSync(path.join(store, '.last-build-status.json'), 'utf8'),
    ) as { status: string; reason: string };
    assert.equal(status.status, 'ok');
    assert.equal(status.reason, 'ok');
  });

  it('writes both files when writeProjection is true', () => {
    const store = trackStore();
    const graph = minimalGraph();
    const projection = { nodes: [{ id: 'concept:graph-engineering' }], edges: [] };

    mod.publishGraphFiles({
      storeRoot: store,
      graphV1: graph,
      projection,
      writeProjection: true,
    });

    assert.ok(fs.existsSync(path.join(store, 'graph.v1.json')));
    assert.ok(fs.existsSync(path.join(store, 'graph.json')));

    const loaded = mod.loadGraphV1(store);
    assert.equal(loaded.engine, 'gsd-graph');

    const proj = JSON.parse(
      fs.readFileSync(path.join(store, 'graph.json'), 'utf8'),
    ) as { nodes: unknown[] };
    assert.equal(proj.nodes.length, 1);
  });

  it('loadGraphV1 fails SCHEMA_INVALID when only projection exists (D-04)', () => {
    const store = trackStore();
    fs.writeFileSync(
      path.join(store, 'graph.json'),
      JSON.stringify({ nodes: [], edges: [] }) + '\n',
      'utf8',
    );
    // deliberately no graph.v1.json

    assert.throws(
      () => mod.loadGraphV1(store),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as InstanceType<typeof mod.GraphError>).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        return true;
      },
    );
  });

  it('rejects invalid graphV1 with SCHEMA_INVALID', () => {
    const store = trackStore();
    assert.throws(
      () =>
        mod.publishGraphFiles({
          storeRoot: store,
          graphV1: { not: 'a graph' },
          writeProjection: false,
        }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as InstanceType<typeof mod.GraphError>).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        return true;
      },
    );
  });

  it('STORE-03: renames graph.v1.json before graph.json (rename spy)', () => {
    const store = trackStore();
    const order: string[] = [];
    const renameSync = (from: string, to: string): void => {
      order.push(path.basename(to));
      fs.renameSync(from, to);
    };

    mod.publishGraphFiles({
      storeRoot: store,
      graphV1: minimalGraph(),
      projection: { nodes: [], edges: [] },
      writeProjection: true,
      _renameSync: renameSync,
    });

    const v1Idx = order.indexOf('graph.v1.json');
    const projIdx = order.indexOf('graph.json');
    assert.ok(v1Idx >= 0, 'v1 rename recorded');
    assert.ok(projIdx >= 0, 'projection rename recorded');
    assert.ok(
      v1Idx < projIdx,
      `v1 must rename before projection; order=${JSON.stringify(order)}`,
    );
  });

  it('STORE-03: mid-protocol fault after v1 leaves v1 loadable, no final graph.json', () => {
    const store = trackStore();

    assert.throws(
      () =>
        mod.publishGraphFiles({
          storeRoot: store,
          graphV1: minimalGraph(),
          projection: { nodes: [], edges: [] },
          writeProjection: true,
          _afterV1Rename: () => {
            throw new Error('injected crash after v1 rename');
          },
        }),
      /injected crash after v1 rename/,
    );

    assert.ok(fs.existsSync(path.join(store, 'graph.v1.json')));
    // projection must not be final-named yet (or at all)
    assert.equal(fs.existsSync(path.join(store, 'graph.json')), false);

    const loaded = mod.loadGraphV1(store);
    assert.equal(loaded.schema_version, 1);
    assert.equal(loaded.engine, 'gsd-graph');
  });
});
