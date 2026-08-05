// gsd-graph — MCP parity tools (why/resolve/diff/communities/sync) tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tools = require(path.join(root, 'dist', 'mcp', 'tools.js')) as {
  listRegisteredToolNames: (opts?: {
    allowBuild?: boolean;
    allowReviewWrite?: boolean;
  }) => string[];
  handleToolCall: (
    name: string,
    args: Record<string, unknown>,
    opts?: { allowBuild?: boolean; defaultDir?: string },
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require(path.join(root, 'dist', 'index.js')) as {
  build: (opts: { corpus: string; dir?: string; ontology?: string }) => object;
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedStore(): { cwd: string; store: string } {
  const cwd = tempDir('gsd-mcp-parity-');
  const corpus = path.join(cwd, 'docs');
  fs.mkdirSync(corpus, { recursive: true });
  fs.writeFileSync(
    path.join(corpus, 'a.md'),
    '# Doc\n\n[[Alpha]] --causes--> [[Beta]]\n[[Beta]] --supports--> [[Gamma]]\n',
    'utf8',
  );
  const store = path.join(cwd, '.gsd-graph');
  lib.build({ corpus, dir: store });
  return { cwd, store };
}

function parse<T>(r: { content: Array<{ text: string }> }): T {
  return JSON.parse(r.content[0]!.text) as T;
}

describe('MCP tool registry parity', () => {
  it('default read tools include why/resolve/diff/communities', () => {
    const names = tools.listRegisteredToolNames();
    for (const n of [
      'graph_why',
      'graph_resolve',
      'graph_diff',
      'graph_communities',
    ]) {
      assert.ok(names.includes(n), n);
    }
    assert.ok(!names.includes('graph_sync'), 'sync is gated');
    const gated = tools.listRegisteredToolNames({ allowBuild: true });
    assert.ok(gated.includes('graph_sync'));
  });
});

describe('MCP parity handlers', () => {
  it('graph_why explains a path with citations', async () => {
    const { cwd, store } = seedStore();
    try {
      const res = await tools.handleToolCall('graph_why', {
        from: 'Alpha',
        to: 'Gamma',
        dir: store,
      });
      assert.ok(res.isError !== true, res.content[0]?.text);
      const body = parse<{ found: boolean; citations: unknown[] }>(res);
      assert.equal(body.found, true);
      assert.ok(body.citations.length >= 2);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('graph_resolve resolves terms and suggests on miss', async () => {
    const { cwd, store } = seedStore();
    try {
      const hit = parse<{ id: string | null }>(
        await tools.handleToolCall('graph_resolve', {
          term: 'alpha',
          dir: store,
        }),
      );
      assert.equal(hit.id, 'Concept:alpha');
      const miss = parse<{
        id: string | null;
        suggestions?: Array<{ id: string }>;
      }>(
        await tools.handleToolCall('graph_resolve', {
          term: 'alpa',
          dir: store,
        }),
      );
      assert.equal(miss.id, null);
      assert.ok((miss.suggestions ?? []).some((s) => s.id === 'Concept:alpha'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('graph_diff reports zero changes against last-build baseline', async () => {
    const { cwd, store } = seedStore();
    try {
      const body = parse<{
        counts: { triples_added: number; triples_removed: number };
      }>(await tools.handleToolCall('graph_diff', { dir: store }));
      assert.equal(body.counts.triples_added, 0);
      assert.equal(body.counts.triples_removed, 0);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('graph_communities returns themes read-only', async () => {
    const { cwd, store } = seedStore();
    try {
      const body = parse<{ community_count: number }>(
        await tools.handleToolCall('graph_communities', {
          dir: store,
          min_size: 2,
        }),
      );
      assert.ok(body.community_count >= 0);
      assert.equal(
        fs.existsSync(path.join(store, 'communities')),
        false,
        'no sidecars without write=true',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('graph_sync is refused without allow-build gate', async () => {
    const { cwd, store } = seedStore();
    try {
      const res = await tools.handleToolCall('graph_sync', { dir: store });
      assert.equal(res.isError, true);
      assert.match(res.content[0]!.text, /not enabled/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
