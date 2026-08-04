// gsd-graph — example research + engineering ontology pack load tests (ONT-04)

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

const RESEARCH_TYPES = [
  'Entity',
  'Person',
  'Organization',
  'Document',
  'Paper',
  'Author',
  'Method',
  'Dataset',
  'Claim',
  'Concept',
  'Topic',
] as const;

const RESEARCH_PREDICATES = [
  'related_to',
  'authored',
  'cites',
  'evaluates',
  'uses_method',
  'about',
  'supports',
  'contradicts',
  'same_as',
] as const;

const ENGINEERING_TYPES = [
  'Entity',
  'Person',
  'Organization',
  'Service',
  'API',
  'Incident',
  'Decision',
  'Change',
  'Document',
  'Concept',
  'Event',
] as const;

const ENGINEERING_PREDICATES = [
  'related_to',
  'depends_on',
  'owns',
  'mitigates',
  'deploys',
  'causes',
  'about',
  'part_of',
  'same_as',
] as const;

function assertNoExtendsInRaw(packDir: string): void {
  const raw = JSON.parse(
    readFileSync(join(root, 'ontology-packs', packDir, 'ontology.json'), 'utf8'),
  ) as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(raw, 'extends'),
    false,
    `${packDir} pack must not declare extends`,
  );
}

function assertPackHashMatchesFile(
  packId: string,
  packHash: string,
): void {
  const bytes = readFileSync(
    join(root, 'ontology-packs', packId, 'ontology.json'),
  );
  const expected = createHash('sha256').update(bytes).digest('hex');
  assert.equal(packHash, expected);
  assert.ok(typeof packHash === 'string' && packHash.length === 64);
}

describe('example ontology packs (ONT-04, D-09)', () => {
  describe('research pack', () => {
    it('loads via packIdOrPath research with DESIGN types/predicates', () => {
      const loaded = mod.loadOntologyPack({ packIdOrPath: 'research' });
      assert.equal(loaded.pack.id, 'research');
      assert.equal(loaded.pack.strict, true);
      assert.equal(loaded.pack.unknown_type_policy, 'review');
      assert.equal(loaded.pack.unknown_predicate_policy, 'review');

      for (const t of RESEARCH_TYPES) {
        assert.equal(loaded.typeSet.has(t), true, `typeSet missing ${t}`);
      }
      for (const p of RESEARCH_PREDICATES) {
        assert.equal(
          loaded.predicateSet.has(p),
          true,
          `predicateSet missing ${p}`,
        );
      }

      // DESIGN domain types required by ONT-04 / D-09
      for (const t of ['Paper', 'Author', 'Method', 'Dataset'] as const) {
        assert.equal(loaded.typeSet.has(t), true, `DESIGN type missing ${t}`);
      }
      for (const p of ['cites', 'evaluates', 'uses_method'] as const) {
        assert.equal(
          loaded.predicateSet.has(p),
          true,
          `DESIGN predicate missing ${p}`,
        );
      }

      assert.ok(loaded.packHash);
      assertPackHashMatchesFile('research', loaded.packHash);
      assertNoExtendsInRaw('research');
    });
  });

  describe('engineering pack', () => {
    it('loads via packIdOrPath engineering with DESIGN types/predicates', () => {
      const loaded = mod.loadOntologyPack({ packIdOrPath: 'engineering' });
      assert.equal(loaded.pack.id, 'engineering');
      assert.equal(loaded.pack.strict, true);
      assert.equal(loaded.pack.unknown_type_policy, 'review');
      assert.equal(loaded.pack.unknown_predicate_policy, 'review');

      for (const t of ENGINEERING_TYPES) {
        assert.equal(loaded.typeSet.has(t), true, `typeSet missing ${t}`);
      }
      for (const p of ENGINEERING_PREDICATES) {
        assert.equal(
          loaded.predicateSet.has(p),
          true,
          `predicateSet missing ${p}`,
        );
      }

      for (const t of [
        'Service',
        'Incident',
        'Decision',
        'Change',
        'API',
      ] as const) {
        assert.equal(loaded.typeSet.has(t), true, `DESIGN type missing ${t}`);
      }
      for (const p of [
        'depends_on',
        'owns',
        'mitigates',
        'deploys',
      ] as const) {
        assert.equal(
          loaded.predicateSet.has(p),
          true,
          `DESIGN predicate missing ${p}`,
        );
      }

      assert.ok(loaded.packHash);
      assertPackHashMatchesFile('engineering', loaded.packHash);
      assertNoExtendsInRaw('engineering');
    });
  });

  it('both packs load replace-only offline in one suite', () => {
    const research = mod.loadOntologyPack({ packIdOrPath: 'research' });
    const engineering = mod.loadOntologyPack({ packIdOrPath: 'engineering' });
    assert.equal(research.pack.id, 'research');
    assert.equal(engineering.pack.id, 'engineering');
    assert.notEqual(research.packHash, engineering.packHash);
  });
});
