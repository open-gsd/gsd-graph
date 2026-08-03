// gsd-graph — offline golden scenarios G0/G1/G2 (GOLD-01, GOLD-02, GOLD-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'corpus');

/** Typed multi-hop predicates that free prose must never invent (GOLD-01 / D-07). */
const TYPED_MULTI_HOP = new Set([
  'causes',
  'supports',
  'contradicts',
  'precedes',
  'depends_on',
]);

const MULTI_HOP_QUESTION = 'why does drought cause food shortage?';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  nodeId: (type: string, label: string) => string;
  packSubgraph: (opts: {
    question: string;
    dir?: string;
    graph?: unknown;
    hops?: number;
    kSeeds?: number;
    budget?: number | null;
  }) => {
    question: string;
    seeds: string[];
    nodes: Array<{ id: string }>;
    triples: Array<{ id: string; s: string; p: string; o: string }>;
    paths: Array<{ nodes: string[]; predicates: string[] }>;
    citations: Array<{
      triple_id: string;
      s: string;
      p: string;
      o: string;
      source_path?: string;
    }>;
    trimmed: string | null;
    budget_tokens: number | null;
  };
  answer: (opts: {
    question: string;
    dir?: string;
    graph?: unknown;
    hops?: number;
    kSeeds?: number;
    budget?: number | null;
  }) => {
    pack: {
      paths: Array<{ nodes: string[]; predicates: string[] }>;
      triples: Array<{ id: string; p: string }>;
      citations: Array<{ triple_id: string; p: string }>;
    };
    answer_markdown: string;
    mode: 'deterministic' | 'prompt_pending' | 'http' | 'abstain';
    abstained: boolean;
    abstain_reason?: string;
  };
  query: (opts: Record<string, unknown>) => {
    paths: Array<{ nodes: string[]; predicates: string[] }>;
    triples: Array<{ p: string }>;
  };
  build: (opts: {
    corpus: string | string[];
    dir?: string;
    ontology?: string;
    full?: boolean;
    writeProjection?: boolean;
  }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
  };
  init: (opts: { dir?: string; cwd?: string }) => { store_dir: string };
  loadGraphV1: (storeRoot: string) => {
    nodes: Array<{ id: string }>;
    triples: Array<{ p: string }>;
  };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/**
 * Isolated store + single-fixture corpus (Pattern 4 / pitfall 6).
 * Never mix free-prose.md with multi-hop.jsonl in the same G0/G1 corpus.
 */
function buildIsolatedCorpus(
  fixtureName: string,
  prefix: string,
): { store: string; corpus: string } {
  const store = tempDir(`${prefix}-store-`);
  const corpus = tempDir(`${prefix}-corpus-`);
  fs.copyFileSync(path.join(fixtures, fixtureName), path.join(corpus, fixtureName));
  mod.init({ dir: store, cwd: store });
  mod.build({ corpus, dir: store, full: true, writeProjection: false });
  return { store, corpus };
}

function hasTypedMultiHopPath(
  paths: Array<{ nodes: string[]; predicates: string[] }>,
): boolean {
  return paths.some((p) => p.predicates.some((pred) => TYPED_MULTI_HOP.has(pred)));
}

// ---------------------------------------------------------------------------
// G0 — GOLD-01 / D-07: free-prose alone must not invent multi-hop edges
// ---------------------------------------------------------------------------
// Offline only (D-05, D-12): no network, no API keys. about edges allowed.
// Pass = abstained OR no path using causes|supports|contradicts|precedes|depends_on.

