// gsd-graph — --version / --update CLI tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cli = require(path.join(root, 'dist', 'cli.js')) as {
  main: (argv: string[]) => number;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  readPackageMeta?: () => { name: string; version: string };
};

// self-update is not all exported from index — load via dist path after build
// eslint-disable-next-line @typescript-eslint/no-require-imports
const self = require(path.join(root, 'dist', 'cli', 'self-update.js')) as {
  readPackageMeta: () => { name: string; version: string };
  getVersionInfo: (opts?: { checkLatest?: boolean }) => {
    name: string;
    version: string;
    install_kind: string;
    node: string;
    platform: string;
  };
  isSelfMetaArgv: (argv: string[]) => boolean;
  argvWantsVersion: (argv: string[]) => boolean;
  argvWantsUpdate: (argv: string[]) => boolean;
};

function captureIO(fn: () => number): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  (process.stdout as NodeJS.WriteStream).write = ((
    chunk: string | Uint8Array,
  ) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  (process.stderr as NodeJS.WriteStream).write = ((
    chunk: string | Uint8Array,
  ) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    return { code: fn(), stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe('version / update meta', () => {
  it('readPackageMeta matches package.json', () => {
    const meta = self.readPackageMeta();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(path.join(root, 'package.json')) as {
      name: string;
      version: string;
    };
    assert.equal(meta.name, pkg.name);
    assert.equal(meta.version, pkg.version);
  });

  it('isSelfMetaArgv detects --version and --update', () => {
    assert.equal(
      self.isSelfMetaArgv(['node', 'gsd-graph', '--version']),
      true,
    );
    assert.equal(self.isSelfMetaArgv(['node', 'gsd-graph', '-V']), true);
    assert.equal(self.isSelfMetaArgv(['node', 'gsd-graph', '--update']), true);
    assert.equal(self.isSelfMetaArgv(['node', 'gsd-graph', 'version']), true);
    assert.equal(
      self.isSelfMetaArgv(['node', 'gsd-graph', 'status']),
      false,
    );
    assert.equal(
      self.isSelfMetaArgv(['node', 'gsd-graph', '--version', 'status']),
      false,
    );
  });

  it('gsd-graph --version prints JSON with name and version', () => {
    const r = captureIO(() =>
      cli.main(['node', 'gsd-graph', '--compact', '--version']),
    );
    assert.equal(r.code, 0, r.stderr);
    const j = JSON.parse(r.stdout) as {
      name: string;
      version: string;
      install_kind: string;
    };
    assert.equal(j.name, '@opengsd/gsd-graph');
    assert.match(j.version, /^\d+\.\d+\.\d+/);
    assert.ok(typeof j.install_kind === 'string');
  });

  it('gsd-graph version subcommand works', () => {
    const r = captureIO(() =>
      cli.main(['node', 'gsd-graph', '--compact', 'version']),
    );
    assert.equal(r.code, 0, r.stderr);
    const j = JSON.parse(r.stdout) as { version: string };
    assert.match(j.version, /^\d+\.\d+\.\d+/);
  });

  it('getVersionInfo returns node and platform', () => {
    const info = self.getVersionInfo();
    assert.match(info.node, /^v\d+/);
    assert.ok(info.platform.length > 0);
  });
});
