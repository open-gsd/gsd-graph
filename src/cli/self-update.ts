// gsd-graph — package version + self-update from npm

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';

export interface PackageMeta {
  name: string;
  version: string;
  package_root: string;
}

export type InstallKind = 'global' | 'local' | 'linked' | 'unknown';

export interface VersionInfo {
  name: string;
  version: string;
  install_kind: InstallKind;
  package_root: string;
  node: string;
  platform: string;
  latest?: string | null;
  update_available?: boolean;
}

export interface UpdateResult {
  ok: true;
  name: string;
  from: string;
  to: string;
  install_kind: InstallKind;
  command: string[];
  changed: boolean;
  stdout_tail: string;
}

/** Resolve package root (dist/cli → ../..). */
export function resolveCliPackageRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export function readPackageMeta(
  packageRoot: string = resolveCliPackageRoot(),
): PackageMeta {
  const pkgPath = path.join(packageRoot, 'package.json');
  try {
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      name?: string;
      version?: string;
    };
    return {
      name:
        typeof raw.name === 'string' && raw.name.length > 0
          ? raw.name
          : '@opengsd/gsd-graph',
      version:
        typeof raw.version === 'string' && raw.version.length > 0
          ? raw.version
          : '0.0.0',
      package_root: packageRoot,
    };
  } catch {
    return {
      name: '@opengsd/gsd-graph',
      version: '0.0.0',
      package_root: packageRoot,
    };
  }
}

export function detectInstallKind(
  packageRoot: string = resolveCliPackageRoot(),
): InstallKind {
  const real = (() => {
    try {
      return fs.realpathSync.native(packageRoot);
    } catch {
      return packageRoot;
    }
  })();

  // npm link / file: install often has no nested node_modules/@scope/name path
  // under a project, but may live outside npm root.
  const nmMarker = `${path.sep}node_modules${path.sep}`;
  if (!real.includes(nmMarker)) {
    return 'linked';
  }

  const globalRoot = runNpmCapture(['root', '-g']);
  if (globalRoot.ok && globalRoot.stdout) {
    const g = path.resolve(globalRoot.stdout.trim());
    if (real === g || real.startsWith(g + path.sep)) {
      return 'global';
    }
  }

  if (real.includes(nmMarker)) {
    return 'local';
  }
  return 'unknown';
}

function runNpmCapture(args: string[]): {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('npm', args, {
    encoding: 'utf8',
    env: process.env,
    // Prefer network for view/install; fail soft for offline version checks.
  });
  return {
    ok: r.status === 0,
    code: r.status,
    stdout: (r.stdout ?? '').toString(),
    stderr: (r.stderr ?? '').toString(),
  };
}

/** Best-effort latest version from registry (null if offline / error). */
export function fetchLatestVersion(packageName: string): string | null {
  const r = runNpmCapture(['view', packageName, 'version', '--json']);
  if (!r.ok) return null;
  const t = r.stdout.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (typeof parsed === 'string') return parsed;
  } catch {
    // npm sometimes prints bare version without JSON
    if (/^\d+\.\d+\.\d+/.test(t)) return t.split(/\s/)[0] ?? null;
  }
  // bare line
  const line = t.split(/\r?\n/).find((l) => /^\d+\.\d+\.\d+/.test(l.trim()));
  return line?.trim() ?? null;
}

export function getVersionInfo(opts?: {
  checkLatest?: boolean;
}): VersionInfo {
  const meta = readPackageMeta();
  const install_kind = detectInstallKind(meta.package_root);
  const info: VersionInfo = {
    name: meta.name,
    version: meta.version,
    install_kind,
    package_root: meta.package_root,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  };
  if (opts?.checkLatest) {
    const latest = fetchLatestVersion(meta.name);
    info.latest = latest;
    if (latest !== null) {
      info.update_available = latest !== meta.version;
    }
  }
  return info;
}

/**
 * Install latest package via npm (global or cwd-local depending on install kind).
 */
