// gsd-graph — JSON/JSONL field-map extract tests (EXT-02 / D-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  extractJsonl: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      aliases?: string[];
    }>;
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
  extractByPath: (
    absPath: string,
    opts?: { contentHash?: string },
  ) => {
    nodes: Array<{ id: string; type: string; label: string }>;
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
  extractMarkdown: (
    sourcePath: string,
    content: string,
    contentHash: string,
  ) => {
    nodes: Array<{ id: string; type: string; label: string }>;
    triples: Array<{ p: string; confidence: string }>;
    diagnostics: Array<{ path: string; code: string; message: string }>;
  };
  fingerprintFile: (absPath: string) => string;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
};

const fixturePath = path.join(
  root,
  'tests',
  'fixtures',
  'corpus',
  'multi-hop.jsonl',
);

describe('extractJsonl (EXT-02 / D-03)', () => {
  it('multi-hop.jsonl yields ≥3 nodes and A→B→C EXTRACTED causes chain', () => {
    const content = fs.readFileSync(fixturePath, 'utf8');
    const contentHash = mod.fingerprintFile(fixturePath);
    const result = mod.extractJsonl(fixturePath, content, contentHash);

    assert.ok(result.nodes.length >= 3, `expected ≥3 nodes, got ${result.nodes.length}`);

    const droughtId = mod.nodeId('Concept', 'Drought');
    const cropId = mod.nodeId('Concept', 'Crop Failure');
    const foodId = mod.nodeId('Concept', 'Food Shortage');

    const ids = new Set(result.nodes.map((n) => n.id));
    assert.ok(ids.has(droughtId), 'Drought node present');
    assert.ok(ids.has(cropId), 'Crop Failure node present');
    assert.ok(ids.has(foodId), 'Food Shortage node present');

    const hop1 = result.triples.find(
      (t) => t.s === droughtId && t.p === 'causes' && t.o === cropId,
    );
    const hop2 = result.triples.find(
      (t) => t.s === cropId && t.p === 'causes' && t.o === foodId,
    );
    assert.ok(hop1, 'Drought --causes--> Crop Failure');
    assert.ok(hop2, 'Crop Failure --causes--> Food Shortage');

    for (const t of result.triples) {
      assert.equal(t.confidence, 'EXTRACTED');
      assert.equal(t.id, mod.tripleId(t.s, t.p, t.o));
      assert.ok(t.provenance.length >= 1);
      for (const e of t.provenance) {
        assert.equal(e.extractor, 'jsonl/field-map');
        assert.equal(e.content_hash, contentHash);
        assert.equal(e.confidence, 'EXTRACTED');
        assert.equal(e.source_path, fixturePath);
      }
    }
  });

  it('invalid JSON line yields diagnostic and continues', () => {
    const content = [
      '{"type":"Concept","label":"Good"}',
      'not-json',
      '{"type":"Concept","label":"Also Good","edges":[{"p":"related_to","o":{"type":"Concept","label":"Good"}}]}',
    ].join('\n');
    const result = mod.extractJsonl('mem://bad.jsonl', content, 'sha256:abc');

    const labels = result.nodes.map((n) => n.label).sort();
    assert.deepEqual(labels, ['Also Good', 'Good']);
    assert.ok(
      result.diagnostics.some((d) => d.code === 'JSON_LINE_INVALID'),
      'JSON_LINE_INVALID diagnostic',
    );
    assert.equal(result.triples.length, 1);
    assert.equal(result.triples[0]!.p, 'related_to');
  });

  it('skips records missing type or label with RECORD_INVALID', () => {
    const content = [
      '{"label":"NoType"}',
      '{"type":"Concept"}',
      '{"type":"Concept","label":"Ok"}',
    ].join('\n');
    const result = mod.extractJsonl('mem://invalid.jsonl', content, 'sha256:x');
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0]!.label, 'Ok');
    const codes = result.diagnostics.map((d) => d.code);
    assert.equal(codes.filter((c) => c === 'RECORD_INVALID').length, 2);
  });

  it('redacts secret-like tokens in labels', () => {
    const content =
      '{"type":"Concept","label":"key sk-abcdefghijklmnopqrstuv"}';
    const result = mod.extractJsonl('mem://secret.jsonl', content, 'sha256:s');
    assert.equal(result.nodes.length, 1);
    assert.match(result.nodes[0]!.label, /\[REDACTED\]/);
  });

  it('supports explicit id and string object refs', () => {
    const content = [
      '{"id":"Concept:alpha","type":"Concept","label":"Alpha","aliases":["A"],"edges":[{"p":"related_to","o":"Concept:beta"}]}',
      '{"id":"Concept:beta","type":"Concept","label":"Beta"}',
    ].join('\n');
    const result = mod.extractJsonl('mem://ids.jsonl', content, 'sha256:id');
    assert.equal(result.nodes.length, 2);
    const alpha = result.nodes.find((n) => n.id === 'Concept:alpha');
    assert.ok(alpha);
    assert.deepEqual(alpha!.aliases, ['A']);
    assert.equal(result.triples.length, 1);
    assert.equal(result.triples[0]!.s, 'Concept:alpha');
    assert.equal(result.triples[0]!.o, 'Concept:beta');
  });
});
