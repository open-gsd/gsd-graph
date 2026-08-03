// gsd-graph — answer prompt apply Ajv + citation honesty gates (LLM-01 / D-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
  packSubgraph: (opts: { question: string; graph?: unknown }) => {
    triples: Array<{ id: string; s: string; p: string; o: string }>;
    seeds: string[];
  };
  answer: (opts: {
    question: string;
    graph?: unknown;
    applyPromptResult?: boolean;
    promptResult?: unknown;
    promptResultPath?: string;
    llmMode?: 'none' | 'prompt' | 'http';
  }) => {
    pack: { triples: Array<{ id: string }> };
    answer_markdown: string;
    mode: 'deterministic' | 'prompt_pending' | 'http' | 'abstain';
    abstained: boolean;
    abstain_reason?: string;
  };
  assertCitationsInPack: (
    pack: { triples: Array<{ id: string }> },
    cited: readonly string[],
  ) => void;
  promptApplyAnswer: (input: {
    pack: { triples: Array<{ id: string }> };
    result: unknown;
  }) => { answer_markdown: string; cited_triple_ids: string[] };
  promptApply: (opts: {
    stage: string;
    result?: unknown;
    pack?: { triples: Array<{ id: string }> };
  }) => unknown;
  validatePromptAnswerResult: ((data: unknown) => boolean) & {
    errors?: unknown[] | null;
  };
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string; message: string };
  GSD_GRAPH_REASON: { PROMPT_RESULT_INVALID: string; EMPTY_SUBGRAPH: string };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function provenance(conf: string, source_path = 'fixture://multi-hop') {
  return [
    {
      source_path,
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

  return {
    schema_version: 1 as const,
    engine: 'gsd-graph' as const,
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1.0.0',
    built_at: '2026-08-03T00:00:00.000Z',
    nodes: [
      {
        id: drought,
        type: 'Concept',
        label: 'Drought',
        aliases: ['dry spell'],
      },
      { id: crop, type: 'Concept', label: 'Crop Failure' },
      { id: food, type: 'Concept', label: 'Food Shortage' },
    ],
    triples: [
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
    ],
    ids: { drought, crop, food, t1, t2 },
  };
}

describe('prompt answer apply — citation honesty (D-02)', () => {
  it('applies valid answer_markdown when cited_triple_ids ⊆ pack', () => {
    const g = multiHopGraph();
    const pack = mod.packSubgraph({
      graph: g,
      question: 'why does drought cause food shortage?',
    });
    assert.ok(pack.triples.length >= 1, 'expected non-empty pack');

    const cited = pack.triples.map((t) => t.id);
    const result = {
      answer_markdown:
        'Drought causes crop failure which leads to food shortage.',
      cited_triple_ids: cited,
    };

    const applied = mod.promptApplyAnswer({ pack, result });
    assert.equal(
      applied.answer_markdown,
      'Drought causes crop failure which leads to food shortage.',
    );
    assert.deepEqual(applied.cited_triple_ids, cited);

    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
      applyPromptResult: true,
      promptResult: result,
    });
    assert.equal(ans.mode, 'prompt_pending');
    assert.equal(ans.abstained, false);
    assert.equal(
      ans.answer_markdown,
      'Drought causes crop failure which leads to food shortage.',
    );
    // Never invents triples — pack unchanged from packSubgraph
    assert.ok(ans.pack.triples.every((t) => cited.includes(t.id) || pack.triples.some((p) => p.id === t.id)));
  });

  it('rejects cited_triple_id not in pack with PROMPT_RESULT_INVALID', () => {
    const g = multiHopGraph();
    const pack = mod.packSubgraph({
      graph: g,
      question: 'why does drought cause food shortage?',
    });
    const bad = {
      answer_markdown: 'Invented edge',
      cited_triple_ids: ['t_not_in_pack_deadbeef'],
    };

    assert.throws(
      () => mod.promptApplyAnswer({ pack, result: bad }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        );
        assert.match((err as Error).message, /cited_triple_id not in pack/);
        return true;
      },
    );

    assert.throws(
      () =>
        mod.answer({
          graph: g,
          question: 'why does drought cause food shortage?',
          applyPromptResult: true,
          promptResult: bad,
        }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        );
        return true;
      },
    );
  });

  it('rejects JSON failing Ajv answer schema with PROMPT_RESULT_INVALID', () => {
    const g = multiHopGraph();
    const pack = mod.packSubgraph({
      graph: g,
      question: 'why does drought cause food shortage?',
    });

    const invalids: unknown[] = [
      {},
      { answer_markdown: 'x' }, // missing cited_triple_ids
      { cited_triple_ids: ['a'] }, // missing answer_markdown
      { answer_markdown: '', cited_triple_ids: ['a'] }, // empty markdown
      { answer_markdown: 'ok', cited_triple_ids: [] }, // empty citations
      { answer_markdown: 'ok', cited_triple_ids: [1] }, // wrong type
      {
        answer_markdown: 'ok',
        cited_triple_ids: pack.triples.map((t) => t.id),
        extra: true,
      }, // additionalProperties
    ];

    for (const result of invalids) {
      assert.equal(
        mod.validatePromptAnswerResult(result),
        false,
        `expected Ajv reject for ${JSON.stringify(result)}`,
      );
      assert.throws(
        () => mod.promptApplyAnswer({ pack, result }),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.equal(
            (err as { reason: string }).reason,
            mod.GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
          );
          return true;
        },
      );
    }
  });

  it('default answer() without apply flags remains deterministic (D-10)', () => {
    const g = multiHopGraph();
    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
    });
    assert.equal(ans.mode, 'deterministic');
    assert.equal(ans.abstained, false);
    assert.match(ans.answer_markdown, /## Seeds/);
    assert.match(ans.answer_markdown, /## Relationships/);
    assert.match(ans.answer_markdown, /## Citations/);
  });

  it('empty pack abstains before apply (ANS-02 honesty)', () => {
    const emptyGraph = {
      schema_version: 1 as const,
      engine: 'gsd-graph' as const,
      engine_version: '0.1.0',
      ontology_pack_id: 'general',
      ontology_version: '1.0.0',
      built_at: '2026-08-03T00:00:00.000Z',
      nodes: [
        {
          id: mod.nodeId('Concept', 'Lonely'),
          type: 'Concept',
          label: 'Lonely',
        },
      ],
      triples: [],
    };
    const ans = mod.answer({
      graph: emptyGraph,
      question: 'what about lonely?',
      applyPromptResult: true,
      promptResult: {
        answer_markdown: 'should not apply',
        cited_triple_ids: ['t_fake'],
      },
    });
    assert.equal(ans.mode, 'abstain');
    assert.equal(ans.abstained, true);
    assert.equal(ans.abstain_reason, mod.GSD_GRAPH_REASON.EMPTY_SUBGRAPH);
    assert.equal(ans.answer_markdown, '');
  });

  it('assertCitationsInPack accepts subset and rejects outsider', () => {
    const pack = {
      triples: [{ id: 't_a' }, { id: 't_b' }],
    };
    mod.assertCitationsInPack(pack, ['t_a']);
    mod.assertCitationsInPack(pack, ['t_a', 't_b']);
    assert.throws(
      () => mod.assertCitationsInPack(pack, ['t_a', 't_missing']),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        );
        return true;
      },
    );
  });
});
