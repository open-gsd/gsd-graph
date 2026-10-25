// gsd-graph — exclusive .build.lock tests (STORE-04)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
      onNotice?: (message: string) => void;
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lockMod = require(path.join(root, 'dist', 'io', 'lock.js')) as {
  lockOwnerState: (pid: unknown) => 'alive' | 'dead';
  tryTakeOver: (
    lockPath: string,
    staleRaw: string,
    owner: 'cli' | 'lib' | 'mcp' | 'test',
    now: number,
    cwd: string,
  ) => { release(): void; payload: { pid: number } } | 'exists';
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

/** Pid of a process that has exited and been reaped (kill(pid, 0) → ESRCH). */
function exitedPid(): number {
  const r = spawnSync(process.execPath, ['-e', '']);
  assert.equal(r.status, 0);
  assert.equal(typeof r.pid, 'number');
  return r.pid!;
}

function writeLock(store: string, pid: number, startedAt = new Date()): string {
  const lockPath = path.join(store, '.build.lock');
  const raw =
    JSON.stringify(
      { pid, started_at: startedAt.toISOString(), owner: 'cli', cwd: '/x' },
      null,
      2,
    ) + '\n';
  fs.writeFileSync(lockPath, raw, 'utf8');
  return raw;
}

function assertLocked(fn: () => unknown): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof mod.GraphError);
    assert.equal(
      (err as InstanceType<typeof mod.GraphError>).reason,
      mod.GSD_GRAPH_REASON.BUILD_LOCKED,
    );
    return true;
  });
}

function takeoverClaims(store: string): string[] {
  return fs.readdirSync(store).filter((f) => f.includes('.takeover-'));
}

describe('acquireBuildLock owner liveness (#5)', () => {
  it('lock of an exited process → taken over with a one-line notice', () => {
    const store = trackStore();
    const pid = exitedPid();
    assert.equal(lockMod.lockOwnerState(pid), 'dead');
    writeLock(store, pid);

    const notices: string[] = [];
    const h = trackHandle(
      mod.acquireBuildLock(store, 'test', { onNotice: (m) => notices.push(m) }),
    );
    assert.equal(h.payload.pid, process.pid);
    assert.equal(notices.length, 1);
    assert.ok(!notices[0]!.includes('\n'), 'notice is one line');
    assert.match(notices[0]!, new RegExp(`pid ${pid} is not running`));
    const onDisk = JSON.parse(fs.readFileSync(h.lockPath, 'utf8')) as {
      pid: number;
      owner: string;
    };
    assert.equal(onDisk.pid, process.pid);
    assert.equal(onDisk.owner, 'test');
    assert.deepEqual(takeoverClaims(store), []);
  });

  it('lock of a running process → held; taken over once it exits', async () => {
    const store = trackStore();
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { stdio: 'ignore' },
    );
    const exited = new Promise<void>((resolve) =>
      child.once('exit', () => resolve()),
    );
    try {
      assert.equal(typeof child.pid, 'number');
      writeLock(store, child.pid!);
      const notices: string[] = [];
      assertLocked(() =>
        mod.acquireBuildLock(store, 'test', {
          onNotice: (m) => notices.push(m),
        }),
      );
      assert.deepEqual(notices, []);
    } finally {
      child.kill('SIGKILL');
    }
    await exited;

    const notices: string[] = [];
    trackHandle(
      mod.acquireBuildLock(store, 'test', { onNotice: (m) => notices.push(m) }),
    );
    assert.equal(notices.length, 1);
  });

  it(
    'EPERM (pid alive under another user) counts as alive',
    { skip: process.platform === 'win32' },
    () => {
      // pid 1 always exists; unprivileged callers get EPERM, root succeeds.
      assert.equal(lockMod.lockOwnerState(1), 'alive');
      const store = trackStore();
      writeLock(store, 1);
      assertLocked(() =>
        mod.acquireBuildLock(store, 'test', { onNotice: () => {} }),
      );
    },
  );

  it('unreadable lock: held while fresh, taken over once old', () => {
    const store = trackStore();
    const lockPath = path.join(store, '.build.lock');
    // An exclusive create whose payload is not written yet looks like this.
    fs.writeFileSync(lockPath, '', 'utf8');
    assertLocked(() =>
      mod.acquireBuildLock(store, 'test', { onNotice: () => {} }),
    );

    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, old, old);
    const notices: string[] = [];
    const h = trackHandle(
      mod.acquireBuildLock(store, 'test', { onNotice: (m) => notices.push(m) }),
    );
    assert.equal(h.payload.pid, process.pid);
    assert.equal(notices.length, 1);
    assert.match(notices[0]!, /unreadable build lock/);
  });

  it('invalid recorded pid counts as dead', () => {
    for (const pid of [0, -1, 1.5, Number.NaN, '123', undefined]) {
      assert.equal(lockMod.lockOwnerState(pid), 'dead', String(pid));
    }
  });
});

