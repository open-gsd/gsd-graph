// gsd-graph — diff vs last-diff-base / named snapshot tests (DIFF-01, D-08)

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
  diff: (opts?: { dir?: string; snapshot?: string }) => {
    baseline: string;
    nodes: { added: string[]; removed: string[]; changed: string[] };
    triples: { added: string[]; removed: string[]; changed: string[] };
    counts: {
      nodes_added: number;
      nodes_removed: number;
      triples_added: number;
      triples_removed: number;
    };
  };
  snapshotSave: (opts: {
    dir?: string;
    name: string;
  }) => { name: string; fileName: string; path: string };
  loadGraphV1: (storeRoot: string) => {
    schema_version: number;
    engine: string;
    engine_version: string;
    ontology_pack_id: string;
    ontology_version: string;
    built_at: string;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      description?: string;
      aliases?: string[];
    }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
      provenance: unknown[];
    }>;
    stats?: { node_count?: number; triple_count?: number };
  };
  publishGraphFiles: (plan: {
    storeRoot: string;
    graphV1: object;
    writeProjection: boolean;
    projection?: object | null;
  }) => void;
  projectGraph: (v1: object) => { nodes: unknown[]; edges: unknown[] };
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

/**
 * Mutate published graph.v1 without rewriting last-diff-base (controlled publish).
 * Returns the mutated document.
 */
function mutateGraphV1(
  store: string,
  mutator: (g: ReturnType<typeof mod.loadGraphV1>) => void,
): ReturnType<typeof mod.loadGraphV1> {
  const g = mod.loadGraphV1(store);
  // deep-clone so we can mutate freely
  const clone = JSON.parse(JSON.stringify(g)) as ReturnType<typeof mod.loadGraphV1>;
  mutator(clone);
  // bump built_at so document-level timestamps differ (must not affect payload compare alone)
  clone.built_at = new Date().toISOString();
  mod.publishGraphFiles({
    storeRoot: store,
    graphV1: clone,
    writeProjection: false,
  });
  return clone;
}

