// gsd-graph — process-spawn CLI E2E (happy path + exit matrix, D-12, CLI-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..');
const binPath = path.join(repoRoot, 'bin', 'gsd-graph.js');
const fixturesCorpus = path.join(repoRoot, 'tests', 'fixtures', 'corpus');

// Stable nodeId scheme from multi-hop fixture labels (Concept:slug)
const DROUGHT_ID = 'Concept:drought';
const FOOD_SHORTAGE_ID = 'Concept:food-shortage';

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

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
  json: unknown;
  errorJson: unknown;
}

/**
 * Process-level CLI runner (D-11, D-12): spawn node bin with NO_COLOR, no TTY.
 */
function run(args: string[], cwd: string): SpawnResult {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  let json: unknown = null;
  let errorJson: unknown = null;

  if (stdout.trim().length > 0) {
    json = JSON.parse(stdout.trim());
  }
  if (stderr.trim().length > 0) {
    try {
      errorJson = JSON.parse(stderr.trim());
    } catch {
      errorJson = null;
    }
  }

  return {
    status: result.status,
    stdout,
    stderr,
    json,
    errorJson,
  };
}

function assertJsonOnlyStdout(stdout: string): unknown {
  // Full stdout must be pure JSON (no leading log lines) — T-04-08 / CLI-02
  return JSON.parse(stdout.trim());
}

