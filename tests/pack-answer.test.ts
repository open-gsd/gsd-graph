// gsd-graph — packSubgraph + deterministic answer gates (PACK-01 / ANS-01 / ANS-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'corpus');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
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
    nodes: Array<{ id: string; type: string; label: string; aliases?: string[]; description?: string }>;
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
    }>;
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
    answer_markdown: string;
    mode: 'deterministic' | 'prompt_pending' | 'http' | 'abstain';
    abstained: boolean;
    abstain_reason?: string;
    prompt_bundle?: object;
  };
  GSD_GRAPH_REASON: { EMPTY_SUBGRAPH: string; [key: string]: string };
  PACK_STOPWORDS: Set<string> | ReadonlySet<string> | string[];
  tokenizeQuestion: (q: string) => string[];
  scoreSeeds: (graph: unknown, tokens: string[], kSeeds: number) => string[];
  expandHops: (
    adj: unknown,
    graph: unknown,
    seeds: Set<string>,
    hops: number,
  ) => { nodes: unknown[]; triples: unknown[] };
  applyBudget: (
    nodes: unknown[],
    triples: unknown[],
    budgetTokens: number | null | undefined,
    seedIds: Set<string>,
  ) => { nodes: unknown[]; triples: unknown[]; trimmed: string | null };
  findShortestPath: (
    adj: unknown,
    from: string,
    to: string,
    maxDepth: number,
  ) => unknown;
  query: (opts: Record<string, unknown>) => unknown;
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
  loadGraphV1: (storeRoot: string) => {
    nodes: unknown[];
    triples: unknown[];
  };
  init: (opts: { dir?: string; cwd?: string }) => { store_dir: string };
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

function provenance(conf: string, source_path = 'fixture://multi-hop') {
  return [
    {
      source_path,
      extractor: 'test',
      content_hash: 'sha256:test',
      confidence: conf,
    },
  ];
}

function multiHopGraph() {
  const drought = mod.nodeId('Concept', 'Drought');
  const crop = mod.nodeId('Concept', 'Crop Failure');
  const food = mod.nodeId('Concept', 'Food Shortage');
  const t1 = mod.tripleId(drought, 'causes', crop);
  const t2 = mod.tripleId(crop, 'causes', food);

  const nodes = [
    {
      id: drought,
      type: 'Concept',
      label: 'Drought',
      aliases: ['dry spell'],
    },
    { id: crop, type: 'Concept', label: 'Crop Failure' },
    { id: food, type: 'Concept', label: 'Food Shortage' },
  ];

  const triples = [
    {
      id: t1,
      s: drought,
      p: 'causes',
      o: crop,
      confidence: 'EXTRACTED',
      provenance: provenance('EXTRACTED'),
    },
    {
      id: t2,
      s: crop,
      p: 'causes',
      o: food,
      confidence: 'EXTRACTED',
      provenance: provenance('EXTRACTED'),
    },
  ];

  return {
    schema_version: 1 as const,
    engine: 'gsd-graph' as const,
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1.0.0',
    built_at: '2026-08-03T00:00:00.000Z',
    nodes,
    triples,
    ids: { drought, crop, food, t1, t2 },
  };
}

function scoringGraph() {
  const a = mod.nodeId('Concept', 'Alpha');
  const b = mod.nodeId('Concept', 'Beta');
  const c = mod.nodeId('Concept', 'Gamma');
  return {
    schema_version: 1 as const,
    engine: 'gsd-graph' as const,
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1.0.0',
    built_at: '2026-08-03T00:00:00.000Z',
    nodes: [
      {
        id: a,
        type: 'Concept',
        label: 'Alpha',
        description: 'mentions widget only here',
      },
      {
        id: b,
        type: 'Concept',
        label: 'Beta',
        aliases: ['widget alias'],
      },
      {
        id: c,
        type: 'Concept',
        label: 'widget label node',
      },
    ],
    triples: [],
    ids: { a, b, c },
  };
}

