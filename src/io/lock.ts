// gsd-graph — exclusive .build.lock acquire / release / stale steal

import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { ensureStoreRoot, storeFile } from './paths';

/** Stale threshold: 15 minutes (STORE-04, DESIGN build locking). */
export const STALE_MS = 15 * 60 * 1000;

export type BuildLockOwner = 'cli' | 'lib' | 'mcp' | 'test';

export interface BuildLockPayload {
  pid: number;
  started_at: string;
  owner: BuildLockOwner;
  cwd: string;
}

export interface LockHandle {
  /** Idempotent release — unlinks .build.lock if still held. */
  release(): void;
  /** Absolute path to the lock file. */
  readonly lockPath: string;
  /** Payload written at acquire time. */
  readonly payload: BuildLockPayload;
}

export interface AcquireBuildLockOptions {
  /** Max time to wait/retry on contention (ms). Default 0 = fail-fast. */
  waitMs?: number;
  /** Override clock for tests (ms since epoch). */
  nowMs?: () => number;
  /** Override cwd recorded in payload. */
  cwd?: string;
  /** Sleep helper for waitMs loop (injectable in tests). */
  sleepMs?: (ms: number) => void;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPayload(lockPath: string): BuildLockPayload | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw) as Partial<BuildLockPayload>;
    if (
      typeof data.pid !== 'number' ||
      typeof data.started_at !== 'string' ||
      typeof data.owner !== 'string' ||
      typeof data.cwd !== 'string'
    ) {
      return null;
    }
    return data as BuildLockPayload;
  } catch {
    return null;
  }
}

function isStale(
  payload: BuildLockPayload,
  now: number,
): { stale: boolean; reason?: string } {
  const started = Date.parse(payload.started_at);
  if (!Number.isFinite(started) || now - started > STALE_MS) {
    return { stale: true, reason: 'age' };
  }
  if (!isPidAlive(payload.pid)) {
    return { stale: true, reason: 'dead_pid' };
  }
  return { stale: false };
}

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  // Busy-wait free: Atomics.wait on a SharedArrayBuffer
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

function tryAcquireOnce(
  lockPath: string,
  owner: BuildLockOwner,
  now: number,
  cwd: string,
): LockHandle | 'exists' {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return 'exists';
    throw err;
  }

  const payload: BuildLockPayload = {
    pid: process.pid,
    started_at: new Date(now).toISOString(),
    owner,
    cwd,
  };

  try {
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  let released = false;
  const handle: LockHandle = {
    lockPath,
    payload,
    release(): void {
      if (released) return;
      released = true;
      try {
        if (fs.existsSync(lockPath)) {
          // Only unlink if we still own it (same pid)
          const current = readPayload(lockPath);
          if (!current || current.pid === process.pid) {
            fs.unlinkSync(lockPath);
          }
        }
      } catch {
        // idempotent best-effort
      }
    },
  };
  return handle;
}

/**
 * Acquire exclusive `.build.lock` under storeRoot (STORE-04, D-06).
 *
 * - openSync(wx) exclusive create
 * - On EEXIST: steal if stale by age (15m) OR dead PID; else BUILD_LOCKED
 * - Default fail-fast (waitMs=0); optional wait/retry loop
 *
 * Caller must call handle.release() (use try/finally).
 */
export function acquireBuildLock(
  storeRoot: string,
  owner: BuildLockOwner,
  opts?: AcquireBuildLockOptions,
): LockHandle {
  const root = ensureStoreRoot(storeRoot);
  const lockPath = storeFile(root, '.build.lock');
  const waitMs = opts?.waitMs ?? 0;
  const nowMs = opts?.nowMs ?? Date.now;
  const cwd = opts?.cwd ?? process.cwd();
  const sleep = opts?.sleepMs ?? sleepSync;

  const deadline = nowMs() + Math.max(0, waitMs);
  let stoleOnce = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = nowMs();
    const result = tryAcquireOnce(lockPath, owner, now, cwd);
    if (result !== 'exists') {
      return result;
    }

    const payload = readPayload(lockPath);
    if (payload) {
      const { stale } = isStale(payload, now);
      if (stale && !stoleOnce) {
        // Steal: unlink and retry once
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // race — fall through
        }
        stoleOnce = true;
        continue;
      }
      if (stale && stoleOnce) {
        // Second steal attempt after failed race
        try {
          fs.unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
        const retry = tryAcquireOnce(lockPath, owner, nowMs(), cwd);
        if (retry !== 'exists') return retry;
      }
    } else {
      // Corrupt / unreadable lock — treat as stealable once
      if (!stoleOnce) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
        stoleOnce = true;
        continue;
      }
    }

    if (nowMs() >= deadline) {
      throw new GraphError(
        GSD_GRAPH_REASON.BUILD_LOCKED,
        `build lock held at ${lockPath}`,
        { lockPath, payload },
      );
    }

    // wait a bit and retry (reset steal flag so stale can be re-checked)
    const remaining = deadline - nowMs();
    const slice = Math.min(50, Math.max(1, remaining));
    sleep(slice);
    stoleOnce = false;
  }
}
