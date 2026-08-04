// gsd-graph — enable one-shot setup tests

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  enable: (opts?: {
    cwd?: string;
    dir?: string;
    skipSync?: boolean;
    packageRoot?: string;
    autoUpdate?: boolean;
  }) => {
    store_dir: string;
    skills_installed: string[];
    hooks_dir: string;
    store_config: string;
    auto_update: boolean;
    sync: { full: boolean; build: { node_count: number } } | null;
    next: { ask: string };
  };
  resolvePackageRoot: (from?: string) => string | null;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cli = require(path.join(root, 'dist', 'cli.js')) as {
  main: (argv: string[]) => number;
};

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-graph-enable-'));
}

describe('enable', () => {
  it('resolvePackageRoot finds this package', () => {
    const pkg = mod.resolvePackageRoot(path.join(root, 'dist', 'pipeline'));
    assert.ok(pkg);
    assert.ok(fs.existsSync(path.join(pkg!, 'skills', 'gsd-graph', 'SKILL.md')));
  });

  it('skip-sync writes config + hooks without requiring corpus', () => {
    const proj = tmpProject();
    const store = path.join(proj, '.gsd-graph');
    const result = mod.enable({
      cwd: proj,
      dir: store,
      skipSync: true,
      packageRoot: root,
    });
    assert.equal(result.auto_update, true);
    assert.equal(result.sync, null);
    assert.ok(fs.existsSync(path.join(store, 'config.json')));
    const cfg = JSON.parse(
      fs.readFileSync(path.join(store, 'config.json'), 'utf8'),
    ) as { enabled?: boolean; auto_update?: boolean };
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.auto_update, true);
    assert.ok(
      fs.existsSync(path.join(store, 'hooks', 'gsd-graph-update.sh')),
    );
    assert.ok(result.next.ask.includes('ask'));
  });

  it('full enable builds graph from README corpus', () => {
    const proj = tmpProject();
    fs.writeFileSync(
      path.join(proj, 'README.md'),
      '# Demo\n\n[[Alpha]] --causes--> [[Beta]]\n',
      'utf8',
    );
    const store = path.join(proj, '.gsd-graph');
    const result = mod.enable({
      cwd: proj,
      dir: store,
      packageRoot: root,
    });
    assert.ok(result.sync);
    assert.equal(result.sync!.full, true);
    assert.ok(result.sync!.build.node_count > 0);
    assert.ok(fs.existsSync(path.join(store, 'graph.v1.json')));
  });

  it('CLI enable --skip-sync exits 0', () => {
    const proj = tmpProject();
    const store = path.join(proj, '.gsd-graph');
    const prev = process.cwd();
    process.chdir(proj);
    try {
      const code = cli.main([
        'node',
        'gsd-graph',
        '--dir',
        store,
        'enable',
        '--skip-sync',
      ]);
      assert.equal(code, 0);
      assert.ok(fs.existsSync(path.join(store, 'config.json')));
    } finally {
      process.chdir(prev);
    }
  });
});
