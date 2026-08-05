// gsd-graph — community detection tests (COM-01, D-01..D-05, D-08, D-10)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.join(__dirname, '..');

type Community = {
  id: string;
  stable_key: string;
  label: string;
  members: string[];
  size: number;
  internal_triple_count: number;
  top_predicates: Array<{ p: string; count: number }>;
  top_nodes: Array<{ id: string; label: string; degree: number }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  detectCommunities: (opts?: {
    graph?: unknown;
    write?: boolean;
    maxIterations?: number;
    minSize?: number;
    dir?: string;
  }) => {
    communities: Community[];
    iterations: number;
    stopped_reason: 'converged' | 'max_iterations';
    nodes_considered: number;
    edges_considered: number;
    dropped_small_count: number;
    index_path?: string;
    report_paths?: string[];
  };
  writeCommunityReports: (opts?: {
    dir?: string;
    communities?: Community[];
  }) => {
    index_path: string;
    report_paths: string[];
  };
  COMMUNITIES_DIR: string;
  COMMUNITY_MAX_ITERATIONS: number;
  COMMUNITY_MIN_SIZE: number;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
  publishGraphFiles: (opts: {
    storeRoot: string;
    graphV1: unknown;
    writeProjection?: boolean;
  }) => void;
  ensureStoreRoot: (storeRoot: string) => string;
  loadGraphV1: (storeRoot: string) => {
    nodes: unknown[];
    triples: Array<{ id: string; s: string; p: string; o: string }>;
  };
  validateGraphV1: (data: unknown) => boolean;
  GSD_GRAPH_REASON: Record<string, string>;
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const d = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  );
  temps.push(d);
  return d;
}

function tripleIdSet(graph: { triples: Array<{ id: string }> }): string {
  return [...graph.triples.map((t) => t.id)].sort().join('\0');
}

function contentHash(filePath: string): string {
  return createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

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

  it('includes purpose header on communities.ts source', () => {
    const src = fs.readFileSync(
      path.join(root, 'src', 'pipeline', 'communities.ts'),
      'utf8',
    );
    assert.match(src, /gsd-graph/);
    assert.doesNotMatch(src, /Copyright \(c\) 2026 Jeremy McSpadden/);
  });
});

describe('confidence filter / min-size / max-iter / determinism (COM-01 expansion)', () => {
  it('AMBIGUOUS-only bridge does not merge the two cliques (D-03)', () => {
    const { graph, ids } = twoCliquesGraph({ ambiguousBridge: true });
    const result = mod.detectCommunities({ graph, write: false });

    assert.equal(result.communities.length, 2);
    // Bridge must not add an undirected community edge
    assert.equal(result.edges_considered, 6);

    const memberSets = result.communities.map((c) => new Set(c.members));
    const aOk = memberSets.some(
      (s) => s.has(ids.a1) && s.has(ids.a2) && s.has(ids.a3) && !s.has(ids.b1),
    );
    const bOk = memberSets.some(
      (s) => s.has(ids.b1) && s.has(ids.b2) && s.has(ids.b3) && !s.has(ids.a1),
    );
    assert.ok(aOk, 'clique A remains separate');
    assert.ok(bOk, 'clique B remains separate');
  });

  it('drops size-2 dyad and increments dropped_small_count (D-02)', () => {
    const { graph } = twoCliquesGraph({ extraDyad: true });
    const result = mod.detectCommunities({ graph, write: false });

    assert.equal(result.communities.length, 2);
    assert.ok(result.dropped_small_count >= 1);
    for (const c of result.communities) {
      assert.ok(!c.members.includes('concept:d1'));
      assert.ok(!c.members.includes('concept:d2'));
      assert.ok(c.size >= 3);
    }
  });

  it('maxIterations 0 or 1 still returns defined stopped_reason; caps at 20', () => {
    const { graph } = twoCliquesGraph();

    const zero = mod.detectCommunities({
      graph,
      write: false,
      maxIterations: 0,
    });
    assert.ok(
      zero.stopped_reason === 'converged' ||
        zero.stopped_reason === 'max_iterations',
    );
    assert.equal(typeof zero.iterations, 'number');
    assert.ok(zero.iterations >= 0);

    const one = mod.detectCommunities({
      graph,
      write: false,
      maxIterations: 1,
    });
    assert.ok(
      one.stopped_reason === 'converged' ||
        one.stopped_reason === 'max_iterations',
    );
    assert.ok(one.iterations <= 1);

    const huge = mod.detectCommunities({
      graph,
      write: false,
      maxIterations: 999,
    });
    assert.ok(huge.iterations <= mod.COMMUNITY_MAX_ITERATIONS);

    const neg = mod.detectCommunities({
      graph,
      write: false,
      maxIterations: -5,
    });
    // non-finite or negative → default; still bounded
    assert.ok(neg.iterations <= mod.COMMUNITY_MAX_ITERATIONS);
    assert.ok(
      neg.stopped_reason === 'converged' ||
        neg.stopped_reason === 'max_iterations',
    );
  });

  it('two consecutive runs deep-equal on communities (D-05, D-10)', () => {
    const { graph } = twoCliquesGraph({ ambiguousBridge: true, extraDyad: true });
    const a = mod.detectCommunities({ graph, write: false });
    const b = mod.detectCommunities({ graph, write: false });
    assert.deepEqual(a.communities, b.communities);
    assert.equal(a.dropped_small_count, b.dropped_small_count);
    assert.equal(a.nodes_considered, b.nodes_considered);
    assert.equal(a.edges_considered, b.edges_considered);
  });

  it('INFERRED edges alone can form a community of size >= 3 (D-03)', () => {
    const n1 = 'concept:i1';
    const n2 = 'concept:i2';
    const n3 = 'concept:i3';
    const graph = baseDoc(
      [
        { id: n1, type: 'Concept', label: 'I1' },
        { id: n2, type: 'Concept', label: 'I2' },
        { id: n3, type: 'Concept', label: 'I3' },
      ],
      [
        triple(n1, 'related_to', n2, 'INFERRED'),
        triple(n2, 'related_to', n3, 'INFERRED'),
        triple(n3, 'related_to', n1, 'INFERRED'),
      ],
    );
    const result = mod.detectCommunities({ graph, write: false });
    assert.equal(result.communities.length, 1);
    assert.equal(result.communities[0]!.size, 3);
    assert.deepEqual(
      [...result.communities[0]!.members].sort(),
      [n1, n2, n3].sort(),
    );
  });

  it('does not mutate injected graph.communities field (A4)', () => {
    const { graph } = twoCliquesGraph();
    const doc = graph as { communities?: unknown[] };
    doc.communities = [{ marker: 'preexisting' }];
    const before = JSON.stringify(doc.communities);
    mod.detectCommunities({ graph: doc, write: false });
    assert.equal(JSON.stringify(doc.communities), before);
  });
});

