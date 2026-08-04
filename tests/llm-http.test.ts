// gsd-graph — HTTP LLM client mock fetch + answerHttp gates (LLM-01 / D-05 / D-12)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
  answer: (opts: Record<string, unknown>) => {
    mode: string;
    answer_markdown: string;
    abstained: boolean;
  };
  answerHttp: (opts: Record<string, unknown>) => Promise<{
    mode: string;
    answer_markdown: string;
    abstained: boolean;
    pack: { triples: Array<{ id: string }> };
  }>;
  httpChatCompletion: (opts: {
    baseUrl: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    apiKeyEnv?: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  }) => Promise<{ content: string; raw: unknown }>;
  parseHttpPromptResultJson: (content: string) => unknown;
  resolveLlmMode: (input?: Record<string, unknown>) => string;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
  GSD_GRAPH_REASON: { PROMPT_RESULT_INVALID: string; EMPTY_SUBGRAPH: string };
};

function provenance(conf: string) {
  return [
    {
      source_path: 'fixture://http',
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
      { id: drought, type: 'Concept', label: 'Drought' },
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
    ids: { t1, t2 },
  };
}

function mockFetchOk(content: string): typeof fetch {
  const impl = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content } }],
      }),
      text: async () => content,
    })) as unknown as typeof fetch;
  return impl;
}

function mockFetchStatus(status: number, body = 'error'): typeof fetch {
  return (async () =>
    ({
      ok: false,
      status,
      json: async () => ({ error: body }),
      text: async () => body,
    })) as unknown as typeof fetch;
}

describe('httpChatCompletion (D-05, D-12)', () => {
  it('returns choices[0].message.content via fetchImpl', async () => {
    let calls = 0;
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls += 1;
      assert.match(String(url), /\/v1\/chat\/completions$/);
      assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.authorization, 'Bearer sk-test');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        text: async () => '',
      } as Response;
    }) as typeof fetch;

    const result = await mod.httpChatCompletion({
      baseUrl: 'https://example.test',
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      apiKeyEnv: 'TEST_KEY',
      env: { TEST_KEY: 'sk-test' },
      fetchImpl,
    });
    assert.equal(result.content, '{"ok":true}');
    assert.equal(calls, 1);
  });

  it('maps non-OK HTTP to PROMPT_RESULT_INVALID', async () => {
    await assert.rejects(
      () =>
        mod.httpChatCompletion({
          baseUrl: 'https://example.test',
          model: 'm',
          messages: [{ role: 'user', content: 'x' }],
          fetchImpl: mockFetchStatus(500, 'boom'),
        }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        );
        assert.match((err as Error).message, /non-OK status 500/);
        return true;
      },
    );
  });

  it('maps empty content to PROMPT_RESULT_INVALID', async () => {
    const empty = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '' } }] }),
        text: async () => '',
      })) as unknown as typeof fetch;
    await assert.rejects(
      () =>
        mod.httpChatCompletion({
          baseUrl: 'https://example.test',
          model: 'm',
          messages: [{ role: 'user', content: 'x' }],
          fetchImpl: empty,
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
});

describe('answerHttp citation + schema gates (D-02)', () => {
  it('applies mock JSON content with cited_triple_ids subset', async () => {
    const g = multiHopGraph();
    const content = JSON.stringify({
      answer_markdown: 'Drought leads to food shortage via crop failure.',
      cited_triple_ids: [g.ids.t1, g.ids.t2],
    });
    const ans = await mod.answerHttp({
      graph: g,
      question: 'why does drought cause food shortage?',
      llmMode: 'http',
      httpBaseUrl: 'https://example.test',
      httpModel: 'test',
      httpApiKeyEnv: 'TEST_KEY',
      env: { TEST_KEY: 'sk-test' },
      fetchImpl: mockFetchOk(content),
    });
    assert.equal(ans.mode, 'http');
    assert.equal(ans.abstained, false);
    assert.match(ans.answer_markdown, /Drought/);
  });

  it('rejects citation outside pack from http JSON', async () => {
    const g = multiHopGraph();
    const content = JSON.stringify({
      answer_markdown: 'Invented',
      cited_triple_ids: ['t_not_real'],
    });
    process.env.OPENAI_API_KEY = 'sk-test';
    try {
      await assert.rejects(
        () =>
          mod.answerHttp({
            graph: g,
            question: 'why drought?',
            llmMode: 'http',
            httpBaseUrl: 'https://example.test',
            fetchImpl: mockFetchOk(content),
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
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});

describe('default answer never fetches (D-01, D-10, D-12)', () => {
  it('answer() does not call fetchImpl / network', () => {
    const g = multiHopGraph();
    let calls = 0;
    const spy = (async () => {
      calls += 1;
      throw new Error('fetch should not be called');
    }) as unknown as typeof fetch;

    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
      fetchImpl: spy,
    });
    assert.equal(ans.mode, 'deterministic');
    assert.equal(calls, 0);
  });

  it('resolveLlmMode stays none without flags even with key', () => {
    process.env.OPENAI_API_KEY = 'sk-ambient';
    try {
      assert.equal(mod.resolveLlmMode(), 'none');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});

describe('parseHttpPromptResultJson', () => {
  it('parses raw and fenced JSON', () => {
    assert.deepEqual(mod.parseHttpPromptResultJson('{"a":1}'), { a: 1 });
    assert.deepEqual(
      mod.parseHttpPromptResultJson('```json\n{"b":2}\n```'),
      { b: 2 },
    );
  });

  it('rejects non-JSON', () => {
    assert.throws(
      () => mod.parseHttpPromptResultJson('not json'),
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
