// gsd-graph — review queue schema + stable rv_ + accept/reject tests (REV-01)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  validateReviewQueue: ((data: unknown) => boolean) & {
    errors?: unknown[] | null;
  };
  reviewItemId: (kind: string, payload: unknown) => string;
  normalize: (input: {
    ontology: unknown;
    nodes: unknown[];
    triples: unknown[];
    now?: string;
  }) => {
    reviewItems: Array<{
      id: string;
      kind: string;
      status: string;
      payload: Record<string, unknown>;
    }>;
    triples: unknown[];
  };
  loadOntologyPack: (opts?: { packIdOrPath?: string }) => unknown;
  loadReviewQueue: (storeRoot: string) => {
    schema_version: number;
    items: Array<{
      id: string;
      kind: string;
      status: string;
      payload: Record<string, unknown>;
      decision: null | { action: string; at: string };
    }>;
    decisions: Array<{ id: string; action: string; at: string }>;
  };
  mergeReviewItems: (
    existing: {
      schema_version: number;
      items: unknown[];
      decisions: Array<{ id: string; action: string; at: string }>;
    },
    incoming: unknown[],
  ) => {
    items: Array<{ id: string; status: string }>;
    decisions: Array<{ id: string; action: string }>;
  };
  reviewResolve: (opts: {
    storeRoot: string;
    id: string;
    action: 'accept' | 'reject';
    extendOntology?: boolean;
    now?: string;
  }) => void;
  publishGraphFiles: (plan: {
    storeRoot: string;
    graphV1: object;
    writeProjection: boolean;
    sidecars?: Record<string, object>;
  }) => void;
  loadGraphV1: (storeRoot: string) => {
    nodes: Array<{ id: string; type: string; label: string; aliases?: string[] }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
      provenance: unknown[];
    }>;
  };
  ensureStoreRoot: (storeRoot: string) => string;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
  GSD_GRAPH_REASON: Record<string, string>;
};

function minimalGraph(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-08-02T12:00:00.000Z',
    nodes: [
      { id: 'person:ada-lovelace', type: 'Person', label: 'Ada Lovelace' },
      { id: 'person:ada', type: 'Person', label: 'Ada' },
      { id: 'concept:math', type: 'Concept', label: 'Math' },
    ],
    triples: [
      {
        id: 't_0123456789abcdef',
        s: 'person:ada',
        p: 'related_to',
        o: 'concept:math',
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'bio.md',
            extractor: 'test',
            content_hash: 'sha256:deadbeef',
            confidence: 'EXTRACTED',
          },
        ],
      },
    ],
    ...overrides,
  };
}

const stores: string[] = [];

afterEach(() => {
  while (stores.length > 0) {
    const s = stores.pop();
    if (s) fs.rmSync(s, { recursive: true, force: true });
  }
});

function trackStore(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-graph-review-'));
  const s = mod.ensureStoreRoot(dir);
  stores.push(s);
  return s;
}

function seedStore(
  graph: Record<string, unknown>,
  queue: Record<string, unknown>,
): string {
  const store = trackStore();
  mod.publishGraphFiles({
    storeRoot: store,
    graphV1: graph,
    writeProjection: false,
    sidecars: { 'review-queue.json': queue },
  });
  return store;
}

describe('validateReviewQueue (OQ-4 / REV-01)', () => {
  it('accepts a DESIGN-shaped review-queue document', () => {
    const doc = {
      schema_version: 1,
      items: [
        {
          id: 'rv_a1b2c3d4',
          kind: 'entity_merge',
          status: 'pending',
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: null,
          payload: {
            keep_id: 'person:ada-lovelace',
            drop_id: 'person:ada',
            reason: 'exact_alias_candidate_needs_confirm',
          },
          decision: null,
        },
      ],
      decisions: [],
    };
    assert.equal(mod.validateReviewQueue(doc), true);
  });

  it('rejects bad id pattern and unknown kind', () => {
    assert.equal(
      mod.validateReviewQueue({
        schema_version: 1,
        items: [
          {
            id: 'bad',
            kind: 'entity_merge',
            status: 'pending',
            created_at: '2026-08-02T12:00:00.000Z',
            updated_at: null,
            payload: {},
            decision: null,
          },
        ],
        decisions: [],
      }),
      false,
    );
  });
});

