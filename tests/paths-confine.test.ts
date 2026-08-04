// gsd-graph — store path resolve + realpath confinement tests (STORE-01/05)

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = joinRoot();

function joinRoot(): string {
  return path.join(__dirname, '..');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  DEFAULT_STORE_DIR: string;
  resolveStoreRoot: (opts?: {
    dir?: string;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
  }) => string;
  ensureStoreRoot: (storeRoot: string) => string;
  confineUnderRoot: (rootReal: string, candidate: string) => string;
  GraphError: new (reason: string, message: string, details?: unknown) => Error & {
    reason: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
};

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('resolveStoreRoot (STORE-01)', () => {
  it('defaults to .gsd-graph under cwd', () => {
    const cwd = makeTmpDir('gsd-graph-paths-default-');
    try {
      const resolved = mod.resolveStoreRoot({ cwd, env: {} });
      assert.equal(path.basename(resolved), mod.DEFAULT_STORE_DIR);
      assert.equal(mod.DEFAULT_STORE_DIR, '.gsd-graph');
      assert.ok(resolved.endsWith(path.join(cwd, '.gsd-graph')) || resolved.endsWith(`${path.sep}.gsd-graph`));
      assert.equal(resolved, path.resolve(cwd, '.gsd-graph'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('honors explicit dir override', () => {
    const cwd = makeTmpDir('gsd-graph-paths-dir-');
    try {
      const custom = path.join(cwd, 'custom-store');
      const resolved = mod.resolveStoreRoot({ cwd, dir: custom, env: {} });
      assert.equal(resolved, path.resolve(cwd, custom));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('honors GSD_GRAPH_DIR env override', () => {
    const cwd = makeTmpDir('gsd-graph-paths-env-');
    try {
      const resolved = mod.resolveStoreRoot({
        cwd,
        env: { GSD_GRAPH_DIR: 'from-env' },
      });
      assert.equal(resolved, path.resolve(cwd, 'from-env'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('dir override beats GSD_GRAPH_DIR', () => {
    const cwd = makeTmpDir('gsd-graph-paths-precedence-');
    try {
      const resolved = mod.resolveStoreRoot({
        cwd,
        dir: 'explicit',
        env: { GSD_GRAPH_DIR: 'from-env' },
      });
      assert.equal(resolved, path.resolve(cwd, 'explicit'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns realpath when store root already exists', () => {
    const cwd = makeTmpDir('gsd-graph-paths-real-');
    try {
      const store = path.join(cwd, '.gsd-graph');
      fs.mkdirSync(store);
      const resolved = mod.resolveStoreRoot({ cwd, env: {} });
      assert.equal(resolved, fs.realpathSync.native(store));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('confineUnderRoot (STORE-05, D-07)', () => {
  let store: string;

  before(() => {
    store = makeTmpDir('gsd-graph-confine-');
    store = mod.ensureStoreRoot(store);
  });

  after(() => {
    fs.rmSync(store, { recursive: true, force: true });
  });

  it('allows known basenames under root', () => {
    const p = mod.confineUnderRoot(store, 'graph.v1.json');
    assert.equal(p, path.join(store, 'graph.v1.json'));
  });

  it('rejects .. escape with PATH_ESCAPE', () => {
    assert.throws(
      () => mod.confineUnderRoot(store, path.join('..', 'outside.json')),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as InstanceType<typeof mod.GraphError>).reason,
          mod.GSD_GRAPH_REASON.PATH_ESCAPE,
        );
        return true;
      },
    );
  });

  it('rejects absolute path outside root with PATH_ESCAPE', () => {
    const outside = path.join(os.tmpdir(), 'gsd-graph-escape-target.json');
    assert.throws(
      () => mod.confineUnderRoot(store, outside),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as InstanceType<typeof mod.GraphError>).reason,
          mod.GSD_GRAPH_REASON.PATH_ESCAPE,
        );
        return true;
      },
    );
  });

  it('rejects symlink escape with PATH_ESCAPE when OS allows symlinks', () => {
    const outsideDir = makeTmpDir('gsd-graph-symlink-out-');
    const outsideFile = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(outsideFile, 'secret\n', 'utf8');
    const linkPath = path.join(store, 'escape-link');

    try {
      fs.symlinkSync(outsideFile, linkPath);
    } catch (err) {
      // Skip when OS/permissions disallow symlinks
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') {
        fs.rmSync(outsideDir, { recursive: true, force: true });
        return;
      }
      throw err;
    }

    try {
      assert.throws(
        () => mod.confineUnderRoot(store, 'escape-link'),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.equal(
            (err as InstanceType<typeof mod.GraphError>).reason,
            mod.GSD_GRAPH_REASON.PATH_ESCAPE,
          );
          return true;
        },
      );
    } finally {
      try {
        fs.unlinkSync(linkPath);
      } catch {
        /* ignore */
      }
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

// silence unused afterEach import if not used
void afterEach;
