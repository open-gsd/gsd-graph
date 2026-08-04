// gsd-graph — resolveLlmMode matrix + prompt file confinement (LLM-01 / D-01 / D-04)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  resolveLlmMode: (input?: {
    flagMode?: 'none' | 'prompt' | 'http' | boolean;
    configMode?: string | null;
  }) => 'none' | 'prompt' | 'http';
  writePromptRequest: (opts: {
    stage: 'extract' | 'normalize' | 'answer' | 'maintain';
    dir?: string;
    question?: string;
    content_hash?: string;
    built_at?: string;
    payload?: unknown;
  }) => { path: string; basename: string; envelope: { stage: string } };
  readPromptResult: (opts: {
    stage: 'extract' | 'normalize' | 'answer' | 'maintain';
    dir?: string;
    path?: string;
  }) => unknown;
  promptResultBasename: (stage: string) => string;
  promptRequestBasename: (stage: string) => string;
  storeFile: (storeRoot: string, name: string) => string;
  resolveStoreRoot: (opts?: { dir?: string }) => string;
  promptApply: (opts: {
    stage: string;
    result?: unknown;
    pack?: { triples: Array<{ id: string }> };
  }) => unknown;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
  GSD_GRAPH_REASON: {
    PROMPT_RESULT_INVALID: string;
    PATH_ESCAPE: string;
  };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  );
  temps.push(dir);
  return dir;
}

describe('resolveLlmMode (D-01)', () => {
  it('defaults to none with empty input', () => {
    assert.equal(mod.resolveLlmMode(), 'none');
    assert.equal(mod.resolveLlmMode({}), 'none');
  });

  it('flag true → prompt; flag prompt|http wins', () => {
    assert.equal(mod.resolveLlmMode({ flagMode: true }), 'prompt');
    assert.equal(mod.resolveLlmMode({ flagMode: 'prompt' }), 'prompt');
    assert.equal(mod.resolveLlmMode({ flagMode: 'http' }), 'http');
  });

  it('flag wins over config', () => {
    assert.equal(
      mod.resolveLlmMode({ flagMode: 'http', configMode: 'prompt' }),
      'http',
    );
    assert.equal(
      mod.resolveLlmMode({ flagMode: true, configMode: 'http' }),
      'prompt',
    );
    assert.equal(
      mod.resolveLlmMode({ flagMode: false, configMode: 'http' }),
      'none',
    );
    assert.equal(
      mod.resolveLlmMode({ flagMode: 'none', configMode: 'prompt' }),
      'none',
    );
  });

  it('configMode used only when flag absent', () => {
    assert.equal(mod.resolveLlmMode({ configMode: 'prompt' }), 'prompt');
    assert.equal(mod.resolveLlmMode({ configMode: 'http' }), 'http');
    assert.equal(mod.resolveLlmMode({ configMode: 'none' }), 'none');
    assert.equal(mod.resolveLlmMode({ configMode: 'garbage' }), 'none');
  });

  it('never ambient — API key env alone does not change mode', () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-should-not-enable';
    try {
      assert.equal(mod.resolveLlmMode(), 'none');
      assert.equal(mod.resolveLlmMode({}), 'none');
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
});

describe('prompt file I/O confinement (D-04)', () => {
  it('writePromptRequest / readPromptResult use store basenames', () => {
    const dir = tempDir('gsd-prompt-');
    const written = mod.writePromptRequest({
      stage: 'answer',
      dir,
      question: 'why drought?',
      content_hash: 'sha256:abc',
      built_at: '2026-08-03T00:00:00.000Z',
      payload: { seeds: ['concept:drought'] },
    });
    assert.equal(written.basename, '.prompt-answer.json');
    assert.ok(fs.existsSync(written.path));
    assert.equal(path.basename(written.path), '.prompt-answer.json');
    // Under store root
    assert.ok(written.path.startsWith(dir));

    const resultPath = path.join(dir, mod.promptResultBasename('answer'));
    fs.writeFileSync(
      resultPath,
      JSON.stringify({
        answer_markdown: 'ok',
        cited_triple_ids: ['t_1'],
      }),
      'utf8',
    );
    const read = mod.readPromptResult({ stage: 'answer', dir }) as {
      answer_markdown: string;
    };
    assert.equal(read.answer_markdown, 'ok');
  });

  it('storeFile rejects path separators (PATH_ESCAPE)', () => {
    const dir = tempDir('gsd-prompt-esc-');
    assert.throws(
      () => mod.storeFile(dir, '../escape.json'),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PATH_ESCAPE,
        );
        return true;
      },
    );
    assert.throws(
      () => mod.storeFile(dir, 'sub/dir.json'),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PATH_ESCAPE,
        );
        return true;
      },
    );
  });

  it('basenames match DESIGN table', () => {
    assert.equal(mod.promptRequestBasename('extract'), '.prompt-extract.json');
    assert.equal(
      mod.promptResultBasename('extract'),
      '.prompt-extract-result.json',
    );
    assert.equal(
      mod.promptRequestBasename('normalize'),
      '.prompt-normalize.json',
    );
    assert.equal(
      mod.promptResultBasename('normalize'),
      '.prompt-normalize-result.json',
    );
    assert.equal(mod.promptRequestBasename('answer'), '.prompt-answer.json');
    assert.equal(
      mod.promptResultBasename('answer'),
      '.prompt-answer-result.json',
    );
    assert.equal(
      mod.promptRequestBasename('maintain'),
      '.prompt-maintain.json',
    );
    assert.equal(
      mod.promptResultBasename('maintain'),
      '.prompt-maintain-result.json',
    );
  });
});

describe('multi-stage promptApply (D-02 / D-03)', () => {
  it('rejects query stage apply', () => {
    assert.throws(
      () => mod.promptApply({ stage: 'query', result: {} }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        );
        assert.match((err as Error).message, /query prompt apply is not supported/);
        return true;
      },
    );
  });

  it('rejects invalid extract schema', () => {
    assert.throws(
      () =>
        mod.promptApply({
          stage: 'extract',
          result: { nodes: 'nope' },
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

  it('accepts valid maintain suggestions without graph rewrite', () => {
    const applied = mod.promptApply({
      stage: 'maintain',
      result: { suggestions: ['review stale provenance'] },
    }) as { stage: string; suggestions: string[] };
    assert.equal(applied.stage, 'maintain');
    assert.deepEqual(applied.suggestions, ['review stale provenance']);
  });
});

describe('package prompts templates (D-03)', () => {
  it('ships extract, normalize, answer, maintain, query under prompts/', () => {
    const promptsDir = path.join(root, 'prompts');
    for (const name of [
      'extract.md',
      'normalize.md',
      'answer.md',
      'maintain.md',
      'query.md',
    ]) {
      const p = path.join(promptsDir, name);
      assert.ok(fs.existsSync(p), `missing ${name}`);
      const body = fs.readFileSync(p, 'utf8');
      assert.ok(body.length > 50, `${name} too short`);
    }
    // query is reserved docs-only
    const query = fs.readFileSync(path.join(promptsDir, 'query.md'), 'utf8');
    assert.match(query, /reserved|not applied|NL→Query|out of scope/i);
  });
});
