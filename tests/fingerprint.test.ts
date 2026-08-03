// gsd-graph — sha256 fingerprint + discoverSources tests (EXT-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  fingerprintFile: (absPath: string) => string;
  discoverSources: (
    corpus: string | string[],
    opts?: { globs?: string[]; maxBytes?: number },
  ) => {
    files: string[];
    diagnostics: Array<{ path: string; code: string; message: string }>;
  };
  GraphError: new (reason: string, message: string, details?: unknown) => Error & {
    reason: string;
  };
  GSD_GRAPH_REASON: Record<string, string>;
};

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('fingerprintFile (EXT-03 / D-04 / OQ-3)', () => {
  it('returns sha256: + 64 lowercase hex of raw file bytes', () => {
    const dir = makeTmpDir('gsd-graph-fp-');
    try {
      const file = path.join(dir, 'sample.md');
      const bytes = Buffer.from('[[Alpha]] --related_to--> [[Beta]]\n', 'utf8');
      fs.writeFileSync(file, bytes);
      const expected =
        'sha256:' + createHash('sha256').update(bytes).digest('hex');
      const got = mod.fingerprintFile(file);
      assert.equal(got, expected);
      assert.match(got, /^sha256:[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('same bytes → same hash (stable)', () => {
    const dir = makeTmpDir('gsd-graph-fp-stable-');
    try {
      const a = path.join(dir, 'a.md');
      const b = path.join(dir, 'b.md');
      const payload = 'identical payload\n';
      fs.writeFileSync(a, payload);
      fs.writeFileSync(b, payload);
      assert.equal(mod.fingerprintFile(a), mod.fingerprintFile(b));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('different bytes → different hash', () => {
    const dir = makeTmpDir('gsd-graph-fp-diff-');
    try {
      const a = path.join(dir, 'a.md');
      const b = path.join(dir, 'b.md');
      fs.writeFileSync(a, 'one');
      fs.writeFileSync(b, 'two');
      assert.notEqual(mod.fingerprintFile(a), mod.fingerprintFile(b));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('discoverSources (EXT-03 foundation)', () => {
  it('returns absolute paths for default extensions under root, sorted', () => {
    const dir = makeTmpDir('gsd-graph-discover-');
    try {
      fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'b.md'), '# b');
      fs.writeFileSync(path.join(dir, 'nested', 'a.txt'), 'a');
      fs.writeFileSync(path.join(dir, 'skip.bin'), 'nope');
      fs.writeFileSync(path.join(dir, 'c.json'), '{}');
      const result = mod.discoverSources(dir);
      assert.ok(Array.isArray(result.files));
      assert.equal(result.files.length, 3);
      const sorted = [...result.files].sort();
      assert.deepEqual(result.files, sorted);
      for (const f of result.files) {
        assert.ok(path.isAbsolute(f));
      }
      assert.ok(result.files.some((f) => f.endsWith(`${path.sep}b.md`)));
      assert.ok(result.files.some((f) => f.endsWith(`${path.sep}a.txt`)));
      assert.ok(result.files.some((f) => f.endsWith(`${path.sep}c.json`)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('missing corpus root throws CORPUS_NOT_FOUND', () => {
    const missing = path.join(os.tmpdir(), `gsd-graph-missing-${Date.now()}`);
    assert.throws(
      () => mod.discoverSources(missing),
      (err: unknown) => {
        assert.ok(err instanceof mod.GraphError);
        assert.equal(
          (err as { reason: string }).reason,
          mod.GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
        );
        return true;
      },
    );
  });

  it('path escape via symlink outside root throws PATH_ESCAPE when OS allows', () => {
    const dir = makeTmpDir('gsd-graph-discover-escape-');
    const outside = makeTmpDir('gsd-graph-discover-outside-');
    try {
      const outsideFile = path.join(outside, 'secret.md');
      fs.writeFileSync(outsideFile, 'secret');
      const link = path.join(dir, 'escape.md');
      try {
        fs.symlinkSync(outsideFile, link);
      } catch {
        // Windows or policy may disallow symlinks — skip
        return;
      }
      assert.throws(
        () => mod.discoverSources(dir),
        (err: unknown) => {
          assert.ok(err instanceof mod.GraphError);
          assert.equal(
            (err as { reason: string }).reason,
            mod.GSD_GRAPH_REASON.PATH_ESCAPE,
          );
          return true;
        },
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('files larger than maxBytes are omitted with FILE_TOO_LARGE diagnostic', () => {
    const dir = makeTmpDir('gsd-graph-discover-size-');
    try {
      fs.writeFileSync(path.join(dir, 'small.md'), 'ok');
      fs.writeFileSync(path.join(dir, 'big.md'), '0123456789abcdef'); // 16 bytes
      const result = mod.discoverSources(dir, { maxBytes: 10 });
      assert.equal(result.files.length, 1);
      assert.ok(result.files[0]!.endsWith('small.md'));
      assert.ok(
        result.diagnostics.some(
          (d) => d.code === 'FILE_TOO_LARGE' && d.path.endsWith('big.md'),
        ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
