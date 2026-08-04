// gsd-graph — project sync / brownfield corpus resolve tests

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  resolveProjectCorpus: (
    cwd?: string,
    opts?: { extra?: string[]; configCorpus?: string[] | null },
  ) => string[];
  projectSync: (opts?: {
    cwd?: string;
    dir?: string;
    full?: boolean;
    report?: boolean;
  }) => {
    full: boolean;
    corpus: string[];
    build: { node_count: number; sources_skipped_fresh: number };
    report_written: boolean;
  };
  discoverSources: (corpus: string | string[]) => {
    files: string[];
    diagnostics: unknown[];
  };
};

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-graph-project-'));
}

describe('resolveProjectCorpus', () => {
  it('picks .planning, docs, and top-level README when present', () => {
    const proj = tmpProject();
    fs.mkdirSync(path.join(proj, '.planning'));
    fs.mkdirSync(path.join(proj, 'docs'));
    fs.writeFileSync(path.join(proj, 'README.md'), '# Hello\n', 'utf8');
    fs.writeFileSync(
      path.join(proj, 'docs', 'a.md'),
      '[[Alpha]] --related_to--> [[Beta]]\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(proj, '.planning', 'PROJECT.md'),
      '# Project\n',
      'utf8',
    );

    const corpus = mod.resolveProjectCorpus(proj);
    assert.ok(corpus.some((p) => p.endsWith(`${path.sep}.planning`)));
    assert.ok(corpus.some((p) => p.endsWith(`${path.sep}docs`)));
    assert.ok(corpus.some((p) => p.endsWith(`${path.sep}README.md`)));
  });

  it('honors explicit gsd_graph.corpus config list', () => {
    const proj = tmpProject();
    fs.mkdirSync(path.join(proj, 'only-docs'));
    fs.writeFileSync(path.join(proj, 'only-docs', 'x.md'), '# X\n', 'utf8');
    const corpus = mod.resolveProjectCorpus(proj, {
      configCorpus: ['only-docs'],
    });
    assert.equal(corpus.length, 1);
    assert.ok(corpus[0]!.endsWith(`${path.sep}only-docs`));
  });
});

describe('projectSync', () => {
  it('init + builds graph from brownfield roots (full)', () => {
    const proj = tmpProject();
    fs.mkdirSync(path.join(proj, 'docs'));
    fs.writeFileSync(
      path.join(proj, 'docs', 'edges.md'),
      '[[Drought]] --causes--> [[Crop Failure]]\n[[Crop Failure]] --causes--> [[Food Shortage]]\n',
      'utf8',
    );
    fs.writeFileSync(path.join(proj, 'README.md'), '# Demo Project\n', 'utf8');

    const store = path.join(proj, '.gsd-graph');
    const result = mod.projectSync({
      cwd: proj,
      dir: store,
      full: true,
      report: true,
    });

    assert.equal(result.full, true);
    assert.ok(result.corpus.length >= 1);
    assert.ok(result.build.node_count > 0);
    assert.ok(fs.existsSync(path.join(store, 'graph.v1.json')));
    assert.ok(result.report_written);
    assert.ok(fs.existsSync(path.join(store, 'GRAPH_REPORT.md')));

    const again = mod.projectSync({ cwd: proj, dir: store, full: false });
    assert.equal(again.full, false);
    assert.ok(again.build.sources_skipped_fresh >= 0);
  });

  it('discover accepts single-file corpus roots', () => {
    const proj = tmpProject();
    const readme = path.join(proj, 'README.md');
    fs.writeFileSync(readme, '# Solo\n\n[[A]] --related_to--> [[B]]\n', 'utf8');
    const found = mod.discoverSources(readme);
    assert.equal(found.files.length, 1);
    assert.equal(found.files[0], fs.realpathSync.native(readme));
  });
});
