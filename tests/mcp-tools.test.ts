// gsd-graph — MCP tool registration + default-off write gates (MCP-01 / D-06 / D-12)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

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
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.1.0',
    ontology_pack_id: 'general',
    built_at: '2026-01-01T00:00:00.000Z',
    content_hash: 'sha256:test',
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
