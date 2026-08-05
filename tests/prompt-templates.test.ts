// gsd-graph — prompt template loading + prompt_version provenance tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  loadPromptTemplate: (
    stage: string,
    opts?: { dir?: string },
  ) => { text: string; source: string; version: string; path: string };
  buildExtractSystemPrompt: (
    types: string[],
    preds: string[],
    opts?: { dir?: string },
  ) => string;
  extractPromptVersion: (opts?: { dir?: string }) => string;
  sanitizeExtractCandidates: (
    result: { nodes?: unknown[]; triples?: Array<Record<string, unknown>> },
    opts: { extractorTag: string; sourcePath?: string; contentHash?: string; promptVersion?: string },
  ) => { triples: Array<{ provenance: Array<{ prompt_version?: string }> }> };
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('loadPromptTemplate', () => {
  it('loads the shipped default with a stable version hash', () => {
    const t = mod.loadPromptTemplate('extract');
    assert.equal(t.source, 'package');
    assert.match(t.text, /gsd-graph/);
    assert.match(t.version, /^sha256:[0-9a-f]{12}$/);
    assert.equal(t.version, mod.loadPromptTemplate('extract').version);
  });

  it('store-local prompts/<stage>.md override wins', () => {
    const store = tempDir('gsd-prompts-');
    try {
      fs.mkdirSync(path.join(store, 'prompts'), { recursive: true });
      fs.writeFileSync(
        path.join(store, 'prompts', 'extract.md'),
        '# Custom extract rules\nBe extra careful.\n',
        'utf8',
      );
      const t = mod.loadPromptTemplate('extract', { dir: store });
      assert.equal(t.source, 'store');
      assert.match(t.text, /Custom extract rules/);
      assert.notEqual(t.version, mod.loadPromptTemplate('extract').version);

      const system = mod.buildExtractSystemPrompt(['Concept'], ['causes'], {
        dir: store,
      });
      assert.match(system, /Custom extract rules/);
      assert.match(system, /Allowed predicates: causes/);
    } finally {
      fs.rmSync(store, { recursive: true, force: true });
    }
  });

  it('unknown stage throws', () => {
    assert.throws(() => mod.loadPromptTemplate('nonsense'));
  });
});

describe('prompt_version provenance', () => {
  it('sanitizeExtractCandidates stamps prompt_version on every entry', () => {
    const version = mod.extractPromptVersion();
    assert.match(version, /^sha256:/);
    const out = mod.sanitizeExtractCandidates(
      {
        triples: [
          {
            id: 't_0000000000000001',
            s: 'Concept:a',
            p: 'causes',
            o: 'Concept:b',
            confidence: 'EXTRACTED',
            provenance: [],
          },
        ],
      },
      {
        extractorTag: 'llm/http',
        sourcePath: 'x.md',
        contentHash: 'h',
        promptVersion: version,
      },
    );
    assert.equal(out.triples[0]?.provenance[0]?.prompt_version, version);
  });
});