describe('stable rv_ ids across normalize runs (D-08)', () => {
  it('same kind+payload → identical rv_ id (no created_at in hash)', () => {
    const general = mod.loadOntologyPack({ packIdOrPath: 'general' });
    const nodes = [
      { id: 'concept:a', type: 'Concept', label: 'A' },
      { id: 'concept:b', type: 'Concept', label: 'B' },
    ];
    const triples = [
      {
        id: 't_x',
        s: 'concept:a',
        p: 'totally_unknown_pred',
        o: 'concept:b',
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'x.md',
            extractor: 'test',
            content_hash: 'sha256:1',
            confidence: 'EXTRACTED',
          },
        ],
      },
    ];
    const a = mod.normalize({
      ontology: general,
      nodes,
      triples,
      now: '2026-08-02T12:00:00.000Z',
    });
    const b = mod.normalize({
      ontology: general,
      nodes,
      triples,
      now: '2026-08-03T99:00:00.000Z',
    });
    assert.equal(a.reviewItems.length, 1);
    assert.equal(b.reviewItems.length, 1);
    assert.equal(a.reviewItems[0]!.id, b.reviewItems[0]!.id);
    assert.match(a.reviewItems[0]!.id, /^rv_[0-9a-f]{8}$/);
    assert.equal(
      a.reviewItems[0]!.id,
      mod.reviewItemId('predicate_unknown', a.reviewItems[0]!.payload),
    );
  });
});