describe('G0 free-prose honesty (GOLD-01, D-07)', () => {
  it('isolated free-prose.md pack/answer abstains or has no typed multi-hop path', () => {
    const { store } = buildIsolatedCorpus('free-prose.md', 'gsd-g0');

    // Sanity: build produced about-only (or empty typed multi-hop) graph
    const v1 = mod.loadGraphV1(store);
    const typedFromBuild = v1.triples.filter((t) => TYPED_MULTI_HOP.has(t.p));
    assert.equal(
      typedFromBuild.length,
      0,
      'free-prose extract must not invent typed multi-hop triples',
    );

    const pack = mod.packSubgraph({
      dir: store,
      question: MULTI_HOP_QUESTION,
    });
    const ans = mod.answer({
      dir: store,
      question: MULTI_HOP_QUESTION,
    });

    const noTypedPath = !hasTypedMultiHopPath(pack.paths);
    const honesty = ans.abstained === true || noTypedPath;
    assert.ok(
      honesty,
      'G0: free-prose must abstain or expose no typed multi-hop path (D-07)',
    );

    // Prefer strong honesty when pack has no multi-hop relationship surface
    if (!hasTypedMultiHopPath(pack.paths) && pack.triples.every((t) => !TYPED_MULTI_HOP.has(t.p))) {
      assert.equal(ans.mode, 'abstain');
      assert.equal(ans.abstained, true);
    }

    // Must not invent a causes chain in markdown from free prose
    assert.doesNotMatch(ans.answer_markdown, /—causes→/);
    assert.doesNotMatch(ans.answer_markdown, /-causes→/);
  });

  it('G0 corpus dir contains only free-prose.md (pitfall 6 isolation)', () => {
    const { corpus } = buildIsolatedCorpus('free-prose.md', 'gsd-g0-iso');
    const names = fs.readdirSync(corpus).sort();
    assert.deepEqual(names, ['free-prose.md']);
  });
});

// ---------------------------------------------------------------------------
// G1 — GOLD-02 / D-08: multi-hop.jsonl yields cited causes path ≥3 nodes
// ---------------------------------------------------------------------------

describe('G1 multi-hop causes path (GOLD-02, D-08)', () => {
  it('isolated multi-hop.jsonl pack has ≥3-node causes path and cited answer', () => {
    const { store } = buildIsolatedCorpus('multi-hop.jsonl', 'gsd-g1');

    const drought = mod.nodeId('Concept', 'Drought');
    const food = mod.nodeId('Concept', 'Food Shortage');

    const pack = mod.packSubgraph({
      dir: store,
      question: MULTI_HOP_QUESTION,
    });

    assert.ok(pack.paths.length >= 1, 'G1: pack.paths.length ≥ 1');
    const longCauses = pack.paths.some(
      (p) => p.nodes.length >= 3 && p.predicates.includes('causes'),
    );
    assert.ok(longCauses, 'G1: some path has ≥3 nodes and causes');

    // Optional cross-check: path endpoints include drought / food-shortage ids
    const pathTouchesChain = pack.paths.some(
      (p) => p.nodes.includes(drought) && p.nodes.includes(food),
    );
    assert.ok(pathTouchesChain, 'G1: path should connect Drought and Food Shortage');

    assert.ok(
      pack.citations.some((c) => c.p === 'causes'),
      'G1: citations include causes',
    );

    // Citations ⊆ pack triples (ANS-01)
    const tripleIds = new Set(pack.triples.map((t) => t.id));
    for (const c of pack.citations) {
      assert.ok(tripleIds.has(c.triple_id), `citation ${c.triple_id} not in pack triples`);
    }

    const ans = mod.answer({
      dir: store,
      question: MULTI_HOP_QUESTION,
    });
    assert.equal(ans.abstained, false);
    assert.equal(ans.mode, 'deterministic');
    assert.match(ans.answer_markdown, /causes/);
  });

  it('G1 corpus dir contains only multi-hop.jsonl (pitfall 6 isolation)', () => {
    const { corpus } = buildIsolatedCorpus('multi-hop.jsonl', 'gsd-g1-iso');
    const names = fs.readdirSync(corpus).sort();
    assert.deepEqual(names, ['multi-hop.jsonl']);
  });
});

// G2 cheap + G3/G4 coverage notes land in Task 2 (GOLD-03 / D-09).
