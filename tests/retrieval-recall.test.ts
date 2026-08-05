// gsd-graph — stemming seed recall + did-you-mean abstain suggestions

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  singularizeToken: (t: string) => string;
  tokenVariants: (t: string) => string[];
  scoreSeeds: (
    graph: object,
    tokens: string[],
    k: number,
  ) => string[];
  suggestSeeds: (
    graph: object,
    tokens: string[],
    k?: number,
  ) => Array<{ id: string; label: string }>;
  packSubgraph: (opts: {
    question: string;
    graph: object;
  }) => { seeds: string[]; seed_suggestions?: Array<{ id: string }> };
  answer: (opts: { question: string; graph: object }) => {
    abstained: boolean;
    abstain_reason?: string;
    suggestions?: string[];
  };
};

function graphOf(
  nodes: Array<{ id: string; type: string; label: string; aliases?: string[]; description?: string }>,
  triples: Array<{ s: string; p: string; o: string }> = [],
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
      id: `t_${String(i).padStart(16, '0')}`.slice(0, 18),
      ...t,
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

describe('singularizeToken / tokenVariants', () => {
  it('applies conservative plural rules', () => {
    assert.equal(mod.singularizeToken('dependencies'), 'dependency');
    assert.equal(mod.singularizeToken('phases'), 'phase');
    assert.equal(mod.singularizeToken('services'), 'service');
    assert.equal(mod.singularizeToken('class'), 'class');
  });

  it('variants cover ambiguous plurals in both directions', () => {
    assert.ok(mod.tokenVariants('boxes').includes('box'));
    assert.ok(mod.tokenVariants('buses').includes('bus'));
    assert.ok(mod.tokenVariants('phases').includes('phase'));
    assert.ok(mod.tokenVariants('dependencies').includes('dependency'));
  });
});

describe('stem-aware seed scoring', () => {
  it('plural question tokens seed singular labels and vice versa', () => {
    const graph = graphOf([
      { id: 'Concept:phase', type: 'Concept', label: 'phase' },
      { id: 'Concept:noise', type: 'Concept', label: 'noise' },
    ]);
    const seeds = mod.scoreSeeds(graph, ['phases'], 5);
    assert.deepEqual(seeds, ['Concept:phase']);

    const graph2 = graphOf([
      { id: 'Concept:dependencies', type: 'Concept', label: 'dependencies' },
    ]);
    const seeds2 = mod.scoreSeeds(graph2, ['dependency'], 5);
    assert.deepEqual(seeds2, ['Concept:dependencies']);
  });
});

describe('did-you-mean suggestions on abstain', () => {
  it('suggests near-miss labels when no seeds matched', () => {
    const graph = graphOf([
      { id: 'Concept:billing-service', type: 'Concept', label: 'billing service' },
      { id: 'Concept:auth', type: 'Concept', label: 'auth' },
    ]);
    // "bilings" — typo of billing, matches nothing as substring
    const suggestions = mod.suggestSeeds(graph, ['bilings']);
    assert.ok(suggestions.length >= 1);
    assert.equal(suggestions[0]!.id, 'Concept:billing-service');
  });

  it('answer surfaces suggestions with no_seeds_matched abstain', () => {
    const graph = graphOf([
      { id: 'Concept:billing-service', type: 'Concept', label: 'billing service' },
    ]);
    const ans = mod.answer({ question: 'what about bileing?', graph });
    assert.equal(ans.abstained, true);
    assert.equal(ans.abstain_reason, 'no_seeds_matched');
    assert.ok((ans.suggestions ?? []).length >= 1);
    assert.match(ans.suggestions![0]!, /billing service/);
  });

  it('no suggestions attached when tokens are nothing like any label', () => {
    const graph = graphOf([
      { id: 'Concept:auth', type: 'Concept', label: 'auth' },
    ]);
    const ans = mod.answer({ question: 'zzzzqqqq wwwwrrrr?', graph });
    assert.equal(ans.abstained, true);
    assert.equal(ans.suggestions, undefined);
  });
});
