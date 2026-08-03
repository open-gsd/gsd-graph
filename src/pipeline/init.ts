// gsd-graph — init store layout + gitignore append (CLI-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_WRITE_PROJECTION } from '../io/atomic-publish';
import {
  DEFAULT_STORE_DIR,
  ensureStoreRoot,
  resolveStoreRoot,
  storeFile,
} from '../io/paths';
import type { InitOptions, InitResult } from '../types';

const DEFAULT_ONTOLOGY = 'general';
const SNAPSHOTS_DIR = 'snapshots';

/**
 * Initialize a gsd-graph store under the resolved root (CLI-03, D-05).
 *
 * - Creates store root via resolveStoreRoot + ensureStoreRoot
 * - Writes minimal config.json when missing
 * - Ensures snapshots/ directory
 * - Appends relative store entry to existing .gitignore only (never creates one)
 *
 * `created` is true when the store root did not exist before this call, or
 * when config.json was written this call.
 */
export function init(opts?: InitOptions): InitResult {
  const cwd = opts?.cwd ?? process.cwd();
  const ontology = opts?.ontology ?? DEFAULT_ONTOLOGY;

  const resolveOpts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    dir?: string;
  } = { cwd, env: {} };
  if (opts?.dir !== undefined) {
    resolveOpts.dir = opts.dir;
  }
  const resolved = resolveStoreRoot(resolveOpts);
  const rootExisted = fs.existsSync(resolved);
  const storeRoot = ensureStoreRoot(resolved);

  const configPath = storeFile(storeRoot, 'config.json');
  let configWritten = false;
  if (!fs.existsSync(configPath)) {
    const config = {
      ontology,
      store: {
        write_projection: DEFAULT_WRITE_PROJECTION,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    configWritten = true;
  }

  const snapshotsPath = path.join(storeRoot, SNAPSHOTS_DIR);
  if (!fs.existsSync(snapshotsPath)) {
    fs.mkdirSync(snapshotsPath, { recursive: true });
  }

  // Gitignore entry uses the operator-facing relative path (opts.dir or
  // DEFAULT_STORE_DIR), not realpath(storeRoot), so macOS /var→/private/var
  // does not produce a broken relative path (CLI-03, D-05).
  const gitignore_appended = appendGitignoreIfNeeded(cwd, opts?.dir);

  return {
    store_dir: storeRoot,
    created: !rootExisted || configWritten,
    gitignore_appended,
    ontology: readOntologyFromConfig(configPath, ontology),
  };
}

function readOntologyFromConfig(configPath: string, fallback: string): string {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { ontology?: unknown };
    if (typeof parsed.ontology === 'string' && parsed.ontology.length > 0) {
      return parsed.ontology;
    }
  } catch {
    // fall through
  }
  return fallback;
}

/**
 * Compute the gitignore store entry (trailing slash, forward slashes).
 * Uses the operator-facing dir string (relative preferred), not realpath.
 */
function gitignoreEntry(cwd: string, dirOpt?: string): string {
  const raw = dirOpt ?? DEFAULT_STORE_DIR;
  let entry: string;
  if (path.isAbsolute(raw)) {
    entry = path.relative(cwd, raw);
    if (!entry || entry === '.') {
      entry = path.basename(raw);
    }
  } else {
    entry = raw;
  }
  entry = entry.split(path.sep).join('/');
  // Drop leading ./
  if (entry.startsWith('./')) {
    entry = entry.slice(2);
  }
  if (!entry.endsWith('/')) {
    entry = `${entry}/`;
  }
  return entry;
}

/**
 * Append relative store path (with trailing /) to .gitignore when the file
 * exists and the entry is missing. Never creates .gitignore (D-05, K26).
 */
function appendGitignoreIfNeeded(cwd: string, dirOpt?: string): boolean {
  const giPath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(giPath)) {
    return false;
  }

  const entry = gitignoreEntry(cwd, dirOpt);
  const entryNoSlash = entry.endsWith('/') ? entry.slice(0, -1) : entry;

  const existing = fs.readFileSync(giPath, 'utf8');
  const lines = existing.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === entry || trimmed === entryNoSlash) {
      return false;
    }
  }

  let next = existing;
  if (next.length > 0 && !next.endsWith('\n')) {
    next += '\n';
  }
  next += `${entry}\n`;
  fs.writeFileSync(giPath, next, 'utf8');
  return true;
}