describe('detectCommunities store I/O (07-02 / D-04, D-08, COM-01)', () => {
  function publishTwoCliquesStore(): {
    store: string;
    tripleIds: string;
    v1Path: string;
    v1Hash: string;
  } {
    const store = mod.ensureStoreRoot(tempDir('gsd-communities-'));
    const { graph } = twoCliquesGraph();
    assert.equal(mod.validateGraphV1(graph), true, 'fixture must validate');
    mod.publishGraphFiles({
      storeRoot: store,
      graphV1: graph,
      writeProjection: false,
    });
    const v1Path = path.join(store, 'graph.v1.json');
    const loaded = mod.loadGraphV1(store);
    return {
      store,
      tripleIds: tripleIdSet(loaded),
      v1Path,
      v1Hash: contentHash(v1Path),
    };
  }

  it('exports COMMUNITIES_DIR as communities', () => {
    assert.equal(mod.COMMUNITIES_DIR, 'communities');
  });

  it('loads via loadGraphV1, writes index + community-*.md, leaves SoT unchanged (D-04, D-08)', () => {
    const { store, tripleIds, v1Path, v1Hash } = publishTwoCliquesStore();

    const result = mod.detectCommunities({ dir: store });

    assert.equal(result.communities.length, 2);
    assert.ok(result.index_path);
    assert.equal(
      result.index_path,
      path.join(store, mod.COMMUNITIES_DIR, 'index.json'),
    );
    assert.ok(Array.isArray(result.report_paths));
    assert.equal(result.report_paths!.length, result.communities.length);
    assert.ok(fs.existsSync(result.index_path!));

    for (const c of result.communities) {
      const mdPath = path.join(
        store,
        mod.COMMUNITIES_DIR,
        `community-${c.id}.md`,
      );
      assert.ok(fs.existsSync(mdPath), `expected ${mdPath}`);
      assert.ok(result.report_paths!.includes(mdPath));

      const md = fs.readFileSync(mdPath, 'utf8');
      assert.match(md, new RegExp(`# Community ${c.id}`));
      assert.match(md, /Non-authoritative theme report/i);
      assert.match(md, /Source of truth is graph\.v1\.json/);
      assert.match(md, /label propagation/);
      assert.match(md, /## Top nodes/);
      assert.match(md, /## Top predicates/);
      assert.match(md, /## Members/);
      // Path safety: basenames only from c_NNNN (T-07-04)
      assert.match(c.id, /^c_\d{4}$/);
    }

    const index = JSON.parse(
      fs.readFileSync(result.index_path!, 'utf8'),
    ) as {
      communities: Array<{
        id: string;
        size: number;
        label: string;
        stable_key: string;
      }>;
      max_iter?: number;
      min_size?: number;
      iterations?: number;
      stopped_reason?: string;
    };
    assert.equal(index.communities.length, 2);
    for (const row of index.communities) {
      assert.match(row.id, /^c_\d{4}$/);
      assert.ok(typeof row.size === 'number' && row.size >= 3);
      assert.ok(typeof row.label === 'string' && row.label.length > 0);
      assert.match(row.stable_key, /^[0-9a-f]{16}$/);
    }
    assert.equal(index.max_iter, mod.COMMUNITY_MAX_ITERATIONS);
    assert.equal(index.min_size, mod.COMMUNITY_MIN_SIZE);
    assert.equal(typeof index.iterations, 'number');
    assert.ok(
      index.stopped_reason === 'converged' ||
        index.stopped_reason === 'max_iterations',
    );

    // SoT triple set + file bytes unchanged (D-04, T-07-05)
    const after = mod.loadGraphV1(store);
    assert.equal(tripleIdSet(after), tripleIds);
    assert.equal(contentHash(v1Path), v1Hash);
    assert.ok(!('communities' in after) || after.communities === undefined);
  });

  it('missing graph.v1 yields STORE_NOT_FOUND (D-08)', () => {
    const store = mod.ensureStoreRoot(tempDir('gsd-communities-miss-'));
    assert.throws(
      () => mod.detectCommunities({ dir: store }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as Error & { reason: string }).reason,
          mod.GSD_GRAPH_REASON.STORE_NOT_FOUND,
        );
        return true;
      },
    );
  });
});

describe('writeCommunityReports rewrite path (07-02 / D-05, A2)', () => {
  function publishTwoCliquesStore(): { store: string; v1Path: string; v1Hash: string } {
    const store = mod.ensureStoreRoot(tempDir('gsd-communities-report-'));
    const { graph } = twoCliquesGraph();
    assert.equal(mod.validateGraphV1(graph), true);
    mod.publishGraphFiles({
      storeRoot: store,
      graphV1: graph,
      writeProjection: false,
    });
    const v1Path = path.join(store, 'graph.v1.json');
    return { store, v1Path, v1Hash: contentHash(v1Path) };
  }

  it('rewrites markdown from prior detect index (A2)', () => {
    const { store, v1Path, v1Hash } = publishTwoCliquesStore();
    const detected = mod.detectCommunities({ dir: store });
    assert.ok(detected.index_path);
    assert.equal(detected.report_paths!.length, 2);

    // Delete markdown only; index remains
    for (const p of detected.report_paths!) {
      fs.unlinkSync(p);
      assert.ok(!fs.existsSync(p));
    }
    assert.ok(fs.existsSync(detected.index_path!));

    const rewritten = mod.writeCommunityReports({ dir: store });
    assert.equal(rewritten.index_path, detected.index_path);
    assert.equal(rewritten.report_paths.length, detected.communities.length);

    for (const p of rewritten.report_paths) {
      assert.ok(fs.existsSync(p), `regenerated ${p}`);
      const md = fs.readFileSync(p, 'utf8');
      assert.match(md, /Non-authoritative theme report/i);
      assert.match(md, /Source of truth is graph\.v1\.json/);
      assert.match(md, /# Community c_\d{4}/);
    }

    // SoT still untouched
    assert.equal(contentHash(v1Path), v1Hash);
  });

  it('missing index.json throws SCHEMA_INVALID without mutating SoT', () => {
    const { store, v1Path, v1Hash } = publishTwoCliquesStore();
    assert.throws(
      () => mod.writeCommunityReports({ dir: store }),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        const ge = err as Error & { reason: string };
        assert.equal(ge.reason, mod.GSD_GRAPH_REASON.SCHEMA_INVALID);
        assert.match(ge.message, /detect/i);
        return true;
      },
    );
    assert.equal(contentHash(v1Path), v1Hash);
    assert.ok(!fs.existsSync(path.join(store, mod.COMMUNITIES_DIR, 'index.json')));
  });

  it('writes from in-memory communities without re-running LPA', () => {
    const { store, v1Path, v1Hash } = publishTwoCliquesStore();
    // Pure detect (no write) then report from memory
    const pure = mod.detectCommunities({
      graph: twoCliquesGraph().graph,
      write: false,
    });
    assert.equal(pure.communities.length, 2);
    assert.equal(pure.index_path, undefined);

    const written = mod.writeCommunityReports({
      dir: store,
      communities: pure.communities,
    });
    assert.ok(fs.existsSync(written.index_path));
    assert.equal(written.report_paths.length, 2);
    for (const p of written.report_paths) {
      assert.ok(fs.existsSync(p));
    }

    const index = JSON.parse(fs.readFileSync(written.index_path, 'utf8')) as {
      communities: Array<{ id: string }>;
      stopped_reason: string;
    };
    assert.equal(index.communities.length, 2);
    assert.equal(index.stopped_reason, 'rewrite');
    assert.equal(contentHash(v1Path), v1Hash);
  });
});
