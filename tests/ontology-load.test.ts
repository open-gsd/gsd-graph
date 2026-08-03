// gsd-graph — ontology pack load + replace-only composition tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(join(root, 'dist', 'index.js')) as {
  loadOntologyPack: (opts?: {
    packIdOrPath?: string;
    baseDir?: string;
  }) => {
    pack: {
      id: string;
      version: string;
      title: string;
      node_types: string[];
      predicates: Array<{ id: string; domain: string[]; range: string[] }>;
      strict: boolean;
      unknown_predicate_policy: string;
      unknown_type_policy: string;
    };
    typeSet: ReadonlySet<string>;
    predicateSet: ReadonlySet<string>;
    packHash: string;
  };
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string; details?: unknown };
  GSD_GRAPH_REASON: { ONTOLOGY_INVALID: string };
};

const EXPECTED_TYPES = [
  'Entity',
  'Person',
  'Organization',
  'Place',
  'Concept',
  'Document',
  'Event',
  'Claim',
  'Topic',
  'Community',
] as const;

const EXPECTED_PREDICATES = [
  'related_to',
  'mentions',
  'part_of',
  'derived_from',
  'causes',
  'supports',
  'contradicts',
  'located_in',
  'works_for',
  'authored',
  'about',
  'member_of',
  'precedes',
  'same_as',
] as const;

describe('loadOntologyPack general (ONT-01)', () => {
  it('loads default general pack with closed allowlists', () => {
    const loaded = mod.loadOntologyPack();
    assert.equal(loaded.pack.id, 'general');
    assert.equal(loaded.pack.strict, true);
    assert.equal(loaded.pack.unknown_type_policy, 'review');
    assert.equal(loaded.pack.unknown_predicate_policy, 'review');

    for (const t of EXPECTED_TYPES) {
      assert.equal(loaded.typeSet.has(t), true, `typeSet missing ${t}`);
    }
    assert.equal(loaded.typeSet.size, EXPECTED_TYPES.length);

    for (const p of EXPECTED_PREDICATES) {
      assert.equal(loaded.predicateSet.has(p), true, `predicateSet missing ${p}`);
    }
    assert.equal(loaded.predicateSet.size, EXPECTED_PREDICATES.length);
  });

  it('loads via packIdOrPath general', () => {
    const loaded = mod.loadOntologyPack({ packIdOrPath: 'general' });
    assert.equal(loaded.pack.id, 'general');
  });

  it('packHash is stable sha256 hex of pack file bytes', () => {
    const loaded = mod.loadOntologyPack({ packIdOrPath: 'general' });
    const bytes = readFileSync(
      join(root, 'ontology-packs', 'general', 'ontology.json'),
    );
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(loaded.packHash, expected);
    assert.match(loaded.packHash, /^[0-9a-f]{64}$/);

    const again = mod.loadOntologyPack({ packIdOrPath: 'general' });
    assert.equal(again.packHash, loaded.packHash);
  });

  it('throws GraphError ONTOLOGY_INVALID for invalid pack JSON', () => {
    const fixture = join(root, 'tests', 'fixtures', 'ontology', 'pack-invalid.json');
    assert.throws(
      () => mod.loadOntologyPack({ packIdOrPath: fixture }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(err.reason, mod.GSD_GRAPH_REASON.ONTOLOGY_INVALID);
        return true;
      },
    );
  });

  it('throws GraphError ONTOLOGY_INVALID for schema-invalid pack', () => {
    const fixture = join(
      root,
      'tests',
      'fixtures',
      'ontology',
      'pack-schema-invalid.json',
    );
    assert.throws(
      () => mod.loadOntologyPack({ packIdOrPath: fixture }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(err.reason, mod.GSD_GRAPH_REASON.ONTOLOGY_INVALID);
        return true;
      },
    );
  });
});

describe('loadOntologyPack replace-only (ONT-03)', () => {
  it('rejects pack with extends string', () => {
    const fixture = join(
      root,
      'tests',
      'fixtures',
      'ontology',
      'pack-with-extends.json',
    );
    assert.throws(
      () => mod.loadOntologyPack({ packIdOrPath: fixture }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(err.reason, mod.GSD_GRAPH_REASON.ONTOLOGY_INVALID);
        assert.match(err.message, /composition|extends|replace-only|not supported/i);
        return true;
      },
    );
  });

  it('loads custom path pack without extends when schema-valid', () => {
    const fixture = join(root, 'tests', 'fixtures', 'ontology', 'pack-custom.json');
    const loaded = mod.loadOntologyPack({ packIdOrPath: fixture });
    assert.equal(loaded.pack.id, 'custom');
    assert.equal(loaded.typeSet.has('Entity'), true);
    assert.equal(loaded.predicateSet.has('related_to'), true);
  });

  it('public API has no mergeOntologyPacks / extends resolver', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require(join(root, 'dist', 'index.js')) as Record<string, unknown>;
    assert.equal('mergeOntologyPacks' in api, false);
    assert.equal('resolvePackExtends' in api, false);
    assert.equal(typeof api.loadOntologyPack, 'function');
  });
});
