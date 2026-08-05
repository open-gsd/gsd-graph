// gsd-graph — centrality (top/pagerank) + why --k alternatives tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  topNodes: (opts?: {
    graph?: object;
    k?: number;
    metric?: string;
  }) => {
    metric: string;
    nodes: Array<{ id: string; degree: number; pagerank: number }>;
    iterations: number;
  };
  pagerank: (graph: object) => {
    scores: Map<string, number>;
    iterations: number;
  };
  why: (opts: {
    from: string;
    to: string;
    graph: object;
    k?: number;
  }) => {
    found: boolean;
    path: { nodes: string[] } | null;
    alternatives?: Array<{ nodes: string[]; predicates: string[] }>;
    explanation_markdown: string;
  };
};

function graphOf(
  nodes: string[],
  edges: Array<[string, string, string]>,
): object {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.0.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-01-01T00:00:00.000Z',
    nodes: nodes.map((id) => ({
      id: `Concept:${id}`,
      type: 'Concept',
      label: id,
    })),
    triples: edges.map(([s, p, o], i) => ({
      id: `t_${i.toString(16).padStart(16, '0')}`,
      s: `Concept:${s}`,
      p,
      o: `Concept:${o}`,
      confidence: 'EXTRACTED',
      provenance: [
        {
          source_path: 'x.md',
          extractor: 'markdown',
          content_hash: 'h',
          confidence: 'EXTRACTED',
        },
      ],
    })),
  };
}

describe('topNodes', () => {
  it('hub node wins on degree and pagerank', () => {
    const graph = graphOf(
      ['hub', 'a', 'b', 'c', 'd'],
      [
        ['a', 'related_to', 'hub'],
        ['b', 'related_to', 'hub'],
        ['c', 'related_to', 'hub'],
        ['d', 'related_to', 'hub'],
      ],
    );
    const byDegree = mod.topNodes({ graph, metric: 'degree', k: 3 });
    assert.equal(byDegree.nodes[0]?.id, 'Concept:hub');
    assert.equal(byDegree.nodes[0]?.degree, 4);

    const byPr = mod.topNodes({ graph, metric: 'pagerank', k: 3 });
    assert.equal(byPr.nodes[0]?.id, 'Concept:hub');
    assert.ok(byPr.iterations > 0);
    assert.ok(byPr.nodes[0]!.pagerank > byPr.nodes[1]!.pagerank);
  });

  it('pagerank scores sum to ~1', () => {
    const graph = graphOf(
      ['a', 'b', 'c'],
      [
        ['a', 'causes', 'b'],
        ['b', 'causes', 'c'],
      ],
    );
    const { scores } = mod.pagerank(graph);
    const sum = [...scores.values()].reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, `sum=${sum}`);
  });
});

describe('why --k alternatives', () => {
  it('returns a distinct alternative route and renders it', () => {
    // Two routes a→d: direct edge and via b→c
    const graph = graphOf(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'causes', 'd'],
        ['a', 'supports', 'b'],
        ['b', 'supports', 'c'],
        ['c', 'supports', 'd'],
      ],
    );
    const res = mod.why({ from: 'a', to: 'd', graph, k: 3 });
    assert.equal(res.found, true);
    assert.equal(res.path?.nodes.length, 2, 'shortest is the direct edge');
    assert.ok(res.alternatives && res.alternatives.length >= 1);
    assert.equal(res.alternatives![0]?.nodes.length, 4, 'detour via b,c');
    assert.match(res.explanation_markdown, /Alternative routes/);
  });

  it('k omitted keeps prior shape (no alternatives field)', () => {
    const graph = graphOf(['a', 'b'], [['a', 'causes', 'b']]);
    const res = mod.why({ from: 'a', to: 'b', graph });
    assert.equal(res.found, true);
    assert.equal(res.alternatives, undefined);
  });
});
