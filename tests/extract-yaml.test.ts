// gsd-graph — extractor registry + YAML/frontmatter extraction tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  parseFlatYaml: (content: string) => {
    entries: Array<{
      key: string;
      values: string[];
      isList: boolean;
      line: number;
    }>;
    diagnostics: Array<{ code: string }>;
  };
  extractYaml: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      description?: string;
    }>;
    triples: Array<{
      s: string;
      p: string;
      o: string;
      provenance: Array<{ extractor: string; span?: { start_line?: number } }>;
    }>;
    diagnostics: Array<{ code: string }>;
  };
  extractMarkdown: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => {
    nodes: Array<{ id: string; type: string; label: string; description?: string }>;
    triples: Array<{
      s: string;
      p: string;
      o: string;
      provenance: Array<{ extractor: string }>;
    }>;
  };
  extractByPath: (absPath: string) => {
    nodes: unknown[];
    triples: unknown[];
    diagnostics: Array<{ code: string }>;
  };
  registerExtractor: (
    e: {
      id: string;
      extensions: string[];
      extract: (p: string, c: string, h: string) => object;
    },
    opts?: { replace?: boolean },
  ) => void;
  extractorForExtension: (ext: string) => { id: string } | undefined;
  registeredExtensions: () => string[];
  build: (opts: { corpus: string; dir?: string; ontology?: string }) => {
    triple_count: number;
    node_count: number;
  };
  loadGraphV1: (storeRoot: string) => {
    nodes: Array<{ id: string; description?: string }>;
    triples: Array<{ s: string; p: string; o: string }>;
  };
  GraphError: new (r: string, m: string) => Error & { reason: string };
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('parseFlatYaml (flat subset)', () => {
  it('parses scalars, inline lists, block lists; skips nested maps', () => {
    const out = mod.parseFlatYaml(
      [
        'title: Phase 4',
        'status: blocked',
        'tags: [auth, billing]',
        'depends_on:',
        '  - phase-3',
        '  - phase-2',
        'nested:',
        '  inner: value',
        '# comment line',
        "quoted: 'hello world'",
      ].join('\n'),
    );
    const byKey = new Map(out.entries.map((e) => [e.key, e]));
    assert.deepEqual(byKey.get('title')?.values, ['Phase 4']);
    assert.deepEqual(byKey.get('status')?.values, ['blocked']);
    assert.deepEqual(byKey.get('tags')?.values, ['auth', 'billing']);
    assert.equal(byKey.get('tags')?.isList, true);
    assert.deepEqual(byKey.get('depends_on')?.values, ['phase-3', 'phase-2']);
    assert.deepEqual(byKey.get('quoted')?.values, ['hello world']);
    assert.ok(out.diagnostics.some((d) => d.code === 'YAML_NESTED_SKIPPED'));
  });
});

describe('extractYaml (Document + gated edges)', () => {
  it('maps title/tags/relational keys; folds scalars into description', () => {
    const res = mod.extractYaml(
      '/tmp/phase-4.yaml',
      [
        'title: Phase 4',
        'status: blocked',
        'owner: jeremy',
        'tags: [auth]',
        'depends_on: phase-3',
      ].join('\n'),
      'hash1',
    );
    const doc = res.nodes.find((n) => n.type === 'Document');
    assert.ok(doc);
    assert.equal(doc.label, 'Phase 4');
    assert.match(doc.description ?? '', /status: blocked/);
    assert.match(doc.description ?? '', /owner: jeremy/);

    const preds = res.triples.map((t) => t.p).sort();
    assert.deepEqual(preds, ['depends_on', 'mentions']);
    const dep = res.triples.find((t) => t.p === 'depends_on');
    assert.equal(dep?.o, 'Concept:phase-3');
    assert.equal(dep?.provenance[0]?.extractor, 'yaml/field');
    assert.ok((dep?.provenance[0]?.span?.start_line ?? 0) >= 1);
  });
});

describe('markdown frontmatter integration', () => {
  it('extracts frontmatter structure and stops definition-parsing it', () => {
    const res = mod.extractMarkdown(
      '/tmp/doc.md',
      [
        '---',
        'title: Roadmap',
        'status: draft',
        'depends_on: phase-1',
        '---',
        '',
        '# Roadmap',
        '',
        'Body [[Alpha]] link.',
      ].join('\n'),
      'hash2',
    );
    // No junk Concept:status node from the definition grammar
    assert.ok(!res.nodes.some((n) => n.id === 'Concept:status'));
    const dep = res.triples.find((t) => t.p === 'depends_on');
    assert.ok(dep, 'frontmatter depends_on extracted');
    assert.equal(dep?.provenance[0]?.extractor, 'markdown/frontmatter');
    // Body wiki link attaches to the frontmatter Document
    const mention = res.triples.find(
      (t) => t.p === 'mentions' && t.o === 'Concept:alpha',
    );
    assert.equal(mention?.s, 'Document:roadmap');
  });
});

describe('extractor registry', () => {
  it('routes .yaml through registry and rejects extension collisions', () => {
    assert.equal(mod.extractorForExtension('.yaml')?.id, 'yaml');
    assert.ok(mod.registeredExtensions().includes('.yml'));
    assert.throws(
      () =>
        mod.registerExtractor({
          id: 'usurper',
          extensions: ['.md'],
          extract: () => ({ nodes: [], triples: [], diagnostics: [] }),
        }),
      (err: unknown) => err instanceof mod.GraphError,
    );
    // replace: true is allowed (restore markdown afterwards is unnecessary —
    // separate process per test file)
  });

  it('build discovers and extracts .yaml files via engineering pack', () => {
    const cwd = tempDir('gsd-yaml-build-');
    const corpus = path.join(cwd, 'docs');
    fs.mkdirSync(corpus, { recursive: true });
    fs.writeFileSync(
      path.join(corpus, 'phase-4.yaml'),
      'title: Phase 4\nstatus: blocked\ndepends_on: phase-3\n',
      'utf8',
    );
    const store = path.join(cwd, '.gsd-graph');
    try {
      const res = mod.build({ corpus, dir: store, ontology: 'engineering' });
      assert.ok(res.node_count >= 2);
      const graph = mod.loadGraphV1(store);
      const dep = graph.triples.find((t) => t.p === 'depends_on');
      assert.ok(dep, 'depends_on survives engineering ontology gate');
      assert.equal(dep?.o, 'Concept:phase-3');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('unsupported extension still yields UNSUPPORTED_EXTENSION diagnostic', () => {
    const cwd = tempDir('gsd-yaml-unsup-');
    const p = path.join(cwd, 'file.xyz');
    fs.writeFileSync(p, 'data', 'utf8');
    try {
      const res = mod.extractByPath(p);
      assert.equal(res.nodes.length, 0);
      assert.ok(
        res.diagnostics.some((d) => d.code === 'UNSUPPORTED_EXTENSION'),
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