describe('stale lock takeover is exclusive (#5)', () => {
  it('a contender acting on an outdated stale view backs off', () => {
    const store = trackStore();
    const lockPath = path.join(store, '.build.lock');
    const staleRaw = writeLock(store, exitedPid());

    // Both contenders read the same stale lock; the first takes it over …
    const first = lockMod.tryTakeOver(lockPath, staleRaw, 'test', 0, '/a');
    assert.notEqual(first, 'exists');
    handles.push(first as Exclude<typeof first, 'exists'>);
    const held = fs.readFileSync(lockPath, 'utf8');

    // … the second, acting on its earlier (now outdated) view, must back off.
    const second = lockMod.tryTakeOver(lockPath, staleRaw, 'test', 0, '/b');
    assert.equal(second, 'exists');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), held);
    assert.deepEqual(takeoverClaims(store), []);
  });

  it('a takeover in progress by a live process blocks other contenders', () => {
    const store = trackStore();
    const lockPath = path.join(store, '.build.lock');
    const staleRaw = writeLock(store, exitedPid());
    const key = createHash('sha256')
      .update(staleRaw, 'utf8')
      .digest('hex')
      .slice(0, 16);
    const claim = `${lockPath}.takeover-${key}-0`;
    fs.writeFileSync(claim, `${process.pid}\n`, 'utf8');

    assert.equal(
      lockMod.tryTakeOver(lockPath, staleRaw, 'test', Date.now(), '/b'),
      'exists',
    );
    assert.equal(fs.readFileSync(lockPath, 'utf8'), staleRaw);

    // A claim left by a takeover that died midway is skipped.
    fs.writeFileSync(claim, `${exitedPid()}\n`, 'utf8');
    const h = lockMod.tryTakeOver(lockPath, staleRaw, 'test', Date.now(), '/c');
    assert.notEqual(h, 'exists');
    handles.push(h as Exclude<typeof h, 'exists'>);
    assert.deepEqual(takeoverClaims(store), []);
  });

  it('concurrent processes taking over one stale lock: one wins', async () => {
    const store = trackStore();
    writeLock(store, exitedPid());
    // All children spin until the same instant, then race for the lock and
    // hold it long enough for every other contender to see it.
    const startAt = Date.now() + 400;
    const indexJs = JSON.stringify(path.join(root, 'dist', 'index.js'));
    const script = `
      const { acquireBuildLock } = require(${indexJs});
      while (Date.now() < ${startAt}) {}
      let h;
      try {
        h = acquireBuildLock(${JSON.stringify(store)}, 'test', {
          onNotice: () => {},
        });
      } catch (e) {
        const locked = e.reason === 'build_locked';
        process.stdout.write(locked ? 'locked' : 'error:' + e.message);
        process.exit(0);
      }
      process.stdout.write('ok');
      setTimeout(() => h.release(), 1500);
    `;
    const runs = Array.from({ length: 8 }, () =>
      new Promise<string>((resolve, reject) => {
        const c = spawn(process.execPath, ['-e', script], {
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let out = '';
        c.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
        c.once('error', reject);
        c.once('exit', () => resolve(out));
      }),
    );
    const results = await Promise.all(runs);
    const summary = results.join(',');
    assert.equal(results.filter((r) => r === 'ok').length, 1, summary);
    assert.equal(results.filter((r) => r === 'locked').length, 7, summary);
    assert.equal(fs.existsSync(path.join(store, '.build.lock')), false);
    assert.deepEqual(takeoverClaims(store), []);
  });
});
