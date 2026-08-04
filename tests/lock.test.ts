// gsd-graph — exclusive .build.lock tests (STORE-04)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  acquireBuildLock: (
    storeRoot: string,
    owner: 'cli' | 'lib' | 'mcp' | 'test',
    opts?: {
      waitMs?: number;
      nowMs?: () => number;
      cwd?: string;
      sleepMs?: (ms: number) => void;
    },
  ) => {
    release(): void;
    lockPath: string;
    payload: {
      pid: number;
      started_at: string;
      owner: string;
      cwd: string;
    };
  };
  ensureStoreRoot: (storeRoot: string) => string;
  GraphError: new (reason: string, message: string, details?: unknown) => Error & {
    reason: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
};

const stores: string[] = [];
const handles: Array<{ release(): void }> = [];

afterEach(() => {
  while (handles.length > 0) {
    const h = handles.pop();
    try {
      h?.release();
    } catch {
      /* ignore */
    }
  }
  while (stores.length > 0) {
    const s = stores.pop();
    if (s) {
      try {
        fs.rmSync(s, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

function trackStore(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-graph-lock-'));
  const store = mod.ensureStoreRoot(dir);
  stores.push(store);
  return store;
}

function trackHandle(
  h: ReturnType<typeof mod.acquireBuildLock>,
): ReturnType<typeof mod.acquireBuildLock> {
  handles.push(h);
  return h;
}

describe('acquireBuildLock (STORE-04)', () => {
  it('succeeds and creates .build.lock JSON with pid/started_at/owner/cwd', () => {
    const store = trackStore();
    const h = trackHandle(
      mod.acquireBuildLock(store, 'test', { cwd: '/tmp/project' }),
    );

    assert.ok(fs.existsSync(h.lockPath));
    assert.equal(h.lockPath, path.join(store, '.build.lock'));

    const raw = JSON.parse(fs.readFileSync(h.lockPath, 'utf8')) as {
      pid: number;
      started_at: string;
      owner: string;
      cwd: string;
    };
    assert.equal(raw.pid, process.pid);
    assert.equal(raw.owner, 'test');
    assert.equal(raw.cwd, '/tmp/project');
    assert.ok(Number.isFinite(Date.parse(raw.started_at)));
    assert.equal(h.payload.pid, process.pid);
  });

  it('second acquire without release throws BUILD_LOCKED', () => {
    const store = trackStore();
    trackHandle(mod.acquireBuildLock(store, 'test'));

    assert.throws(
      () => mod.acquireBuildLock(store, 'lib'),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as InstanceType<typeof mod.GraphError>).reason,
          mod.GSD_GRAPH_REASON.BUILD_LOCKED,
        );
        return true;
      },
    );
  });

  it('release unlinks lock and allows re-acquire', () => {
    const store = trackStore();
    const h1 = mod.acquireBuildLock(store, 'test');
    h1.release();
    assert.equal(fs.existsSync(path.join(store, '.build.lock')), false);

    const h2 = trackHandle(mod.acquireBuildLock(store, 'cli'));
    assert.equal(h2.payload.owner, 'cli');
    // idempotent release
    h1.release();
    h2.release();
    assert.equal(fs.existsSync(path.join(store, '.build.lock')), false);
  });

  it('stale lock by age with dead/nonexistent pid → steal succeeds', () => {
    const store = trackStore();
    const lockPath = path.join(store, '.build.lock');
    // Use a very high PID unlikely to exist; if kill(0) somehow succeeds, age still stales
    const fakePid = 2_147_483_646;
    const oldIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    fs.writeFileSync(
      lockPath,
      JSON.stringify(
        {
          pid: fakePid,
          started_at: oldIso,
          owner: 'cli',
          cwd: '/old',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const h = trackHandle(mod.acquireBuildLock(store, 'test'));
    assert.equal(h.payload.owner, 'test');
    assert.equal(h.payload.pid, process.pid);
    const raw = JSON.parse(fs.readFileSync(h.lockPath, 'utf8')) as {
      owner: string;
      pid: number;
    };
    assert.equal(raw.owner, 'test');
    assert.equal(raw.pid, process.pid);
  });

  it('dead PID (non-stale age) → steal succeeds', () => {
    const store = trackStore();
    const lockPath = path.join(store, '.build.lock');
    // Nonexistent PID, recent started_at — dead PID steal
    const fakePid = 2_147_483_645;
    fs.writeFileSync(
      lockPath,
      JSON.stringify(
        {
          pid: fakePid,
          started_at: new Date().toISOString(),
          owner: 'mcp',
          cwd: '/x',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const h = trackHandle(mod.acquireBuildLock(store, 'lib'));
    assert.equal(h.payload.owner, 'lib');
  });

  it('live non-stale foreign pid → BUILD_LOCKED (fail-fast)', () => {
    const store = trackStore();
    const lockPath = path.join(store, '.build.lock');
    // Current process is alive and recent — simulates foreign live holder
    // by writing our own pid but we won't hold via acquire; second acquire
    // sees live pid + fresh started_at → BUILD_LOCKED
    fs.writeFileSync(
      lockPath,
      JSON.stringify(
        {
          pid: process.pid,
          started_at: new Date().toISOString(),
          owner: 'cli',
          cwd: '/live',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    assert.throws(
      () => mod.acquireBuildLock(store, 'test'),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as InstanceType<typeof mod.GraphError>).reason,
          mod.GSD_GRAPH_REASON.BUILD_LOCKED,
        );
        return true;
      },
    );
  });
});
