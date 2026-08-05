// gsd-graph — JSON/JSONL field-map extract tests (EXT-02 / D-03)

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
    opts?: { format?: 'auto' | 'json-document' | 'jsonl' },
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

  it('pretty-printed single JSON object does not flood JSON_LINE_INVALID', () => {
    // OpenAPI-style dumps under docs/ were parsed line-by-line as JSONL.
    const content = `{
  "openapi": "3.0.0",
  "info": {
    "title": "Demo API",
    "version": "1.0.0"
  },
  "paths": {
    "/health": {
      "get": {
        "summary": "ok"
      }
    }
  }
}
`;
    const result = mod.extractJsonl(
      'mem://live-postgrest-openapi.json',
      content,
      'sha256:openapi',
      { format: 'json-document' },
    );
    assert.equal(result.nodes.length, 0);
    assert.equal(result.triples.length, 0);
    const lineInvalid = result.diagnostics.filter(
      (d) => d.code === 'JSON_LINE_INVALID',
    );
    assert.equal(
      lineInvalid.length,
      0,
      `expected 0 JSON_LINE_INVALID, got ${lineInvalid.length}`,
    );
    assert.ok(
      result.diagnostics.some((d) => d.code === 'RECORD_INVALID'),
      'one RECORD_INVALID for non-field-map object',
    );
    assert.ok(result.diagnostics.length <= 3, 'diagnostics stay small');
  });

  it('json-document mode never emits JSON_LINE_INVALID even if parse fails', () => {
    const content = '{\n  "broken":\n';
    const result = mod.extractJsonl('mem://broken.json', content, 'sha256:b', {
      format: 'json-document',
    });
    assert.equal(result.nodes.length, 0);
    assert.equal(
      result.diagnostics.filter((d) => d.code === 'JSON_LINE_INVALID').length,
      0,
    );
    assert.ok(result.diagnostics.some((d) => d.code === 'JSON_INVALID'));
  });

  it('extractByPath routes .json as json-document (no line spam)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-json-'));
    const file = path.join(dir, 'vendor-state-raw.json');
    fs.writeFileSync(
      file,
      '{\n  "vendors": [\n    { "id": 1 },\n    { "id": 2 }\n  ]\n}\n',
      'utf8',
    );
    const result = mod.extractByPath(file);
    assert.equal(
      result.diagnostics.filter((d) => d.code === 'JSON_LINE_INVALID').length,
      0,
    );
    assert.ok(result.diagnostics.length <= 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('JSONL still parses when first line starts with {', () => {
    const content = [
      '{"type":"Concept","label":"One"}',
      '{"type":"Concept","label":"Two"}',
    ].join('\n');
    const result = mod.extractJsonl('mem://two.jsonl', content, 'sha256:two', {
      format: 'jsonl',
    });
    assert.equal(result.nodes.length, 2);
  });

  it('JSON array file produces same nodes/triples as equivalent JSONL', () => {
    const records = [
      {
        type: 'Concept',
        label: 'Alpha',
        edges: [{ p: 'related_to', o: { type: 'Concept', label: 'Beta' } }],
      },
      { type: 'Concept', label: 'Beta' },
    ];
    const jsonl = records.map((r) => JSON.stringify(r)).join('\n');
    const arrayDoc = JSON.stringify(records, null, 2);

    const fromJsonl = mod.extractJsonl('mem://a.jsonl', jsonl, 'sha256:j');
    const fromArray = mod.extractJsonl('mem://a.json', arrayDoc, 'sha256:a');

    assert.equal(fromArray.nodes.length, fromJsonl.nodes.length);
    assert.equal(fromArray.triples.length, fromJsonl.triples.length);

    const jsonlIds = new Set(fromJsonl.nodes.map((n) => n.id));
    for (const n of fromArray.nodes) {
      assert.ok(jsonlIds.has(n.id), `array node ${n.id} present in jsonl`);
    }
    const jsonlEdges = new Set(
      fromJsonl.triples.map((t) => `${t.s}|${t.p}|${t.o}`),
    );
    for (const t of fromArray.triples) {
      assert.ok(
        jsonlEdges.has(`${t.s}|${t.p}|${t.o}`),
        `array triple ${t.s} ${t.p} ${t.o}`,
      );
      assert.equal(t.confidence, 'EXTRACTED');
    }
  });
});

describe('extractByPath router (EXT-02 / D-01 / D-12)', () => {
  it('routes multi-hop.jsonl and matches direct extractJsonl', () => {
    const content = fs.readFileSync(fixturePath, 'utf8');
    const contentHash = mod.fingerprintFile(fixturePath);
    const direct = mod.extractJsonl(fixturePath, content, contentHash);
    const routed = mod.extractByPath(fixturePath);

    assert.equal(routed.nodes.length, direct.nodes.length);
    assert.equal(routed.triples.length, direct.triples.length);
    assert.deepEqual(
      routed.nodes.map((n) => n.id).sort(),
      direct.nodes.map((n) => n.id).sort(),
    );
    assert.deepEqual(
      routed.triples.map((t) => t.id).sort(),
      direct.triples.map((t) => t.id).sort(),
    );
    for (const t of routed.triples) {
      assert.equal(t.confidence, 'EXTRACTED');
      assert.equal(t.provenance[0]!.content_hash, contentHash);
      assert.equal(t.provenance[0]!.extractor, 'jsonl/field-map');
    }
  });

  it('routes .json array with two linked records', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-extract-'));
    const jsonPath = path.join(dir, 'linked.json');
    const records = [
      {
        type: 'Concept',
        label: 'Cause',
        edges: [{ p: 'causes', o: { type: 'Concept', label: 'Effect' } }],
      },
      { type: 'Concept', label: 'Effect' },
    ];
    fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2), 'utf8');

    const result = mod.extractByPath(jsonPath);
    assert.ok(result.nodes.length >= 2);
    assert.equal(result.triples.length, 1);
    assert.equal(result.triples[0]!.p, 'causes');
    assert.equal(result.triples[0]!.confidence, 'EXTRACTED');
    assert.equal(
      result.triples[0]!.provenance[0]!.content_hash,
      mod.fingerprintFile(jsonPath),
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('routes .md via extractMarkdown', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-extract-md-'));
    const mdPath = path.join(dir, 'edge.md');
    fs.writeFileSync(
      mdPath,
      '[[Alpha]] --related_to--> [[Beta]]\n',
      'utf8',
    );
    const result = mod.extractByPath(mdPath);
    assert.ok(result.nodes.length >= 2);
    const edge = result.triples.find((t) => t.p === 'related_to');
    assert.ok(edge);
    assert.equal(edge!.confidence, 'EXTRACTED');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('unsupported extension yields UNSUPPORTED_EXTENSION diagnostic', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-extract-x-'));
    const binPath = path.join(dir, 'data.bin');
    fs.writeFileSync(binPath, 'not extracted', 'utf8');
    const result = mod.extractByPath(binPath);
    assert.equal(result.nodes.length, 0);
    assert.equal(result.triples.length, 0);
    assert.ok(
      result.diagnostics.some((d) => d.code === 'UNSUPPORTED_EXTENSION'),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('honors provided contentHash without re-fingerprint mismatch on extract', () => {
    const content = fs.readFileSync(fixturePath, 'utf8');
    const forced = 'sha256:deadbeef';
    const result = mod.extractByPath(fixturePath, { contentHash: forced });
    assert.ok(result.triples.length >= 2);
    for (const t of result.triples) {
      assert.equal(t.provenance[0]!.content_hash, forced);
    }
    // content still extracted from disk
    void content;
  });
});