export function selfUpdate(opts?: {
  cwd?: string;
  onProgress?: (message: string) => void;
}): UpdateResult {
  const meta = readPackageMeta();
  const install_kind = detectInstallKind(meta.package_root);
  const progress = opts?.onProgress;
  const cwd = opts?.cwd ?? process.cwd();

  progress?.(`Checking latest ${meta.name}…`);
  const latest = fetchLatestVersion(meta.name);
  if (!latest) {
    throw new GraphError(
      GSD_GRAPH_REASON.UPDATE_FAILED,
      `could not resolve latest version of ${meta.name} (npm view failed / offline)`,
      { name: meta.name },
    );
  }

  if (latest === meta.version) {
    progress?.(`Already on latest ${latest}`);
    return {
      ok: true,
      name: meta.name,
      from: meta.version,
      to: latest,
      install_kind,
      command: [],
      changed: false,
      stdout_tail: '',
    };
  }

  const pkgSpec = `${meta.name}@${latest}`;
  let command: string[];
  if (install_kind === 'global' || install_kind === 'unknown') {
    // Default to global for unknown/bin installs — matches `npm i -g` UX.
    command = ['install', '-g', pkgSpec];
  } else if (install_kind === 'local') {
    command = ['install', pkgSpec];
  } else {
    // linked / dev checkout — refuse to overwrite source tree silently
    throw new GraphError(
      GSD_GRAPH_REASON.UPDATE_FAILED,
      `refusing to self-update a linked/dev install at ${meta.package_root}; run: npm install -g ${pkgSpec}`,
      { package_root: meta.package_root, install_kind },
    );
  }

  progress?.(`Installing ${pkgSpec} (${install_kind})…`);
  const r = spawnSync('npm', command, {
    encoding: 'utf8',
    cwd: install_kind === 'local' ? cwd : undefined,
    env: process.env,
  });

  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (r.status !== 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.UPDATE_FAILED,
      `npm ${command.join(' ')} failed (exit ${r.status}): ${out.slice(-500)}`,
      { command, status: r.status },
    );
  }

  progress?.(`Updated ${meta.version} → ${latest}`);
  return {
    ok: true,
    name: meta.name,
    from: meta.version,
    to: latest,
    install_kind,
    command: ['npm', ...command],
    changed: true,
    stdout_tail: out.slice(-800),
  };
}

/** True when argv is only asking for version/update (no other command). */
export function isSelfMetaArgv(argv: string[]): boolean {
  // argv like process.argv: [node, script, ...args]
  const args = argv.slice(2).filter((a) => a.length > 0);
  if (args.length === 0) return false;
  const meta = new Set([
    '-V',
    '--version',
    '-U',
    '--update',
    '--pretty',
    '--compact',
    '--dir',
  ]);
  // allow --dir <path> pair
  let i = 0;
  let sawMeta = false;
  while (i < args.length) {
    const a = args[i]!;
    if (a === '--dir') {
      i += 2;
      continue;
    }
    if (a.startsWith('--dir=')) {
      i += 1;
      continue;
    }
    if (a === '--pretty' || a === '--compact') {
      i += 1;
      continue;
    }
    if (
      a === '-V' ||
      a === '--version' ||
      a === '-U' ||
      a === '--update' ||
      a === 'version' ||
      a === 'update'
    ) {
      sawMeta = true;
      i += 1;
      continue;
    }
    // unknown / real command
    if (!meta.has(a) && !a.startsWith('-')) {
      return false;
    }
    if (a.startsWith('-') && !meta.has(a)) {
      return false;
    }
    i += 1;
  }
  return sawMeta;
}

export function argvWantsVersion(argv: string[]): boolean {
  return argv.slice(2).some((a) => a === '-V' || a === '--version' || a === 'version');
}

export function argvWantsUpdate(argv: string[]): boolean {
  return argv.slice(2).some((a) => a === '-U' || a === '--update' || a === 'update');
}
