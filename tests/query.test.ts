// gsd-graph — Query IR tests (QRY-01, QRY-02, D-01..D-04)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'corpus');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  confidenceRank: (c: string) => number;
  bestTier: (
    entries: Array<{ confidence: string; source_path?: string; extractor?: string; content_hash?: string }>,
  ) => string;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
  query: (opts: Record<string, unknown>) => {
    nodes: Array<{ id: string; type: string; label: string; aliases?: string[] }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
    }>;
    paths: Array<{ nodes: string[]; predicates: string[] }>;
    seeds: string[];
    trimmed: string | null;
    budget_tokens: number | null;
  };
  buildAdjacencyMap: (graph: unknown) => Map<string, unknown[]>;
  seedAndExpand: (
    graph: unknown,
    term: string,
    hops?: number,
  ) => {
    seeds: string[];
    nodes: unknown[];
    triples: unknown[];
  };
  applyBudget: (
    nodes: unknown[],
    triples: Array<{ id: string; confidence: string; s: string; o: string; p: string }>,
    budgetTokens: number | null | undefined,
    seedIds: Set<string>,
  ) => {
    nodes: unknown[];
    triples: Array<{ id: string; confidence: string }>;
    trimmed: string | null;
  };
  build: (opts: {
    corpus: string | string[];
    dir?: string;
    ontology?: string;
    full?: boolean;
    writeProjection?: boolean;
  }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
  };
  loadGraphV1: (storeRoot: string) => {
    nodes: unknown[];
    triples: unknown[];
  };
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string; message: string };
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function provenance(conf: string) {
  return [
    {
      source_path: 'fixture://multi-hop',
      extractor: 'test',
      content_hash: 'sha256:test',
      confidence: conf,
    },
  ];
}

function multiHopGraph() {
  const drought = mod.nodeId('Concept', 'Drought');
  const crop = mod.nodeId('Concept', 'Crop Failure');
  const food = mod.nodeId('Concept', 'Food Shortage');
  const t1 = mod.tripleId(drought, 'causes', crop);
  const t2 = mod.tripleId(crop, 'causes', food);

  const nodes = [
    {
      id: drought,
      type: 'Concept',
      label: 'Drought',
      aliases: ['dry spell'],
    },
    { id: crop, type: 'Concept', label: 'Crop Failure' },
    { id: food, type: 'Concept', label: 'Food Shortage' },
  ];

  const triples = [
    {
      id: t1,
      s: drought,
      p: 'causes',
      o: crop,
      confidence: 'EXTRACTED',
      provenance: provenance('EXTRACTED'),
    },
    {
      id: t2,
      s: crop,
      p: 'causes',
      o: food,
      confidence: 'EXTRACTED',
      provenance: provenance('EXTRACTED'),
    },
  ];

  return {
    schema_version: 1 as const,
    engine: 'gsd-graph' as const,
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1.0.0',
    built_at: '2026-08-03T00:00:00.000Z',
    nodes,
    triples,
    ids: { drought, crop, food, t1, t2 },
  };
}

describe('confidenceRank', () => {
  it('matches bestTier rank order EXTRACTED > INFERRED > AMBIGUOUS', () => {
    assert.equal(mod.confidenceRank('EXTRACTED'), 2);
    assert.equal(mod.confidenceRank('INFERRED'), 1);
    assert.equal(mod.confidenceRank('AMBIGUOUS'), 0);
    assert.ok(mod.confidenceRank('EXTRACTED') > mod.confidenceRank('INFERRED'));
    assert.ok(mod.confidenceRank('INFERRED') > mod.confidenceRank('AMBIGUOUS'));

    // bestTier uses the same table
    assert.equal(
      mod.bestTier([{ confidence: 'AMBIGUOUS' }, { confidence: 'EXTRACTED' }]),
      'EXTRACTED',
    );
    assert.equal(
      mod.bestTier([{ confidence: 'INFERRED' }, { confidence: 'AMBIGUOUS' }]),
      'INFERRED',
    );
  });
});

describe('query path', () => {
  it('returns multi-hop Drought → Crop Failure → Food Shortage with causes', () => {
    const g = multiHopGraph();
    const result = mod.query({
      graph: g,
      path: { from: g.ids.drought, to: g.ids.food, maxDepth: 6 },
    });

    assert.ok(result.paths.length >= 1, 'expected at least one path');
    const p0 = result.paths[0]!;
    assert.ok(p0.nodes.length >= 3, `expected ≥3 nodes, got ${p0.nodes.length}`);
    assert.deepEqual(p0.nodes, [g.ids.drought, g.ids.crop, g.ids.food]);
    assert.ok(
      p0.predicates.includes('causes'),
      `predicates should include causes: ${JSON.stringify(p0.predicates)}`,
    );
    assert.equal(p0.predicates.length, 2);
    assert.equal(result.triples.length, 2);
    assert.ok(result.nodes.length >= 3);
    assert.equal(result.trimmed, null);
    assert.equal(result.budget_tokens, null);
  });

  it('buildAdjacencyMap indexes undirected neighbors', () => {
    const g = multiHopGraph();
    const adj = mod.buildAdjacencyMap(g);
    assert.ok(adj.has(g.ids.drought));
    assert.ok(adj.has(g.ids.crop));
    assert.ok(adj.has(g.ids.food));
    const droughtEdges = adj.get(g.ids.drought) as Array<{ neighbor: string }>;
    assert.ok(droughtEdges.some((e) => e.neighbor === g.ids.crop));
    // reverse direction present on crop → drought
    const cropEdges = adj.get(g.ids.crop) as Array<{ neighbor: string }>;
    assert.ok(cropEdges.some((e) => e.neighbor === g.ids.drought));
  });

  it('throws GraphError when no op fields provided', () => {
    const g = multiHopGraph();
    assert.throws(
      () => mod.query({ graph: g }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.match((err as Error).message, /term|path|id|filter/i);
        return true;
      },
    );
  });

  it('uses opts.graph without requiring a store (D-04)', () => {
    const g = multiHopGraph();
    // No dir — must not attempt to load graph.v1 from disk
    const result = mod.query({
      graph: g,
      path: { from: g.ids.drought, to: g.ids.crop },
    });
    assert.equal(result.paths[0]?.nodes.length, 2);
  });
});

