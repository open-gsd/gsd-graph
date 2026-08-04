// gsd-graph — deterministic Markdown extract tests (EXT-01 / D-01)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  extractMarkdown: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => {
    nodes: Array<{ id: string; type: string; label: string; description?: string }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
      provenance: Array<{
        source_path: string;
        extractor: string;
        content_hash: string;
        confidence: string;
      }>;
    }>;
    diagnostics: Array<{ path: string; code: string; message: string }>;
  };
  fingerprintFile: (absPath: string) => string;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
  slugifyLabel: (label: string) => string;
  bestTier: (
    entries: Array<{ confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' }>,
  ) => string;
  stableStringify: (value: unknown) => string;
  reviewItemId: (kind: string, payload: unknown) => string;
};

describe('id helpers (D-05 / K20 / D-08 prep)', () => {
  it('slugifyLabel NFKC-lowers and collapses non-alnum', () => {
    assert.equal(mod.slugifyLabel('  Hello World! '), 'hello-world');
    assert.equal(mod.slugifyLabel('!!!'), 'unnamed');
  });

  it('nodeId is type:slug', () => {
    assert.equal(mod.nodeId('Concept', 'Alpha'), 'Concept:alpha');
  });

  it('tripleId matches ^t_[0-9a-f]{16}$ and is stable', () => {
    const id = mod.tripleId('Concept:alpha', 'related_to', 'Concept:beta');
    assert.match(id, /^t_[0-9a-f]{16}$/);
    assert.equal(
      id,
      mod.tripleId('Concept:alpha', 'related_to', 'Concept:beta'),
    );
    const expected =
      't_' +
      createHash('sha256')
        .update('Concept:alpha\0related_to\0Concept:beta', 'utf8')
        .digest('hex')
        .slice(0, 16);
    assert.equal(id, expected);
  });

  it('bestTier ranks EXTRACTED > INFERRED > AMBIGUOUS', () => {
    assert.equal(
      mod.bestTier([
        { confidence: 'INFERRED' },
        { confidence: 'AMBIGUOUS' },
        { confidence: 'EXTRACTED' },
      ]),
      'EXTRACTED',
    );
    assert.equal(mod.bestTier([]), 'AMBIGUOUS');
  });

  it('stableStringify sorts object keys', () => {
    assert.equal(
      mod.stableStringify({ b: 1, a: { d: 2, c: 3 } }),
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it('reviewItemId is rv_ + 8 hex and stable', () => {
    const id = mod.reviewItemId('entity_merge', { keep: 'a', drop: 'b' });
    assert.match(id, /^rv_[0-9a-f]{8}$/);
    assert.equal(
      id,
      mod.reviewItemId('entity_merge', { drop: 'b', keep: 'a' }),
    );
  });
});

const TYPED_MULTI_HOP = new Set([
  'causes',
  'supports',
  'contradicts',
  'precedes',
  'depends_on',
]);

describe('extractMarkdown tracer (EXT-01 / D-02 / OQ-1 primary)', () => {
  it('primary edge line yields Alpha/Beta nodes + EXTRACTED related_to triple', () => {
    const sourcePath = 'corpus/structured-edges.md';
    const content = '[[Alpha]] --related_to--> [[Beta]]\n';
    const contentHash =
      'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex');
    const result = mod.extractMarkdown(sourcePath, content, contentHash);

    const alpha = result.nodes.find((n) => n.label === 'Alpha');
    const beta = result.nodes.find((n) => n.label === 'Beta');
    assert.ok(alpha, 'Alpha node');
    assert.ok(beta, 'Beta node');
    assert.equal(alpha!.id, mod.nodeId(alpha!.type, 'Alpha'));
    assert.equal(beta!.id, mod.nodeId(beta!.type, 'Beta'));
    assert.match(alpha!.id, /^[A-Za-z]+:[a-z0-9-]+$/);

    const edge = result.triples.find(
      (t) => t.p === 'related_to' && t.s === alpha!.id && t.o === beta!.id,
    );
    assert.ok(edge, 'related_to triple');
    assert.equal(edge!.confidence, 'EXTRACTED');
    assert.equal(edge!.id, mod.tripleId(alpha!.id, 'related_to', beta!.id));
    assert.match(edge!.id, /^t_[0-9a-f]{16}$/);
    assert.ok(edge!.provenance.length >= 1);
    const prov = edge!.provenance[0]!;
    assert.equal(prov.content_hash, contentHash);
    assert.equal(prov.source_path, sourcePath);
    assert.match(prov.extractor, /markdown/);
    assert.equal(prov.confidence, 'EXTRACTED');
  });

  it('fixture structured-edges.md fingerprints and extracts primary edge', () => {
    const fixture = path.join(
      root,
      'tests',
      'fixtures',
      'corpus',
      'structured-edges.md',
    );
    assert.ok(fs.existsSync(fixture), 'structured-edges.md fixture');
    const hash = mod.fingerprintFile(fixture);
    const content = fs.readFileSync(fixture, 'utf8');
    const result = mod.extractMarkdown(fixture, content, hash);
    const edge = result.triples.find((t) => t.p === 'related_to');
    assert.ok(edge, 'related_to from fixture');
    assert.equal(edge!.provenance[0]!.content_hash, hash);
  });
});

describe('extractMarkdown OQ-1 grammar', () => {
  it('wiki [[Label]] → Concept + mentions from Document context (heading)', () => {
    const content = '# Doc Title\n\nSee [[Alpha]] today.\n';
    const hash = 'sha256:wiki';
    const result = mod.extractMarkdown('notes.md', content, hash);
    const doc = result.nodes.find((n) => n.type === 'Document');
    const concept = result.nodes.find(
      (n) => n.type === 'Concept' && n.label === 'Alpha',
    );
    assert.ok(doc);
    assert.ok(concept);
    const mentions = result.triples.find(
      (t) => t.p === 'mentions' && t.o === concept!.id && t.s === doc!.id,
    );
    assert.ok(mentions);
    assert.equal(mentions!.confidence, 'EXTRACTED');
    assert.equal(mentions!.provenance[0]!.extractor, 'markdown/wiki');
  });

  it('markdown link [label](path) → mentions EXTRACTED; path not fetched', () => {
    const content = '# Notes\n\nSee [Beta notes](./beta.md).\n';
    const result = mod.extractMarkdown('notes.md', content, 'sha256:link');
    const mentioned = result.nodes.find((n) => n.label === 'Beta notes');
    assert.ok(mentioned);
    const edge = result.triples.find(
      (t) => t.p === 'mentions' && t.o === mentioned!.id,
    );
    assert.ok(edge);
    assert.equal(edge!.confidence, 'EXTRACTED');
    assert.equal(edge!.provenance[0]!.extractor, 'markdown/link');
  });

  it('H1/H2 → Document + Topic + about EXTRACTED', () => {
    const content = '## Graph Topics\n';
    const result = mod.extractMarkdown('h.md', content, 'sha256:h');
    const doc = result.nodes.find(
      (n) => n.type === 'Document' && n.label === 'Graph Topics',
    );
    const topic = result.nodes.find(
      (n) => n.type === 'Topic' && n.label === 'Graph Topics',
    );
    assert.ok(doc);
    assert.ok(topic);
    const about = result.triples.find(
      (t) => t.p === 'about' && t.s === doc!.id && t.o === topic!.id,
    );
    assert.ok(about);
    assert.equal(about!.confidence, 'EXTRACTED');
    assert.equal(about!.provenance[0]!.extractor, 'markdown/heading');
  });

  it('accepts Subject --predicate--> Object and Subject -predicate-> Object', () => {
    const content = [
      'Gamma --supports--> Delta',
      'Epsilon -depends_on-> Zeta',
    ].join('\n');
    const result = mod.extractMarkdown('e.md', content, 'sha256:e');
    const supports = result.triples.find((t) => t.p === 'supports');
    const depends = result.triples.find((t) => t.p === 'depends_on');
    assert.ok(supports);
    assert.ok(depends);
    assert.equal(supports!.confidence, 'EXTRACTED');
    assert.equal(depends!.confidence, 'EXTRACTED');
  });

  it('definition-ish updates Concept description only — no invented causes', () => {
    const content = 'Alpha: A concept used in fixtures.\n';
    const result = mod.extractMarkdown('d.md', content, 'sha256:d');
    const alpha = result.nodes.find((n) => n.label === 'Alpha');
    assert.ok(alpha);
    assert.equal(alpha!.description, 'A concept used in fixtures.');
    assert.equal(result.triples.filter((t) => t.p === 'causes').length, 0);
  });

  it('#topic-token → Topic + mentions EXTRACTED', () => {
    const content = '# Notes\n\nTalk about #graph-engineering today.\n';
    const result = mod.extractMarkdown('t.md', content, 'sha256:t');
    const topic = result.nodes.find(
      (n) => n.type === 'Topic' && n.label === 'graph-engineering',
    );
    assert.ok(topic);
    const mentions = result.triples.find(
      (t) => t.p === 'mentions' && t.o === topic!.id,
    );
    assert.ok(mentions);
    assert.equal(mentions!.confidence, 'EXTRACTED');
    assert.equal(mentions!.provenance[0]!.extractor, 'markdown/tag');
  });

  it('redacts sk- tokens in wiki labels to [REDACTED]', () => {
    const content = '[[sk-abc1234567890secret]] --related_to--> [[Beta]]\n';
    const result = mod.extractMarkdown('r.md', content, 'sha256:r');
    const secretNode = result.nodes.find((n) => n.label.includes('sk-'));
    assert.equal(secretNode, undefined);
    const redacted = result.nodes.find((n) => n.label === '[REDACTED]');
    assert.ok(redacted, 'redacted label node');
  });
});

describe('free-prose honesty (D-01 / K24)', () => {
  it('free-prose.md emits no EXTRACTED typed multi-hop predicates', () => {
    const fixture = path.join(
      root,
      'tests',
      'fixtures',
      'corpus',
      'free-prose.md',
    );
    assert.ok(fs.existsSync(fixture), 'free-prose.md fixture');
    const content = fs.readFileSync(fixture, 'utf8');
    const hash = mod.fingerprintFile(fixture);
    const result = mod.extractMarkdown(fixture, content, hash);
    const bad = result.triples.filter(
      (t) => t.confidence === 'EXTRACTED' && TYPED_MULTI_HOP.has(t.p),
    );
    assert.deepEqual(
      bad.map((t) => t.p),
      [],
      'no EXTRACTED causes/supports/contradicts/precedes/depends_on from free prose',
    );
  });
});
