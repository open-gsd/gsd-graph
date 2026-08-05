// gsd-graph — embedding sidecar + semantic seed fallback tests (no network)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  build: (opts: { corpus: string; dir?: string }) => object;
  buildEmbeddingSidecar: (opts?: {
    dir?: string;
    config?: { baseUrl: string; model: string; apiKeyEnv: string };
    fetchImpl?: unknown;
    env?: Record<string, string>;
  }) => Promise<{ embedded: number; reused: number; path: string }>;
  loadEmbeddingSidecar: (storeRoot: string) => {
    entries: Array<{ id: string; vector: number[] }>;
  } | null;
  semanticSeedCandidates: (
    q: string,
    opts?: {
      dir?: string;
      config?: { baseUrl: string; model: string; apiKeyEnv: string };
      fetchImpl?: unknown;
      env?: Record<string, string>;
    },
  ) => Promise<Array<{ id: string; score: number }>>;
  answerSemantic: (opts: {
    question: string;
    dir?: string;
    fetchImpl?: unknown;
    env?: Record<string, string>;
  }) => Promise<{ abstained: boolean; pack: { seeds: string[] } }>;
  setSeedScorer: (
    s: {
      id: string;
      score: (g: object, q: string, k: number) => Array<{ id: string; score: number }>;
    } | null,
  ) => void;
  cosineSimilarity: (a: number[], b: number[]) => number;
  clearGraphV1Cache: () => void;
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Deterministic fake embeddings: known labels map to fixed unit vectors. */
const VOCAB: Record<string, number[]> = {
  'authentication svc': [1, 0, 0],
  'billing engine': [0, 1, 0],
  'auth service': [0.95, 0.05, 0],
};

function fakeFetch(): unknown {
  return async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { input: string[] };
    const data = body.input.map((text, index) => {
      const key = Object.keys(VOCAB).find((k) => text.toLowerCase().includes(k));
      const embedding = key !== undefined ? VOCAB[key] : [0, 0, 1];
      return { index, embedding };
    });
    return {
      ok: true,
      json: async () => ({ data }),
      text: async () => '',
    };
  };
}

const CONFIG = {
  baseUrl: 'https://fake.example',
  model: 'fake-embed',
  apiKeyEnv: 'FAKE_KEY',
};
const ENV = { FAKE_KEY: 'k' };

function seedStore(): { cwd: string; store: string } {
  const cwd = tempDir('gsd-embed-');
  const corpus = path.join(cwd, 'docs');
  fs.mkdirSync(corpus, { recursive: true });
  fs.writeFileSync(
    path.join(corpus, 'a.md'),
    '# Doc\n\n[[Authentication Svc]] --causes--> [[Billing Engine]]\n',
    'utf8',
  );
  const store = path.join(cwd, '.gsd-graph');
  mod.build({ corpus, dir: store });
  return { cwd, store };
}

describe('embedding sidecar', () => {
  it('builds, reuses unchanged entries, and ranks semantic candidates', async () => {
    const { cwd, store } = seedStore();
    try {
      const first = await mod.buildEmbeddingSidecar({
        dir: store,
        config: CONFIG,
        fetchImpl: fakeFetch(),
        env: ENV,
      });
      assert.ok(first.embedded > 0);

      const again = await mod.buildEmbeddingSidecar({
        dir: store,
        config: CONFIG,
        fetchImpl: fakeFetch(),
        env: ENV,
      });
      assert.equal(again.embedded, 0, 'unchanged labels reuse vectors');
      assert.ok(again.reused > 0);

      // "auth service" is vocab-mismatched from "authentication svc" —
      // lexical seeding misses it, embeddings rank it first.
      const candidates = await mod.semanticSeedCandidates('auth service', {
        dir: store,
        config: CONFIG,
        fetchImpl: fakeFetch(),
        env: ENV,
      });
      assert.ok(candidates.length >= 1);
      assert.equal(candidates[0]?.id, 'Concept:authentication-svc');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('cosineSimilarity behaves', () => {
    assert.equal(mod.cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(mod.cosineSimilarity([1, 0], [0, 1]), 0);
  });
});

describe('answerSemantic (SeedScorer fallback)', () => {
  it('registered scorer rescues a no-seed abstain; default path unchanged', async () => {
    const { cwd, store } = seedStore();
    try {
      mod.clearGraphV1Cache();
      // Custom scorer that anchors the mismatched question
      mod.setSeedScorer({
        id: 'test',
        score: () => [{ id: 'Concept:authentication-svc', score: 0.9 }],
      });
      try {
        const ans = await mod.answerSemantic({
          question: 'what does the login gateway break?',
          dir: store,
        });
        assert.equal(ans.abstained, false);
        assert.deepEqual(ans.pack.seeds, ['Concept:authentication-svc']);
      } finally {
        mod.setSeedScorer(null);
      }

      // Without scorer or sidecar the abstain stands (no network attempted).
      const plain = await mod.answerSemantic({
        question: 'what does the login gateway break?',
        dir: store,
      });
      assert.equal(plain.abstained, true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