describe('packSubgraph multi-hop', () => {
  it('returns paths with causes and ≥3 nodes for drought→food shortage question', () => {
    const g = multiHopGraph();
    const pack = mod.packSubgraph({
      graph: g,
      question: 'why does drought cause food shortage?',
    });

    assert.equal(pack.question, 'why does drought cause food shortage?');
    assert.ok(pack.seeds.length > 0, 'expected non-empty seeds');
    assert.ok(pack.seeds.length <= 5, 'top k seeds ≤ 5');
    assert.ok(
      pack.seeds.includes(g.ids.drought) || pack.seeds.includes(g.ids.food),
      `seeds should include drought or food: ${JSON.stringify(pack.seeds)}`,
    );

    assert.ok(pack.paths.length >= 1, 'expected at least one path');
    const longPath = pack.paths.find((p) => p.nodes.length >= 3);
    assert.ok(longPath, 'expected a path with ≥3 nodes');
    assert.ok(
      longPath!.predicates.includes('causes'),
      `predicates should include causes: ${JSON.stringify(longPath!.predicates)}`,
    );

    assert.ok(pack.triples.length >= 1);
    assert.equal(pack.trimmed, null);
    assert.equal(pack.budget_tokens, null);
  });

  it('citations every triple_id is in pack.triples (D-02)', () => {
    const g = multiHopGraph();
    const pack = mod.packSubgraph({
      graph: g,
      question: 'why does drought cause food shortage?',
    });

    const tripleIds = new Set(pack.triples.map((t) => t.id));
    assert.ok(pack.citations.length > 0, 'expected citations');
    for (const c of pack.citations) {
      assert.ok(
        tripleIds.has(c.triple_id),
        `citation ${c.triple_id} missing from triples`,
      );
      assert.equal(typeof c.s, 'string');
      assert.equal(typeof c.p, 'string');
      assert.equal(typeof c.o, 'string');
    }
  });

  it('uses opts.graph without opening a store (D-10)', () => {
    const g = multiHopGraph();
    // No dir — must not attempt to load graph.v1 from disk
    const pack = mod.packSubgraph({
      graph: g,
      question: 'drought food shortage',
    });
    assert.ok(pack.seeds.length > 0);
    assert.ok(pack.triples.length >= 1);
  });

  it('loads from store via loadGraphV1 after isolated multi-hop build (D-10)', () => {
    const store = tempDir('gsd-pack-store-');
    const corpus = tempDir('gsd-pack-corpus-');
    fs.copyFileSync(
      path.join(fixtures, 'multi-hop.jsonl'),
      path.join(corpus, 'multi-hop.jsonl'),
    );
    mod.build({ corpus, dir: store, full: true, writeProjection: false });

    const pack = mod.packSubgraph({
      dir: store,
      question: 'why does drought cause food shortage?',
    });

    assert.ok(pack.seeds.length > 0);
    assert.ok(pack.paths.length >= 1);
    const longPath = pack.paths.find((p) => p.nodes.length >= 3);
    assert.ok(longPath, 'disk pack should find multi-hop causes path');
    assert.ok(longPath!.predicates.includes('causes'));
  });
});

