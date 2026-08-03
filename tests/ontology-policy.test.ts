// gsd-graph — unknown type/predicate policy matrix tests (ONT-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const root = join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(join(root, 'dist', 'index.js')) as {
  loadOntologyPack: (opts?: { packIdOrPath?: string }) => {
    pack: {
      id: string;
      strict: boolean;
      unknown_type_policy: string;
      unknown_predicate_policy: string;
      node_types: string[];
      predicates: Array<{ id: string }>;
    };
    typeSet: ReadonlySet<string>;
    predicateSet: ReadonlySet<string>;
    packHash: string;
  };
  applyUnknownPolicy: (
    loaded: {
      pack: {
        strict: boolean;
        unknown_type_policy: string;
        unknown_predicate_policy: string;
      };
      typeSet: ReadonlySet<string>;
      predicateSet: ReadonlySet<string>;
    },
    kind: 'type' | 'predicate',
    proposed: string,
  ) => { action: string; coercedTo?: string };
};

type Loaded = ReturnType<typeof mod.loadOntologyPack>;

function withPolicies(
  base: Loaded,
  typePolicy: string,
  predPolicy: string,
): Loaded {
  return {
    ...base,
    pack: {
      ...base.pack,
      unknown_type_policy: typePolicy as Loaded['pack']['unknown_type_policy'],
      unknown_predicate_policy:
        predPolicy as Loaded['pack']['unknown_predicate_policy'],
    },
  };
}

describe('applyUnknownPolicy matrix (ONT-02, D-05)', () => {
  let general: Loaded;

  before(() => {
    general = mod.loadOntologyPack({ packIdOrPath: 'general' });
  });

  it('default general pack policies are review', () => {
    assert.equal(general.pack.unknown_type_policy, 'review');
    assert.equal(general.pack.unknown_predicate_policy, 'review');
    assert.equal(general.pack.strict, true);
  });

  it('known type → allow', () => {
    const d = mod.applyUnknownPolicy(general, 'type', 'Person');
    assert.equal(d.action, 'allow');
    assert.equal(d.coercedTo, undefined);
  });

  it('known predicate → allow', () => {
    const d = mod.applyUnknownPolicy(general, 'predicate', 'related_to');
    assert.equal(d.action, 'allow');
    assert.equal(d.coercedTo, undefined);
  });

  it('unknown + policy review → review (caller must not write)', () => {
    const typeDec = mod.applyUnknownPolicy(general, 'type', 'AlienType');
    assert.equal(typeDec.action, 'review');
    assert.equal(typeDec.coercedTo, undefined);

    const predDec = mod.applyUnknownPolicy(
      general,
      'predicate',
      'teleports_to',
    );
    assert.equal(predDec.action, 'review');
    assert.equal(predDec.coercedTo, undefined);
  });

  it('unknown type + coerce → coerce to Concept', () => {
    const loaded = withPolicies(general, 'coerce', 'review');
    const d = mod.applyUnknownPolicy(loaded, 'type', 'AlienType');
    assert.equal(d.action, 'coerce');
    assert.equal(d.coercedTo, 'Concept');
  });

  it('unknown predicate + coerce → coerce to related_to', () => {
    const loaded = withPolicies(general, 'review', 'coerce');
    const d = mod.applyUnknownPolicy(loaded, 'predicate', 'teleports_to');
    assert.equal(d.action, 'coerce');
    assert.equal(d.coercedTo, 'related_to');
  });

  it('unknown + drop → drop', () => {
    const loaded = withPolicies(general, 'drop', 'drop');
    assert.equal(
      mod.applyUnknownPolicy(loaded, 'type', 'AlienType').action,
      'drop',
    );
    assert.equal(
      mod.applyUnknownPolicy(loaded, 'predicate', 'teleports_to').action,
      'drop',
    );
  });

  it('known members still allow under coerce/drop policies', () => {
    const loaded = withPolicies(general, 'drop', 'coerce');
    assert.equal(mod.applyUnknownPolicy(loaded, 'type', 'Concept').action, 'allow');
    assert.equal(
      mod.applyUnknownPolicy(loaded, 'predicate', 'mentions').action,
      'allow',
    );
  });
});
