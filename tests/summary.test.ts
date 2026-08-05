// gsd-graph — enable/sync wrap-up summary tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';

const root = path.join(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  printEnableWrapup: (result: unknown, cwd?: string) => void;
  printSyncWrapup: (result: unknown, cwd?: string) => void;
};

describe('printEnableWrapup', () => {
  it('writes a human summary to stderr when progress mode is on', () => {
    const prev = process.env.GSD_GRAPH_PROGRESS;
    const prevSum = process.env.GSD_GRAPH_NO_SUMMARY;
    process.env.GSD_GRAPH_PROGRESS = '1';
    delete process.env.GSD_GRAPH_NO_SUMMARY;

    let err = '';
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = ((
      chunk: string | Uint8Array,
    ) => {
      err += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;

    try {
      mod.printEnableWrapup(
        {
          store_dir: '/tmp/proj/.gsd-graph',
          skills_installed: ['/home/u/.agents/skills/gsd-graph'],
          hooks_dir: '/tmp/proj/.gsd-graph/hooks',
          store_config: '/tmp/proj/.gsd-graph/config.json',
          planning_config: null,
          auto_update: true,
          sync: {
            store_dir: '/tmp/proj/.gsd-graph',
            corpus: ['/tmp/proj/docs', '/tmp/proj/README.md'],
            init: {
              store_dir: '/tmp/proj/.gsd-graph',
              created: true,
              gitignore_appended: false,
              ontology: 'general',
            },
            build: {
              store_dir: '/tmp/proj/.gsd-graph',
              node_count: 5698,
              triple_count: 1281,
              review_pending: 1307,
              sources_total: 100,
              sources_extracted: 100,
              sources_skipped_fresh: 0,
              diagnostics: [{ path: 'x', code: 'RECORD_INVALID', message: 'm' }],
              engine: 'gsd-graph',
              engine_version: '0.2.4',
              built_at: '2026-08-05T00:00:00.000Z',
            },
            communities_written: false,
            report_written: true,
            full: true,
          },
          next: {
            ask: 'gsd-graph ask "your multi-hop question"',
            sync: 'gsd-graph sync',
            status: 'gsd-graph status',
            hook: '/tmp/proj/.gsd-graph/hooks/gsd-graph-update.sh',
          },
        },
        '/tmp/proj',
      );
    } finally {
      process.stderr.write = orig;
      if (prev === undefined) delete process.env.GSD_GRAPH_PROGRESS;
      else process.env.GSD_GRAPH_PROGRESS = prev;
      if (prevSum === undefined) delete process.env.GSD_GRAPH_NO_SUMMARY;
      else process.env.GSD_GRAPH_NO_SUMMARY = prevSum;
    }

    assert.match(err, /gsd-graph enabled/i);
    assert.match(err, /5,?698/);
    assert.match(err, /1,?281/);
    assert.match(err, /Nodes/i);
    assert.match(err, /Triples/i);
    assert.match(err, /Sources/i);
    assert.match(err, /Next/i);
    assert.match(err, /ask/);
  });

  it('is quiet when GSD_GRAPH_NO_SUMMARY=1', () => {
    process.env.GSD_GRAPH_NO_SUMMARY = '1';
    let err = '';
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr as NodeJS.WriteStream).write = ((
      chunk: string | Uint8Array,
    ) => {
      err += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      mod.printEnableWrapup({
        store_dir: '/x',
        skills_installed: [],
        hooks_dir: '/x/hooks',
        store_config: '/x/c.json',
        planning_config: null,
        auto_update: false,
        sync: null,
        next: {
          ask: 'a',
          sync: 's',
          status: 'st',
          hook: 'h',
        },
      });
    } finally {
      process.stderr.write = orig;
      delete process.env.GSD_GRAPH_NO_SUMMARY;
    }
    assert.equal(err, '');
  });
});