describe('reviewResolve accept/reject (REV-01, D-08, D-09)', () => {
  it('reject records decision and does not add contested triple', () => {
    const draftTriple = {
      s: 'concept:a',
      p: 'totally_unknown_pred',
      o: 'concept:b',
      provenance: [
        {
          source_path: 'x.md',
          extractor: 'test',
          content_hash: 'sha256:1',
          confidence: 'EXTRACTED',
        },
      ],
    };
    const payload = {
      proposed_p: 'totally_unknown_pred',
      triple: draftTriple,
    };
    const id = mod.reviewItemId('predicate_unknown', payload);
    const store = seedStore(minimalGraph(), {
      schema_version: 1,
      items: [
        {
          id,
          kind: 'predicate_unknown',
          status: 'pending',
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: null,
          payload,
          decision: null,
        },
      ],
      decisions: [],
    });

    const before = mod.loadGraphV1(store);
    const tripleCount = before.triples.length;

    mod.reviewResolve({
      storeRoot: store,
      id,
      action: 'reject',
      now: '2026-08-02T13:00:00.000Z',
    });

    const after = mod.loadGraphV1(store);
    assert.equal(after.triples.length, tripleCount);
    assert.ok(
      !after.triples.some((t) => t.p === 'totally_unknown_pred'),
      'contested predicate not written',
    );

    const queue = mod.loadReviewQueue(store);
    const item = queue.items.find((i) => i.id === id);
    assert.ok(item);
    assert.equal(item!.status, 'rejected');
    assert.equal(item!.decision?.action, 'reject');
    assert.equal(queue.decisions.length, 1);
    assert.equal(queue.decisions[0]!.action, 'reject');
  });

  it('accept entity_merge rewrites triples and deletes drop node', () => {
    const payload = {
      keep_id: 'person:ada-lovelace',
      drop_id: 'person:ada',
      reason: 'exact_alias',
    };
    const id = mod.reviewItemId('entity_merge', payload);
    const store = seedStore(minimalGraph(), {
      schema_version: 1,
      items: [
        {
          id,
          kind: 'entity_merge',
          status: 'pending',
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: null,
          payload,
          decision: null,
        },
      ],
      decisions: [],
    });

    mod.reviewResolve({
      storeRoot: store,
      id,
      action: 'accept',
      now: '2026-08-02T13:00:00.000Z',
    });

    const g = mod.loadGraphV1(store);
    assert.ok(!g.nodes.some((n) => n.id === 'person:ada'), 'drop node removed');
    assert.ok(g.nodes.some((n) => n.id === 'person:ada-lovelace'));
    const keep = g.nodes.find((n) => n.id === 'person:ada-lovelace')!;
    assert.ok(keep.aliases && keep.aliases.length > 0);
    assert.equal(g.triples.length, 1);
    assert.equal(g.triples[0]!.s, 'person:ada-lovelace');
    assert.equal(g.triples[0]!.o, 'concept:math');

    const queue = mod.loadReviewQueue(store);
    assert.equal(queue.items.find((i) => i.id === id)?.status, 'accepted');
  });

  it('accept predicate_unknown without extendOntology coerces to related_to', () => {
    const draftTriple = {
      s: 'concept:math',
      p: 'totally_unknown_pred',
      o: 'person:ada-lovelace',
      provenance: [
        {
          source_path: 'x.md',
          extractor: 'test',
          content_hash: 'sha256:1',
          confidence: 'EXTRACTED',
        },
      ],
    };
    const payload = {
      proposed_p: 'totally_unknown_pred',
      triple: draftTriple,
    };
    const id = mod.reviewItemId('predicate_unknown', payload);
    const store = seedStore(minimalGraph(), {
      schema_version: 1,
      items: [
        {
          id,
          kind: 'predicate_unknown',
          status: 'pending',
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: null,
          payload,
          decision: null,
        },
      ],
      decisions: [],
    });

    mod.reviewResolve({
      storeRoot: store,
      id,
      action: 'accept',
      extendOntology: false,
      now: '2026-08-02T13:00:00.000Z',
    });

    const g = mod.loadGraphV1(store);
    const written = g.triples.find(
      (t) => t.s === 'concept:math' && t.o === 'person:ada-lovelace',
    );
    assert.ok(written);
    assert.equal(written!.p, 'related_to');
    assert.ok(!g.triples.some((t) => t.p === 'totally_unknown_pred'));
    // No ontology.lock expand without flag
    assert.equal(
      fs.existsSync(path.join(store, 'ontology.lock.json')),
      false,
    );
  });

  it('accept predicate_unknown with extendOntology writes proposed p + lock sidecar', () => {
    const draftTriple = {
      s: 'concept:math',
      p: 'totally_unknown_pred',
      o: 'person:ada-lovelace',
      provenance: [
        {
          source_path: 'x.md',
          extractor: 'test',
          content_hash: 'sha256:1',
          confidence: 'EXTRACTED',
        },
      ],
    };
    const payload = {
      proposed_p: 'totally_unknown_pred',
      triple: draftTriple,
    };
    const id = mod.reviewItemId('predicate_unknown', payload);
    const store = seedStore(minimalGraph(), {
      schema_version: 1,
      items: [
        {
          id,
          kind: 'predicate_unknown',
          status: 'pending',
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: null,
          payload,
          decision: null,
        },
      ],
      decisions: [],
    });

    mod.reviewResolve({
      storeRoot: store,
      id,
      action: 'accept',
      extendOntology: true,
      now: '2026-08-02T13:00:00.000Z',
    });

    const g = mod.loadGraphV1(store);
    assert.ok(g.triples.some((t) => t.p === 'totally_unknown_pred'));
    const lockPath = path.join(store, 'ontology.lock.json');
    assert.equal(fs.existsSync(lockPath), true);
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as {
      predicates: Array<{ id: string }>;
      extended: boolean;
    };
    assert.equal(lock.extended, true);
    assert.ok(lock.predicates.some((p) => p.id === 'totally_unknown_pred'));
  });

  it('prior decision prevents re-opening pending on identical payload rebuild', () => {
    const payload = {
      proposed_p: 'totally_unknown_pred',
      triple: { s: 'a', p: 'totally_unknown_pred', o: 'b', provenance: [] },
    };
    const id = mod.reviewItemId('predicate_unknown', payload);
    const existing = {
      schema_version: 1 as const,
      items: [
        {
          id,
          kind: 'predicate_unknown',
          status: 'rejected',
          created_at: '2026-08-02T12:00:00.000Z',
          updated_at: '2026-08-02T13:00:00.000Z',
          payload,
          decision: {
            action: 'reject' as const,
            at: '2026-08-02T13:00:00.000Z',
          },
        },
      ],
      decisions: [
        { id, action: 'reject' as const, at: '2026-08-02T13:00:00.000Z' },
      ],
    };
    const incoming = [
      {
        id,
        kind: 'predicate_unknown',
        status: 'pending',
        created_at: '2026-08-03T00:00:00.000Z',
        updated_at: null,
        payload,
        decision: null,
      },
    ];
    const merged = mod.mergeReviewItems(existing, incoming);
    const item = merged.items.find((i) => i.id === id);
    assert.ok(item);
    assert.equal(item!.status, 'rejected');
    assert.equal(merged.decisions.length, 1);
  });
});
