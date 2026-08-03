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

describe('cli-commands nested snapshot/review/ontology (CLI-01)', () => {
  it('snapshot save and list round-trip via main', () => {
    const { dir } = prepareStore();
    const save = run(['--dir', dir, 'snapshot', 'save', 'pre-edit']);
    assert.equal(save.code, 0, save.stderr);
    const saved = save.json as { name: string; fileName: string; path: string };
    assert.equal(saved.name, 'pre-edit');
    assert.ok(saved.fileName.includes('pre-edit'));

    const list = run(['--dir', dir, 'snapshot', 'list']);
    assert.equal(list.code, 0, list.stderr);
    const entries = list.json as Array<{ name: string; fileName: string }>;
    assert.ok(Array.isArray(entries));
    assert.ok(entries.some((e) => e.name === 'pre-edit'));
  });

  it('snapshot restore recovers named snapshot', () => {
    const { dir } = prepareStore();
    const save = run(['--dir', dir, 'snapshot', 'save', 'checkpoint']);
    assert.equal(save.code, 0, save.stderr);

    const restore = run(['--dir', dir, 'snapshot', 'restore', 'checkpoint']);
    assert.equal(restore.code, 0, restore.stderr);
    const body = restore.json as { name: string; fileName: string };
    assert.equal(body.name, 'checkpoint');
  });

  it('review list returns JSON queue (pending items ok)', () => {
    const { dir } = prepareStore();
    const result = run(['--dir', dir, 'review', 'list']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      items?: unknown[];
      schema_version?: number;
    };
    // Either full document or { items } shape — must be JSON object
    assert.equal(typeof body, 'object');
    assert.ok(body !== null);
    if (Array.isArray(body.items)) {
      // pending-filtered list is fine (empty or non-empty after fixture build)
      assert.ok(true);
    }
  });

  it('review accept/reject unknown id exits 2', () => {
    const { dir } = prepareStore();
    const result = run([
      '--dir',
      dir,
      'review',
      'accept',
      'review-item-does-not-exist',
    ]);
    assert.equal(result.code, 2, result.stderr);
    const err = JSON.parse(result.stderr) as { ok: false; reason: string };
    assert.equal(err.ok, false);
  });

  it('ontology show default general exits 0 with pack summary', () => {
    const result = run(['ontology', 'show']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      id: string;
      version: string;
      node_types: number;
      predicates: number;
      packHash?: string;
    };
    assert.equal(body.id, 'general');
    assert.ok(typeof body.version === 'string');
    assert.ok(body.node_types > 0);
    assert.ok(body.predicates > 0);
  });

  it('ontology validate default general exits 0', () => {
    const result = run(['ontology', 'validate']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      ok: boolean;
      pack_id: string;
      version: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.pack_id, 'general');
  });

});

/**
 * Multi-hop-only store for pack/answer CLI smoke (D-06, D-10).
 * Isolated corpus avoids free-prose/about noise from full fixturesCorpus.
 */
function prepareMultiHopStore(): { cwd: string; dir: string } {
  const cwd = makeTmpDir('gsd-graph-cli-pack-');
  const dir = path.join(cwd, 'store');
  const corpus = path.join(cwd, 'corpus');
  fs.mkdirSync(corpus, { recursive: true });
  fs.copyFileSync(
    path.join(fixturesCorpus, 'multi-hop.jsonl'),
    path.join(corpus, 'multi-hop.jsonl'),
  );
  lib.init({ cwd, dir });
  lib.build({ corpus, dir, full: true });
  return { cwd, dir };
}

describe('cli-commands pack/answer grounding (D-06, ANS-01)', () => {
  it('pack <question> exits 0 with seeds/triples/paths JSON (D-06)', () => {
    const { dir } = prepareMultiHopStore();
    const result = run([
      '--dir',
      dir,
      'pack',
      'why does drought cause food shortage?',
    ]);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      seeds: string[];
      triples: unknown[];
      paths: unknown[];
      nodes?: unknown[];
      citations?: unknown[];
    };
    assert.ok(Array.isArray(body.seeds), 'pack must return seeds');
    assert.ok(Array.isArray(body.triples), 'pack must return triples');
    assert.ok(Array.isArray(body.paths), 'pack must return paths');
    assert.ok(body.seeds.length > 0, 'expected non-empty seeds');
    assert.ok(body.triples.length >= 1, 'expected multi-hop triples');
  });

  it('answer <question> exits 0 with pack, answer_markdown, mode, abstained (D-06, ANS-01)', () => {
    const { dir } = prepareMultiHopStore();
    const result = run([
      '--dir',
      dir,
      'answer',
      'why does drought cause food shortage?',
    ]);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      pack: { seeds: string[]; triples: unknown[]; paths: unknown[] };
      answer_markdown: string;
      mode: string;
      abstained: boolean;
    };
    assert.equal(typeof body.pack, 'object');
    assert.ok(body.pack !== null);
    assert.ok(Array.isArray(body.pack.seeds));
    assert.ok(Array.isArray(body.pack.triples));
    assert.ok(Array.isArray(body.pack.paths));
    assert.equal(typeof body.answer_markdown, 'string');
    assert.equal(body.mode, 'deterministic');
    assert.equal(body.abstained, false);
    assert.match(body.answer_markdown, /## Seeds/);
    assert.match(body.answer_markdown, /causes/);
  });

  it('pack and answer forward optional --budget (D-06)', () => {
    const { dir } = prepareMultiHopStore();
    const pack = run([
      '--dir',
      dir,
      'pack',
      'drought food shortage',
      '--budget',
      '500',
    ]);
    assert.equal(pack.code, 0, pack.stderr);
    const packBody = pack.json as { budget_tokens: number | null };
    assert.equal(packBody.budget_tokens, 500);

    const answer = run([
      '--dir',
      dir,
      'answer',
      'drought food shortage',
      '--budget',
      '500',
    ]);
    assert.equal(answer.code, 0, answer.stderr);
    const ansBody = answer.json as {
      pack: { budget_tokens: number | null };
      abstained: boolean;
    };
    assert.equal(ansBody.pack.budget_tokens, 500);
  });

  it('pack/answer missing question argument exit 1 usage (CLI-02)', () => {
    const pack = run(['pack']);
    assert.equal(pack.code, 1);
    const packErr = JSON.parse(pack.stderr) as { ok: false; reason: string };
    assert.equal(packErr.ok, false);
    assert.equal(packErr.reason, 'usage');

    const answer = run(['answer']);
    assert.equal(answer.code, 1);
    const ansErr = JSON.parse(answer.stderr) as { ok: false; reason: string };
    assert.equal(ansErr.ok, false);
    assert.equal(ansErr.reason, 'usage');
  });

  it('answer abstain still exits 0 with abstained true (D-04, ANS-02)', () => {
    const { dir } = prepareMultiHopStore();
    // Stopword-only / no-match question → empty pack → abstain success
    const result = run(['--dir', dir, 'answer', 'the and or of what']);
    assert.equal(result.code, 0, result.stderr);
    const body = result.json as {
      mode: string;
      abstained: boolean;
      answer_markdown: string;
      pack: { triples: unknown[] };
    };
    assert.equal(body.mode, 'abstain');
    assert.equal(body.abstained, true);
    assert.equal(body.pack.triples.length, 0);
    // Must not treat abstain as operational failure (exit 2)
    assert.ok(!result.stderr.includes('"ok":false'));
  });
});
