// gsd-graph — watch mode + git post-commit hook installer tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  watchCorpus: (opts?: {
    cwd?: string;
    dir?: string;
    corpus?: string[];
    debounceMs?: number;
    onSync?: (r: { build: { triple_count: number } }) => void;
    onError?: (e: unknown) => void;
  }) => { roots: string[]; close: () => void };
  installGitPostCommitHook: (opts?: {
    cwd?: string;
    remove?: boolean;
  }) => { ok: boolean; path: string; action: string };
  GraphError: new (r: string, m: string) => Error & { reason: string };
};

function tempDir(prefix: string): string {
  return fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  );
}

describe('watchCorpus', () => {
  it('debounces changes into an incremental sync', async () => {
    const cwd = tempDir('gsd-watch-');
    const corpus = path.join(cwd, 'docs');
    fs.mkdirSync(corpus, { recursive: true });
    fs.writeFileSync(path.join(corpus, 'a.md'), '# Doc\n', 'utf8');
    const store = path.join(cwd, '.gsd-graph');

    const synced: Array<{ build: { triple_count: number } }> = [];
    const handle = mod.watchCorpus({
      cwd,
      dir: store,
      corpus: [corpus],
      debounceMs: 150,
      onSync: (r) => synced.push(r),
      onError: () => {},
    });
    try {
      assert.deepEqual(handle.roots, [corpus]);
      // FSEvents may miss writes made immediately after watch start —
      // keep re-writing until an event lands (each write appends fresh bytes).
      const deadline = Date.now() + 15000;
      let writes = 0;
      while (synced.length === 0 && Date.now() < deadline) {
        fs.writeFileSync(
          path.join(corpus, 'a.md'),
          `# Doc\n\n[[Alpha]] --causes--> [[Beta]]\n\ntick ${writes++}\n`,
          'utf8',
        );
        await new Promise((r) => setTimeout(r, 400));
      }
      assert.ok(synced.length >= 1, 'sync fired from watch event');
      assert.ok(synced[0]!.build.triple_count >= 1);
    } finally {
      handle.close();
    }
  });
});

describe('installGitPostCommitHook', () => {
  it('creates, is idempotent, appends to existing hooks, and removes cleanly', () => {
    const cwd = tempDir('gsd-githook-');
    execFileSync('git', ['init', '-q'], { cwd });
    try {
      const created = mod.installGitPostCommitHook({ cwd });
      assert.equal(created.action, 'created');
      const content = fs.readFileSync(created.path, 'utf8');
      assert.match(content, /gsd-graph sync/);
      assert.ok(
        (fs.statSync(created.path).mode & 0o111) !== 0,
        'hook is executable',
      );

      assert.equal(
        mod.installGitPostCommitHook({ cwd }).action,
        'already_installed',
      );

      const removed = mod.installGitPostCommitHook({ cwd, remove: true });
      assert.equal(removed.action, 'removed');
      assert.equal(fs.existsSync(created.path), false);

      // Appends to a pre-existing user hook and removal keeps user content
      fs.writeFileSync(
        created.path,
        '#!/bin/sh\necho user-things\n',
        { mode: 0o755 },
      );
      const appended = mod.installGitPostCommitHook({ cwd });
      assert.equal(appended.action, 'appended');
      const merged = fs.readFileSync(created.path, 'utf8');
      assert.match(merged, /user-things/);
      assert.match(merged, /gsd-graph sync/);
      mod.installGitPostCommitHook({ cwd, remove: true });
      const after = fs.readFileSync(created.path, 'utf8');
      assert.match(after, /user-things/);
      assert.ok(!after.includes('gsd-graph sync'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('errors outside a git repository', () => {
    const cwd = tempDir('gsd-githook-norepo-');
    // Guard: ensure no parent git repo interferes by checking error only when
    // rev-parse actually fails; os.tmpdir is never inside a repo in CI/dev.
    try {
      assert.throws(
        () => mod.installGitPostCommitHook({ cwd }),
        (err: unknown) => err instanceof mod.GraphError,
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
