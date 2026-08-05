// gsd-graph — --help / help command tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cli = require(path.join(root, 'dist', 'cli.js')) as {
  main: (argv: string[]) => number;
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

describe('gsd-graph --help', () => {
  it('--help prints usage and exits 0 (no JSON error)', () => {
    const r = captureIO(() =>
      cli.main(['node', 'gsd-graph', '--help']),
    );
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Usage:\s*gsd-graph/i);
    assert.match(r.stdout, /enable/);
    assert.match(r.stdout, /Quick start/i);
    assert.doesNotMatch(r.stderr, /"ok"\s*:\s*false/);
  });

  it('-h works', () => {
    const r = captureIO(() => cli.main(['node', 'gsd-graph', '-h']));
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Usage:\s*gsd-graph/i);
  });

  it('help subcommand works', () => {
    const r = captureIO(() =>
      cli.main(['node', 'gsd-graph', 'help']),
    );
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Usage:\s*gsd-graph/i);
  });

  it('subcommand --help works (enable)', () => {
    const r = captureIO(() =>
      cli.main(['node', 'gsd-graph', 'enable', '--help']),
    );
    assert.equal(r.code, 0);
    assert.match(r.stdout, /enable/i);
    assert.match(r.stdout, /--mcp/);
  });

  it('unknown command still returns usage JSON on stderr', () => {
    const r = captureIO(() =>
      cli.main(['node', 'gsd-graph', 'not-a-real-command']),
    );
    assert.equal(r.code, 1);
    assert.match(r.stderr, /"ok"\s*:\s*false/);
    assert.match(r.stderr, /usage/);
  });
});
