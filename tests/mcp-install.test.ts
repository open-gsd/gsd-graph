// gsd-graph — MCP host install / doctor tests

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, afterEach } from 'node:test';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  mcpInstall: (opts?: {
    cwd?: string;
    dir?: string;
    hosts?: Array<'claude' | 'codex' | 'cursor' | 'project'>;
  }) => {
    store_dir: string;
    launch: { command: string; args: string[] };
    hosts: Array<{ host: string; ok: boolean; action: string; path?: string }>;
  };
  mcpDoctor: (opts?: { cwd?: string; dir?: string }) => {
    ok: boolean;
    checks: Array<{ id: string; ok: boolean; message: string }>;
  };
  resolveMcpLaunch: (opts: { storeDir: string }) => {
    command: string;
    args: string[];
  };
  upsertCodexMcpServer: (
    configPath: string,
    launch: { command: string; args: string[] },
  ) => { action: string; path: string };
};

const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-mcp-'));
  temps.push(d);
  return d;
}

describe('resolveMcpLaunch', () => {
  it('includes --dir store path in args', () => {
    const store = path.join(tmp(), '.gsd-graph');
    const launch = mod.resolveMcpLaunch({ storeDir: store });
    assert.ok(launch.args.includes('--dir'));
    const i = launch.args.indexOf('--dir');
    assert.equal(launch.args[i + 1], store);
  });
});

describe('upsertCodexMcpServer', () => {
  it('writes and updates mcp_servers.gsd-graph block', () => {
    const dir = tmp();
    const cfg = path.join(dir, 'config.toml');
    fs.writeFileSync(cfg, 'model = "test"\n', 'utf8');
    const launch = {
      command: 'npx',
      args: ['-y', '-p', '@opengsd/gsd-graph', 'gsd-graph-mcp', '--dir', '/x'],
    };
    const a = mod.upsertCodexMcpServer(cfg, launch);
    assert.equal(a.action, 'installed');
    let text = fs.readFileSync(cfg, 'utf8');
    assert.match(text, /\[mcp_servers\.gsd-graph\]/);
    assert.match(text, /gsd-graph-mcp/);

    const b = mod.upsertCodexMcpServer(cfg, {
      command: 'gsd-graph-mcp',
      args: ['--dir', '/y'],
    });
    assert.equal(b.action, 'updated');
    text = fs.readFileSync(cfg, 'utf8');
    assert.match(text, /gsd-graph-mcp/);
    assert.match(text, /\/y/);
    // only one section
    assert.equal(
      (text.match(/\[mcp_servers\.gsd-graph\]/g) ?? []).length,
      1,
    );
  });
});

describe('mcpInstall project host', () => {
  it('writes project .mcp.json', () => {
    const cwd = tmp();
    const store = path.join(cwd, '.gsd-graph');
    fs.mkdirSync(store);
    const result = mod.mcpInstall({
      cwd,
      dir: store,
      hosts: ['project'],
    });
    assert.equal(result.hosts.length, 1);
    assert.equal(result.hosts[0]!.host, 'project');
    assert.equal(result.hosts[0]!.ok, true);
    const mcpPath = path.join(cwd, '.mcp.json');
    assert.ok(fs.existsSync(mcpPath));
    const doc = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as {
      mcpServers: { 'gsd-graph': { command: string; args: string[] } };
    };
    assert.ok(doc.mcpServers['gsd-graph']);
    assert.ok(doc.mcpServers['gsd-graph'].args.includes('--dir'));
  });
});

describe('mcpDoctor', () => {
  it('reports missing graph.v1 as store fail', () => {
    const cwd = tmp();
    const store = path.join(cwd, '.gsd-graph');
    fs.mkdirSync(store);
    const d = mod.mcpDoctor({ cwd, dir: store });
    const storeCheck = d.checks.find((c) => c.id === 'store');
    assert.ok(storeCheck);
    assert.equal(storeCheck!.ok, false);
    assert.equal(d.ok, false);
  });

  it('store ok when graph.v1.json exists', () => {
    const cwd = tmp();
    const store = path.join(cwd, '.gsd-graph');
    fs.mkdirSync(store);
    fs.writeFileSync(path.join(store, 'graph.v1.json'), '{}\n', 'utf8');
    const d = mod.mcpDoctor({ cwd, dir: store });
    const storeCheck = d.checks.find((c) => c.id === 'store');
    assert.ok(storeCheck?.ok);
    assert.equal(d.ok, true);
  });
});
