// gsd-graph — CLI adapter (commander) + K22 exit mapping
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { GSD_GRAPH_REASON, GraphError } from './errors';
import { init } from './pipeline/init';

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
      const globals = cmd.optsWithGlobals() as { dir?: string; ontology?: string };
      const initOpts: {
        cwd: string;
        ontology: string;
        dir?: string;
      } = {
        cwd: process.cwd(),
        ontology: opts.ontology ?? globals.ontology ?? 'general',
      };
      if (globals.dir !== undefined) {
        initOpts.dir = globals.dir;
      }
      const result = init(initOpts);
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
