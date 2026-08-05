// gsd-graph — MCP tool registration + default-off write gates (MCP-01 / D-06 / D-12)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mcp = require(path.join(root, 'dist', 'mcp', 'server.js')) as {
  listToolNames: (opts?: {
    allowBuild?: boolean;
    allowReviewWrite?: boolean;
    dir?: string;
  }) => string[];
  createGsdGraphMcpServer: (opts?: {
    allowBuild?: boolean;
    allowReviewWrite?: boolean;
    dir?: string;
  }) => Promise<{ toolNames: string[]; server: { close?: () => Promise<void> } }>;
  parseMcpArgv: (argv: string[]) => {
    allowBuild?: boolean;
    allowReviewWrite?: boolean;
    dir?: string;
  };
  handleToolCall: (
    name: string,
    args: Record<string, unknown>,
    opts?: { defaultDir?: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require(path.join(root, 'dist', 'index.js')) as {
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
  status: (opts?: { dir?: string }) => {
    exists: boolean;
    store_dir: string;
    engine: string;
    reason?: string | null;
  };
  packSubgraph: (opts: { question: string; graph?: unknown }) => {
    question: string;
    seeds: string[];
    triples: unknown[];
    citations: unknown[];
  };
  answer: (opts: { question: string; graph?: unknown }) => {
    answer_markdown: string;
    mode: string;
    abstained: boolean;
    pack: { triples: unknown[] };
  };
  publishGraphFiles: (
    storeRoot: string,
    files: Record<string, string>,
    opts?: { writeProjection?: boolean },
  ) => void;
  ensureStoreRoot: (storeRoot: string) => string;
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

function multiHopGraph() {
  const drought = lib.nodeId('Concept', 'Drought');
  const crop = lib.nodeId('Concept', 'Crop Failure');
  const food = lib.nodeId('Concept', 'Food Shortage');
  const t1 = lib.tripleId(drought, 'causes', crop);
  const t2 = lib.tripleId(crop, 'causes', food);
  return {
    schema_version: 1 as const,
    engine: 'gsd-graph' as const,
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    ontology_version: '1.0.0',
    built_at: '2026-01-01T00:00:00.000Z',
    nodes: [
      {
        id: drought,
        type: 'Concept',
        label: 'Drought',
        aliases: ['dry spell'],
      },
      { id: crop, type: 'Concept', label: 'Crop Failure' },
      { id: food, type: 'Concept', label: 'Food Shortage' },
    ],
    triples: [
      {
        id: t1,
        s: drought,
        p: 'causes',
        o: crop,
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'fixture://multi-hop',
            extractor: 'test',
            content_hash: 'sha256:test',
            confidence: 'EXTRACTED',
          },
        ],
      },
      {
        id: t2,
        s: crop,
        p: 'causes',
        o: food,
        confidence: 'EXTRACTED',
        provenance: [
          {
            source_path: 'fixture://multi-hop',
            extractor: 'test',
            content_hash: 'sha256:test',
            confidence: 'EXTRACTED',
          },
        ],
      },
    ],
  };
}

describe('MCP tool registration (MCP-01, D-06)', () => {
  it('default tool names include graph_status and exclude graph_build', () => {
    const names = mcp.listToolNames();
    assert.equal(names.includes('graph_status'), true, 'graph_status required');
    assert.equal(names.includes('graph_build'), false, 'graph_build off by default (D-06)');
    assert.equal(
      names.includes('graph_review_resolve'),
      false,
      'graph_review_resolve off by default (D-06)',
    );
  });

  it('createGsdGraphMcpServer returns registered tool names without stdio connect', async () => {
    const { toolNames, server } = await mcp.createGsdGraphMcpServer();
    assert.equal(toolNames.includes('graph_status'), true);
    assert.equal(toolNames.includes('graph_build'), false);
    // Ensure we can close without hanging on stdin
    if (server.close) await server.close();
  });

  it('graph_status handler returns JSON from public status() for a temp store dir', async () => {
    const dir = tempDir('gsd-mcp-status-');
    const result = await mcp.handleToolCall('graph_status', { dir });
    assert.equal(result.isError, undefined);
    assert.equal(result.content.length, 1);
    const body = JSON.parse(result.content[0]!.text) as {
      exists: boolean;
      store_dir: string;
      engine: string;
      reason?: string | null;
    };
    assert.equal(body.engine, 'gsd-graph');
    assert.equal(body.exists, false);
    assert.equal(body.store_dir, lib.status({ dir }).store_dir);
    assert.match(String(body.reason ?? ''), /missing/i);
  });
});

describe('MCP package identity hooks (D-07)', () => {
  it('parseMcpArgv recognizes allow flags and dir without stdout pollution', () => {
    const opts = mcp.parseMcpArgv([
      'node',
      'gsd-graph-mcp',
      '--allow-build',
      '--allow-review-write',
      '--dir',
      '/tmp/store',
    ]);
    assert.equal(opts.allowBuild, true);
    assert.equal(opts.allowReviewWrite, true);
    assert.equal(opts.dir, '/tmp/store');
  });
});

describe('MCP full read tool matrix + default-off writes (MCP-01, D-06)', () => {
  const DEFAULT_EXACT = [
    'graph_status',
    'graph_query',
    'graph_pack',
    'graph_answer',
    'graph_why',
    'graph_resolve',
    'graph_diff',
    'graph_communities',
    'graph_review_list',
  ];

  it('default tool list is exactly the read tools (D-06)', () => {
    const names = mcp.listToolNames();
    assert.deepEqual([...names].sort(), [...DEFAULT_EXACT].sort());
  });

  it('allowBuild registers graph_build; allowReviewWrite registers graph_review_resolve', () => {
    const withBuild = mcp.listToolNames({ allowBuild: true });
    assert.equal(withBuild.includes('graph_build'), true);
    assert.equal(withBuild.includes('graph_review_resolve'), false);

    const withReview = mcp.listToolNames({ allowReviewWrite: true });
    assert.equal(withReview.includes('graph_review_resolve'), true);
    assert.equal(withReview.includes('graph_build'), false);

    const both = mcp.listToolNames({
      allowBuild: true,
      allowReviewWrite: true,
    });
    assert.equal(both.includes('graph_build'), true);
    assert.equal(both.includes('graph_review_resolve'), true);
    for (const n of DEFAULT_EXACT) {
      assert.equal(both.includes(n), true, `missing default ${n}`);
    }
  });

  it('createGsdGraphMcpServer with allow flags matches listToolNames', async () => {
    const { toolNames, server } = await mcp.createGsdGraphMcpServer({
      allowBuild: true,
      allowReviewWrite: true,
    });
    assert.equal(toolNames.includes('graph_build'), true);
    assert.equal(toolNames.includes('graph_review_resolve'), true);
    if (server.close) await server.close();
  });

  it('graph_build / graph_review_resolve handlers refuse when gates off', async () => {
    const buildDenied = await mcp.handleToolCall('graph_build', {
      corpus: '/tmp/nope',
    });
    assert.equal(buildDenied.isError, true);
    assert.match(buildDenied.content[0]!.text, /not enabled|allow-build/i);

    const resolveDenied = await mcp.handleToolCall('graph_review_resolve', {
      id: 'x',
      action: 'reject',
    });
    assert.equal(resolveDenied.isError, true);
    assert.match(
      resolveDenied.content[0]!.text,
      /not enabled|allow-review-write/i,
    );
  });

  it('graph_pack and graph_answer delegate to library on in-memory fixture (D-12 offline)', async () => {
    // Integration-style via public APIs used by handlers: pack/answer shapes.
    // Handlers load from store dir; we exercise library parity + tool JSON shape
    // by writing a minimal store graph.v1 for the tool path.
    const dir = tempDir('gsd-mcp-pack-');
    const store = path.join(dir, '.gsd-graph');
    fs.mkdirSync(store, { recursive: true });
    const graph = multiHopGraph();
    fs.writeFileSync(
      path.join(store, 'graph.v1.json'),
      JSON.stringify(graph, null, 2),
      'utf8',
    );

    const packResult = await mcp.handleToolCall('graph_pack', {
      question: 'How does drought cause food shortage?',
      dir: store,
    });
    assert.equal(packResult.isError, undefined, packResult.content[0]?.text);
    const pack = JSON.parse(packResult.content[0]!.text) as {
      question: string;
      seeds: string[];
      triples: unknown[];
      citations: unknown[];
      nodes: unknown[];
    };
    assert.equal(typeof pack.question, 'string');
    assert.ok(Array.isArray(pack.seeds));
    assert.ok(Array.isArray(pack.triples));
    assert.ok(Array.isArray(pack.citations));
    assert.ok(pack.triples.length > 0, 'fixture multi-hop should pack triples');

    const answerResult = await mcp.handleToolCall('graph_answer', {
      question: 'How does drought cause food shortage?',
      dir: store,
    });
    assert.equal(
      answerResult.isError,
      undefined,
      answerResult.content[0]?.text,
    );
    const ans = JSON.parse(answerResult.content[0]!.text) as {
      answer_markdown: string;
      mode: string;
      abstained: boolean;
      pack: { triples: unknown[] };
    };
    assert.equal(typeof ans.answer_markdown, 'string');
    assert.equal(ans.abstained, false);
    assert.ok(ans.pack.triples.length > 0);
    assert.match(ans.mode, /deterministic|prompt|http/);
  });

  it('graph_query term search returns nodes/triples from store (read-only)', async () => {
    const dir = tempDir('gsd-mcp-query-');
    const store = path.join(dir, '.gsd-graph');
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(
      path.join(store, 'graph.v1.json'),
      JSON.stringify(multiHopGraph(), null, 2),
      'utf8',
    );

    const result = await mcp.handleToolCall('graph_query', {
      term: 'Drought',
      dir: store,
      hops: 2,
    });
    assert.equal(result.isError, undefined, result.content[0]?.text);
    const body = JSON.parse(result.content[0]!.text) as {
      nodes: unknown[];
      triples: unknown[];
      seeds: string[];
    };
    assert.ok(body.seeds.length > 0);
    assert.ok(body.nodes.length > 0);
  });

  it('graph_review_list returns pending items from empty queue', async () => {
    const dir = tempDir('gsd-mcp-review-');
    const store = path.join(dir, '.gsd-graph');
    fs.mkdirSync(store, { recursive: true });
    const result = await mcp.handleToolCall('graph_review_list', { dir: store });
    assert.equal(result.isError, undefined, result.content[0]?.text);
    const body = JSON.parse(result.content[0]!.text) as {
      count: number;
      items: unknown[];
      store_dir: string;
    };
    assert.equal(body.count, 0);
    assert.deepEqual(body.items, []);
  });

  it('handlers never write diagnostics to stdout (T-06-10 smoke)', async () => {
    // Capture stdout during a status call — should remain empty.
    let stdout = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      // still call through for test runner stability
      return (origWrite as (c: string | Uint8Array, ...r: unknown[]) => boolean)(
        chunk,
        ...rest,
      );
    }) as typeof process.stdout.write;
    try {
      const dir = tempDir('gsd-mcp-stdout-');
      await mcp.handleToolCall('graph_status', { dir });
    } finally {
      process.stdout.write = origWrite;
    }
    // MCP JSON-RPC integrity: tool handlers must not emit their own stdout
    assert.equal(
      stdout.includes('graph_status') || stdout.includes('store_dir'),
      false,
      `handler leaked status payload to stdout: ${stdout.slice(0, 200)}`,
    );
  });
});
