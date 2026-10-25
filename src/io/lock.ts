// gsd-graph — exclusive .build.lock acquire / release / stale steal

import { createHash } from 'node:crypto';
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
  /**
   * One-line notice when a stale lock is taken over.
   * Default: written to stderr (stdout stays machine output).
   */
  onNotice?: (message: string) => void;
}

/**
 * Probe a lock owner pid with signal 0.
 *
 * - `dead`: no such process (ESRCH), or the recorded pid is not a valid pid
 * - `alive`: the process exists — including EPERM (it runs as another user)
 *   and any other error, which never counts as proof that the owner is gone
 */
export function lockOwnerState(pid: unknown): 'alive' | 'dead' {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return 'dead';
  }
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'alive';
  }
}

function readRaw(lockPath: string): string | null {
  try {
    return fs.readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
}

function readPayload(lockPath: string): BuildLockPayload | null {
  const raw = readRaw(lockPath);
  return raw === null ? null : parsePayload(raw);
}

function parsePayload(raw: string): BuildLockPayload | null {
  try {
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
): { stale: boolean; reason?: 'age' | 'dead_pid' } {
  const started = Date.parse(payload.started_at);
  if (!Number.isFinite(started) || now - started > STALE_MS) {
    return { stale: true, reason: 'age' };
  }
  if (lockOwnerState(payload.pid) === 'dead') {
    return { stale: true, reason: 'dead_pid' };
  }
  return { stale: false };
}

function staleNotice(
  lockPath: string,
  payload: BuildLockPayload,
  reason: 'age' | 'dead_pid',
): string {
  const why =
    reason === 'dead_pid'
      ? `pid ${payload.pid} is not running`
      : `older than ${STALE_MS / 60_000} min`;
  return (
    `[gsd-graph] taking over stale build lock ${lockPath} ` +
    `(${why}; started ${payload.started_at} by ${payload.owner})`
  );
}

/**
 * Grace for a lock or claim file that exists but has no readable content yet
 * (created with an exclusive open, content written right after).
 */
const UNWRITTEN_GRACE_MS = 5_000;

function claimAbandoned(claimPath: string, holder: string): boolean {
  if (holder.length === 0) {
    // The pid is written right after the exclusive create; an empty claim is
    // either being written now or was left by a crash in between.
    try {
      return Date.now() - fs.statSync(claimPath).mtimeMs > UNWRITTEN_GRACE_MS;
    } catch {
      return false;
    }
  }
  return lockOwnerState(Number.parseInt(holder, 10)) === 'dead';
}

function unreadableLockAbandoned(lockPath: string): boolean {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > UNWRITTEN_GRACE_MS;
  } catch {
    return false;
  }
}

function defaultNotice(message: string): void {
  process.stderr.write(`${message}\n`);
}

function unlinkQuiet(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    /* already gone */
  }
}

/**
 * Take over one stale lock instance (`staleRaw` = its exact file content).
 *
 * Removing a lock and creating a new one are two steps, so two processes that
 * both saw the same stale lock could otherwise both remove "it" — the second
 * one removing the fresh lock the first had just created — and both run. To
 * prevent that, a process must first win an exclusive claim file named after
 * this stale instance (`openSync(…, 'wx')`); only the claim holder re-checks
 * that the lock file still holds that instance and replaces it.
 *
 * A claim whose holder died (ESRCH) mid-takeover is skipped by claiming the
 * next generation, so a crash here cannot wedge the lock again. Claims are
 * removed once the stale instance is gone; a late process that then wins a
 * fresh claim finds different content and backs off.
 *
 * Exported for tests only (not part of the package index).
 */
export function tryTakeOver(
  lockPath: string,
  staleRaw: string,
  owner: BuildLockOwner,
  now: number,
  cwd: string,
): LockHandle | 'exists' {
  const key = createHash('sha256')
    .update(staleRaw, 'utf8')
    .digest('hex')
    .slice(0, 16);
  const claims: string[] = [];
  let claimed = false;
  for (let gen = 0, attempts = 0; gen < 16 && attempts < 64; attempts++) {
    const claimPath = `${lockPath}.takeover-${key}-${gen}`;
    try {
      const fd = fs.openSync(claimPath, 'wx');
      try {
        fs.writeFileSync(fd, `${process.pid}\n`, 'utf8');
      } finally {
        fs.closeSync(fd);
      }
      claims.push(claimPath);
      claimed = true;
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const holder = readRaw(claimPath);
    // Claim vanished: the takeover finished (or was abandoned); try again.
    if (holder === null) continue;
    if (claimAbandoned(claimPath, holder)) {
      claims.push(claimPath);
      gen += 1;
      continue;
    }
    // Another live process is taking this lock over right now.
    return 'exists';
  }
  if (!claimed) return 'exists';

  try {
    if (readRaw(lockPath) !== staleRaw) {
      // Already replaced or released — not ours to remove.
      return 'exists';
    }
    fs.unlinkSync(lockPath);
    return tryAcquireOnce(lockPath, owner, now, cwd);
  } finally {
    // The stale instance is gone now (or never was ours): drop its claims.
    for (const c of claims) unlinkQuiet(c);
  }
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
 * - On EEXIST: take over if stale by age (15m) OR dead owner PID (ESRCH;
 *   EPERM = alive under another user = held), with a one-line notice;
 *   else BUILD_LOCKED. Takeover is exclusive per stale lock instance
 *   (see tryTakeOver), so concurrent acquirers cannot both take it over.
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
  const notice = opts?.onNotice ?? defaultNotice;

  const deadline = nowMs() + Math.max(0, waitMs);
  let stoleOnce = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = nowMs();
    const result = tryAcquireOnce(lockPath, owner, now, cwd);
    if (result !== 'exists') {
      return result;
    }

    const raw = readRaw(lockPath);
    const payload = raw === null ? null : parsePayload(raw);
    if (raw !== null && payload) {
      const stale = isStale(payload, now);
      if (stale.reason !== undefined && !stoleOnce) {
        stoleOnce = true;
        const taken = tryTakeOver(lockPath, raw, owner, now, cwd);
        if (taken !== 'exists') {
          notice(staleNotice(lockPath, payload, stale.reason));
          return taken;
        }
        // Another process took it over (or it was released): look again.
        continue;
      }
    } else if (raw === null) {
      // Released meanwhile → just retry.
      if (!stoleOnce) {
        stoleOnce = true;
        continue;
      }
    } else if (!stoleOnce && unreadableLockAbandoned(lockPath)) {
      // Corrupt lock — stealable once, through the same exclusive takeover.
      // A fresh unreadable lock is a new lock whose payload is still being
      // written, so it counts as held.
      stoleOnce = true;
      const taken = tryTakeOver(lockPath, raw, owner, now, cwd);
      if (taken !== 'exists') {
        notice(`[gsd-graph] taking over unreadable build lock ${lockPath}`);
        return taken;
      }
      continue;
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
