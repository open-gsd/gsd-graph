// gsd-graph — project corpus resolve + sync (brownfield + continuous update)

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { storeFile } from '../io/paths';
import type { BuildResult, ProjectSyncOptions, ProjectSyncResult } from '../types';
import { build } from './build';
import { detectCommunities } from './communities';
import { init } from './init';
import { writeGraphReport } from './report';

/** Default directory corpus roots for brownfield/project sync (if they exist). */
export const DEFAULT_PROJECT_CORPUS_DIRS = [
  '.planning',
  '.planning/codebase',
  'docs',
  'doc',
  'wiki',
  'architecture',
] as const;

/** Top-level documentation files included when present. */
export const DEFAULT_PROJECT_CORPUS_FILES = [
  'README.md',
  'README.markdown',
  'CONTRIBUTING.md',
  'ARCHITECTURE.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'CHANGELOG.md',
  'SECURITY.md',
] as const;

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-test',
  'coverage',
  '.gsd-graph',
  'graphify-out',
  '.memdb',
  '.memtrace',
]);

/**
 * Resolve brownfield/project corpus roots under cwd.
 *
 * Prefer planning + docs trees (not a full-repo recursive scan of `.`).
 * Single-file roots (README.md, etc.) are supported via discoverSources.
 * Optional config: `.planning/config.json` → `gsd_graph.corpus` string[].
 */
export function resolveProjectCorpus(
  cwd: string = process.cwd(),
  opts?: { extra?: string[]; configCorpus?: string[] | null },
): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  const add = (relOrAbs: string): void => {
    const abs = path.isAbsolute(relOrAbs)
      ? relOrAbs
      : path.resolve(cwd, relOrAbs);
    if (!fs.existsSync(abs)) return;
    let real: string;
    try {
      real = fs.realpathSync.native(abs);
    } catch {
      return;
    }
    // Never scan the graph store itself.
    if (path.basename(real) === '.gsd-graph') return;
    if (seen.has(real)) return;
    // Skip known huge / non-doc trees if someone passes them explicitly as dirs.
    if (fs.statSync(real).isDirectory() && SKIP_DIR_NAMES.has(path.basename(real))) {
      return;
    }
    seen.add(real);
    roots.push(real);
  };

  if (opts?.configCorpus && opts.configCorpus.length > 0) {
    for (const c of opts.configCorpus) add(c);
  } else {
    for (const d of DEFAULT_PROJECT_CORPUS_DIRS) add(d);
    for (const f of DEFAULT_PROJECT_CORPUS_FILES) add(f);
  }

  if (opts?.extra) {
    for (const e of opts.extra) add(e);
  }

  roots.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return roots;
}

export type GraphProjectConfig = {
  enabled?: boolean;
  auto_update?: boolean;
  store_dir?: string;
  corpus?: string[];
  full_on_enable?: boolean;
  communities_on_sync?: boolean;
  report_on_sync?: boolean;
};

function parseGraphFlags(g: Record<string, unknown>): GraphProjectConfig {
  const out: GraphProjectConfig = {};
  if (typeof g.enabled === 'boolean') out.enabled = g.enabled;
  if (typeof g.auto_update === 'boolean') out.auto_update = g.auto_update;
  if (typeof g.store_dir === 'string') out.store_dir = g.store_dir;
  if (Array.isArray(g.corpus)) {
    out.corpus = g.corpus.filter((x): x is string => typeof x === 'string');
  }
  if (typeof g.full_on_enable === 'boolean') {
    out.full_on_enable = g.full_on_enable;
  }
  if (typeof g.communities_on_sync === 'boolean') {
    out.communities_on_sync = g.communities_on_sync;
  }
  if (typeof g.report_on_sync === 'boolean') {
    out.report_on_sync = g.report_on_sync;
  }
  return out;
}

/**
 * Read project graph flags from store config (primary) then `.planning/config.json`.
 * Store path: `.gsd-graph/config.json` (or override via GSD_GRAPH_DIR / opts).
 */
export function readGraphProjectConfig(
  cwd: string = process.cwd(),
  storeDir?: string,
): GraphProjectConfig | null {
  const storeRoot = path.resolve(cwd, storeDir ?? '.gsd-graph');
  const storeConfigPath = path.join(storeRoot, 'config.json');
  let fromStore: GraphProjectConfig | null = null;
  if (fs.existsSync(storeConfigPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(storeConfigPath, 'utf8')) as Record<
        string,
        unknown
      >;
      fromStore = parseGraphFlags(raw);
    } catch {
      fromStore = null;
    }
  }

  const planning = readPlanningGraphConfig(cwd);
  if (!fromStore && !planning) return null;
  return { ...(planning ?? {}), ...(fromStore ?? {}) };
}

/**
 * Read optional gsd_graph section from `.planning/config.json`.
 */
export function readPlanningGraphConfig(
  cwd: string = process.cwd(),
): GraphProjectConfig | null {
  const configPath = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      gsd_graph?: Record<string, unknown>;
    };
    const g = raw.gsd_graph;
    if (!g || typeof g !== 'object') return null;
    return parseGraphFlags(g);
  } catch {
    return null;
  }
}

/**
 * Init (if needed) + build project corpus. Incremental by default.
 * Used by CLI `sync`, GSD skill brownfield/enable, and auto_update hooks.
 */
export function projectSync(opts?: ProjectSyncOptions): ProjectSyncResult {
  const cwd = opts?.cwd ?? process.cwd();
  const cfg = readGraphProjectConfig(cwd, opts?.dir);
  const dir = opts?.dir ?? cfg?.store_dir;
  const full = opts?.full === true;
  const communities =
    opts?.communities === true ||
    (opts?.communities !== false && cfg?.communities_on_sync === true);
  // Default report on when unset (enable path sets report_on_sync: true).
  const report =
    opts?.report === true ||
    (opts?.report !== false &&
      (cfg?.report_on_sync === true || cfg?.report_on_sync === undefined));

  const resolveOpts: {
    extra?: string[];
    configCorpus?: string[] | null;
  } = {
    configCorpus: opts?.corpus ?? cfg?.corpus ?? null,
  };
  if (opts?.extraCorpus !== undefined) {
    resolveOpts.extra = opts.extraCorpus;
  }
  const corpus = resolveProjectCorpus(cwd, resolveOpts);

  if (corpus.length === 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
      'no project corpus roots found — add docs/, README.md, or .planning/, or pass --corpus <path>',
      { cwd },
    );
  }

  const initResult = init({
    cwd,
    ...(dir !== undefined ? { dir } : {}),
  });

  const buildResult: BuildResult = build({
    corpus,
    ...(dir !== undefined ? { dir } : {}),
    full,
    writeReportOnBuild: report === true,
  });

  let communities_written = false;
  if (communities) {
    try {
      detectCommunities({ dir: buildResult.store_dir });
      communities_written = true;
    } catch {
      // non-fatal for sync — status still useful
      communities_written = false;
    }
  }

  let report_written = false;
  if (report) {
    try {
      writeGraphReport({ dir: buildResult.store_dir });
      report_written = true;
    } catch {
      report_written = false;
    }
  }

  // Persist last-sync metadata for hooks/status agents
  try {
    const statusPath = storeFile(buildResult.store_dir, '.last-sync-status.json');
    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          status: 'ok',
          full,
          corpus,
          node_count: buildResult.node_count,
          triple_count: buildResult.triple_count,
          communities_written,
          report_written,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  } catch {
    // ignore status write failures
  }

  return {
    store_dir: buildResult.store_dir,
    corpus,
    init: initResult,
    build: buildResult,
    communities_written,
    report_written,
    full,
  };
}
