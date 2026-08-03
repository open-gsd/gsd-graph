// gsd-graph — CLI command surface smoke tests (CLI-01, D-02, D-06)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');
const fixturesCorpus = path.join(root, 'tests', 'fixtures', 'corpus');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require(path.join(root, 'dist', 'index.js')) as {
  init: (opts?: { dir?: string; cwd?: string; ontology?: string }) => {
    store_dir: string;
    created: boolean;
  };
  build: (opts: {
    corpus: string | string[];
    dir?: string;
    full?: boolean;
  }) => {
    store_dir: string;
    node_count: number;
    triple_count: number;
  };
  nodeId: (type: string, label: string) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cli = require(path.join(root, 'dist', 'cli.js')) as {
  main: (argv: string[]) => number;
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function makeTmpDir(prefix: string): string {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  );
  temps.push(dir);
  return dir;
}

function captureIO(fn: () => number): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  (process.stdout as NodeJS.WriteStream).write = ((
    chunk: string | Uint8Array,
    ..._rest: unknown[]
  ) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  (process.stderr as NodeJS.WriteStream).write = ((
    chunk: string | Uint8Array,
    ..._rest: unknown[]
  ) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

function run(argv: string[]): {
  code: number;
  stdout: string;
  stderr: string;
  json: unknown;
} {
  const result = captureIO(() =>
    cli.main(['node', 'gsd-graph', ...argv]),
  );
  let json: unknown = null;
  if (result.stdout.trim().length > 0) {
    json = JSON.parse(result.stdout);
  }
  return { ...result, json };
}

function prepareStore(): { cwd: string; dir: string } {
  const cwd = makeTmpDir('gsd-graph-cli-cmds-');
  const dir = path.join(cwd, 'store');
  lib.init({ cwd, dir });
  lib.build({ corpus: fixturesCorpus, dir, full: true });
  return { cwd, dir };
}

describe('cli-commands core ops (CLI-01)', () => {
  it('build --corpus writes JSON via library adapter (no --llm)', () => {
    const cwd = makeTmpDir('gsd-graph-cli-build-');
    const dir = path.join(cwd, 'store');
    lib.init({ cwd, dir });

    const result = run([
      '--dir',
      dir,
      'build',
      '--corpus',
      fixturesCorpus,
      '--full',
    ]);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      store_dir: string;
      node_count: number;
      engine: string;
    };
    assert.equal(body.engine, 'gsd-graph');
    assert.ok(body.node_count > 0);
    assert.ok(body.store_dir.length > 0);

    // D-08: --llm must not be registered
    const llm = run([
      '--dir',
      dir,
      'build',
      '--corpus',
      fixturesCorpus,
      '--llm',
      'openai',
    ]);
    assert.equal(llm.code, 1);
    const err = JSON.parse(llm.stderr) as { ok: false; reason: string };
    assert.equal(err.ok, false);
    assert.equal(err.reason, 'usage');
  });

  it('status returns JSON for built store', () => {
    const { dir } = prepareStore();
    const result = run(['--dir', dir, 'status']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      exists: boolean;
      store_dir: string;
      node_count?: number;
    };
    assert.equal(body.exists, true);
    assert.ok((body.node_count ?? 0) > 0);
  });

  it('query <term> returns seeds and nodes JSON', () => {
    const { dir } = prepareStore();
    const result = run(['--dir', dir, 'query', 'Drought', '--hops', '2']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      seeds: string[];
      nodes: Array<{ id: string }>;
      triples: unknown[];
    };
    assert.ok(body.seeds.includes(lib.nodeId('Concept', 'Drought')));
    assert.ok(body.nodes.length > 0);
  });

  it('path <from> <to> maps to query path IR', () => {
    const { dir } = prepareStore();
    const from = lib.nodeId('Concept', 'Drought');
    const to = lib.nodeId('Concept', 'Food Shortage');
    const result = run([
      '--dir',
      dir,
      'path',
      from,
      to,
      '--depth',
      '4',
    ]);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      paths: Array<{ nodes: string[]; predicates: string[] }>;
      nodes: unknown[];
    };
    assert.ok(Array.isArray(body.paths));
    assert.ok(body.paths.length >= 1);
    assert.deepEqual(body.paths[0]!.nodes[0], from);
    assert.deepEqual(
      body.paths[0]!.nodes[body.paths[0]!.nodes.length - 1],
      to,
    );
  });

  it('diff uses last-diff-base after build and maps missing snapshot to exit 2', () => {
    const { dir } = prepareStore();
    // Successful build writes snapshots/.last-diff-base.json → empty delta
    const ok = run(['--dir', dir, 'diff']);
    assert.equal(ok.code, 0, ok.stderr);
    const body = ok.json as {
      baseline: string;
      counts: { nodes_added: number; triples_added: number };
    };
    assert.ok(typeof body.baseline === 'string');
    assert.equal(body.counts.nodes_added, 0);

    // Unknown snapshot name → GraphError → exit 2 (CLI-02, D-03)
    const missing = run([
      '--dir',
      dir,
      'diff',
      '--snapshot',
      'does-not-exist-snapshot',
    ]);
    assert.equal(missing.code, 2, missing.stderr);
    const err = JSON.parse(missing.stderr) as {
      ok: false;
      reason: string;
      message: string;
    };
    assert.equal(err.ok, false);
    assert.ok(typeof err.reason === 'string');
  });

  it('repair writes projection JSON result', () => {
    const { dir } = prepareStore();
    const result = run(['--dir', dir, 'repair']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      store_dir: string;
      projection_written: boolean;
      node_count: number;
    };
    assert.equal(body.projection_written, true);
    assert.ok(body.node_count > 0);
  });

  it('build without --corpus exits usage 1', () => {
    const cwd = makeTmpDir('gsd-graph-cli-build-missing-');
    const dir = path.join(cwd, 'store');
    lib.init({ cwd, dir });
    const result = run(['--dir', dir, 'build']);
    assert.equal(result.code, 1);
    const err = JSON.parse(result.stderr) as { ok: false; reason: string };
    assert.equal(err.reason, 'usage');
  });
});