describe('cli happy path (D-12, CLI-02, CLI-03)', () => {
  it('init → build → query → path exits 0 with JSON-only stdout', () => {
    assert.equal(
      fs.existsSync(binPath),
      true,
      'bin/gsd-graph.js missing — run npm run build',
    );

    const cwd = makeTmpDir('gsd-graph-cli-e2e-');
    fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n', 'utf8');

    // 1. init
    const initResult = run(['init'], cwd);
    assert.equal(initResult.status, 0, `init failed: ${initResult.stderr}`);
    const initBody = assertJsonOnlyStdout(initResult.stdout) as {
      store_dir: string;
      created: boolean;
      gitignore_appended?: boolean;
    };
    assert.ok(typeof initBody.store_dir === 'string');
    assert.ok(initBody.store_dir.length > 0);
    assert.equal(fs.existsSync(path.join(cwd, '.gsd-graph')), true);
    const gi = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
    assert.match(gi, /\.gsd-graph\//);

    // 2. build --corpus <fixture dir>
    const buildResult = run(
      ['build', '--corpus', fixturesCorpus, '--full'],
      cwd,
    );
    assert.equal(buildResult.status, 0, `build failed: ${buildResult.stderr}`);
    const buildBody = assertJsonOnlyStdout(buildResult.stdout) as {
      store_dir?: string;
      node_count?: number;
      triple_count?: number;
      engine?: string;
    };
    assert.ok(
      typeof buildBody.node_count === 'number' ||
        typeof buildBody.engine === 'string',
      'build stdout should include node_count or engine',
    );
    if (typeof buildBody.node_count === 'number') {
      assert.ok(buildBody.node_count > 0);
    }

    // 3. query drought
    const queryResult = run(['query', 'drought', '--hops', '2'], cwd);
    assert.equal(
      queryResult.status,
      0,
      `query failed: ${queryResult.stderr}`,
    );
    const queryBody = assertJsonOnlyStdout(queryResult.stdout) as {
      nodes?: unknown[];
      triples?: unknown[];
      seeds?: string[];
    };
    assert.ok(Array.isArray(queryBody.nodes), 'query must return nodes array');
    assert.ok(
      Array.isArray(queryBody.triples),
      'query must return triples array',
    );
    assert.ok((queryBody.nodes?.length ?? 0) > 0);

    // Discover path endpoints from query seeds/nodes when possible
    const seeds = queryBody.seeds ?? [];
    const fromId =
      seeds.find((s) => s.toLowerCase().includes('drought')) ?? DROUGHT_ID;
    const nodeIds = (queryBody.nodes as Array<{ id?: string }>)
      .map((n) => n.id)
      .filter((id): id is string => typeof id === 'string');
    const toId =
      nodeIds.find((id) => id.toLowerCase().includes('food-shortage')) ??
      FOOD_SHORTAGE_ID;

    // 4. path from → to
    const pathResult = run(['path', fromId, toId, '--depth', '4'], cwd);
    assert.equal(pathResult.status, 0, `path failed: ${pathResult.stderr}`);
    const pathBody = assertJsonOnlyStdout(pathResult.stdout) as {
      paths?: unknown[];
      nodes?: unknown[];
    };
    assert.ok(
      Array.isArray(pathBody.paths) || Array.isArray(pathBody.nodes),
      'path stdout must be structured JSON with paths or nodes',
    );
  });
});

describe('cli exit matrix (CLI-01, CLI-02, D-02, D-03, D-04)', () => {
  it('unknown command and unregistered pack/answer exit 1', () => {
    const cwd = makeTmpDir('gsd-graph-cli-exit1-');
    fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n', 'utf8');

    for (const args of [
      ['totally-unknown-verb'],
      ['pack'],
      ['answer', 'what is drought?'],
    ] as string[][]) {
      const result = run(args, cwd);
      assert.equal(
        result.status,
        1,
        `${args.join(' ')} expected exit 1, got ${result.status}: ${result.stderr}`,
      );
      const err = result.errorJson as {
        ok: false;
        reason: string;
        message: string;
      } | null;
      assert.ok(err, `stderr JSON required for ${args.join(' ')}`);
      assert.equal(err.ok, false);
      assert.equal(typeof err.reason, 'string');
      assert.equal(typeof err.message, 'string');
    }
  });

  it('build without --corpus exits 1 (usage)', () => {
    const cwd = makeTmpDir('gsd-graph-cli-usage-');
    fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n', 'utf8');
    const initResult = run(['init'], cwd);
    assert.equal(initResult.status, 0, initResult.stderr);

    const result = run(['build'], cwd);
    assert.equal(result.status, 1, result.stderr);
    const err = result.errorJson as {
      ok: false;
      reason: string;
      message: string;
    };
    assert.equal(err.ok, false);
    assert.equal(err.reason, 'usage');
  });

  it('operational failure exits 2 with stderr {ok:false,reason,message}', () => {
    const cwd = makeTmpDir('gsd-graph-cli-exit2-');
    fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n', 'utf8');
    const initResult = run(['init'], cwd);
    assert.equal(initResult.status, 0, initResult.stderr);

    // Init-only store has no last-diff-base → NO_BASELINE (exit 2)
    const diffResult = run(['diff'], cwd);
    assert.equal(
      diffResult.status,
      2,
      `diff without baseline expected 2: ${diffResult.stderr}`,
    );
    const err = diffResult.errorJson as {
      ok: false;
      reason: string;
      message: string;
    };
    assert.equal(err.ok, false);
    assert.equal(typeof err.reason, 'string');
    assert.equal(typeof err.message, 'string');
    assert.equal(err.reason, 'no_baseline');

    // Alternative operational path: corpus_not_found
    const badCorpus = run(
      ['build', '--corpus', path.join(cwd, 'does-not-exist-corpus')],
      cwd,
    );
    assert.equal(
      badCorpus.status,
      2,
      `missing corpus expected 2: ${badCorpus.stderr}`,
    );
    const corpusErr = badCorpus.errorJson as {
      ok: false;
      reason: string;
      message: string;
    };
    assert.equal(corpusErr.ok, false);
    assert.equal(corpusErr.reason, 'corpus_not_found');
  });

  it('build_locked surfaces as exit 3 with reason build_locked', () => {
    const cwd = makeTmpDir('gsd-graph-cli-exit3-');
    fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n', 'utf8');
    const initResult = run(['init'], cwd);
    assert.equal(initResult.status, 0, initResult.stderr);

    const storeDir = path.join(cwd, '.gsd-graph');
    const lockPath = path.join(storeDir, '.build.lock');
    // Plant non-stale lock with current PID so acquireBuildLock fails (T-04-09)
    const lockPayload = {
      pid: process.pid,
      started_at: new Date().toISOString(),
      owner: 'test',
      cwd,
    };
    fs.writeFileSync(lockPath, JSON.stringify(lockPayload, null, 2) + '\n', 'utf8');

    try {
      const buildResult = run(
        ['build', '--corpus', fixturesCorpus, '--full'],
        cwd,
      );
      assert.equal(
        buildResult.status,
        3,
        `locked build expected 3: ${buildResult.stderr}`,
      );
      const err = buildResult.errorJson as {
        ok: false;
        reason: string;
        message: string;
      };
      assert.equal(err.ok, false);
      assert.equal(err.reason, 'build_locked');
      assert.equal(typeof err.message, 'string');
    } finally {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }
  });
});
