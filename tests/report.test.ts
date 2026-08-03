// gsd-graph — writeGraphReport from published graph.v1 only (RPT-01, D-08, D-10)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  writeGraphReport: (opts?: { dir?: string; topN?: number }) => {
    path: string;
    node_count: number;
    triple_count: number;
  };
  publishGraphFiles: (opts: {
    storeRoot: string;
    graphV1: unknown;
    writeProjection?: boolean;
  }) => void;
  ensureStoreRoot: (storeRoot: string) => string;
  validateGraphV1: (data: unknown) => boolean;
  loadGraphV1: (storeRoot: string) => {
    nodes: unknown[];
    triples: Array<{ p: string }>;
    engine: string;
    engine_version: string;
    ontology_pack_id: string;
    ontology_version: string;
    built_at: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const d = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  );
  temps.push(d);
  return d;
}

function provenance(): {
  source_path: string;
  extractor: string;
  content_hash: string;
  confidence: 'EXTRACTED';
} {
  return {
    source_path: 'corpus/article.md',
    extractor: 'markdown/heading',
    content_hash: 'sha256:deadbeef',
    confidence: 'EXTRACTED',
  };
}

function triple(
  id: string,
  s: string,
  p: string,
  o: string,
): Record<string, unknown> {
  return {
    id,
    s,
    p,
    o,
    confidence: 'EXTRACTED',
    provenance: [provenance()],
  };
}

/** Minimal valid graph.v1 with multiple predicates for top-N sorting. */
function minimalGraph(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-08-02T12:00:00.000Z',
    nodes: [
      { id: 'concept:a', type: 'Concept', label: 'A' },
      { id: 'concept:b', type: 'Concept', label: 'B' },
      { id: 'concept:c', type: 'Concept', label: 'C' },
      { id: 'document:d', type: 'Document', label: 'D' },
    ],
    triples: [
      // about: 3, related_to: 2, same_as: 1, supports: 1 (tie — id asc)
      // triple ids must match ^t_[0-9a-f]{16}$
      triple('t_aaaaaaaaaaaaaaaa', 'document:d', 'about', 'concept:a'),
      triple('t_bbbbbbbbbbbbbbbb', 'document:d', 'about', 'concept:b'),
      triple('t_cccccccccccccccc', 'document:d', 'about', 'concept:c'),
      triple('t_dddddddddddddddd', 'concept:a', 'related_to', 'concept:b'),
      triple('t_eeeeeeeeeeeeeeee', 'concept:b', 'related_to', 'concept:c'),
      triple('t_ffffffffffffffff', 'concept:a', 'same_as', 'concept:a'),
      triple('t_0123456789abcdef', 'concept:a', 'supports', 'concept:b'),
    ],
    stats: { node_count: 4, triple_count: 7 },
    ...overrides,
  };
}

function publishFixture(
  overrides: Record<string, unknown> = {},
): { store: string; graph: Record<string, unknown> } {
  const store = mod.ensureStoreRoot(tempDir('gsd-report-'));
  const graph = minimalGraph(overrides);
  assert.equal(
    mod.validateGraphV1(graph),
    true,
    'fixture graph.v1 must validate',
  );
  mod.publishGraphFiles({
    storeRoot: store,
    graphV1: graph,
    writeProjection: false,
  });
  return { store, graph };
}

describe('writeGraphReport (RPT-01, D-08, D-10)', () => {
  it('writes GRAPH_REPORT.md from published v1 with counts + top predicates', () => {
    const { store } = publishFixture();

    // Poison projection so counts must come from v1 only (D-08, D-10)
    fs.writeFileSync(
      path.join(store, 'graph.json'),
      JSON.stringify({ edges: [], node_count: 9999, triple_count: 9999 }),
      'utf8',
    );

    const result = mod.writeGraphReport({ dir: store, topN: 10 });

    assert.equal(result.node_count, 4);
    assert.equal(result.triple_count, 7);
    assert.equal(result.path, path.join(store, 'GRAPH_REPORT.md'));
    assert.ok(fs.existsSync(result.path));

    const md = fs.readFileSync(result.path, 'utf8');
    assert.match(md, /Non-authoritative/i);
    assert.match(md, /graph\.v1\.json/);
    assert.match(md, /engine:\s*gsd-graph\s+0\.1\.0/);
    assert.match(md, /ontology:\s*general@1/);
    assert.match(md, /built_at:\s*2026-08-02T12:00:00\.000Z/);
    assert.match(md, /nodes:\s*4/);
    assert.match(md, /triples:\s*7/);

    // Top predicates: about 3, related_to 2, same_as 1, supports 1 (id asc on ties)
    const predSection = md.split('## Top predicates')[1] ?? '';
    const lines = predSection
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '));
    assert.deepEqual(lines, [
      '- about: 3',
      '- related_to: 2',
      '- same_as: 1',
      '- supports: 1',
    ]);

    // loadGraphV1 still matches return counts (v1 is SoT)
    const v1 = mod.loadGraphV1(store);
    assert.equal(v1.nodes.length, result.node_count);
    assert.equal(v1.triples.length, result.triple_count);
  });

  it('honors topN and stable tie-break by predicate id asc', () => {
    const { store } = publishFixture();
    const result = mod.writeGraphReport({ dir: store, topN: 2 });
    const md = fs.readFileSync(result.path, 'utf8');
    const predSection = md.split('## Top predicates')[1] ?? '';
    const lines = predSection
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '));
    assert.deepEqual(lines, ['- about: 3', '- related_to: 2']);
  });

  it('throws SCHEMA_INVALID when graph.v1 is missing (never uses projection)', () => {
    const store = mod.ensureStoreRoot(tempDir('gsd-report-empty-'));
    fs.writeFileSync(
      path.join(store, 'graph.json'),
      JSON.stringify({ edges: [{ p: 'about' }] }),
      'utf8',
    );
    assert.throws(
      () => mod.writeGraphReport({ dir: store }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.SCHEMA_INVALID,
        );
        return true;
      },
    );
    assert.equal(fs.existsSync(path.join(store, 'GRAPH_REPORT.md')), false);
  });

  it('optionally includes pending review count without failing if queue missing', () => {
    const { store } = publishFixture();
    // No review-queue.json — still succeeds
    const result = mod.writeGraphReport({ dir: store });
    assert.ok(fs.existsSync(result.path));
    const md = fs.readFileSync(result.path, 'utf8');
    // loadReviewQueue returns empty queue when missing → review_pending: 0
    assert.match(md, /review_pending:\s*0/);

    // With a queue file, count pending only (ids match ^rv_[0-9a-f]{8}$)
    fs.writeFileSync(
      path.join(store, 'review-queue.json'),
      JSON.stringify({
        schema_version: 1,
        items: [
          {
            id: 'rv_aaaaaaaa',
            kind: 'predicate_unknown',
            status: 'pending',
            created_at: '2026-08-02T12:00:00.000Z',
            updated_at: null,
            payload: {},
            decision: null,
          },
          {
            id: 'rv_bbbbbbbb',
            kind: 'type_unknown',
            status: 'accepted',
            created_at: '2026-08-02T12:00:00.000Z',
            updated_at: '2026-08-02T13:00:00.000Z',
            payload: {},
            decision: {
              action: 'accept',
              at: '2026-08-02T13:00:00.000Z',
            },
          },
        ],
        decisions: [],
      }),
      'utf8',
    );
    const result2 = mod.writeGraphReport({ dir: store });
    const md2 = fs.readFileSync(result2.path, 'utf8');
    assert.match(md2, /review_pending:\s*1/);
  });
});
