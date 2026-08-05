// gsd-graph — pack relevance ranking + citation confidence tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  packSubgraph: (opts: {
    question: string;
    graph: object;
    budget?: number;
    hops?: number;
  }) => {
    triples: Array<{ id: string; p: string }>;
    citations: Array<{
      triple_id: string;
      confidence?: string;
      source_count?: number;
    }>;
    trimmed: string | null;
  };
  answer: (opts: { question: string; graph: object }) => {
    answer_markdown: string;
  };
  why: (opts: { from: string; to: string; graph: object }) => {
    explanation_markdown: string;
    citations: Array<{ confidence?: string }>;
  };
  packRelevanceScore: (
    t: object,
    distances: Map<string, number>,
  ) => number;
};

interface TripleIn {
  s: string;
  p: string;
  o: string;
  confidence?: string;
  sources?: number;
}

function graphOf(
  nodes: Array<{ id: string; type: string; label: string; description?: string }>,
  triples: TripleIn[],
): object {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.0.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-01-01T00:00:00.000Z',
    nodes,
    triples: triples.map((t, i) => ({
      id: `t_${i.toString(16).padStart(16, '0')}`,
      s: t.s,
      p: t.p,
      o: t.o,
      confidence: t.confidence ?? 'EXTRACTED',
      provenance: Array.from({ length: t.sources ?? 1 }, (_, k) => ({
        source_path: `src-${k}.md`,
        extractor: 'markdown',
        content_hash: 'h',
        confidence: t.confidence ?? 'EXTRACTED',
        span: { start_line: k + 1, end_line: k + 1 },
      })),
    })),
  };
}

describe('packRelevanceScore', () => {
  it('confidence dominates; proximity, predicate, provenance break ties', () => {
    const distances = new Map<string, number>([
      ['a', 0],
      ['b', 1],
      ['far', 3],
    ]);
    const mk = (over: object): object => ({
      s: 'a',
      p: 'causes',
      o: 'b',
      confidence: 'EXTRACTED',
      provenance: [
        {
          source_path: 'x.md',
          extractor: 'm',
          content_hash: 'h',
          confidence: 'EXTRACTED',
        },
      ],
      ...over,
    });

    const extracted = mod.packRelevanceScore(mk({}), distances);
    const ambiguous = mod.packRelevanceScore(
      mk({ confidence: 'AMBIGUOUS' }),
      distances,
    );
    assert.ok(extracted > ambiguous + 50, 'confidence dominates');

    const nearSeed = mod.packRelevanceScore(mk({}), distances);
    const farAway = mod.packRelevanceScore(
      mk({ s: 'far', o: 'far' }),
      distances,
    );
    assert.ok(nearSeed > farAway, 'seed proximity ranks higher');

    const mentions = mod.packRelevanceScore(mk({ p: 'mentions' }), distances);
    assert.ok(nearSeed > mentions, 'mentions is the noise predicate');
  });
});

describe('budget trim keeps the relevant triple', () => {
  it('drops far mentions before the seed-adjacent causal edge', () => {
    // Star around 'hub' plus a causal seed edge. Tight budget must keep the
    // seed-adjacent causal triple, dropping distant mentions noise first.
    const nodes = [
      { id: 'Concept:auth', type: 'Concept', label: 'auth' },
      { id: 'Concept:outage', type: 'Concept', label: 'outage' },
      { id: 'Document:noise', type: 'Document', label: 'noise doc' },
    ];
    const triples: TripleIn[] = [
      { s: 'Concept:auth', p: 'causes', o: 'Concept:outage', sources: 3 },
    ];
    for (let i = 0; i < 12; i++) {
      const id = `Concept:filler-${i}`;
      nodes.push({ id, type: 'Concept', label: `filler ${i}` });
      triples.push({ s: 'Document:noise', p: 'mentions', o: id });
      // Chain filler off outage at depth 2+
      triples.push({ s: 'Concept:outage', p: 'mentions', o: id });
    }
    const graph = graphOf(nodes, triples);
    const pack = mod.packSubgraph({
      question: 'why did auth cause the outage?',
      graph,
      budget: 400,
    });
    assert.ok(pack.trimmed !== null, 'budget must bind for this test');
    assert.ok(
      pack.triples.some((t) => t.p === 'causes'),
      'causal seed edge survives the trim',
    );
  });
});

describe('citation confidence + source counts', () => {
  it('pack citations carry confidence and source_count; markdown shows tier', () => {
    const graph = graphOf(
      [
        { id: 'Concept:auth', type: 'Concept', label: 'auth' },
        { id: 'Concept:outage', type: 'Concept', label: 'outage' },
      ],
      [{ s: 'Concept:auth', p: 'causes', o: 'Concept:outage', sources: 3 }],
    );
    const pack = mod.packSubgraph({ question: 'auth outage?', graph });
    assert.equal(pack.citations[0]?.confidence, 'EXTRACTED');
    assert.equal(pack.citations[0]?.source_count, 3);

    const ans = mod.answer({ question: 'auth outage?', graph });
    assert.match(ans.answer_markdown, /\[EXTRACTED ×3\]/);

    const w = mod.why({ from: 'auth', to: 'outage', graph });
    assert.equal(w.citations[0]?.confidence, 'EXTRACTED');
    assert.match(w.explanation_markdown, /\[EXTRACTED\]/);
  });
});