describe('PACK_STOPWORDS and seed scoring', () => {
  it('exports the full DESIGN stopword set', () => {
    const expected = [
      'a',
      'an',
      'the',
      'and',
      'or',
      'of',
      'to',
      'in',
      'on',
      'for',
      'why',
      'how',
      'what',
      'is',
      'are',
      'did',
      'does',
      'do',
    ];
    const set =
      mod.PACK_STOPWORDS instanceof Set
        ? mod.PACK_STOPWORDS
        : new Set(mod.PACK_STOPWORDS as string[]);
    for (const w of expected) {
      assert.ok(set.has(w), `missing stopword: ${w}`);
    }
    assert.equal(set.size, expected.length, 'no extra stopwords in 0.1.0');
  });

  it('stopword-only / no-match questions yield empty pack without throw', () => {
    const g = multiHopGraph();
    const stopOnly = mod.packSubgraph({
      graph: g,
      question: 'why does the do?',
    });
    assert.deepEqual(stopOnly.seeds, []);
    assert.equal(stopOnly.triples.length, 0);
    assert.equal(stopOnly.paths.length, 0);
    assert.equal(stopOnly.citations.length, 0);
    assert.equal(stopOnly.nodes.length, 0);

    const noMatch = mod.packSubgraph({
      graph: g,
      question: 'quantum entanglement teleportation',
    });
    assert.deepEqual(noMatch.seeds, []);
    assert.equal(noMatch.triples.length, 0);
    assert.equal(noMatch.paths.length, 0);
    assert.equal(noMatch.citations.length, 0);
  });

  it('scores label +3 over alias +2 over description +1', () => {
    const g = scoringGraph();
    // token "widget": label node +3, alias node +2, description node +1
    const seeds = mod.scoreSeeds(g, ['widget'], 5);
    assert.deepEqual(seeds, [g.ids.c, g.ids.b, g.ids.a]);
  });

  it('tokenizeQuestion drops stopwords and short tokens', () => {
    const tokens = mod.tokenizeQuestion('Why does drought cause food shortage?');
    assert.ok(tokens.includes('drought'));
    assert.ok(tokens.includes('food'));
    assert.ok(tokens.includes('shortage'));
    assert.ok(!tokens.includes('why'));
    assert.ok(!tokens.includes('does'));
  });
});

