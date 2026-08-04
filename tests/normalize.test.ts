// gsd-graph — normalize multiset provenance + exact merge + policy tests (NORM-01/02)

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
  normalize: (input: {
    ontology: ReturnType<typeof mod.loadOntologyPack>;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      description?: string;
      aliases?: string[];
    }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
      score?: number;
      provenance: Array<{
        source_path: string;
        extractor: string;
        content_hash: string;
        confidence: string;
      }>;
    }>;
    now?: string;
  }) => {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      description?: string;
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
    reviewItems: Array<{
      id: string;
      kind: string;
      status: string;
      payload: Record<string, unknown>;
      decision: null | object;
    }>;
    diagnostics: Array<{ path: string; code: string; message: string }>;
  };
  reviewItemId: (kind: string, payload: unknown) => string;
  tripleId: (s: string, p: string, o: string) => string;
  bestTier: (entries: Array<{ confidence: string }>) => string;
};

type Loaded = ReturnType<typeof mod.loadOntologyPack>;

function prov(
  source_path: string,
  confidence: string,
  extractor = 'test',
  content_hash = 'sha256:aaaa',
) {
  return { source_path, extractor, content_hash, confidence };
}

function triple(
  s: string,
  p: string,
  o: string,
  provenance: ReturnType<typeof prov>[],
  confidence = 'AMBIGUOUS',
) {
  return {
    id: 't_placeholder',
    s,
    p,
    o,
    confidence,
    provenance,
  };
}

function node(id: string, type: string, label: string, aliases?: string[]) {
  return { id, type, label, ...(aliases ? { aliases } : {}) };
}

describe('normalize multiset + best_tier + policy (NORM-01, D-05, D-07)', () => {
  let general: Loaded;

  before(() => {
    general = mod.loadOntologyPack({ packIdOrPath: 'general' });
  });

  it('returns { nodes, triples, reviewItems, diagnostics }', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [node('concept:a', 'Concept', 'A')],
      triples: [],
      now: '2026-08-02T12:00:00.000Z',
    });
    assert.ok(Array.isArray(out.nodes));
    assert.ok(Array.isArray(out.triples));
    assert.ok(Array.isArray(out.reviewItems));
    assert.ok(Array.isArray(out.diagnostics));
  });

  it('unions provenance multiset on (s,p,o) and sets confidence = bestTier (EXTRACTED wins)', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        node('concept:alpha', 'Concept', 'Alpha'),
        node('concept:beta', 'Concept', 'Beta'),
      ],
      triples: [
        triple(
          'concept:alpha',
          'related_to',
          'concept:beta',
          [prov('a.md', 'INFERRED', 'md', 'sha256:1111')],
          'INFERRED',
        ),
        triple(
          'concept:alpha',
          'related_to',
          'concept:beta',
          [prov('b.md', 'EXTRACTED', 'md', 'sha256:2222')],
          'EXTRACTED',
        ),
      ],
      now: '2026-08-02T12:00:00.000Z',
    });

    assert.equal(out.triples.length, 1);
    const t = out.triples[0]!;
    assert.equal(t.s, 'concept:alpha');
    assert.equal(t.p, 'related_to');
    assert.equal(t.o, 'concept:beta');
    assert.equal(t.provenance.length, 2);
    assert.equal(t.confidence, 'EXTRACTED');
    assert.equal(t.id, mod.tripleId('concept:alpha', 'related_to', 'concept:beta'));
    assert.equal(mod.bestTier(t.provenance), 'EXTRACTED');
  });

  it('known allowlisted predicate writes through (allow)', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        node('concept:a', 'Concept', 'A'),
        node('concept:b', 'Concept', 'B'),
      ],
      triples: [
        triple(
          'concept:a',
          'causes',
          'concept:b',
          [prov('x.md', 'EXTRACTED')],
          'EXTRACTED',
        ),
      ],
    });
    assert.equal(out.triples.length, 1);
    assert.equal(out.triples[0]!.p, 'causes');
    assert.equal(out.reviewItems.length, 0);
  });

  it('unknown predicate with review policy → reviewItems kind predicate_unknown; triple not written', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        node('concept:a', 'Concept', 'A'),
        node('concept:b', 'Concept', 'B'),
      ],
      triples: [
        triple(
          'concept:a',
          'totally_unknown_pred',
          'concept:b',
          [prov('x.md', 'EXTRACTED')],
          'EXTRACTED',
        ),
      ],
      now: '2026-08-02T12:00:00.000Z',
    });
    assert.equal(out.triples.length, 0);
    assert.equal(out.reviewItems.length, 1);
    const item = out.reviewItems[0]!;
    assert.equal(item.kind, 'predicate_unknown');
    assert.equal(item.status, 'pending');
    assert.equal(item.payload.proposed_p, 'totally_unknown_pred');
    assert.match(item.id, /^rv_[0-9a-f]{8}$/);
    const expected = mod.reviewItemId('predicate_unknown', item.payload);
    assert.equal(item.id, expected);
  });
});