describe('diff vs last-diff-base and named snapshot (DIFF-01, D-08, D-04)', () => {
  it('diff({ dir }) after build A + controlled mutate reports triples removed/added by id vs last-diff-base', () => {
    const corpus = tempDir('gsd-diff-base-c-');
    const store = tempDir('gsd-diff-base-s-');
    copyFixture('structured-edges.md', corpus);

    const result = mod.build({ corpus, dir: store, full: true });
    assert.ok(result.triple_count >= 1, 'build must produce triples');
    assert.equal(
      fs.existsSync(path.join(store, 'snapshots', '.last-diff-base.json')),
      true,
      'build must write last-diff-base',
    );

    const before = mod.loadGraphV1(store);
    const removedTriple = before.triples[0]!;
    assert.ok(removedTriple?.id, 'need at least one triple id');

    // Drop first triple; add a synthetic triple with a new id so both ± appear
    const syntheticId = 't_deadbeefcafef00d';
    mutateGraphV1(store, (g) => {
      g.triples = g.triples.filter((t) => t.id !== removedTriple.id);
      g.triples.push({
        id: syntheticId,
        s: 'Concept:synthetic-s',
        p: 'related_to',
        o: 'Concept:synthetic-o',
        confidence: 'INFERRED',
        provenance: [
          {
            source_path: '/corpus/synthetic.md',
            extractor: 'test',
            content_hash: 'sha256:00',
            confidence: 'INFERRED',
          },
        ],
      });
      // ensure nodes exist for schema (optional — Ajv may not require referential integrity)
      if (!g.nodes.some((n) => n.id === 'Concept:synthetic-s')) {
        g.nodes.push({
          id: 'Concept:synthetic-s',
          type: 'Concept',
          label: 'Synthetic S',
        });
      }
      if (!g.nodes.some((n) => n.id === 'Concept:synthetic-o')) {
        g.nodes.push({
          id: 'Concept:synthetic-o',
          type: 'Concept',
          label: 'Synthetic O',
        });
      }
      g.stats = {
        node_count: g.nodes.length,
        triple_count: g.triples.length,
      };
    });

    const d = mod.diff({ dir: store });
    assert.match(
      d.baseline,
      /\.last-diff-base\.json$/,
      'default baseline is last-diff-base',
    );
    assert.ok(
      d.triples.removed.includes(removedTriple.id),
      `removed must include ${removedTriple.id}, got ${JSON.stringify(d.triples.removed)}`,
    );
    assert.ok(
      d.triples.added.includes(syntheticId),
      `added must include ${syntheticId}, got ${JSON.stringify(d.triples.added)}`,
    );
    assert.equal(d.counts.triples_removed, d.triples.removed.length);
    assert.equal(d.counts.triples_added, d.triples.added.length);
    assert.ok(d.counts.triples_removed >= 1);
    assert.ok(d.counts.triples_added >= 1);
    // nodes may also show synthetic adds
    assert.equal(d.counts.nodes_added, d.nodes.added.length);
    assert.equal(d.counts.nodes_removed, d.nodes.removed.length);
  });

  it('diff({ dir, snapshot }) uses named snapshot baseline (resolution: snapshot arg → last-diff-base)', () => {
    const corpus = tempDir('gsd-diff-snap-c-');
    const store = tempDir('gsd-diff-snap-s-');
    copyFixture('structured-edges.md', corpus);

    mod.build({ corpus, dir: store, full: true });
    const beforeTriples = mod.loadGraphV1(store).triples.map((t) => t.id).sort();
    const saved = mod.snapshotSave({ dir: store, name: 'pre-edit' });
    assert.equal(saved.name, 'pre-edit');

    // Mutate corpus + rebuild so current differs from named snapshot (and last-diff-base updates)
    fs.writeFileSync(
      path.join(corpus, 'structured-edges.md'),
      '# Mutated\n\n[[Omega]] --related_to--> [[Zeta]]\n',
      'utf8',
    );
    mod.build({ corpus, dir: store, full: true });
    const afterTriples = mod.loadGraphV1(store).triples.map((t) => t.id).sort();
    assert.notDeepEqual(afterTriples, beforeTriples, 'mutation must change triple set');

    const d = mod.diff({ dir: store, snapshot: 'pre-edit' });
    assert.ok(
      d.baseline.includes('pre-edit') || d.baseline === saved.fileName || d.baseline === saved.path,
      `baseline should reference named snapshot, got ${d.baseline}`,
    );

    // Every id only in before should be removed; only in after should be added
    const beforeSet = new Set(beforeTriples);
    const afterSet = new Set(afterTriples);
    for (const id of beforeTriples) {
      if (!afterSet.has(id)) {
        assert.ok(
          d.triples.removed.includes(id),
          `expected removed ${id}`,
        );
      }
    }
    for (const id of afterTriples) {
      if (!beforeSet.has(id)) {
        assert.ok(
          d.triples.added.includes(id),
          `expected added ${id}`,
        );
      }
    }
    assert.equal(d.counts.triples_added, d.triples.added.length);
    assert.equal(d.counts.triples_removed, d.triples.removed.length);
  });

  it('diff without baseline on empty store throws NO_BASELINE', () => {
    const store = tempDir('gsd-diff-empty-s-');
    // empty dir — no snapshots/, no graph.v1
    assert.throws(
      () => mod.diff({ dir: store }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError, 'expected GraphError');
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.NO_BASELINE,
        );
        return true;
      },
    );
  });

  it('diff detects node/triple changed when same id but comparable payload differs', () => {
    const corpus = tempDir('gsd-diff-chg-c-');
    const store = tempDir('gsd-diff-chg-s-');
    copyFixture('structured-edges.md', corpus);

    mod.build({ corpus, dir: store, full: true });
    const before = mod.loadGraphV1(store);
    const node = before.nodes[0]!;
    const triple = before.triples[0]!;
    assert.ok(node && triple);

    mutateGraphV1(store, (g) => {
      const n = g.nodes.find((x) => x.id === node.id);
      if (n) {
        n.label = `${n.label} (renamed)`;
      }
      const t = g.triples.find((x) => x.id === triple.id);
      if (t) {
        t.confidence = t.confidence === 'EXTRACTED' ? 'INFERRED' : 'EXTRACTED';
      }
    });

    const d = mod.diff({ dir: store });
    assert.ok(
      d.nodes.changed.includes(node.id),
      `node ${node.id} should be changed, got ${JSON.stringify(d.nodes.changed)}`,
    );
    assert.ok(
      d.triples.changed.includes(triple.id),
      `triple ${triple.id} should be changed, got ${JSON.stringify(d.triples.changed)}`,
    );
    // built_at alone must not force every id into changed
    // (we only changed one node + one triple)
    assert.ok(d.nodes.changed.length >= 1);
    assert.ok(d.triples.changed.length >= 1);
  });

  it('diff reads only graph.v1 for current (projection is not SoT)', () => {
    const corpus = tempDir('gsd-diff-sot-c-');
    const store = tempDir('gsd-diff-sot-s-');
    copyFixture('structured-edges.md', corpus);

    mod.build({ corpus, dir: store, full: true, writeProjection: true });
    const v1 = mod.loadGraphV1(store);
    // Poison projection with invented edges — diff must ignore it
    fs.writeFileSync(
      path.join(store, 'graph.json'),
      JSON.stringify({
        nodes: v1.nodes,
        edges: [
          {
            source: 'fake:s',
            target: 'fake:o',
            relation: 'related_to',
            label: 'related_to',
            confidence: 'EXTRACTED',
            id: 't_invented00000001',
          },
        ],
      }),
      'utf8',
    );

    // Current === last-diff-base → empty ± (projection poison must not appear)
    const d = mod.diff({ dir: store });
    assert.equal(d.triples.added.length, 0);
    assert.equal(d.triples.removed.length, 0);
    assert.ok(!d.triples.added.includes('t_invented00000001'));
  });
});