describe('query seed_expand', () => {
  it('seeds on id/label/alias substring and expands undirected hops', () => {
    const g = multiHopGraph();
    const result = mod.query({ graph: g, term: 'drought', hops: 2 });

    assert.ok(result.seeds.length > 0, 'expected non-empty seeds');
    assert.ok(
      result.seeds.includes(g.ids.drought),
      `seeds should include drought id: ${JSON.stringify(result.seeds)}`,
    );
    // hops=2 from Drought reaches Crop Failure and Food Shortage
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    assert.ok(nodeIds.has(g.ids.drought));
    assert.ok(nodeIds.has(g.ids.crop));
    assert.ok(nodeIds.has(g.ids.food));
    assert.ok(result.triples.length >= 2, 'expected causes chain triples');
    assert.ok(result.triples.every((t) => t.p === 'causes'));
  });

  it('matches alias case-folded substring', () => {
    const g = multiHopGraph();
    const result = mod.query({ graph: g, term: 'DRY SPELL', hops: 0 });
    assert.ok(result.seeds.includes(g.ids.drought));
  });

  it('seedAndExpand helper returns seeds + expanded subgraph', () => {
    const g = multiHopGraph();
    const expanded = mod.seedAndExpand(g, 'crop', 1);
    assert.ok(expanded.seeds.includes(g.ids.crop));
    assert.ok(expanded.triples.length >= 1);
  });

  it('defaults seed_expand hops to 2', () => {
    const g = multiHopGraph();
    const result = mod.query({ graph: g, term: 'drought' });
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    assert.ok(nodeIds.has(g.ids.food), 'default hops=2 should reach food shortage');
  });
});

describe('query neighborhood', () => {
  it('returns only nodes/triples within 1 hop of id', () => {
    const g = multiHopGraph();
    const result = mod.query({ graph: g, id: g.ids.drought, hops: 1 });

    assert.deepEqual(result.seeds, [g.ids.drought]);
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    assert.ok(nodeIds.has(g.ids.drought));
    assert.ok(nodeIds.has(g.ids.crop));
    assert.ok(
      !nodeIds.has(g.ids.food),
      'food shortage is 2 hops from drought — must not appear at hops=1',
    );
    assert.equal(result.triples.length, 1);
    assert.equal(result.triples[0]?.p, 'causes');
  });

  it('defaults neighborhood hops to 1', () => {
    const g = multiHopGraph();
    const result = mod.query({ graph: g, id: g.ids.crop });
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    // 1 hop from crop: drought + food
    assert.ok(nodeIds.has(g.ids.drought));
    assert.ok(nodeIds.has(g.ids.food));
    assert.equal(result.triples.length, 2);
  });
});

describe('query filter', () => {
  it('filters by predicates and confidenceMin using shared ranks', () => {
    const g = multiHopGraph();
    // Add an AMBIGUOUS related_to noise triple
    const noiseId = mod.tripleId(g.ids.drought, 'related_to', g.ids.food);
    g.triples.push({
      id: noiseId,
      s: g.ids.drought,
      p: 'related_to',
      o: g.ids.food,
      confidence: 'AMBIGUOUS',
      provenance: provenance('AMBIGUOUS'),
    });

    const result = mod.query({
      graph: g,
      predicates: ['causes'],
      confidenceMin: 'EXTRACTED',
    });

    assert.ok(result.triples.length >= 2);
    assert.ok(result.triples.every((t) => t.p === 'causes'));
    assert.ok(result.triples.every((t) => t.confidence === 'EXTRACTED'));
    assert.ok(!result.triples.some((t) => t.id === noiseId));

    // confidenceMin INFERRED excludes only AMBIGUOUS
    const mid = mod.query({
      graph: g,
      confidenceMin: 'INFERRED',
    });
    assert.ok(mid.triples.every((t) => mod.confidenceRank(t.confidence) >= 1));
    assert.ok(!mid.triples.some((t) => t.confidence === 'AMBIGUOUS'));
  });

  it('types filter keeps Concept nodes and triples with both endpoints kept', () => {
    const g = multiHopGraph();
    // Inject a non-Concept node + triple
    const actorId = mod.nodeId('Actor', 'Farmer');
    g.nodes.push({ id: actorId, type: 'Actor', label: 'Farmer' });
    g.triples.push({
      id: mod.tripleId(actorId, 'related_to', g.ids.drought),
      s: actorId,
      p: 'related_to',
      o: g.ids.drought,
      confidence: 'INFERRED',
      provenance: provenance('INFERRED'),
    });

    const result = mod.query({ graph: g, types: ['Concept'] });
    assert.ok(result.nodes.every((n) => n.type === 'Concept'));
    assert.ok(
      result.triples.every(
        (t) =>
          result.nodes.some((n) => n.id === t.s) &&
          result.nodes.some((n) => n.id === t.o),
      ),
    );
    assert.ok(!result.nodes.some((n) => n.id === actorId));
  });
});
