// gsd-graph — watch mode: debounced incremental sync on corpus file changes

/**
 * Continuous freshness without editor-specific hooks: fs.watch over the
 * project corpus roots, debounced into `projectSync` (incremental, under the
 * ordinary build lock). Works for Cursor/Codex/plain-editor users the
 * Claude-Code PostToolUse hook cannot reach.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ProjectSyncResult } from '../types';
import { projectSync, resolveProjectCorpus } from './project-sync';
import { registeredExtensions } from './extractors';

export interface WatchCorpusOptions {
  cwd?: string;
  /** Store directory override. */
  dir?: string;
  /** Explicit corpus roots; default: auto brownfield resolve. */
  corpus?: string[];
  /** Debounce window before a sync fires (default 2000ms). */
  debounceMs?: number;
  /** Called after each completed sync. */
  onSync?: (result: ProjectSyncResult) => void;
  /** Called on watch/sync errors (never throws out of the watcher). */
  onError?: (err: unknown) => void;
  /** Progress lines (forwarded to projectSync). */
  onProgress?: (message: string) => void;
}

export interface WatchHandle {
  /** Corpus roots being watched. */
  roots: string[];
  /** Stop watching and cancel any pending debounce. */
  close(): void;
}

/**
 * Watch corpus roots and run incremental syncs on relevant changes.
 * Returns a handle; the caller owns process lifetime.
 */
export function watchCorpus(opts?: WatchCorpusOptions): WatchHandle {
  const cwd = opts?.cwd ?? process.cwd();
  const debounceMs = opts?.debounceMs ?? 2000;
  const roots =
    opts?.corpus !== undefined && opts.corpus.length > 0
      ? opts.corpus.map((c) => path.resolve(cwd, c))
      : resolveProjectCorpus(cwd);

  const extensions = new Set(registeredExtensions());
  const watchers: fs.FSWatcher[] = [];
  let timer: NodeJS.Timeout | null = null;
  let syncing = false;
  let rerunAfter = false;
  let closed = false;

  const runSync = (): void => {
    if (closed) return;
    if (syncing) {
      rerunAfter = true;
      return;
    }
    syncing = true;
    try {
      const result = projectSync({
        cwd,
        ...(opts?.dir !== undefined ? { dir: opts.dir } : {}),
        ...(opts?.corpus !== undefined && opts.corpus.length > 0
          ? { corpus: roots }
          : {}),
        ...(opts?.onProgress !== undefined
          ? { onProgress: opts.onProgress }
          : {}),
      });
      opts?.onSync?.(result);
    } catch (err) {
      opts?.onError?.(err);
    } finally {
      syncing = false;
      if (rerunAfter) {
        rerunAfter = false;
        schedule();
      }
    }
  };

  const schedule = (): void => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(runSync, debounceMs);
    // Never keep the process alive on our own — the CLI owns lifetime.
    timer.unref?.();
  };

  const relevant = (fileName: string | null): boolean => {
    if (fileName === null) return true; // platform gave no name — be safe
    const ext = path.extname(fileName).toLowerCase();
    return extensions.has(ext);
  };

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const st = fs.statSync(root);
      const watcher = fs.watch(
        root,
        { recursive: st.isDirectory() },
        (_event, fileName) => {
          if (relevant(typeof fileName === 'string' ? fileName : null)) {
            schedule();
          }
        },
      );
      watcher.on('error', (err) => opts?.onError?.(err));
      watchers.push(watcher);
    } catch (err) {
      opts?.onError?.(err);
    }
  }

  return {
    roots,
    close(): void {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // already closed
        }
      }
    },
  };
}
