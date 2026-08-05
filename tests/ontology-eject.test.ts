// gsd-graph — ontology eject + project-local pack resolution tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  ontologyEject: (opts?: {
    dir?: string;
    cwd?: string;
    out?: string;
  }) => {
    pack_path: string;
    pack_id: string;
    absorbed_predicates: string[];
    config_updated: boolean;
  };
  loadOntologyPack: (opts?: {
    packIdOrPath?: string;
    baseDir?: string;
  }) => {
    pack: { id: string };
    predicateSet: Set<string>;
  };
  init: (opts: { cwd: string; dir?: string }) => { store_dir: string };
};

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('project-local pack resolution', () => {
  it('cwd ontology-packs/<id>/ontology.json wins over shipped pack ids', () => {
    const cwd = tempDir('gsd-ont-local-');
    try {
      const dir = path.join(cwd, 'ontology-packs', 'teampack');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'ontology.json'),
        JSON.stringify({
          id: 'teampack',
          version: '1',
          title: 'Team pack',
          node_types: ['Entity', 'Concept', 'Document', 'Topic'],
          predicates: [{ id: 'team_owns', domain: ['*'], range: ['*'] }],
          strict: true,
        }),
        'utf8',
      );
      const loaded = mod.loadOntologyPack({
        packIdOrPath: 'teampack',
        baseDir: cwd,
      });
      assert.equal(loaded.pack.id, 'teampack');
      assert.ok(loaded.predicateSet.has('team_owns'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('ontology eject', () => {
  it('materializes active pack + lock extensions and points config at it', () => {
    const cwd = tempDir('gsd-ont-eject-');
    try {
      const store = path.join(cwd, '.gsd-graph');
      mod.init({ cwd, dir: store });
      // Simulate accepted --extend-ontology decisions in the lock
      fs.writeFileSync(
        path.join(store, 'ontology.lock.json'),
        JSON.stringify({
          pack_id: 'general',
          node_types: ['Runbook'],
          predicates: [{ id: 'escalates_to', domain: ['*'], range: ['*'] }],
          extended: true,
        }),
        'utf8',
      );

      const res = mod.ontologyEject({ cwd, dir: store });
      assert.equal(res.pack_id, 'general-local');
      assert.deepEqual(res.absorbed_predicates, ['escalates_to']);
      assert.equal(res.config_updated, true);
      assert.ok(fs.existsSync(res.pack_path));

      // Config now points at the local pack and it loads with the extension
      const config = JSON.parse(
        fs.readFileSync(path.join(store, 'config.json'), 'utf8'),
      ) as { ontology: string };
      const loaded = mod.loadOntologyPack({
        packIdOrPath: config.ontology,
        baseDir: cwd,
      });
      assert.equal(loaded.pack.id, 'general-local');
      assert.ok(loaded.predicateSet.has('escalates_to'));
      assert.ok(loaded.predicateSet.has('related_to'));
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
