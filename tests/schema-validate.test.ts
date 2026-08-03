// gsd-graph — Ajv graph.v1 / ontology-pack schema validation tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(join(root, 'dist', 'index.js')) as {
  validateGraphV1: ((data: unknown) => boolean) & { errors?: unknown[] | null };
  validateOntologyPack: ((data: unknown) => boolean) & {
    errors?: unknown[] | null;
  };
  GSD_GRAPH_REASON: Record<string, string>;
};

function minimalGraph(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-08-02T12:00:00.000Z',
    nodes: [
      {
        id: 'concept:graph-engineering',
        type: 'Concept',
        label: 'Graph Engineering',
      },
    ],
    triples: [
      {
        id: 't_0123456789abcdef',
        s: 'document:intro',
        p: 'about',
        o: 'concept:graph-engineering',
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'corpus/article.md',
            extractor: 'markdown/heading',
            content_hash: 'sha256:deadbeef',
            confidence: 'EXTRACTED',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('validateOntologyPack (D-09)', () => {
  it('accepts ontology-packs/general/ontology.json', () => {
    const pack = JSON.parse(
      readFileSync(join(root, 'ontology-packs', 'general', 'ontology.json'), 'utf8'),
    ) as unknown;
    assert.equal(
      mod.validateOntologyPack(pack),
      true,
      JSON.stringify(mod.validateOntologyPack.errors, null, 2),
    );
  });

  it('rejects pack missing required fields', () => {
    assert.equal(mod.validateOntologyPack({ id: 'x' }), false);
    assert.ok(mod.validateOntologyPack.errors && mod.validateOntologyPack.errors.length > 0);
  });
});

describe('validateGraphV1 (D-09)', () => {
  it('accepts a minimal DESIGN-shaped graph document', () => {
    assert.equal(
      mod.validateGraphV1(minimalGraph()),
      true,
      JSON.stringify(mod.validateGraphV1.errors, null, 2),
    );
  });

  it('rejects missing required fields', () => {
    const bad = minimalGraph();
    delete bad.schema_version;
    assert.equal(mod.validateGraphV1(bad), false);
  });

  it('rejects wrong schema_version / engine consts', () => {
    assert.equal(mod.validateGraphV1(minimalGraph({ schema_version: 2 })), false);
    assert.equal(mod.validateGraphV1(minimalGraph({ engine: 'other' })), false);
  });

  it('rejects triple with empty provenance', () => {
    const g = minimalGraph();
    const triples = g.triples as Array<Record<string, unknown>>;
    triples[0] = { ...triples[0], provenance: [] };
    assert.equal(mod.validateGraphV1(g), false);
  });
});
