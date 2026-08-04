// gsd-graph — init library + CLI K22 exit mapping tests (CLI-02/03, PKG-03)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require(path.join(root, 'dist', 'index.js')) as {
  init: (opts?: {
    dir?: string;
    ontology?: string;
    cwd?: string;
  }) => {
    store_dir: string;
    created: boolean;
    gitignore_appended: boolean;
    ontology: string;
  };
  GraphError: new (
    reason: string,
    message: string,
    details?: unknown,
  ) => Error & { reason: string };
  GSD_GRAPH_REASON: Record<string, string>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cli = require(path.join(root, 'dist', 'cli.js')) as {
  main: (argv: string[]) => number;
  mapCliError: (err: unknown) => number;
};

function makeTmpDir(prefix: string): string {
  // realpath so comparisons match ensureStoreRoot (macOS /var → /private/var)
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

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
    ..._rest: unknown[]
  ) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  (process.stderr as NodeJS.WriteStream).write = ((
    chunk: string | Uint8Array,
    ..._rest: unknown[]
  ) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe('init library (CLI-03)', () => {
  it('creates default .gsd-graph store layout with config and snapshots', () => {
    const cwd = makeTmpDir('gsd-graph-init-default-');
    try {
      const result = lib.init({ cwd });
      const store = path.join(cwd, '.gsd-graph');
      assert.equal(result.store_dir, path.resolve(store));
      assert.equal(result.created, true);
      assert.equal(result.ontology, 'general');
      assert.equal(fs.existsSync(store), true);
      assert.equal(fs.existsSync(path.join(store, 'config.json')), true);
      assert.equal(fs.existsSync(path.join(store, 'snapshots')), true);
      assert.equal(fs.statSync(path.join(store, 'snapshots')).isDirectory(), true);

      const config = JSON.parse(
        fs.readFileSync(path.join(store, 'config.json'), 'utf8'),
      ) as { ontology?: string; store?: { write_projection?: boolean } };
      assert.equal(config.ontology, 'general');
      assert.equal(config.store?.write_projection, false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('appends store dir to existing .gitignore and is idempotent', () => {
    const cwd = makeTmpDir('gsd-graph-init-gi-');
    try {
      fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\n', 'utf8');
      const first = lib.init({ cwd });
      assert.equal(first.gitignore_appended, true);

      const gi1 = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
      assert.match(gi1, /\.gsd-graph\//);
      const count1 = (gi1.match(/\.gsd-graph\//g) ?? []).length;
      assert.equal(count1, 1);

      const second = lib.init({ cwd });
      assert.equal(second.gitignore_appended, false);
      assert.equal(second.created, false);
      const gi2 = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
      assert.equal(gi2, gi1);
      assert.equal((gi2.match(/\.gsd-graph\//g) ?? []).length, 1);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not create .gitignore when absent', () => {
    const cwd = makeTmpDir('gsd-graph-init-nogi-');
    try {
      const result = lib.init({ cwd });
      assert.equal(result.gitignore_appended, false);
      assert.equal(fs.existsSync(path.join(cwd, '.gitignore')), false);
      assert.equal(fs.existsSync(path.join(cwd, '.gsd-graph')), true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses custom relative --dir for store and gitignore entry', () => {
    const cwd = makeTmpDir('gsd-graph-init-custom-');
    try {
      fs.writeFileSync(path.join(cwd, '.gitignore'), '', 'utf8');
      const result = lib.init({ cwd, dir: 'custom-store' });
      assert.equal(result.store_dir, path.resolve(cwd, 'custom-store'));
      assert.equal(fs.existsSync(path.join(cwd, 'custom-store', 'config.json')), true);
      assert.equal(result.gitignore_appended, true);
      const gi = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
      assert.match(gi, /custom-store\//);
      assert.doesNotMatch(gi, /\.gsd-graph\//);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns gitignore_appended false when entry already present', () => {
    const cwd = makeTmpDir('gsd-graph-init-preseedi-');
    try {
      const seed = 'node_modules/\n.gsd-graph/\n';
      fs.writeFileSync(path.join(cwd, '.gitignore'), seed, 'utf8');
      const result = lib.init({ cwd });
      assert.equal(result.gitignore_appended, false);
      assert.equal(fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8'), seed);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('honors ontology option in result and config', () => {
    const cwd = makeTmpDir('gsd-graph-init-ont-');
    try {
      const result = lib.init({ cwd, ontology: 'domain-x' });
      assert.equal(result.ontology, 'domain-x');
      const config = JSON.parse(
        fs.readFileSync(path.join(cwd, '.gsd-graph', 'config.json'), 'utf8'),
      ) as { ontology?: string };
      assert.equal(config.ontology, 'domain-x');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('init CLI main (CLI-02, K22)', () => {
  it('main init returns 0 with JSON-only stdout', () => {
    const cwd = makeTmpDir('gsd-graph-cli-init-');
    const prev = process.cwd();
    try {
      process.chdir(cwd);
      const store = path.join(cwd, 'cli-store');
      const { code, stdout, stderr } = captureIO(() =>
        cli.main(['node', 'gsd-graph', 'init', '--dir', store]),
      );
      assert.equal(code, 0, `expected 0, stderr=${stderr}`);
      const lines = stdout.trim().split('\n').filter(Boolean);
      assert.equal(lines.length, 1, 'exactly one JSON line on stdout');
      const payload = JSON.parse(lines[0]!) as {
        store_dir: string;
        created: boolean;
        gitignore_appended: boolean;
        ontology: string;
      };
      assert.equal(payload.store_dir, path.resolve(store));
      assert.equal(payload.created, true);
      assert.equal(payload.ontology, 'general');
      assert.equal(fs.existsSync(path.join(store, 'config.json')), true);
      // success path must not dump human diagnostics on stdout
      assert.equal(stdout.includes('Error'), false);
    } finally {
      process.chdir(prev);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('main unknown flag returns exit 1 with usage stderr JSON', () => {
    const { code, stdout, stderr } = captureIO(() =>
      cli.main(['node', 'gsd-graph', 'init', '--not-a-real-flag']),
    );
    assert.equal(code, 1);
    assert.equal(stdout.trim(), '');
    const err = JSON.parse(stderr.trim()) as {
      ok: boolean;
      reason: string;
      message: string;
    };
    assert.equal(err.ok, false);
    assert.equal(err.reason, 'usage');
    assert.equal(typeof err.message, 'string');
  });

  it('mapCliError maps GraphError schema_invalid → 2 and build_locked → 3', () => {
    const schemaReason = lib.GSD_GRAPH_REASON.SCHEMA_INVALID as string;
    const lockReason = lib.GSD_GRAPH_REASON.BUILD_LOCKED as string;
    const schemaErr = new lib.GraphError(schemaReason, 'bad schema');
    assert.equal(cli.mapCliError(schemaErr), 2);

    const lockErr = new lib.GraphError(lockReason, 'locked');
    assert.equal(cli.mapCliError(lockErr), 3);

    assert.equal(cli.mapCliError(new Error('other')), 1);
  });

  it('main path with GraphError non-lock returns exit 2 and D-04 stderr', () => {
    // Live-patch init export so main's catch path is exercised without a
    // test-only CLI hook (Task 3 preferred approach when init can't throw).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initMod = require(path.join(root, 'dist', 'pipeline', 'init.js')) as {
      init: typeof lib.init;
    };
    const orig = initMod.init;
    initMod.init = () => {
      throw new lib.GraphError('schema_invalid', 'schema boom');
    };
    try {
      const { code, stdout, stderr } = captureIO(() =>
        cli.main(['node', 'gsd-graph', 'init']),
      );
      assert.equal(code, 2);
      assert.equal(stdout.trim(), '');
      const body = JSON.parse(stderr.trim()) as {
        ok: boolean;
        reason: string;
        message: string;
      };
      assert.equal(body.ok, false);
      assert.equal(body.reason, 'schema_invalid');
      assert.match(body.message, /schema boom/);
    } finally {
      initMod.init = orig;
    }
  });

  it('main path with GraphError build_locked returns exit 3', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initMod = require(path.join(root, 'dist', 'pipeline', 'init.js')) as {
      init: typeof lib.init;
    };
    const orig = initMod.init;
    initMod.init = () => {
      throw new lib.GraphError('build_locked', 'build is locked');
    };
    try {
      const { code, stdout, stderr } = captureIO(() =>
        cli.main(['node', 'gsd-graph', 'init']),
      );
      assert.equal(code, 3);
      assert.equal(stdout.trim(), '');
      const body = JSON.parse(stderr.trim()) as {
        ok: boolean;
        reason: string;
        message: string;
      };
      assert.equal(body.ok, false);
      assert.equal(body.reason, 'build_locked');
      assert.match(body.message, /locked/);
    } finally {
      initMod.init = orig;
    }
  });
});
