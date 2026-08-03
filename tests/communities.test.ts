// gsd-graph — community detection tests (COM-01, D-01..D-03, D-05, D-10)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  detectCommunities: (opts?: {
    graph?: unknown;
    write?: boolean;
    maxIterations?: number;
    minSize?: number;
    dir?: string;
  }) => {
    communities: Array<{
      id: string;
      stable_key: string;
      label: string;
      members: string[];
      size: number;
      internal_triple_count: number;
      top_predicates: Array<{ p: string; count: number }>;
      top_nodes: Array<{ id: string; label: string; degree: number }>;
    }>;
    iterations: number;
    stopped_reason: 'converged' | 'max_iterations';
    nodes_considered: number;
    edges_considered: number;
    dropped_small_count: number;
  };
  COMMUNITY_MAX_ITERATIONS: number;
  COMMUNITY_MIN_SIZE: number;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
};

function provenance(conf: string) {
  return [
    {
      source_path: 'fixture://communities',
      extractor: 'test',
      content_hash: 'sha256:test',
      confidence: conf,
    },
  ];
}

function triple(
  s: string,
  p: string,
  o: string,
  confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS',
) {
  return {
    id: mod.tripleId(s, p, o),
    s,
    p,
    o,
    confidence,
    provenance: provenance(confidence),
  };
}

function baseDoc(
  nodes: Array<{ id: string; type: string; label: string }>,
  triples: ReturnType<typeof triple>[],
) {
  return {
    schema_version: 1 as const,
    engine: 'gsd-graph' as const,
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1.0.0',
    built_at: '2026-08-03T00:00:00.000Z',
    nodes,
    triples,
  };
}

/** Clique A (a1–a3) + Clique B (b1–b3), EXTRACTED mutual edges. */
function twoCliquesGraph(opts?: {
  ambiguousBridge?: boolean;
  extraDyad?: boolean;
}) {
  const a1 = 'concept:a1';
  const a2 = 'concept:a2';
  const a3 = 'concept:a3';
  const b1 = 'concept:b1';
  const b2 = 'concept:b2';
  const b3 = 'concept:b3';

  const nodes = [
    { id: a1, type: 'Concept', label: 'A1' },
    { id: a2, type: 'Concept', label: 'A2' },
    { id: a3, type: 'Concept', label: 'A3' },
    { id: b1, type: 'Concept', label: 'B1' },
    { id: b2, type: 'Concept', label: 'B2' },
    { id: b3, type: 'Concept', label: 'B3' },
  ];

  const triples = [
    triple(a1, 'related_to', a2, 'EXTRACTED'),
    triple(a2, 'related_to', a3, 'EXTRACTED'),
    triple(a3, 'related_to', a1, 'EXTRACTED'),
    triple(b1, 'related_to', b2, 'EXTRACTED'),
    triple(b2, 'related_to', b3, 'EXTRACTED'),
    triple(b3, 'related_to', b1, 'EXTRACTED'),
  ];

  if (opts?.ambiguousBridge) {
    triples.push(triple(a1, 'maybe_related', b1, 'AMBIGUOUS'));
  }

  if (opts?.extraDyad) {
    const d1 = 'concept:d1';
    const d2 = 'concept:d2';
    nodes.push(
      { id: d1, type: 'Concept', label: 'D1' },
      { id: d2, type: 'Concept', label: 'D2' },
    );
    triples.push(triple(d1, 'related_to', d2, 'EXTRACTED'));
  }

  return {
    graph: baseDoc(nodes, triples),
    ids: { a1, a2, a3, b1, b2, b3 },
  };
}

describe('community constants', () => {
  it('exports D-02 defaults max 20 iters and min size 3', () => {
    assert.equal(mod.COMMUNITY_MAX_ITERATIONS, 20);
    assert.equal(mod.COMMUNITY_MIN_SIZE, 3);
  });
});

describe('detectCommunities two-clique (COM-01 tracer)', () => {
  it('returns two communities partitioning a* vs b* with c_NNNN ids', () => {
    const { graph, ids } = twoCliquesGraph();
    const result = mod.detectCommunities({ graph, write: false });

    assert.equal(result.communities.length, 2);
    assert.ok(result.iterations >= 1 && result.iterations <= 20);
    assert.ok(
      result.stopped_reason === 'converged' ||
        result.stopped_reason === 'max_iterations',
    );
    assert.equal(result.nodes_considered, 6);
    assert.ok(result.edges_considered >= 6);

    for (const c of result.communities) {
      assert.ok(c.size >= 3);
      assert.match(c.id, /^c_\d{4}$/);
      assert.match(c.stable_key, /^[0-9a-f]{16}$/);
      assert.ok(Array.isArray(c.members));
      assert.equal(c.members.length, c.size);
    }

    const idsSorted = result.communities.map((c) => c.id).sort();
    assert.deepEqual(idsSorted, ['c_0001', 'c_0002']);

    const memberSets = result.communities.map((c) => new Set(c.members));
    const aMembers = [ids.a1, ids.a2, ids.a3];
    const bMembers = [ids.b1, ids.b2, ids.b3];

    const aCommunity = memberSets.find((s) => aMembers.every((m) => s.has(m)));
    const bCommunity = memberSets.find((s) => bMembers.every((m) => s.has(m)));
    assert.ok(aCommunity, 'clique A members share a community');
    assert.ok(bCommunity, 'clique B members share a community');
    assert.notEqual(aCommunity, bCommunity);

    for (const m of aMembers) {
      assert.ok(!bCommunity!.has(m), 'no cross-clique membership into B');
    }
    for (const m of bMembers) {
      assert.ok(!aCommunity!.has(m), 'no cross-clique membership into A');
    }
  });

  it('includes copyright header on communities.ts source', () => {
    const src = fs.readFileSync(
      path.join(root, 'src', 'pipeline', 'communities.ts'),
      'utf8',
    );
    assert.match(src, /Copyright \(c\) 2026 Jeremy McSpadden/);
    assert.match(src, /gsd-graph/);
  });
});
