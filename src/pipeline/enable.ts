// gsd-graph — one-command project enable (skill + hooks + config + full sync)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_STORE_DIR, resolveStoreRoot, storeFile } from '../io/paths';
import type { EnableOptions, EnableResult, ProjectSyncResult } from '../types';
import { projectSync } from './project-sync';

const SKILL_TARGETS = [
  ['.agents', 'skills', 'gsd-graph'],
  ['.claude', 'skills', 'gsd-graph'],
] as const;

/**
 * Resolve package root (contains skills/, hooks/, package.json).
 * Works when running from published package or monorepo checkout.
 */
export function resolvePackageRoot(
  fromDir: string = __dirname,
): string | null {
  let cur = path.resolve(fromDir);
  for (let i = 0; i < 8; i++) {
    const pkgJson = path.join(cur, 'package.json');
    const skill = path.join(cur, 'skills', 'gsd-graph', 'SKILL.md');
    if (fs.existsSync(pkgJson) && fs.existsSync(skill)) {
      try {
        const name = (
          JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { name?: string }
        ).name;
        if (name === '@opengsd/gsd-graph' || name === 'gsd-graph') return cur;
      } catch {
        /* continue walk */
      }
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Published layout: dist/pipeline/enable.js → package root is ../..
  const published = path.resolve(fromDir, '..', '..');
  if (fs.existsSync(path.join(published, 'skills', 'gsd-graph', 'SKILL.md'))) {
    return published;
  }
  return null;
}

function copyFile(src: string, dest: string, executable = false): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (executable) {
    try {
      fs.chmodSync(dest, 0o755);
    } catch {
      /* windows */
    }
  }
}

/** Install agent skill into user skill dirs (best-effort). */
export function installSkill(pkgRoot: string): string[] {
  const skillSrc = path.join(pkgRoot, 'skills', 'gsd-graph', 'SKILL.md');
  if (!fs.existsSync(skillSrc)) return [];
  const home = os.homedir();
  const installed: string[] = [];
  for (const parts of SKILL_TARGETS) {
    const dir = path.join(home, ...parts);
    try {
      fs.mkdirSync(dir, { recursive: true });
      copyFile(skillSrc, path.join(dir, 'SKILL.md'));
      installed.push(dir);
    } catch {
      /* skip unwritable homes */
    }
  }
  return installed;
}

/** Copy continuous-update hooks into the project store. */
export function installHooks(pkgRoot: string, storeRoot: string): string {
  const destHooks = path.join(storeRoot, 'hooks');
  const hooksSrc = path.join(pkgRoot, 'hooks');
  copyFile(
    path.join(hooksSrc, 'gsd-graph-update.sh'),
    path.join(destHooks, 'gsd-graph-update.sh'),
    true,
  );
  copyFile(
    path.join(hooksSrc, 'lib', 'gsd-graph-rebuild.sh'),
    path.join(destHooks, 'lib', 'gsd-graph-rebuild.sh'),
    true,
  );
  return destHooks;
}

/**
 * Write auto-update flags into store config.json (primary) and optionally
 * merge into .planning/config.json when that file already exists.
 */
export function writeEnableConfig(opts: {
  cwd: string;
  storeRoot: string;
  autoUpdate: boolean;
  reportOnSync: boolean;
  communitiesOnSync: boolean;
}): { store_config: string; planning_config: string | null } {
  const storeConfigPath = storeFile(opts.storeRoot, 'config.json');
  let storeConfig: Record<string, unknown> = {};
  if (fs.existsSync(storeConfigPath)) {
    try {
      storeConfig = JSON.parse(
        fs.readFileSync(storeConfigPath, 'utf8'),
      ) as Record<string, unknown>;
    } catch {
      storeConfig = {};
    }
  }
  storeConfig.enabled = true;
  storeConfig.auto_update = opts.autoUpdate;
  storeConfig.report_on_sync = opts.reportOnSync;
  storeConfig.communities_on_sync = opts.communitiesOnSync;
  if (storeConfig.ontology === undefined) storeConfig.ontology = 'general';
  if (storeConfig.store === undefined) {
    storeConfig.store = { write_projection: true };
  }
  fs.mkdirSync(opts.storeRoot, { recursive: true });
  fs.writeFileSync(
    storeConfigPath,
    JSON.stringify(storeConfig, null, 2) + '\n',
    'utf8',
  );

  let planningPath: string | null = null;
  const planningConfigPath = path.join(opts.cwd, '.planning', 'config.json');
  if (fs.existsSync(planningConfigPath)) {
    try {
      const planning = JSON.parse(
        fs.readFileSync(planningConfigPath, 'utf8'),
      ) as Record<string, unknown>;
      const g =
        planning.gsd_graph && typeof planning.gsd_graph === 'object'
          ? (planning.gsd_graph as Record<string, unknown>)
          : {};
      g.enabled = true;
      g.auto_update = opts.autoUpdate;
      g.store_dir = g.store_dir ?? DEFAULT_STORE_DIR;
      g.report_on_sync = opts.reportOnSync;
      g.communities_on_sync = opts.communitiesOnSync;
      g.full_on_enable = true;
      planning.gsd_graph = g;
      fs.writeFileSync(
        planningConfigPath,
        JSON.stringify(planning, null, 2) + '\n',
        'utf8',
      );
      planningPath = planningConfigPath;
    } catch {
      planningPath = null;
    }
  }

  return { store_config: storeConfigPath, planning_config: planningPath };
}

/**
 * One-shot enable for brownfield + continuous update:
 * skill install → hooks → config → full project sync.
 *
 * Intended UX:
 *   npm i @opengsd/gsd-graph
 *   npx gsd-graph enable
 *   npx gsd-graph ask "…"
 */
export function enable(opts?: EnableOptions): EnableResult {
  const cwd = opts?.cwd ?? process.cwd();
  const autoUpdate = opts?.autoUpdate !== false;
  const report = opts?.report !== false;
  const communities = opts?.communities === true;
  const skipSync = opts?.skipSync === true;
  const dir = opts?.dir;
  const progress = opts?.onProgress;

  const resolveOpts: { cwd: string; dir?: string } = { cwd };
  if (dir !== undefined) resolveOpts.dir = dir;
  progress?.('Preparing store…');
  const storeRoot = resolveStoreRoot(resolveOpts);
  fs.mkdirSync(storeRoot, { recursive: true });

  const pkgRoot = opts?.packageRoot ?? resolvePackageRoot();
  progress?.('Installing agent skill…');
  const skills_installed = pkgRoot ? installSkill(pkgRoot) : [];
  progress?.('Installing continuous-update hooks…');
  const hooks_dir = pkgRoot
    ? installHooks(pkgRoot, storeRoot)
    : path.join(storeRoot, 'hooks');

  progress?.('Writing config…');
  const configPaths = writeEnableConfig({
    cwd,
    storeRoot,
    autoUpdate,
    reportOnSync: report,
    communitiesOnSync: communities,
  });

  let sync: ProjectSyncResult | null = null;
  if (!skipSync) {
    progress?.('Starting full project sync…');
    sync = projectSync({
      cwd,
      ...(dir !== undefined ? { dir } : {}),
      full: true,
      report,
      ...(communities ? { communities: true } : {}),
      ...(progress !== undefined ? { onProgress: progress } : {}),
    });
  } else {
    progress?.('Skipping corpus sync (--skip-sync)…');
  }

  progress?.(
    sync
      ? `Done — ${sync.build.node_count} nodes, ${sync.build.triple_count} triples`
      : 'Done — skill/hooks installed',
  );

  return {
    store_dir: sync?.store_dir ?? storeRoot,
    skills_installed,
    hooks_dir,
    store_config: configPaths.store_config,
    planning_config: configPaths.planning_config,
    auto_update: autoUpdate,
    sync,
    next: {
      ask: 'gsd-graph ask "your multi-hop question"',
      sync: 'gsd-graph sync',
      status: 'gsd-graph status',
      hook: path.join(hooks_dir, 'gsd-graph-update.sh'),
    },
  };
}
