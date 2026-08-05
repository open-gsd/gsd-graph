// gsd-graph — register MCP server with Claude / Codex / Cursor

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_STORE_DIR, resolveStoreRoot } from '../io/paths';
import { readPackageMeta, resolveCliPackageRoot } from './self-update';

export type McpHostId = 'claude' | 'codex' | 'cursor' | 'project';

export interface McpLaunch {
  command: string;
  args: string[];
}

export interface McpHostResult {
  host: McpHostId;
  ok: boolean;
  action: 'installed' | 'updated' | 'skipped' | 'failed' | 'checked';
  path?: string;
  message: string;
}

export interface McpInstallOptions {
  cwd?: string;
  /** Store directory override (relative or absolute). */
  dir?: string;
  /** Hosts to configure; default all detected + project .mcp.json */
  hosts?: McpHostId[];
  /** Pin npm package version in launch args (default: this package version). */
  packageVersion?: string;
  allowBuild?: boolean;
  allowReviewWrite?: boolean;
  onProgress?: (message: string) => void;
}

export interface McpInstallResult {
  store_dir: string;
  launch: McpLaunch;
  hosts: McpHostResult[];
  next: string[];
}

export interface McpDoctorCheck {
  id: string;
  ok: boolean;
  message: string;
}

export interface McpDoctorResult {
  ok: boolean;
  store_dir: string;
  launch: McpLaunch;
  checks: McpDoctorCheck[];
  hosts: McpHostResult[];
  next: string[];
}

const ALL_HOSTS: McpHostId[] = ['claude', 'codex', 'cursor', 'project'];

/** Resolve absolute store path for MCP --dir. */
export function resolveMcpStoreDir(opts?: {
  cwd?: string;
  dir?: string;
}): string {
  const cwd = opts?.cwd ?? process.cwd();
  const raw = opts?.dir ?? DEFAULT_STORE_DIR;
  const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  try {
    return fs.existsSync(abs) ? fs.realpathSync.native(abs) : abs;
  } catch {
    return abs;
  }
}

/**
 * Prefer global `gsd-graph-mcp` on PATH; else npx pinned package.
 * `preferPortable: true` skips machine-local node/bin paths (for shareable
 * project `.mcp.json`).
 */
