// gsd-graph — sha256 fingerprint tests (EXT-03)
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