describe('packSubgraph budget and expand-by-id', () => {
  it('tiny budget trims triples; citations ⊆ remaining triples', () => {
    const g = multiHopGraph();
    // Force trim: budget 1 token is below any non-empty JSON estimate
    const pack = mod.packSubgraph({
      graph: g,
      question: 'why does drought cause food shortage?',
      budget: 1,
    });

    // Either fully emptied (empty-pack shape) or trimmed with citations ⊆
    if (pack.triples.length === 0) {
      assert.equal(pack.citations.length, 0);
      assert.ok(
        pack.trimmed !== null || pack.budget_tokens === 1,
        'budget path should set trimmed or budget_tokens',
      );
      assert.equal(pack.budget_tokens, 1);
    } else {
      assert.ok(pack.trimmed !== null, 'expected trimmed non-null when triples remain under tiny budget');
      const tripleIds = new Set(pack.triples.map((t) => t.id));
      for (const c of pack.citations) {
        assert.ok(tripleIds.has(c.triple_id));
      }
      assert.equal(pack.budget_tokens, 1);
    }
  });

  it('budget that keeps some triples drops lower confidence first', () => {
    const drought = mod.nodeId('Concept', 'Drought');
    const crop = mod.nodeId('Concept', 'Crop Failure');
    const food = mod.nodeId('Concept', 'Food Shortage');
    const tAmb = mod.tripleId(drought, 'causes', crop);
    const tExt = mod.tripleId(crop, 'causes', food);

    const graph = {
      schema_version: 1 as const,
      engine: 'gsd-graph' as const,
      engine_version: '0.1.0',
      ontology_pack_id: 'general',
      ontology_version: '1.0.0',
      built_at: '2026-08-03T00:00:00.000Z',
      nodes: [
        { id: drought, type: 'Concept', label: 'Drought' },
        { id: crop, type: 'Concept', label: 'Crop Failure' },
        { id: food, type: 'Concept', label: 'Food Shortage' },
      ],
      triples: [
        {
          id: tAmb,
          s: drought,
          p: 'causes',
          o: crop,
          confidence: 'AMBIGUOUS',
          provenance: provenance('AMBIGUOUS'),
        },
        {
          id: tExt,
          s: crop,
          p: 'causes',
          o: food,
          confidence: 'EXTRACTED',
          provenance: provenance('EXTRACTED'),
        },
      ],
    };

    // Measure full size then set budget just under so one triple drops
    const full = mod.packSubgraph({
      graph,
      question: 'drought food shortage',
    });
    assert.equal(full.triples.length, 2);

    const fullTokens = Math.ceil(
      JSON.stringify({ nodes: full.nodes, triples: full.triples }).length / 4,
    );
    // Budget between one-triple and two-triple size: drop AMBIGUOUS first
    const oneTripleApprox = Math.ceil(
      JSON.stringify({
        nodes: full.nodes,
        triples: full.triples.filter((t) => t.id === tExt),
      }).length / 4,
    );
    // Use a budget that forces drop of at least one triple but preferably keeps EXTRACTED
    const budget = Math.max(1, Math.min(fullTokens - 1, oneTripleApprox + 5));

    const packed = mod.packSubgraph({
      graph,
      question: 'drought food shortage',
      budget,
    });

    if (packed.triples.length > 0 && packed.triples.length < 2) {
      assert.ok(
        packed.triples.every((t) => t.confidence !== 'AMBIGUOUS') ||
          packed.triples.some((t) => t.id === tExt),
        'AMBIGUOUS should drop before EXTRACTED when budget binds',
      );
      assert.ok(packed.trimmed !== null);
      const tripleIds = new Set(packed.triples.map((t) => t.id));
      assert.ok(packed.citations.every((c) => tripleIds.has(c.triple_id)));
    } else {
      // Budget may empty the pack or keep both if estimate fits — still no throw
      assert.equal(packed.budget_tokens, budget);
      const tripleIds = new Set(packed.triples.map((t) => t.id));
      assert.ok(packed.citations.every((c) => tripleIds.has(c.triple_id)));
    }
  });

  it('expands by seed id — shared label substrings do not re-seed via matchTermSeeds', () => {
    // Two nodes share substring "cell" in labels; only one should be a scored seed
    // for question token "alpha". Expansion must not pull extra seeds by re-matching.
    const alpha = mod.nodeId('Concept', 'Alpha Cell');
    const beta = mod.nodeId('Concept', 'Beta Cell');
    const gamma = mod.nodeId('Concept', 'Gamma');
    const t1 = mod.tripleId(alpha, 'related_to', gamma);
    const t2 = mod.tripleId(beta, 'related_to', gamma);

    const graph = {
      schema_version: 1 as const,
      engine: 'gsd-graph' as const,
      engine_version: '0.1.0',
      ontology_pack_id: 'general',
      ontology_version: '1.0.0',
      built_at: '2026-08-03T00:00:00.000Z',
      nodes: [
        { id: alpha, type: 'Concept', label: 'Alpha Cell' },
        { id: beta, type: 'Concept', label: 'Beta Cell' },
        { id: gamma, type: 'Concept', label: 'Gamma' },
      ],
      triples: [
        {
          id: t1,
          s: alpha,
          p: 'related_to',
          o: gamma,
          confidence: 'EXTRACTED',
          provenance: provenance('EXTRACTED'),
        },
        {
          id: t2,
          s: beta,
          p: 'related_to',
          o: gamma,
          confidence: 'EXTRACTED',
          provenance: provenance('EXTRACTED'),
        },
      ],
    };

    const pack = mod.packSubgraph({
      graph,
      question: 'alpha',
      hops: 1,
      kSeeds: 1,
    });

    // Only Alpha Cell scores on "alpha"; expand-by-id should not seed Beta via "cell"
    assert.deepEqual(pack.seeds, [alpha]);
    // Neighborhood of alpha includes gamma and t1; beta may appear only if path/union pulls it —
    // with single seed and hops=1, beta is not reached via expand from alpha alone.
    const nodeIds = new Set(pack.nodes.map((n) => n.id));
    assert.ok(nodeIds.has(alpha));
    assert.ok(nodeIds.has(gamma));
    assert.ok(
      !nodeIds.has(beta),
      'expand-by-id must not re-match shared "cell" substring as a seed',
    );
    assert.equal(pack.triples.length, 1);
    assert.equal(pack.triples[0]?.id, t1);
  });

  it('public composition helpers are exported for pack to reuse', () => {
    assert.equal(typeof mod.expandHops, 'function');
    assert.equal(typeof mod.applyBudget, 'function');
    assert.equal(typeof mod.findShortestPath, 'function');
    assert.equal(typeof mod.query, 'function');
    assert.equal(typeof mod.packSubgraph, 'function');
  });
});

