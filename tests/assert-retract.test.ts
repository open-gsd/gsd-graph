// gsd-graph — assert/retract write path + episode replay tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  build: (opts: { corpus: string; dir?: string; full?: boolean; ontology?: string }) => {
    triple_count: number;
  };
  assertFact: (opts: {
    dir?: string;
    s: string;
    p: string;
    o: string;
    confidence?: string;
    note?: string;
    supersedes?: string;
    actor?: string;
  }) => {
    triple_id: string;
    gated_to_review: boolean;
    created_nodes: string[];
    review_pending: number;
  };
  retractFact: (opts: { dir?: string; tripleId: string; note?: string }) => {
    removed: boolean;
  };
  loadGraphV1: (storeRoot: string) => {
    nodes: Array<{ id: string }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      supersedes?: string[];
      provenance: Array<{ source_path: string; extractor: string }>;
    }>;
  };
  loadReviewQueue: (storeRoot: string) => {
    items: Array<{ kind: string; status: string }>;
  };
  clearGraphV1Cache: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tools = require(path.join(root, 'dist', 'mcp', 'tools.js')) as {
  handleToolCall: (
    name: string,
    args: Record<string, unknown>,
    opts?: { allowAssert?: boolean; defaultDir?: string },
  ) => Promise<{
    content: Array<{ text: string }>;
    isError?: boolean;
  }>;
  listRegisteredToolNames: (opts?: { allowAssert?: boolean }) => string[];
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedStore(): { cwd: string; store: string; corpus: string } {
  const cwd = tempDir('gsd-assert-');
  const corpus = path.join(cwd, 'docs');
  fs.mkdirSync(corpus, { recursive: true });
  fs.writeFileSync(
    path.join(corpus, 'a.md'),
    '# Doc\n\n[[Alpha]] --causes--> [[Beta]]\n',
    'utf8',
  );
  const store = path.join(cwd, '.gsd-graph');
  mod.build({ corpus, dir: store });
  return { cwd, store, corpus };
}

describe('assertFact', () => {
  it('asserts a fact with episode provenance; survives full rebuild', () => {
    const { cwd, store, corpus } = seedStore();
    try {
      const res = mod.assertFact({
        dir: store,
        s: 'Alpha',
        p: 'supports',
        o: 'delta feature',
        note: 'learned in session',
      });
      assert.equal(res.gated_to_review, false);
      assert.ok(res.created_nodes.includes('Concept:delta-feature'));

      mod.clearGraphV1Cache();
      let graph = mod.loadGraphV1(store);
      const t = graph.triples.find((x) => x.id === res.triple_id);
      assert.ok(t, 'asserted triple published');
      assert.equal(t?.provenance[0]?.source_path, 'episodes.jsonl');
      assert.equal(t?.provenance[0]?.extractor, 'user/assert');

      // Full rebuild replays the episode — fact survives
      mod.build({ corpus, dir: store, full: true });
      mod.clearGraphV1Cache();
      graph = mod.loadGraphV1(store);
      assert.ok(
        graph.triples.some((x) => x.id === res.triple_id),
        'assert survives full rebuild',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('unknown predicate is gated to the review queue, not silently written', () => {
    const { cwd, store } = seedStore();
    try {
      const res = mod.assertFact({
        dir: store,
        s: 'Alpha',
        p: 'zzz_made_up_predicate',
        o: 'Beta',
      });
      assert.equal(res.gated_to_review, true);
      assert.ok(res.review_pending > 0);
      const queue = mod.loadReviewQueue(store);
      assert.ok(
        queue.items.some(
          (i) => i.kind === 'predicate_unknown' && i.status === 'pending',
        ),
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('retractFact', () => {
  it('removes the triple now and rebuilds honor the retraction', () => {
    const { cwd, store, corpus } = seedStore();
    try {
      mod.clearGraphV1Cache();
      const graph = mod.loadGraphV1(store);
      const target = graph.triples.find((t) => t.p === 'causes');
      assert.ok(target);

      const res = mod.retractFact({
        dir: store,
        tripleId: target!.id,
        note: 'doc was wrong',
      });
      assert.equal(res.removed, true);
      mod.clearGraphV1Cache();
      assert.ok(
        !mod.loadGraphV1(store).triples.some((t) => t.id === target!.id),
      );

      // Full rebuild re-extracts the doc, but the retraction episode wins
      mod.build({ corpus, dir: store, full: true });
      mod.clearGraphV1Cache();
      assert.ok(
        !mod.loadGraphV1(store).triples.some((t) => t.id === target!.id),
        'retraction holds across rebuild',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('assert with supersedes records the reversal', () => {
    const { cwd, store } = seedStore();
    try {
      mod.clearGraphV1Cache();
      const target = mod.loadGraphV1(store).triples.find((t) => t.p === 'causes');
      assert.ok(target);
      const res = mod.assertFact({
        dir: store,
        s: 'Alpha',
        p: 'contradicts',
        o: 'Beta',
        supersedes: target!.id,
      });
      mod.clearGraphV1Cache();
      const graph = mod.loadGraphV1(store);
      const winner = graph.triples.find((t) => t.id === res.triple_id);
      assert.deepEqual(winner?.supersedes, [target!.id]);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('MCP graph_assert / graph_retract gates', () => {
  it('refused without the allow-assert gate; works with it', async () => {
    const { cwd, store } = seedStore();
    try {
      const refused = await tools.handleToolCall('graph_assert', {
        s: 'Alpha',
        p: 'supports',
        o: 'Gamma',
        dir: store,
      });
      assert.equal(refused.isError, true);

      const ok = await tools.handleToolCall(
        'graph_assert',
        { s: 'Alpha', p: 'supports', o: 'Gamma', dir: store },
        { allowAssert: true },
      );
      assert.ok(ok.isError !== true, ok.content[0]?.text);
      const body = JSON.parse(ok.content[0]!.text) as { triple_id: string };
      mod.clearGraphV1Cache();
      const graph = mod.loadGraphV1(store);
      const t = graph.triples.find((x) => x.id === body.triple_id);
      assert.equal(t?.provenance[0]?.extractor, 'agent/mcp');

      const names = tools.listRegisteredToolNames({ allowAssert: true });
      assert.ok(names.includes('graph_assert'));
      assert.ok(names.includes('graph_retract'));
      assert.ok(!tools.listRegisteredToolNames().includes('graph_assert'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