describe('normalize exact same-type merge + same_as advisory (NORM-02, D-06)', () => {
  let general: Loaded;

  before(() => {
    general = mod.loadOntologyPack({ packIdOrPath: 'general' });
  });

  it('two nodes same type with identical id → single keeper; aliases/labels merged', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        { id: 'person:ada', type: 'Person', label: 'Ada', aliases: ['ada'] },
        {
          id: 'person:ada',
          type: 'Person',
          label: 'Ada Lovelace',
          description: 'Mathematician',
          aliases: ['ada-lovelace'],
        },
      ],
      triples: [],
    });
    assert.equal(out.nodes.length, 1);
    const n = out.nodes[0]!;
    assert.equal(n.id, 'person:ada');
    assert.equal(n.description, 'Mathematician');
    assert.ok(n.aliases && n.aliases.length >= 2);
  });

  it('exact alias merge: label/alias slug equals other id local part → single keeper', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        node('person:ada-lovelace', 'Person', 'Ada Lovelace'),
        {
          id: 'person:ada',
          type: 'Person',
          label: 'Ada',
          aliases: ['ada-lovelace'],
        },
        node('concept:math', 'Concept', 'Math'),
      ],
      triples: [
        triple(
          'person:ada',
          'related_to',
          'concept:math',
          [prov('bio.md', 'EXTRACTED')],
          'EXTRACTED',
        ),
      ],
    });

    const people = out.nodes.filter((n) => n.type === 'Person');
    assert.equal(people.length, 1);
    assert.equal(people[0]!.id, 'person:ada-lovelace');
    assert.equal(out.triples.length, 1);
    assert.equal(out.triples[0]!.s, 'person:ada-lovelace');
  });

  it('cross-type same label → no auto-merge; entity_merge review item', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        node('person:ada', 'Person', 'Ada'),
        node('concept:ada', 'Concept', 'Ada'),
      ],
      triples: [],
      now: '2026-08-02T12:00:00.000Z',
    });
    assert.equal(out.nodes.length, 2);
    const merges = out.reviewItems.filter((r) => r.kind === 'entity_merge');
    assert.ok(merges.length >= 1);
    assert.equal(merges[0]!.status, 'pending');
  });

  it('same_as triple remains advisory edge; node ids not rewritten', () => {
    const out = mod.normalize({
      ontology: general,
      nodes: [
        node('person:ada-lovelace', 'Person', 'Ada Lovelace'),
        node('person:a-lovelace', 'Person', 'A. Lovelace'),
      ],
      triples: [
        triple(
          'person:ada-lovelace',
          'same_as',
          'person:a-lovelace',
          [prov('wiki.md', 'EXTRACTED')],
          'EXTRACTED',
        ),
      ],
    });
    assert.equal(out.nodes.length, 2, 'both nodes retained');
    assert.equal(out.triples.length, 1);
    assert.equal(out.triples[0]!.p, 'same_as');
    assert.equal(out.triples[0]!.s, 'person:ada-lovelace');
    assert.equal(out.triples[0]!.o, 'person:a-lovelace');
  });
});
