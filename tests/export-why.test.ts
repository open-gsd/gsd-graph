// gsd-graph — export formats + why path explanations + alias suggestions

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
  exportGraph: (opts: {
    dir?: string;
    graph?: unknown;
    format: string;
    out?: string;
    maxTriples?: number;
  }) => {
    format: string;
    path: string;
    node_count: number;
    triple_count: number;
    truncated: boolean;
  };
  renderMermaid: (view: unknown) => string;
  why: (opts: {
    dir?: string;
    graph?: unknown;
    from: string;
    to: string;
    maxDepth?: number;
  }) => {
    found: boolean;
    reason: string | null;
    from_id: string | null;
    to_id: string | null;
    path: { nodes: string[]; predicates: string[] } | null;
    explanation_markdown: string;
    citations: Array<{ triple_id: string; sources: unknown[] }>;
  };
  resolveNodeTerm: (graph: unknown, term: string) => string | null;
  normalize: (input: {
    ontology: unknown;
    nodes: unknown[];
    triples: unknown[];
    now?: string;
  }) => {
    reviewItems: Array<{ kind: string; payload: { reason?: string } }>;
  };
  loadOntologyPack: (opts: { packIdOrPath: string }) => unknown;
};

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function chainGraph(): object {
  const a = mod.nodeId('Concept', 'Drought');
  const b = mod.nodeId('Concept', 'Crop Failure');
  const c = mod.nodeId('Concept', 'Food Shortage');
  const prov = (line: number) => [
    {
      source_path: '/docs/climate.md',
      extractor: 'markdown/edge-line',
      content_hash: 'sha256:x',
      confidence: 'EXTRACTED',
      span: { start_line: line, end_line: line },
    },
  ];
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.0.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-08-04T00:00:00.000Z',
    nodes: [
      { id: a, type: 'Concept', label: 'Drought' },
      { id: b, type: 'Concept', label: 'Crop Failure' },
      { id: c, type: 'Concept', label: 'Food Shortage' },
    ],
    triples: [
      {
        id: mod.tripleId(a, 'causes', b),
        s: a,
        p: 'causes',
        o: b,
        confidence: 'EXTRACTED',
        provenance: prov(3),
      },
      {
        id: mod.tripleId(b, 'causes', c),
        s: b,
        p: 'causes',
        o: c,
        confidence: 'EXTRACTED',
        provenance: prov(4),
      },
    ],
  };
}

describe('exportGraph', () => {
  it('writes all four formats with sane contents', () => {
    const out = makeTmpDir('gsd-graph-export-');
    const graph = chainGraph();

    const mmd = mod.exportGraph({
      graph,
      format: 'mermaid',
      out: path.join(out, 'g.mmd'),
      dir: path.join(out, 'store'),
    });
    const mmdText = fs.readFileSync(mmd.path, 'utf8');
    assert.match(mmdText, /^graph LR/);
    assert.match(mmdText, /-->\|causes\|/);
    assert.equal(mmd.triple_count, 2);

    const gml = mod.exportGraph({
      graph,
      format: 'graphml',
      out: path.join(out, 'g.graphml'),
      dir: path.join(out, 'store'),
    });
    const gmlText = fs.readFileSync(gml.path, 'utf8');
    assert.match(gmlText, /<graphml/);
    assert.match(gmlText, /<data key="predicate">causes<\/data>/);

    const cy = mod.exportGraph({
      graph,
      format: 'cypher',
      out: path.join(out, 'g.cypher'),
      dir: path.join(out, 'store'),
    });
    const cyText = fs.readFileSync(cy.path, 'utf8');
    assert.match(cyText, /MERGE \(n:Concept/);
    assert.match(cyText, /MERGE \(a\)-\[r:CAUSES\]->\(b\)/);

    const html = mod.exportGraph({
      graph,
      format: 'html',
      out: path.join(out, 'g.html'),
      dir: path.join(out, 'store'),
    });
    const htmlText = fs.readFileSync(html.path, 'utf8');
    assert.match(htmlText, /<!doctype html>/i);
    assert.match(htmlText, /Food Shortage/);
    // Self-contained: no external URLs loaded at runtime
    assert.doesNotMatch(htmlText, /src="http/);
    assert.doesNotMatch(htmlText, /href="http/);
  });

  it('caps triples and reports truncation', () => {
    const out = makeTmpDir('gsd-graph-export-cap-');
    const result = mod.exportGraph({
      graph: chainGraph(),
      format: 'mermaid',
      out: path.join(out, 'g.mmd'),
      dir: path.join(out, 'store'),
      maxTriples: 1,
    });
    assert.equal(result.triple_count, 1);
    assert.equal(result.truncated, true);
  });

  it('rejects unknown formats', () => {
    assert.throws(() =>
      mod.exportGraph({ graph: chainGraph(), format: 'dot', dir: '/tmp/x' }),
    );
  });
});

describe('why', () => {
  it('explains a 2-hop chain with prose and citations', () => {
    const result = mod.why({
      graph: chainGraph(),
      from: 'drought',
      to: 'food shortage',
    });
    assert.equal(result.found, true);
    assert.equal(result.path!.predicates.length, 2);
    assert.match(result.explanation_markdown, /\*\*Drought\*\* causes/);
    assert.match(result.explanation_markdown, /2 hops/);
    assert.match(result.explanation_markdown, /climate\.md:3/);
    assert.equal(result.citations.length, 2);
  });

  it('abstains honestly when a term matches nothing', () => {
    const result = mod.why({
      graph: chainGraph(),
      from: 'drought',
      to: 'quantum teleportation',
    });
    assert.equal(result.found, false);
    assert.match(result.reason!, /no node matches/);
    assert.equal(result.explanation_markdown, '');
  });

  it('resolveNodeTerm prefers exact id then shortest label', () => {
    const graph = chainGraph();
    const id = mod.nodeId('Concept', 'Drought');
    assert.equal(mod.resolveNodeTerm(graph, id), id);
    assert.equal(mod.resolveNodeTerm(graph, 'crop'), mod.nodeId('Concept', 'Crop Failure'));
    assert.equal(mod.resolveNodeTerm(graph, 'zzz-nothing'), null);
  });
});

describe('alias suggestions (suggest-only, NORM-02)', () => {
  it('plural pairs produce entity_merge review with reason alias_suggestion', () => {
    const ontology = mod.loadOntologyPack({ packIdOrPath: 'general' });
    const out = mod.normalize({
      ontology,
      nodes: [
        { id: 'Concept:service', type: 'Concept', label: 'Service' },
        { id: 'Concept:services', type: 'Concept', label: 'Services' },
      ],
      triples: [],
      now: '2026-08-04T00:00:00.000Z',
    });
    const suggestion = out.reviewItems.find(
      (i) => i.kind === 'entity_merge' && i.payload.reason === 'alias_suggestion',
    );
    assert.ok(suggestion, 'expected alias_suggestion review item');
  });
});
