// gsd-graph — eval harness tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  runEval: (opts: {
    graph?: object;
    dir?: string;
    cases?: Array<Record<string, unknown>>;
    file?: string;
    cwd?: string;
  }) => {
    total: number;
    passed: number;
    failed: number;
    seed_recall_avg: number | null;
    citations_all_valid: boolean;
    cases: Array<{ id: string; ok: boolean; failures: string[] }>;
  };
  GraphError: new (r: string, m: string) => Error & { reason: string };
};

function graphOf(): object {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.0.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-01-01T00:00:00.000Z',
    nodes: [
      { id: 'Concept:auth', type: 'Concept', label: 'auth' },
      { id: 'Concept:outage', type: 'Concept', label: 'outage' },
    ],
    triples: [
      {
        id: 't_0000000000000001',
        s: 'Concept:auth',
        p: 'causes',
        o: 'Concept:outage',
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'x.md',
            extractor: 'markdown',
            content_hash: 'h',
            confidence: 'EXTRACTED',
          },
        ],
      },
    ],
  };
}

describe('runEval', () => {
  it('scores passing and failing cases with seed recall', () => {
    const res = mod.runEval({
      graph: graphOf(),
      cases: [
        {
          id: 'good',
          question: 'why does auth cause the outage?',
          expect_seeds: ['Concept:auth', 'Concept:outage'],
          expect_answer_contains: ['causes'],
        },
        {
          id: 'bad-seed',
          question: 'why does auth cause the outage?',
          expect_seeds: ['Concept:nonexistent'],
        },
        {
          id: 'abstain-ok',
          question: 'qqqq zzzz nothing?',
          expect_abstain: true,
          expect_abstain_reason: 'no_seeds_matched',
        },
        {
          id: 'why-ok',
          why: { from: 'auth', to: 'outage', expect_found: true },
        },
      ],
    });
    assert.equal(res.total, 4);
    assert.equal(res.passed, 3);
    assert.equal(res.failed, 1);
    assert.equal(res.citations_all_valid, true);
    const bad = res.cases.find((c) => c.id === 'bad-seed');
    assert.ok(bad && !bad.ok && bad.failures[0]?.includes('missing seeds'));
    // recall avg over the two seed-declaring cases: (1.0 + 0.0) / 2
    assert.equal(res.seed_recall_avg, 0.5);
  });

  it('loads cases from a QA file and errors helpfully when absent', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-eval-'));
    try {
      fs.mkdirSync(path.join(cwd, 'evals'), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, 'evals', 'gsd-graph.json'),
        JSON.stringify({
          schema_version: 1,
          cases: [
            { id: 'file-case', why: { from: 'auth', to: 'outage', expect_found: true } },
          ],
        }),
        'utf8',
      );
      const res = mod.runEval({ graph: graphOf(), cwd });
      assert.equal(res.total, 1);
      assert.equal(res.passed, 1);

      assert.throws(
        () =>
          mod.runEval({
            graph: graphOf(),
            cwd: path.join(cwd, 'nowhere-such-dir'),
          }),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.match((err as Error).message, /no eval cases found/);
          return true;
        },
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