describe('answer deterministic (ANS-01 / D-03)', () => {
  it('exports answer for multi-hop deterministic cited markdown', () => {
    assert.equal(typeof mod.answer, 'function');
  });

  it('multi-hop question returns mode deterministic, abstained false, causes in markdown', () => {
    const g = multiHopGraph();
    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
    });

    assert.equal(ans.abstained, false);
    assert.equal(ans.mode, 'deterministic');
    // Phase 5 never sets prompt_pending/http (D-05) — mode is deterministic only
    assert.notEqual(ans.mode as string, 'prompt_pending');
    assert.notEqual(ans.mode as string, 'http');
    assert.match(ans.answer_markdown, /causes/);
    assert.ok(ans.pack.triples.length >= 1);
  });

  it('answer_markdown includes Seeds / Relationships / Paths / Citations sections', () => {
    const g = multiHopGraph();
    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
    });

    const md = ans.answer_markdown;
    const seedsIdx = md.indexOf('## Seeds');
    const relIdx = md.indexOf('## Relationships');
    const pathsIdx = md.indexOf('## Paths');
    const citeIdx = md.indexOf('## Citations');
    assert.ok(seedsIdx >= 0, 'expected ## Seeds');
    assert.ok(relIdx > seedsIdx, '## Relationships after ## Seeds');
    assert.ok(pathsIdx > relIdx, '## Paths after ## Relationships');
    assert.ok(citeIdx > pathsIdx, '## Citations after ## Paths');
  });

  it('Relationships and Citations derive only from pack.triples; citation ids ⊆ triples', () => {
    const g = multiHopGraph();
    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
    });

    const pack = ans.pack;
    const tripleIds = new Set(pack.triples.map((t) => t.id));
    assert.ok(pack.citations.length > 0);
    for (const c of pack.citations) {
      assert.ok(
        tripleIds.has(c.triple_id),
        `citation ${c.triple_id} not in pack.triples`,
      );
    }

    // Every relationship line triple id must be a pack triple
    const relSection = ans.answer_markdown.split('## Relationships')[1]?.split('## Paths')[0] ?? '';
    const relIds = [...relSection.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    for (const id of relIds) {
      assert.ok(tripleIds.has(id), `relationship cites unknown triple ${id}`);
    }

    // Citation section backtick triple ids ⊆ pack
    const citeSection = ans.answer_markdown.split('## Citations')[1] ?? '';
    const citeIds = [...citeSection.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    for (const id of citeIds) {
      assert.ok(tripleIds.has(id), `markdown citation ${id} not in pack.triples`);
    }

    // Relationships only use predicates present on pack triples
    for (const t of pack.triples) {
      if (t.p === 'causes') {
        assert.match(
          ans.answer_markdown,
          new RegExp(`${escapeReg(t.s)}\\s*—${escapeReg(t.p)}→\\s*${escapeReg(t.o)}`),
        );
      }
    }
  });

  it('answer.pack matches packSubgraph for the same options (D-03)', () => {
    const g = multiHopGraph();
    const opts = {
      graph: g,
      question: 'why does drought cause food shortage?',
    };
    const pack = mod.packSubgraph(opts);
    const ans = mod.answer(opts);
    assert.deepEqual(ans.pack, pack);
  });

  it('Paths section reflects pack.paths node-predicate chains', () => {
    const g = multiHopGraph();
    const ans = mod.answer({
      graph: g,
      question: 'why does drought cause food shortage?',
    });
    assert.ok(ans.pack.paths.length >= 1);
    const longPath = ans.pack.paths.find((p) => p.nodes.length >= 3);
    assert.ok(longPath, 'expected multi-hop path');
    // Path rendering uses node -predicate→ node chains
    for (let i = 0; i < longPath!.predicates.length; i++) {
      const pred = longPath!.predicates[i]!;
      assert.match(ans.answer_markdown, new RegExp(`-${escapeReg(pred)}→`));
    }
    for (const n of longPath!.nodes) {
      assert.match(ans.answer_markdown, new RegExp(escapeReg(n)));
    }
  });
});

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
