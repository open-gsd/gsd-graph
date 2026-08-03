// gsd-graph — package identity and standalone dependency gates
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

function readPackageJson(): Record<string, unknown> {
  const raw = readFileSync(join(root, 'package.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function depNames(pkg: Record<string, unknown>, key: string): string[] {
  const block = pkg[key];
  if (!block || typeof block !== 'object') return [];
  return Object.keys(block as Record<string, unknown>);
}

function hasGsdCoreDep(names: string[]): boolean {
  return names.some(
    (n) =>
      n === 'gsd-core' ||
      n === '@opengsd/gsd-core' ||
      n.startsWith('gsd-core/') ||
      n.startsWith('@opengsd/gsd-core/'),
  );
}

describe('package identity (PKG-01, PKG-02)', () => {
  it('names the package @opengsd/gsd-graph with Node >=22 engines', () => {
    const pkg = readPackageJson();
    assert.equal(pkg.name, '@opengsd/gsd-graph');

    const engines = pkg.engines as Record<string, string> | undefined;
    assert.ok(engines, 'engines field required');
    const nodeEngine = engines.node;
    assert.equal(typeof nodeEngine, 'string', 'engines.node required');
    assert.match(nodeEngine as string, />=\s*22/);
  });

  it('description positions Graph Engineering toolkit', () => {
    const pkg = readPackageJson();
    assert.equal(typeof pkg.description, 'string');
    assert.match(
      pkg.description as string,
      /Graph Engineering toolkit/i,
      'description must include "Graph Engineering toolkit"',
    );
  });

  it('has zero gsd-core runtime or peer dependency (D-01, PKG-02)', () => {
    const pkg = readPackageJson();
    const classes = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ] as const;

    for (const key of classes) {
      const names = depNames(pkg, key);
      assert.equal(
        hasGsdCoreDep(names),
        false,
        `${key} must not list gsd-core or @opengsd/gsd-core (found: ${names.join(', ') || 'none'})`,
      );
    }
  });

  it('build emits dist/index.js and dist/index.d.ts', () => {
    assert.equal(
      existsSync(join(root, 'dist', 'index.js')),
      true,
      'dist/index.js missing — run npm run build',
    );
    assert.equal(
      existsSync(join(root, 'dist', 'index.d.ts')),
      true,
      'dist/index.d.ts missing — run npm run build',
    );
  });

  it('exports GSD_GRAPH_REASON including PATH_ESCAPE and BUILD_LOCKED', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(join(root, 'dist', 'index.js')) as {
      GSD_GRAPH_REASON: Record<string, string>;
      GraphError: new (reason: string, message: string) => Error & {
        reason: string;
      };
    };

    assert.ok(mod.GSD_GRAPH_REASON, 'GSD_GRAPH_REASON export missing');
    assert.equal(mod.GSD_GRAPH_REASON.OK, 'ok');
    assert.equal(mod.GSD_GRAPH_REASON.PATH_ESCAPE, 'path_escape');
    assert.equal(mod.GSD_GRAPH_REASON.BUILD_LOCKED, 'build_locked');
    assert.equal(mod.GSD_GRAPH_REASON.SCHEMA_INVALID, 'schema_invalid');
    assert.equal(mod.GSD_GRAPH_REASON.ONTOLOGY_INVALID, 'ontology_invalid');

    const err = new mod.GraphError(mod.GSD_GRAPH_REASON.PATH_ESCAPE, 'escape');
    assert.equal(err.reason, 'path_escape');
    assert.match(err.message, /escape/);
  });

  it('README positions Graph Engineering and denies gsd-core runtime coupling', () => {
    const readmePath = join(root, 'README.md');
    assert.equal(existsSync(readmePath), true, 'README.md missing');
    const text = readFileSync(readmePath, 'utf8');

    assert.match(text, /Graph Engineering/, 'README must mention Graph Engineering');
    assert.match(text, /@opengsd\/gsd-graph/, 'README must name the npm package');
    assert.match(text, /gsd-graph/, 'README must mention CLI name gsd-graph');

    // Ban affirmative runtime-coupling claims (allow explicit denials).
    const banned = [
      /\bdepends on gsd-core\b/i,
      /\brequires gsd-core\b/i,
      /\bintegrates with gsd-core (workflows|runtime)\b/i,
      /\bgsd-core (capability|subsystem|host integration)\b/i,
      /\bas a gsd-core plugin\b/i,
    ];
    for (const re of banned) {
      assert.equal(
        re.test(text),
        false,
        `README must not claim gsd-core runtime coupling (matched ${re})`,
      );
    }

    // Positive standalone statement
    assert.match(
      text,
      /no runtime dependency/i,
      'README must explicitly state no runtime dependency on gsd-core',
    );
  });
});

describe('package identity bin (PKG-03, D-01, D-09)', () => {
  it('publishes bin gsd-graph → ./bin/gsd-graph.js and files includes bin', () => {
    const pkg = readPackageJson();
    const bin = pkg.bin as Record<string, string> | undefined;
    assert.ok(bin, 'bin field required');
    assert.equal(bin['gsd-graph'], './bin/gsd-graph.js');

    const files = pkg.files as string[] | undefined;
    assert.ok(Array.isArray(files), 'files array required');
    assert.equal(files.includes('bin'), true, 'files must include bin');
  });

  it('bin/gsd-graph.js has node shebang and invokes main(process.argv)', () => {
    const binPath = join(root, 'bin', 'gsd-graph.js');
    assert.equal(existsSync(binPath), true, 'bin/gsd-graph.js missing');
    const source = readFileSync(binPath, 'utf8');
    const firstLine = source.split(/\r?\n/)[0] ?? '';
    assert.equal(firstLine, '#!/usr/bin/env node');
    assert.match(source, /require\(['"]\.\.\/dist\/cli\.js['"]\)/);
    assert.match(source, /main\(process\.argv\)/);
  });

  it('pins commander to 14.x (not 15) in dependencies', () => {
    const pkg = readPackageJson();
    const deps = pkg.dependencies as Record<string, string> | undefined;
    assert.ok(deps, 'dependencies required');
    const range = deps.commander;
    assert.equal(typeof range, 'string', 'commander dependency required');
    assert.match(range as string, /\^?14(\.|$)/, `commander must be 14.x, got ${range}`);
    assert.equal(
      /^\s*[\^~]?15/.test(range as string),
      false,
      `commander must not be 15.x (engines mismatch), got ${range}`,
    );
  });

  it('bin is invokable via process.execPath spawn (PKG-03 process gate)', () => {
    // Residual process-level proof beyond static shebang/package.json checks (04-03)
    const binPath = join(root, 'bin', 'gsd-graph.js');
    assert.equal(existsSync(binPath), true, 'bin/gsd-graph.js missing');
    const result = spawnSync(
      process.execPath,
      [binPath, 'ontology', 'show'],
      {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
    assert.equal(
      result.status,
      0,
      `bin spawn failed: status=${result.status} stderr=${result.stderr}`,
    );
    const body = JSON.parse((result.stdout ?? '').trim()) as {
      id?: string;
      node_types?: number;
    };
    assert.equal(body.id, 'general');
    assert.ok(typeof body.node_types === 'number' && body.node_types > 0);
  });
});
