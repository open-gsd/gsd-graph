// gsd-graph — CLI spinner / progress tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  createCliSpinner: (initial?: string) => {
    update: (m: string) => void;
    succeed: (m?: string) => void;
    fail: (m?: string) => void;
    stop: () => void;
  };
  withSpinner: <T>(label: string, fn: (report: (m: string) => void) => T) => T;
  enable: (opts?: {
    cwd?: string;
    dir?: string;
    skipSync?: boolean;
    packageRoot?: string;
    onProgress?: (m: string) => void;
  }) => { store_dir: string };
};

describe('createCliSpinner', () => {
  it('is safe when stderr is not a TTY (no throw)', () => {
    const spin = mod.createCliSpinner('hello');
    spin.update('step 2');
    spin.stop();
    spin.succeed('ok');
    spin.fail('nope');
    assert.ok(true);
  });

  it('withSpinner returns fn result and invokes report', () => {
    const seen: string[] = [];
    const out = mod.withSpinner('start', (report) => {
      report('mid');
      seen.push('mid');
      return 42;
    });
    assert.equal(out, 42);
    assert.deepEqual(seen, ['mid']);
  });
});

describe('enable onProgress', () => {
  it('emits progress steps during enable --skip-sync', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const os = require('node:os') as typeof import('node:os');
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-spin-'));
    const store = path.join(proj, '.gsd-graph');
    const steps: string[] = [];
    mod.enable({
      cwd: proj,
      dir: store,
      skipSync: true,
      packageRoot: root,
      onProgress: (m) => steps.push(m),
    });
    assert.ok(steps.length >= 3, `expected several steps, got ${steps.length}`);
    assert.ok(
      steps.some((s) => /skill|hooks|config|store|skip/i.test(s)),
      `unexpected steps: ${JSON.stringify(steps)}`,
    );
    fs.rmSync(proj, { recursive: true, force: true });
  });
});
