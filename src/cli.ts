// gsd-graph — CLI adapter (commander) + K22 exit mapping
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { GSD_GRAPH_REASON, GraphError } from './errors';
import { build } from './pipeline/build';
import { diff } from './pipeline/diff';
import { init } from './pipeline/init';
import { query } from './pipeline/query';
import { repair } from './pipeline/repair';
import { status } from './pipeline/status';

export interface CliErrorBody {
  ok: false;
  reason: string;
  message: string;
}

/**
 * Map caught errors to K22 exit codes (CLI-02, D-03):
 * - GraphError build_locked → 3
 * - other GraphError → 2
 * - usage / unknown → 1
 */
export function mapCliError(err: unknown): number {
  if (err instanceof GraphError) {
    return err.reason === GSD_GRAPH_REASON.BUILD_LOCKED ? 3 : 2;
  }
  return 1;
}

function writeOk(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function writeErrorJson(body: CliErrorBody): void {
  let line = JSON.stringify(body) + '\n';
  if (process.stderr.isTTY) {
    // Optional color on stderr only — never color stdout JSON (D-09)
    line = pc.red(line);
  }
  process.stderr.write(line);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function parseIntOpt(value: string): number {
  return parseInt(value, 10);
}

/** Global --dir from parent program (D-07). */
function globalDir(cmd: Command): string | undefined {
  const globals = cmd.optsWithGlobals() as { dir?: string };
  return globals.dir;
}

function withDir<T extends object>(
  base: T,
  dir: string | undefined,
): T & { dir?: string } {
  if (dir === undefined) return base;
  return { ...base, dir };
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name('gsd-graph')
    .description('Graph Engineering toolkit CLI')
    .showSuggestionAfterError()
    .exitOverride()
    // Suppress commander's default human error/help streams — K22 writes
    // structured JSON via writeErrorJson / writeOk only (D-03, D-04).
    .configureOutput({
      writeOut: () => {},
      writeErr: () => {},
    })
    .option('--dir <path>', 'store directory override');

  program
    .command('init')
    .description('Create store layout and append gitignore entry when present')
    .option('--ontology <idOrPath>', 'ontology pack id or path', 'general')
    .action((opts: { ontology?: string }, cmd: Command) => {
      const dir = globalDir(cmd);
      const initOpts: {
        cwd: string;
        ontology: string;
        dir?: string;
      } = {
        cwd: process.cwd(),
        ontology: opts.ontology ?? 'general',
      };
      if (dir !== undefined) {
        initOpts.dir = dir;
      }
      const result = init(initOpts);
      writeOk(result);
    });

  // Core ops — thin adapters over library (CLI-01, D-02, D-06, D-08)
  program
    .command('build')
    .description('Offline extract/normalize/publish from a corpus root')
    .requiredOption('--corpus <path>', 'corpus root directory to discover')
    .option('--full', 're-extract all sources (ignore fresh hashes)')
    .action((opts: { corpus: string; full?: boolean }, cmd: Command) => {
      const result = build(
        withDir(
          {
            corpus: opts.corpus,
            ...(opts.full === true ? { full: true } : {}),
          },
          globalDir(cmd),
        ),
      );
      writeOk(result);
    });

  program
    .command('query')
    .description('Seed-expand query by term (Query IR)')
    .argument('<term>', 'seed term (id/label/alias substring)')
    .option('--hops <n>', 'hop expansion depth', parseIntOpt)
    .option('--budget <n>', 'token budget for result trim', parseIntOpt)
    .action(
      (
        term: string,
        opts: { hops?: number; budget?: number },
        cmd: Command,
      ) => {
        const result = query(
          withDir(
            {
              term,
              ...(opts.hops !== undefined ? { hops: opts.hops } : {}),
              ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
            },
            globalDir(cmd),
          ),
        );
        writeOk(result);
      },
    );

  program
    .command('path')
    .description('Shortest path query between two node ids')
    .argument('<from>', 'source node id')
    .argument('<to>', 'target node id')
    .option('--depth <n>', 'max path depth', parseIntOpt)
    .action((from: string, to: string, opts: { depth?: number }, cmd: Command) => {
      const result = query(
        withDir(
          {
            path: {
              from,
              to,
              ...(opts.depth !== undefined ? { maxDepth: opts.depth } : {}),
            },
          },
          globalDir(cmd),
        ),
      );
      writeOk(result);
    });

  program
    .command('status')
    .description('Read store status (never uses projection as SoT)')
    .action((_opts: unknown, cmd: Command) => {
      const result = status(withDir({}, globalDir(cmd)));
      writeOk(result);
    });

  program
    .command('diff')
    .description('Diff current graph.v1 against a snapshot or last-diff-base')
    .option('--snapshot <name>', 'named snapshot (logical name or fileName)')
    .action((opts: { snapshot?: string }, cmd: Command) => {
      const result = diff(
        withDir(
          {
            ...(opts.snapshot !== undefined ? { snapshot: opts.snapshot } : {}),
          },
          globalDir(cmd),
        ),
      );
      writeOk(result);
    });

  program
    .command('repair')
    .description('Regenerate disposable graph.json projection from graph.v1')
    .action((_opts: unknown, cmd: Command) => {
      const result = repair(withDir({}, globalDir(cmd)));
      writeOk(result);
    });

  return program;
}

/**
 * CLI entry used by bin/gsd-graph.js and tests (D-11).
 * Returns process exit code; does not call process.exit.
 */
export function main(argv: string[]): number {
  const program = buildProgram();
  try {
    program.parse(argv);
    return 0;
  } catch (err) {
    if (err instanceof GraphError) {
      writeErrorJson({
        ok: false,
        reason: err.reason,
        message: err.message,
      });
      return mapCliError(err);
    }
    if (err instanceof CommanderError) {
      writeErrorJson({
        ok: false,
        reason: 'usage',
        message: errorMessage(err),
      });
      return 1;
    }
    writeErrorJson({
      ok: false,
      reason: 'usage',
      message: errorMessage(err),
    });
    return mapCliError(err);
  }
}

// Local debug: node dist/cli.js … (published bin always calls main explicitly)
if (require.main === module) {
  process.exitCode = main(process.argv);
}