export function resolveMcpLaunch(opts?: {
  storeDir: string;
  packageVersion?: string;
  allowBuild?: boolean;
  allowReviewWrite?: boolean;
  /** Prefer npx / global bin (no absolute package-bin + process.execPath). */
  preferPortable?: boolean;
}): McpLaunch {
  const storeDir = opts?.storeDir ?? resolveMcpStoreDir();
  const meta = readPackageMeta(resolveCliPackageRoot());
  const version = opts?.packageVersion ?? meta.version;
  const extra: string[] = ['--dir', storeDir];
  if (opts?.allowBuild) extra.push('--allow-build');
  if (opts?.allowReviewWrite) extra.push('--allow-review-write');

  // Prefer local package bin when running from install tree (user-local hosts)
  if (!opts?.preferPortable) {
    const pkgBin = path.join(resolveCliPackageRoot(), 'bin', 'gsd-graph-mcp.js');
    if (fs.existsSync(pkgBin)) {
      return {
        command: process.execPath,
        args: [pkgBin, ...extra],
      };
    }
  }

  const which = spawnSync('command', ['-v', 'gsd-graph-mcp'], {
    encoding: 'utf8',
    shell: true,
  });
  const globalBin = (which.stdout ?? '').trim();
  if (which.status === 0 && globalBin.length > 0 && fs.existsSync(globalBin)) {
    return { command: globalBin, args: extra };
  }

  // npx fallback — pin version for stability
  return {
    command: 'npx',
    args: [
      '-y',
      '-p',
      `${meta.name}@${version}`,
      'gsd-graph-mcp',
      ...extra,
    ],
  };
}

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  } catch {
    /* corrupt → start fresh merge base */
  }
  return {};
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function mergeJsonMcpServer(
  filePath: string,
  serverName: string,
  launch: McpLaunch,
): { action: 'installed' | 'updated'; path: string } {
  const doc = readJsonFile(filePath);
  const servers =
    doc.mcpServers && typeof doc.mcpServers === 'object'
      ? ({ ...(doc.mcpServers as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};
  const existed = serverName in servers;
  servers[serverName] = {
    command: launch.command,
    args: launch.args,
  };
  doc.mcpServers = servers;
  writeJsonFile(filePath, doc);
  return {
    action: existed ? 'updated' : 'installed',
    path: filePath,
  };
}

/** Insert or replace [mcp_servers.gsd-graph] block in Codex config.toml */
export function upsertCodexMcpServer(
  configPath: string,
  launch: McpLaunch,
): { action: 'installed' | 'updated'; path: string } {
  const header = '[mcp_servers.gsd-graph]';
  const block = [
    header,
    `command = ${tomlString(launch.command)}`,
    'args = [',
    ...launch.args.map((a) => `  ${tomlString(a)},`),
    ']',
    '',
  ].join('\n');

  let text = '';
  let existed = false;
  if (fs.existsSync(configPath)) {
    text = fs.readFileSync(configPath, 'utf8');
    existed = text.includes(header);
    // Remove existing block (until next [section] or EOF)
    const re =
      /\[mcp_servers\.gsd-graph\][^\n]*(?:\n(?!\[)[^\n]*)*\n?/g;
    text = text.replace(re, '');
    if (!text.endsWith('\n') && text.length > 0) text += '\n';
    text += '\n' + block;
  } else {
    text = block;
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, text, 'utf8');
  return {
    action: existed ? 'updated' : 'installed',
    path: configPath,
  };
}

function tomlString(s: string): string {
  return JSON.stringify(s);
}

function claudeCliAvailable(): boolean {
  const r = spawnSync('claude', ['--version'], {
    encoding: 'utf8',
    shell: true,
  });
  return r.status === 0;
}

function installClaude(
  launch: McpLaunch,
  progress?: (m: string) => void,
): McpHostResult {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  // Prefer `claude mcp add` when CLI exists
  if (claudeCliAvailable()) {
    progress?.('Registering with Claude Code CLI…');
    // Remove first so re-runs update args
    spawnSync('claude', ['mcp', 'remove', 'gsd-graph'], {
      encoding: 'utf8',
      shell: true,
    });
    const args = [
      'mcp',
      'add',
      'gsd-graph',
      '--',
      launch.command,
      ...launch.args,
    ];
    const r = spawnSync('claude', args, {
      encoding: 'utf8',
      shell: true,
    });
    if (r.status === 0) {
      return {
        host: 'claude',
        ok: true,
        action: 'installed',
        message: 'Registered via `claude mcp add gsd-graph`',
      };
    }
    // Fall through to settings.json merge
  }

  progress?.('Writing ~/.claude/settings.json…');
  try {
    const res = mergeJsonMcpServer(settingsPath, 'gsd-graph', launch);
    return {
      host: 'claude',
      ok: true,
      action: res.action,
      path: res.path,
      message: `Merged into ${res.path}`,
    };
  } catch (err) {
    return {
      host: 'claude',
      ok: false,
      action: 'failed',
      path: settingsPath,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function installCodex(
  launch: McpLaunch,
  progress?: (m: string) => void,
): McpHostResult {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  progress?.('Updating ~/.codex/config.toml…');
  try {
    const res = upsertCodexMcpServer(configPath, launch);
    return {
      host: 'codex',
      ok: true,
      action: res.action,
      path: res.path,
      message: `${res.action} [mcp_servers.gsd-graph] in ${res.path}`,
    };
  } catch (err) {
    return {
      host: 'codex',
      ok: false,
      action: 'failed',
      path: configPath,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function installCursor(
  launch: McpLaunch,
  progress?: (m: string) => void,
): McpHostResult {
  const filePath = path.join(os.homedir(), '.cursor', 'mcp.json');
  progress?.('Writing ~/.cursor/mcp.json…');
  try {
    const res = mergeJsonMcpServer(filePath, 'gsd-graph', launch);
    return {
      host: 'cursor',
      ok: true,
      action: res.action,
      path: res.path,
      message: `Merged into ${res.path}`,
    };
  } catch (err) {
    return {
      host: 'cursor',
      ok: false,
      action: 'failed',
      path: filePath,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function installProject(
  cwd: string,
  launch: McpLaunch,
  progress?: (m: string) => void,
): McpHostResult {
  const filePath = path.join(cwd, '.mcp.json');
  progress?.('Writing project .mcp.json…');
  try {
    const res = mergeJsonMcpServer(filePath, 'gsd-graph', launch);
    return {
      host: 'project',
      ok: true,
      action: res.action,
      path: res.path,
      message: `Merged into ${res.path} (commit this for teammates)`,
    };
  } catch (err) {
    return {
      host: 'project',
      ok: false,
      action: 'failed',
      path: filePath,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function hostDetected(host: McpHostId): boolean {
  switch (host) {
    case 'claude':
      return (
        claudeCliAvailable() ||
        fs.existsSync(path.join(os.homedir(), '.claude'))
      );
    case 'codex':
      return fs.existsSync(path.join(os.homedir(), '.codex'));
    case 'cursor':
      return fs.existsSync(path.join(os.homedir(), '.cursor'));
    case 'project':
      return true;
    default:
      return false;
  }
}

/**
 * Install gsd-graph MCP into host configs.
 */
export function mcpInstall(opts?: McpInstallOptions): McpInstallResult {
  const cwd = opts?.cwd ?? process.cwd();
  const progress = opts?.onProgress;
  const store_dir = resolveMcpStoreDir({
    cwd,
    ...(opts?.dir !== undefined ? { dir: opts.dir } : {}),
  });

  const launchOpts = {
    storeDir: store_dir,
    ...(opts?.packageVersion !== undefined
      ? { packageVersion: opts.packageVersion }
      : {}),
    ...(opts?.allowBuild === true ? { allowBuild: true } : {}),
    ...(opts?.allowReviewWrite === true ? { allowReviewWrite: true } : {}),
  };
  // User-local hosts: prefer absolute package bin for reliability
  const launch = resolveMcpLaunch(launchOpts);
  // Project .mcp.json: portable npx/global so teammates can commit it
  const projectStoreDir = (() => {
    const rel = path.relative(cwd, store_dir);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.split(path.sep).join('/'); // posix for JSON configs
    }
    return store_dir;
  })();
  const projectLaunch = resolveMcpLaunch({
    ...launchOpts,
    storeDir: projectStoreDir,
    preferPortable: true,
  });

  const requested = opts?.hosts?.length ? opts.hosts : ALL_HOSTS;
  const hosts: McpHostResult[] = [];

  for (const host of requested) {
    if (host !== 'project' && !hostDetected(host)) {
      hosts.push({
        host,
        ok: true,
        action: 'skipped',
        message: `${host} not detected on this machine`,
      });
      continue;
    }
    if (host === 'claude') hosts.push(installClaude(launch, progress));
    else if (host === 'codex') hosts.push(installCodex(launch, progress));
    else if (host === 'cursor') hosts.push(installCursor(launch, progress));
    else if (host === 'project')
      hosts.push(installProject(cwd, projectLaunch, progress));
  }

  const next = [
    'Restart Claude Code / Codex / Cursor so MCP tools load',
    'Verify: gsd-graph mcp doctor',
    'Tools: graph_status, graph_query, graph_pack, graph_answer',
  ];

  return { store_dir, launch, hosts, next };
}

function claudeHasServer(): boolean {
  if (!claudeCliAvailable()) {
    const settings = path.join(os.homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(settings)) return false;
    try {
      const d = JSON.parse(fs.readFileSync(settings, 'utf8')) as {
        mcpServers?: Record<string, unknown>;
      };
      return Boolean(d.mcpServers && d.mcpServers['gsd-graph']);
    } catch {
      return false;
    }
  }
  const r = spawnSync('claude', ['mcp', 'get', 'gsd-graph'], {
    encoding: 'utf8',
    shell: true,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return r.status === 0 || /gsd-graph/i.test(out);
}

function codexHasServer(): boolean {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) return false;
  return fs.readFileSync(configPath, 'utf8').includes('[mcp_servers.gsd-graph]');
}

function cursorHasServer(): boolean {
  const filePath = path.join(os.homedir(), '.cursor', 'mcp.json');
  if (!fs.existsSync(filePath)) return false;
  try {
    const d = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      mcpServers?: Record<string, unknown>;
    };
    return Boolean(d.mcpServers && d.mcpServers['gsd-graph']);
  } catch {
    return false;
  }
}

function projectHasServer(cwd: string): boolean {
  const filePath = path.join(cwd, '.mcp.json');
  if (!fs.existsSync(filePath)) return false;
  try {
    const d = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      mcpServers?: Record<string, unknown>;
    };
    return Boolean(d.mcpServers && d.mcpServers['gsd-graph']);
  } catch {
    return false;
  }
}

/**
 * Diagnose MCP readiness for this project.
 */
export function mcpDoctor(opts?: {
  cwd?: string;
  dir?: string;
}): McpDoctorResult {
  const cwd = opts?.cwd ?? process.cwd();
  const store_dir = resolveMcpStoreDir({
    cwd,
    ...(opts?.dir !== undefined ? { dir: opts.dir } : {}),
  });
  const launch = resolveMcpLaunch({ storeDir: store_dir });
  const checks: McpDoctorCheck[] = [];

  const v1 = path.join(store_dir, 'graph.v1.json');
  checks.push({
    id: 'store',
    ok: fs.existsSync(v1),
    message: fs.existsSync(v1)
      ? `graph.v1.json present at ${v1}`
      : `missing ${v1} — run: gsd-graph enable`,
  });

  const binOk =
    (launch.command === 'npx' && launch.args.length > 0) ||
    fs.existsSync(launch.command) ||
    launch.command === process.execPath;
  checks.push({
    id: 'launch',
    ok: binOk,
    message: `launch: ${launch.command} ${launch.args.join(' ')}`,
  });

  const hosts: McpHostResult[] = [
    {
      host: 'claude',
      ok: claudeHasServer(),
      action: 'checked',
      message: claudeHasServer()
        ? 'gsd-graph registered'
        : 'not registered — gsd-graph mcp install --host claude',
    },
    {
      host: 'codex',
      ok: codexHasServer(),
      action: 'checked',
      message: codexHasServer()
        ? 'gsd-graph in config.toml'
        : 'not registered — gsd-graph mcp install --host codex',
    },
    {
      host: 'cursor',
      ok: cursorHasServer(),
      action: 'checked',
      message: cursorHasServer()
        ? 'gsd-graph in mcp.json'
        : 'not registered — gsd-graph mcp install --host cursor',
    },
    {
      host: 'project',
      ok: projectHasServer(cwd),
      action: 'checked',
      path: path.join(cwd, '.mcp.json'),
      message: projectHasServer(cwd)
        ? '.mcp.json present'
        : 'no project .mcp.json — gsd-graph mcp install --host project',
    },
  ];

  for (const h of hosts) {
    checks.push({
      id: `host:${h.host}`,
      ok: h.ok,
      message: `${h.host}: ${h.message}`,
    });
  }

  const ok = checks.every((c) => c.ok || c.id.startsWith('host:'));
  // Doctor is ok if store+launch ok; host gaps are advisories
  const coreOk = checks.filter((c) => c.id === 'store' || c.id === 'launch').every((c) => c.ok);

  const next: string[] = [];
  if (!fs.existsSync(v1)) next.push('gsd-graph enable');
  if (!hosts.some((h) => h.ok && h.host !== 'project')) {
    next.push('gsd-graph mcp install');
  }
  next.push('Restart Claude / Codex / Cursor after install');

  return {
    ok: coreOk,
    store_dir,
    launch,
    checks,
    hosts,
    next,
  };
}

/** Used by resolveStoreRoot callers that pass enable dir */
export function enableDirToStore(opts: {
  cwd?: string;
  dir?: string;
}): string {
  const cwd = opts.cwd ?? process.cwd();
  if (opts.dir) {
    return resolveMcpStoreDir({ cwd, dir: opts.dir });
  }
  return resolveStoreRoot({ cwd });
}
