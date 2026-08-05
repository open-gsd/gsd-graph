// gsd-graph — conflict review kind, supersession, provenance timestamps

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  build: (opts: { corpus: string; dir?: string; ontology?: string }) => {
    review_pending: number;
  };
  loadGraphV1: (storeRoot: string) => {
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      supersedes?: string[];
      superseded_by?: string[];
      provenance: Array<{ first_seen?: string; last_seen?: string }>;
    }>;
  };
  loadReviewQueue: (storeRoot: string) => {
    items: Array<{ kind: string; status: string; payload: Record<string, unknown> }>;
  };
  supersede: (opts: {
    dir?: string;
    winner: string;
    loser: string;
  }) => { winner: string; loser: string };
  reviewResolve: (opts: {
    storeRoot: string;
    id: string;
    action: 'accept' | 'reject';
  }) => void;
  packSubgraph: (opts: { question: string; graph: object; budget?: number }) => {
    citations: Array<{ triple_id: string; superseded?: boolean }>;
  };
  packRelevanceScore: (t: object, d: Map<string, number>) => number;
  clearGraphV1Cache: () => void;
  GsdGraph: { open: (o: { dir: string }) => { ask: (q: string) => { answer_markdown: string } } };
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildStore(markdown: string): { cwd: string; store: string } {
  const cwd = tempDir('gsd-conflict-');
  const corpus = path.join(cwd, 'docs');
  fs.mkdirSync(corpus, { recursive: true });
  fs.writeFileSync(path.join(corpus, 'a.md'), markdown, 'utf8');
  const store = path.join(cwd, '.gsd-graph');
  mod.build({ corpus, dir: store, ontology: 'engineering' });
  return { cwd, store };
}

describe('conflict review kind', () => {
  it('reciprocal directional edges produce a pending conflict item', () => {
    const { cwd, store } = buildStore(
      '# Doc\n\n[[Alpha]] --depends_on--> [[Beta]]\n[[Beta]] --depends_on--> [[Alpha]]\n',
    );
    try {
      const queue = mod.loadReviewQueue(store);
      const conflict = queue.items.find((i) => i.kind === 'conflict');
      assert.ok(conflict, 'expected conflict item');
      assert.equal(conflict.status, 'pending');
      assert.equal(conflict.payload.reason, 'reciprocal_cycle');
      assert.equal(conflict.payload.p, 'depends_on');
      // Both triples still written — surfacing, not suppression
      const graph = mod.loadGraphV1(store);
      const deps = graph.triples.filter((t) => t.p === 'depends_on');
      assert.equal(deps.length, 2);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports + contradicts on same endpoints is flagged', () => {
    // general pack carries both supports and contradicts
    const cwd = tempDir('gsd-conflict-general-');
    const corpus = path.join(cwd, 'docs');
    fs.mkdirSync(corpus, { recursive: true });
    fs.writeFileSync(
      path.join(corpus, 'a.md'),
      '# Doc\n\n[[A]] --supports--> [[B]]\n[[A]] --contradicts--> [[B]]\n',
      'utf8',
    );
    const store = path.join(cwd, '.gsd-graph');
    mod.build({ corpus, dir: store, ontology: 'general' });
    try {
      const queue = mod.loadReviewQueue(store);
      const conflict = queue.items.find(
        (i) => i.kind === 'conflict' && i.payload.reason === 'opposing_predicates',
      );
      assert.ok(conflict, 'expected opposing_predicates conflict');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('provenance timestamps', () => {
  it('build stamps first_seen/last_seen on provenance entries', () => {
    const { cwd, store } = buildStore(
      '# Doc\n\n[[Alpha]] --causes--> [[Beta]]\n',
    );
    try {
      const graph = mod.loadGraphV1(store);
      const t = graph.triples.find((x) => x.p === 'causes');
      assert.ok(t);
      assert.ok(t.provenance[0]?.first_seen, 'first_seen stamped');
      assert.ok(t.provenance[0]?.last_seen, 'last_seen stamped');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('supersede', () => {
  it('records winner/loser, survives reload, flags citations, ranks lower', () => {
    const { cwd, store } = buildStore(
      '# Doc\n\n[[Alpha]] --depends_on--> [[Beta]]\n[[Alpha]] --depends_on--> [[Gamma]]\n',
    );
    try {
      const graph1 = mod.loadGraphV1(store);
      const [t1, t2] = graph1.triples.filter((t) => t.p === 'depends_on');
      assert.ok(t1 && t2);

      mod.supersede({ dir: store, winner: t1.id, loser: t2.id });
      mod.clearGraphV1Cache();

      const graph2 = mod.loadGraphV1(store);
      const winner = graph2.triples.find((t) => t.id === t1.id);
      const loser = graph2.triples.find((t) => t.id === t2.id);
      assert.deepEqual(winner?.supersedes, [t2.id]);
      assert.deepEqual(loser?.superseded_by, [t1.id]);

      // Ranking: superseded EXTRACTED drops a full tier
      const d = new Map<string, number>([[loser!.s, 0]]);
      const fresh = mod.packRelevanceScore(winner!, d);
      const stale = mod.packRelevanceScore(loser!, d);
      assert.ok(fresh - stale >= 100, 'superseded ranks a tier lower');

      // Citations flag it
      const pack = mod.packSubgraph({
        question: 'alpha beta gamma dependencies?',
        graph: graph2,
      });
      const staleCite = pack.citations.find((c) => c.triple_id === t2.id);
      assert.equal(staleCite?.superseded, true);

      // Rendered answer shows the flag
      const g = mod.GsdGraph.open({ dir: store });
      const ans = g.ask('alpha beta gamma dependencies?');
      assert.match(ans.answer_markdown, /superseded/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('conflict accept is record-only (graph untouched)', () => {
    const { cwd, store } = buildStore(
      '# Doc\n\n[[Alpha]] --depends_on--> [[Beta]]\n[[Beta]] --depends_on--> [[Alpha]]\n',
    );
    try {
      const before = mod.loadGraphV1(store).triples.length;
      const queue = mod.loadReviewQueue(store);
      const conflict = queue.items.find((i) => i.kind === 'conflict') as
        | { id: string }
        | undefined;
      assert.ok(conflict);
      mod.reviewResolve({
        storeRoot: store,
        id: (conflict as { id: string }).id,
        action: 'accept',
      });
      mod.clearGraphV1Cache();
      assert.equal(mod.loadGraphV1(store).triples.length, before);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
