// gsd-graph — CLI adapter (commander) + K22 exit mapping

import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { GSD_GRAPH_REASON, GraphError } from './errors';
import { resolveStoreRoot } from './io/paths';
import { loadOntologyPack } from './ontology/load-pack';
import { ontologyEject } from './ontology/eject';
import { promptApply } from './llm/apply';
import { resolveLlmMode } from './llm/provider';
import {
  readPromptResult,
  requirePromptFileStage,
} from './llm/prompt-files';
import { answer, answerHttp, answerSemantic } from './pipeline/answer';
import {
  buildEmbeddingSidecar,
  loadEmbeddingSidecar,
  readEmbeddingsConfig,
} from './embeddings/sidecar';
import { build, mergeCandidates } from './pipeline/build';
import {
  collectLlmSources,
  extractPromptVersion,
  llmExtractHttp,
  sanitizeExtractCandidates,
  writeExtractPromptRequest,
} from './llm/extract';
import { defaultApiKeyEnv, type LlmHttpProvider } from './llm/http-client';
import {
  detectCommunities,
  writeCommunityReports,
} from './pipeline/communities';
import { diff } from './pipeline/diff';
import { init } from './pipeline/init';
import { withSpinner } from './cli/spinner';
import { printEnableWrapup, printSyncWrapup } from './cli/summary';
import {
  argvWantsUpdate,
  argvWantsVersion,
  getVersionInfo,
  isSelfMetaArgv,
  selfUpdate,
} from './cli/self-update';
import {
  mcpDoctor,
  mcpInstall,
  type McpHostId,
} from './cli/mcp-install';
import { enable } from './pipeline/enable';
import { projectSync } from './pipeline/project-sync';
import { packSubgraph } from './pipeline/pack';
import { query } from './pipeline/query';
import { writeGraphReport } from './pipeline/report';
import { repair } from './pipeline/repair';
import { exportGraph, isExportFormat } from './pipeline/export';
import { why } from './pipeline/why';
import {
  loadReviewQueue,
  reviewResolve,
  reviewResolveBatch,
} from './pipeline/review';
import {
  snapshotList,
  snapshotRestore,
  snapshotSave,
} from './pipeline/snapshot';
import { supersede } from './pipeline/supersede';
import { assertFact, retractFact } from './pipeline/assert';
import { runEval } from './pipeline/eval';
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

/**
 * JSON pretty-print control for stdout (K22 still applies — valid JSON only).
 * - auto: pretty on TTY, compact when piped
 * - --pretty / GSD_GRAPH_JSON_PRETTY=1
 * - --compact / GSD_GRAPH_JSON_COMPACT=1
 */
let jsonPrettyOverride: boolean | undefined;
/** When true, force JSON emit for human-facing commands (enable/sync). */
let forceJsonEmit: boolean | undefined;

function preferPrettyJson(): boolean {
  if (jsonPrettyOverride === true) return true;
  if (jsonPrettyOverride === false) return false;
  if (
    process.env.GSD_GRAPH_JSON_COMPACT === '1' ||
    process.env.GSD_GRAPH_JSON_COMPACT === 'true'
  ) {
    return false;
  }
  if (
    process.env.GSD_GRAPH_JSON_PRETTY === '1' ||
    process.env.GSD_GRAPH_JSON_PRETTY === 'true'
  ) {
    return true;
  }
  return Boolean(process.stdout.isTTY);
}

function formatJson(payload: unknown): string {
  return preferPrettyJson()
    ? JSON.stringify(payload, null, 2) + '\n'
    : JSON.stringify(payload) + '\n';
}

function writeOk(payload: unknown): void {
  process.stdout.write(formatJson(payload));
}

/**
 * For enable/sync: interactive TTY → wrap-up only (no JSON dump).
 * Piped / CI / --json / --pretty / --compact → emit JSON on stdout.
 */
function shouldEmitJsonForHumanCommand(): boolean {
  if (forceJsonEmit === true) return true;
  if (forceJsonEmit === false) return false;
  if (
    process.env.GSD_GRAPH_JSON === '1' ||
    process.env.GSD_GRAPH_JSON === 'true'
  ) {
    return true;
  }
  if (
    process.env.GSD_GRAPH_NO_JSON === '1' ||
    process.env.GSD_GRAPH_NO_JSON === 'true'
  ) {
    return false;
  }
  if (process.env.CI === 'true' || process.env.CI === '1') return true;
  // Non-TTY (pipes/scripts): always JSON
  if (!process.stdout.isTTY) return true;
  // Interactive human default: summary only
  return false;
}

function writeOkHumanCommand(payload: unknown): void {
  if (!shouldEmitJsonForHumanCommand()) return;
  writeOk(payload);
}

function writeErrorJson(body: CliErrorBody): void {
  let line = formatJson(body);
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

/** HTTP LLM settings resolved from store config.json `llm.http` + defaults. */
interface ResolvedLlmHttp {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  provider: LlmHttpProvider;
}

/** Default endpoints per provider — used only after explicit `--llm http`. */
function defaultLlmBaseUrl(provider: LlmHttpProvider): string {
  return provider === 'anthropic'
    ? 'https://api.anthropic.com'
    : 'https://api.openai.com';
}

function defaultLlmModel(provider: LlmHttpProvider): string {
  return provider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o-mini';
}

/** Read store config.json `llm.http` section (all fields optional). */
function readStoreLlmHttp(dir: string | undefined): ResolvedLlmHttp {
  let raw: {
    provider?: unknown;
    base_url?: unknown;
    model?: unknown;
    api_key_env?: unknown;
  } = {};
  try {
    const storeRoot = resolveStoreRoot(dir !== undefined ? { dir } : {});
    const configPath = require('node:path').join(storeRoot, 'config.json');
    const fs = require('node:fs') as typeof import('node:fs');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        llm?: { http?: typeof raw };
      };
      raw = parsed.llm?.http ?? {};
    }
  } catch {
    raw = {};
  }
  const provider: LlmHttpProvider =
    raw.provider === 'anthropic' ? 'anthropic' : 'openai';
  return {
    provider,
    baseUrl:
      typeof raw.base_url === 'string' && raw.base_url.length > 0
        ? raw.base_url
        : defaultLlmBaseUrl(provider),
    model:
      typeof raw.model === 'string' && raw.model.length > 0
        ? raw.model
        : defaultLlmModel(provider),
    apiKeyEnv:
      typeof raw.api_key_env === 'string' && raw.api_key_env.length > 0
        ? raw.api_key_env
        : defaultApiKeyEnv(provider),
  };
}

/** Load the active ontology allowlists for LLM extract prompts. */
function loadLlmAllowlists(dir: string | undefined): {
  types: string[];
  predicates: string[];
} {
  let packId = 'general';
  try {
    const storeRoot = resolveStoreRoot(dir !== undefined ? { dir } : {});
    const fs = require('node:fs') as typeof import('node:fs');
    const configPath = require('node:path').join(storeRoot, 'config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        ontology?: unknown;
      };
      if (typeof parsed.ontology === 'string' && parsed.ontology.length > 0) {
        packId = parsed.ontology;
      }
    }
  } catch {
    packId = 'general';
  }
  const loaded = loadOntologyPack({ packIdOrPath: packId });
  return {
    types: [...loaded.pack.node_types],
    predicates: loaded.pack.predicates.map((p) => p.id),
  };
}

/**
 * LLM extract stage shared by build/sync (D-01: only on explicit --llm):
 * - prompt → write `.prompt-extract.json`; host agent replies, then
 *   `gsd-graph prompt apply extract` merges.
 * - http → live completion per source, merge INFERRED candidates now.
 * Returns a JSON-safe summary for the command result (null when mode none).
 */
function runLlmExtractStage(
  mode: import('./types').LlmMode,
  corpus: string | string[],
  dir: string | undefined,
): object | Promise<object> | null {
  if (mode === 'none') return null;
  const allow = loadLlmAllowlists(dir);

  if (mode === 'prompt') {
    const out = writeExtractPromptRequest({
      ...(dir !== undefined ? { dir } : {}),
      corpus,
      allowedTypes: allow.types,
      allowedPredicates: allow.predicates,
    });
    return {
      mode: 'prompt',
      request_path: out.request.path,
      sources: out.sources,
      skipped: out.skipped,
      next: 'write .prompt-extract-result.json, then: gsd-graph prompt apply extract',
    };
  }

  // http — async live extraction + merge
  const http = readStoreLlmHttp(dir);
  const { files, skipped } = collectLlmSources(corpus);
  return llmExtractHttp(files, {
    baseUrl: http.baseUrl,
    model: http.model,
    provider: http.provider,
    apiKeyEnv: http.apiKeyEnv,
    allowedTypes: allow.types,
    allowedPredicates: allow.predicates,
    ...(dir !== undefined ? { dir } : {}),
  }).then((extracted) => {
    const merged = mergeCandidates({
      ...(dir !== undefined ? { dir } : {}),
      nodes: extracted.nodes,
      triples: extracted.triples,
    });
    return {
      mode: 'http',
      provider: http.provider,
      model: http.model,
      sources_extracted: extracted.sources_extracted,
      candidate_nodes: extracted.nodes.length,
      candidate_triples: extracted.triples.length,
      node_count: merged.node_count,
      triple_count: merged.triple_count,
      review_pending: merged.review_pending,
      failures: extracted.failures,
      skipped_sources: skipped,
    };
  });
}

/** Parent command groups: bare `gsd-graph <group>` prints that group's help. */
function defaultGroupHelp(cmd: Command): Command {
  return cmd.action(function (this: Command) {
    this.help();
  });
}

/** Extra human help after commander’s command list (stdout). */
const HELP_AFTER = `
Quick start:
  gsd-graph enable --mcp     skill + hooks + graph + MCP hosts
  gsd-graph sync             incremental update after docs change
  gsd-graph ask "…"          grounded multi-hop answer + citations
  gsd-graph status           store health / counts
  gsd-graph mcp install      wire Claude / Codex / Cursor
  gsd-graph mcp doctor       verify MCP registration

Also useful:
  gsd-graph why <a> <b>      how A connects to B (cited prose)
  gsd-graph export --format html   interactive viewer (mermaid|graphml|cypher too)
  gsd-graph sync --llm       LLM-assisted extraction (prompt file or --llm http)
  gsd-graph query <term>     seed-expand search
  gsd-graph review list      pending ontology / merge items
  gsd-graph review accept --all --kind <kind>   batch resolve
  gsd-graph --version        package version (JSON)
  gsd-graph --update         install latest from npm

Subcommand help:
  gsd-graph help <command>
  gsd-graph <command> --help

Machine output: most commands print JSON on stdout (K22).
enable/sync print a human wrap-up on TTY; use --json for full JSON.
Docs: https://github.com/open-gsd/gsd-graph#readme
`;

function buildProgram(): Command {
  const program = new Command();
  program
    .name('gsd-graph')
    .description(
      'Graph Engineering toolkit — local knowledge graph (triples + citations)',
    )
    .showSuggestionAfterError()
    .exitOverride()
    // Help is human text on stdout. Usage/errors still map to JSON on stderr (K22).
    .configureOutput({
      writeOut: (str: string) => {
        process.stdout.write(str);
      },
      writeErr: () => {},
    })
    .helpOption('-h, --help', 'show help')
    .addHelpText('after', HELP_AFTER)
    .option('--dir <path>', 'store directory override')
    .option(
      '--pretty',
      'pretty-print JSON on stdout (default when stdout is a TTY)',
    )
    .option(
      '--compact',
      'single-line JSON on stdout (default when piped / non-TTY)',
    )
    .option(
      '--json',
      'emit full JSON on stdout for enable/sync (default when piped)',
    )
    .option('-V, --version', 'show package version (JSON)')
    .option('-U, --update', 'update @opengsd/gsd-graph to latest from npm')
    .hook('preAction', (thisCommand) => {
      const o = thisCommand.optsWithGlobals() as {
        pretty?: boolean;
        compact?: boolean;
        json?: boolean;
      };
      // Reset each invocation so flags don't leak across main() test calls.
      jsonPrettyOverride = undefined;
      forceJsonEmit = undefined;
      if (o.compact === true) jsonPrettyOverride = false;
      else if (o.pretty === true) jsonPrettyOverride = true;
      // --json / --pretty / --compact all imply JSON emission for enable/sync
      if (o.json === true || o.pretty === true || o.compact === true) {
        forceJsonEmit = true;
      }
    });

  program
    .command('version')
    .description('Show package version as JSON (also: -V, --version)')
    .option('--check', 'also query npm for latest version')
    .action((opts: { check?: boolean }) => {
      writeOk(
        getVersionInfo({
          checkLatest: opts.check === true,
        }),
      );
    });

  program
    .command('update')
    .description(
      'Update @opengsd/gsd-graph to latest via npm (also: -U, --update)',
    )
    .action(() => {
      const result = withSpinner('Updating gsd-graph…', (report) =>
        selfUpdate({ cwd: process.cwd(), onProgress: report }),
      );
      writeOk(result);
    });

  // One-shot enable — skill + hooks + config + full brownfield sync
  program
    .command('enable')
    .description(
      'One-shot setup: install skill/hooks, write config, full project graph sync',
    )
    .option('--no-auto-update', 'disable continuous post-commit sync flags')
    .option('--no-report', 'skip GRAPH_REPORT.md on first sync')
    .option('--communities', 'run communities detect after first sync')
    .option('--skip-sync', 'install skill/hooks/config only (no corpus build)')
    .option(
      '--mcp',
      'register MCP with Claude / Codex / Cursor + project .mcp.json',
    )
    .action(
      (
        opts: {
          autoUpdate?: boolean;
          report?: boolean;
          communities?: boolean;
          skipSync?: boolean;
          mcp?: boolean;
        },
        cmd: Command,
      ) => {
        const dir = globalDir(cmd);
        const result = withSpinner('Enabling gsd-graph…', (report) =>
          enable({
            cwd: process.cwd(),
            ...(dir !== undefined ? { dir } : {}),
            ...(opts.autoUpdate === false ? { autoUpdate: false } : {}),
            ...(opts.report === false ? { report: false } : {}),
            ...(opts.communities === true ? { communities: true } : {}),
            ...(opts.skipSync === true ? { skipSync: true } : {}),
            ...(opts.mcp === true ? { mcp: true } : {}),
            onProgress: report,
          }),
        );
        printEnableWrapup(result);
        writeOkHumanCommand(result);
      },
    );

  // MCP host registration
  const mcpCmd = defaultGroupHelp(
    program
      .command('mcp')
      .description(
        'Register or diagnose gsd-graph MCP for Claude / Codex / Cursor',
      ),
  );

  mcpCmd
    .command('install')
    .description(
      'Write MCP config for detected hosts (Claude, Codex, Cursor) + project .mcp.json',
    )
    .option(
      '--host <id>',
      'host to configure (repeatable): claude|codex|cursor|project',
      (val: string, prev: string[]) => {
        prev.push(val);
        return prev;
      },
      [] as string[],
    )
    .option('--allow-build', 'enable graph_build MCP tool')
    .option('--allow-review-write', 'enable graph_review_resolve MCP tool')
    .action(
      (
        opts: {
          host?: string[];
          allowBuild?: boolean;
          allowReviewWrite?: boolean;
        },
        cmd: Command,
      ) => {
        const dir = globalDir(cmd);
        const hosts = (opts.host ?? [])
          .map((h) => h.toLowerCase())
          .filter((h): h is McpHostId =>
            ['claude', 'codex', 'cursor', 'project'].includes(h),
          );
        const result = withSpinner('Installing gsd-graph MCP…', (report) =>
          mcpInstall({
            cwd: process.cwd(),
            ...(dir !== undefined ? { dir } : {}),
            ...(hosts.length > 0 ? { hosts } : {}),
            ...(opts.allowBuild === true ? { allowBuild: true } : {}),
            ...(opts.allowReviewWrite === true
              ? { allowReviewWrite: true }
              : {}),
            onProgress: report,
          }),
        );
        // Always print a short human summary on stderr for install
        if (process.stderr.isTTY || process.env.GSD_GRAPH_PROGRESS === '1') {
          process.stderr.write(
            `\n✔ MCP install\n` +
              result.hosts
                .map(
                  (h) =>
                    `  ${h.ok ? '✔' : '✖'} ${h.host}: ${h.message}`,
                )
                .join('\n') +
              `\n\n  Next: restart Claude / Codex / Cursor\n  Then: gsd-graph mcp doctor\n\n`,
          );
        }
        writeOk(result);
      },
    );

  mcpCmd
    .command('doctor')
    .description('Check graph store + MCP host registration')
    .action((_opts: unknown, cmd: Command) => {
      const dir = globalDir(cmd);
      const result = mcpDoctor({
        cwd: process.cwd(),
        ...(dir !== undefined ? { dir } : {}),
      });
      if (process.stderr.isTTY || process.env.GSD_GRAPH_PROGRESS === '1') {
        process.stderr.write(
          `\n${result.ok ? '✔' : '✖'} gsd-graph mcp doctor\n` +
            result.checks
              .map((c) => `  ${c.ok ? '✔' : '✖'} ${c.message}`)
              .join('\n') +
            (result.next.length
              ? `\n\n  Next:\n${result.next.map((n) => `    ${n}`).join('\n')}`
              : '') +
            '\n\n',
        );
      }
      writeOk(result);
    });

  program
    .command('init')
    .description('Create store layout and append gitignore entry when present')
    .option(
      '--ontology <idOrPath>',
      'ontology pack id or path (default: general; persisted to config.json)',
    )
    .action((opts: { ontology?: string }, cmd: Command) => {
      const dir = globalDir(cmd);
      const initOpts: {
        cwd: string;
        ontology?: string;
        dir?: string;
      } = {
        cwd: process.cwd(),
        // Only pass when explicit so re-init without the flag never rewrites
        // an existing persisted choice.
        ...(opts.ontology !== undefined ? { ontology: opts.ontology } : {}),
      };
      if (dir !== undefined) {
        initOpts.dir = dir;
      }
      const result = init(initOpts);
      writeOk(result);
    });

  // Project sync — brownfield auto corpus + continuous incremental update
  program
    .command('sync')
    .description(
      'Init (if needed) and build project corpus (docs, README, .planning, …); incremental by default',
    )
    .option('--full', 'full re-extract (ignore fresh content hashes)')
    .option(
      '--corpus <path>',
      'extra corpus root (repeatable)',
      (val: string, prev: string[]) => {
        prev.push(val);
        return prev;
      },
      [] as string[],
    )
    .option('--communities', 'run communities detect after build')
    .option('--report', 'write GRAPH_REPORT.md after build')
    .option(
      '--ontology <idOrPath>',
      'ontology pack id or path (default: config.json ontology, else general)',
    )
    .option(
      '--llm [mode]',
      'LLM-assisted extraction: omit/prompt → request file; http → live endpoint',
    )
    .action(
      (
        opts: {
          full?: boolean;
          corpus?: string[];
          communities?: boolean;
          report?: boolean;
          ontology?: string;
          llm?: string | boolean;
        },
        cmd: Command,
      ): void | Promise<void> => {
        const dir = globalDir(cmd);
        const result = withSpinner(
          opts.full === true ? 'Full project sync…' : 'Project sync…',
          (report) =>
            projectSync({
              cwd: process.cwd(),
              ...(dir !== undefined ? { dir } : {}),
              ...(opts.full === true ? { full: true } : {}),
              ...(opts.corpus && opts.corpus.length > 0
                ? { extraCorpus: opts.corpus }
                : {}),
              ...(opts.communities === true ? { communities: true } : {}),
              ...(opts.report === true ? { report: true } : {}),
              ...(opts.ontology !== undefined
                ? { ontology: opts.ontology }
                : {}),
              onProgress: report,
            }),
        );
        const flagMode = parseLlmFlag(opts.llm);
        const mode = resolveLlmMode(
          flagMode === undefined ? {} : { flagMode },
        );
        const stage = runLlmExtractStage(mode, result.corpus, dir);
        if (stage !== null && typeof (stage as Promise<object>).then === 'function') {
          return (stage as Promise<object>).then((llm) => {
            printSyncWrapup(result);
            writeOkHumanCommand({ ...result, llm_extract: llm });
          });
        }
        printSyncWrapup(result);
        writeOkHumanCommand(
          stage === null ? result : { ...result, llm_extract: stage },
        );
      },
    );

  // Core ops — thin adapters over library (CLI-01, D-02, D-06, D-08)
  program
    .command('build')
    .description('Offline extract/normalize/publish from a corpus root')
    .requiredOption('--corpus <path>', 'corpus root directory to discover')
    .option('--full', 're-extract all sources (ignore fresh hashes)')
    .option(
      '--ontology <idOrPath>',
      'ontology pack id or path (default: config.json ontology, else general)',
    )
    .option(
      '--llm [mode]',
      'LLM-assisted extraction: omit/prompt → request file; http → live endpoint',
    )
    .action(
      (
        opts: {
          corpus: string;
          full?: boolean;
          ontology?: string;
          llm?: string | boolean;
        },
        cmd: Command,
      ): void | Promise<void> => {
        const dir = globalDir(cmd);
        const result = build(
          withDir(
            {
              corpus: opts.corpus,
              ...(opts.full === true ? { full: true } : {}),
              ...(opts.ontology !== undefined
                ? { ontology: opts.ontology }
                : {}),
            },
            dir,
          ),
        );
        const flagMode = parseLlmFlag(opts.llm);
        const mode = resolveLlmMode(
          flagMode === undefined ? {} : { flagMode },
        );
        const stage = runLlmExtractStage(mode, opts.corpus, dir);
        if (stage !== null && typeof (stage as Promise<object>).then === 'function') {
          return (stage as Promise<object>).then((llm) => {
            writeOk({ ...result, llm_extract: llm });
          });
        }
        writeOk(stage === null ? result : { ...result, llm_extract: stage });
      },
    );

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
    .command('why')
    .description('Explain how two concepts connect — path + cited prose')
    .argument('<from>', 'source term (label, alias, or node id)')
    .argument('<to>', 'target term (label, alias, or node id)')
    .option('--depth <n>', 'max path depth', parseIntOpt)
    .action(
      (from: string, to: string, opts: { depth?: number }, cmd: Command) => {
        const result = why(
          withDir(
            {
              from,
              to,
              ...(opts.depth !== undefined ? { maxDepth: opts.depth } : {}),
            },
            globalDir(cmd),
          ),
        );
        writeOk(result);
      },
    );

  program
    .command('export')
    .description('Export graph to mermaid | graphml | cypher | html viewer')
    .requiredOption(
      '--format <fmt>',
      'output format: mermaid | graphml | cypher | html',
    )
    .option('--out <path>', 'output file (default <store>/exports/graph.<ext>)')
    .option('--max-triples <n>', 'cap exported triples (default 5000)', parseIntOpt)
    .action(
      (
        opts: { format: string; out?: string; maxTriples?: number },
        cmd: Command,
      ) => {
        if (!isExportFormat(opts.format)) {
          throw new GraphError(
            GSD_GRAPH_REASON.SCHEMA_INVALID,
            `unknown export format: ${opts.format} (mermaid | graphml | cypher | html)`,
          );
        }
        const result = exportGraph(
          withDir(
            {
              format: opts.format,
              ...(opts.out !== undefined ? { out: opts.out } : {}),
              ...(opts.maxTriples !== undefined
                ? { maxTriples: opts.maxTriples }
                : {}),
            },
            globalDir(cmd),
          ),
        );
        writeOk(result);
      },
    );

  program
    .command('status')
    .description('Read store status (never uses projection as SoT)')
    .action((_opts: unknown, cmd: Command) => {
      const result = status(withDir({}, globalDir(cmd)));
      writeOk(result);
    });

  program
    .command('report')
    .description(
      'Write disposable GRAPH_REPORT.md from published graph.v1 (never SoT)',
    )
    .action((_opts: unknown, cmd: Command) => {
      const result = writeGraphReport(withDir({}, globalDir(cmd)));
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

  // Nested lifecycle verbs — never use two-arg executable form (RESEARCH pitfall 3)
  const snapshot = defaultGroupHelp(
    program
      .command('snapshot')
      .description('Save, list, or restore named graph.v1 snapshots'),
  );

  snapshot
    .command('save')
    .description('Save current graph.v1 as a named snapshot')
    .argument('<name>', 'logical snapshot name')
    .action((name: string, _opts: unknown, cmd: Command) => {
      const result = snapshotSave(withDir({ name }, globalDir(cmd)));
      writeOk(result);
    });

  snapshot
    .command('list')
    .description('List named snapshots (newest first; excludes last-diff-base)')
    .action((_opts: unknown, cmd: Command) => {
      const result = snapshotList(withDir({}, globalDir(cmd)));
      writeOk(result);
    });

  snapshot
    .command('restore')
    .description('Restore graph.v1 from a named snapshot')
    .argument('<name>', 'logical snapshot name or fileName')
    .action((name: string, _opts: unknown, cmd: Command) => {
      const result = snapshotRestore(withDir({ name }, globalDir(cmd)));
      writeOk(result);
    });

  const review = defaultGroupHelp(
    program
      .command('review')
      .description('List or resolve review-queue items'),
  );

  review
    .command('list')
    .description('List pending review-queue items')
    .action((_opts: unknown, cmd: Command) => {
      const storeRoot = resolveStoreRoot(
        withDir({}, globalDir(cmd)) as { dir?: string },
      );
      const queue = loadReviewQueue(storeRoot);
      const pending = queue.items.filter((i) => i.status === 'pending');
      writeOk({
        schema_version: queue.schema_version,
        items: pending,
        decisions_count: queue.decisions.length,
        pending_count: pending.length,
      });
    });

  const reviewBatchAction = (
    action: 'accept' | 'reject',
    id: string | undefined,
    opts: {
      extendOntology?: boolean;
      all?: boolean;
      kind?: string;
      predicate?: string;
    },
    cmd: Command,
  ): void => {
    const storeRoot = resolveStoreRoot(
      withDir({}, globalDir(cmd)) as { dir?: string },
    );
    const hasFilters =
      opts.all === true ||
      opts.kind !== undefined ||
      opts.predicate !== undefined;

    if (id !== undefined && !hasFilters) {
      reviewResolve({
        storeRoot,
        id,
        action,
        ...(opts.extendOntology === true ? { extendOntology: true } : {}),
      });
      writeOk({ ok: true, id, action });
      return;
    }
    if (!hasFilters) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `review ${action} requires an item id, or --all / --kind / --predicate for batch resolve`,
      );
    }
    const result = reviewResolveBatch({
      storeRoot,
      action,
      ...(opts.all === true ? { all: true } : {}),
      ...(opts.kind !== undefined
        ? { kind: opts.kind as import('./types').ReviewKind }
        : {}),
      ...(opts.predicate !== undefined ? { predicate: opts.predicate } : {}),
      ...(id !== undefined ? { ids: [id] } : {}),
      ...(opts.extendOntology === true ? { extendOntology: true } : {}),
    });
    writeOk({
      ok: true,
      action,
      resolved: result.resolved,
      resolved_count: result.resolved.length,
      skipped: result.skipped,
    });
  };

  review
    .command('accept')
    .description('Accept pending review item(s) — single id or batch filters')
    .argument('[id]', 'review item id (omit when using batch filters)')
    .option(
      '--extend-ontology',
      'allow ontology.lock extend on unknown type/predicate accept',
    )
    .option('--all', 'accept every pending item (respects --kind/--predicate)')
    .option(
      '--kind <kind>',
      'batch filter: entity_merge | predicate_unknown | type_unknown | schema_drift',
    )
    .option(
      '--predicate <p>',
      'batch filter: predicate_unknown items proposing this predicate',
    )
    .action(
      (
        id: string | undefined,
        opts: {
          extendOntology?: boolean;
          all?: boolean;
          kind?: string;
          predicate?: string;
        },
        cmd: Command,
      ) => {
        reviewBatchAction('accept', id, opts, cmd);
      },
    );

  review
    .command('reject')
    .description('Reject pending review item(s) — single id or batch filters')
    .argument('[id]', 'review item id (omit when using batch filters)')
    .option('--all', 'reject every pending item (respects --kind/--predicate)')
    .option(
      '--kind <kind>',
      'batch filter: entity_merge | predicate_unknown | type_unknown | schema_drift',
    )
    .option(
      '--predicate <p>',
      'batch filter: predicate_unknown items proposing this predicate',
    )
    .action(
      (
        id: string | undefined,
        opts: { all?: boolean; kind?: string; predicate?: string },
        cmd: Command,
      ) => {
        reviewBatchAction('reject', id, opts, cmd);
      },
    );

  program
    .command('eval')
    .description(
      'Run the answer-quality QA set (seed recall, citation validity, pass/fail)',
    )
    .option('--file <path>', 'QA file (default evals/gsd-graph.json)')
    .action((opts: { file?: string }, cmd: Command) => {
      const result = runEval(
        withDir(
          {
            cwd: process.cwd(),
            ...(opts.file !== undefined ? { file: opts.file } : {}),
          },
          globalDir(cmd),
        ),
      );
      writeOk(result);
      if (result.failed > 0) {
        throw new GraphError(
          GSD_GRAPH_REASON.BUILD_FAILED,
          `${result.failed}/${result.total} eval case(s) failed`,
        );
      }
    });

  program
    .command('assert')
    .description(
      'Assert a fact into the graph (ontology-gated; recorded in episodes.jsonl)',
    )
    .argument('<subject>', 'subject node id, label, or alias')
    .argument('<predicate>', 'predicate id (unknown → review queue)')
    .argument('<object>', 'object node id, label, or alias')
    .option('--type-s <type>', 'node type when creating the subject (default Concept)')
    .option('--type-o <type>', 'node type when creating the object (default Concept)')
    .option(
      '--confidence <tier>',
      'EXTRACTED | INFERRED | AMBIGUOUS (default INFERRED)',
    )
    .option('--note <text>', 'evidence note recorded in the episode log')
    .option('--supersedes <tripleId>', 'triple this assertion supersedes')
    .option('--actor <tag>', 'who asserts (default user/assert)')
    .action(
      (
        s: string,
        p: string,
        o: string,
        opts: {
          typeS?: string;
          typeO?: string;
          confidence?: string;
          note?: string;
          supersedes?: string;
          actor?: string;
        },
        cmd: Command,
      ) => {
        const conf =
          opts.confidence === 'EXTRACTED' ||
          opts.confidence === 'INFERRED' ||
          opts.confidence === 'AMBIGUOUS'
            ? opts.confidence
            : undefined;
        const result = assertFact(
          withDir(
            {
              s,
              p,
              o,
              ...(opts.typeS !== undefined ? { sType: opts.typeS } : {}),
              ...(opts.typeO !== undefined ? { oType: opts.typeO } : {}),
              ...(conf !== undefined ? { confidence: conf } : {}),
              ...(opts.note !== undefined ? { note: opts.note } : {}),
              ...(opts.supersedes !== undefined
                ? { supersedes: opts.supersedes }
                : {}),
              ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
            },
            globalDir(cmd),
          ),
        );
        writeOk({ ok: true, ...result });
      },
    );

  program
    .command('retract')
    .description('Retract a triple by id (recorded in episodes.jsonl)')
    .argument('<tripleId>', 'triple id to retract')
    .option('--note <text>', 'reason recorded in the episode log')
    .option('--actor <tag>', 'who retracts (default user/retract)')
    .action(
      (
        tripleId: string,
        opts: { note?: string; actor?: string },
        cmd: Command,
      ) => {
        const result = retractFact(
          withDir(
            {
              tripleId,
              ...(opts.note !== undefined ? { note: opts.note } : {}),
              ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
            },
            globalDir(cmd),
          ),
        );
        writeOk({ ok: true, ...result });
      },
    );

  program
    .command('supersede')
    .description(
      'Record that one triple supersedes another (decision reversal verdict)',
    )
    .argument('<winner>', 'triple id that wins (current fact)')
    .argument('<loser>', 'triple id that is superseded (stale fact)')
    .action((winner: string, loser: string, _opts: unknown, cmd: Command) => {
      const result = supersede(withDir({ winner, loser }, globalDir(cmd)));
      writeOk({ ok: true, ...result });
    });

  const ontology = defaultGroupHelp(
    program
      .command('ontology')
      .description('Show or validate an ontology pack'),
  );

  ontology
    .command('show')
    .description('Load pack and print JSON-safe summary')
    .option('--pack <idOrPath>', 'pack id or path', 'general')
    .action((opts: { pack?: string }) => {
      const loaded = loadOntologyPack({
        packIdOrPath: opts.pack ?? 'general',
      });
      // Sets are not JSON-serializable — emit summary fields only (D-06)
      writeOk({
        id: loaded.pack.id,
        version: loaded.pack.version,
        title: loaded.pack.title,
        node_types: loaded.pack.node_types.length,
        predicates: loaded.pack.predicates.length,
        strict: loaded.pack.strict,
        packHash: loaded.packHash,
      });
    });

  ontology
    .command('eject')
    .description(
      'Materialize the active pack + accepted lock extensions as a committable project-local pack',
    )
    .option('--out <dir>', 'output directory (default ontology-packs/<id>-local)')
    .action((opts: { out?: string }, cmd: Command) => {
      const result = ontologyEject(
        withDir(
          {
            cwd: process.cwd(),
            ...(opts.out !== undefined ? { out: opts.out } : {}),
          },
          globalDir(cmd),
        ),
      );
      writeOk({ ok: true, ...result });
    });

  ontology
    .command('validate')
    .description('Load + schema-validate pack; ok on success')
    .option('--pack <idOrPath>', 'pack id or path', 'general')
    .action((opts: { pack?: string }) => {
      const loaded = loadOntologyPack({
        packIdOrPath: opts.pack ?? 'general',
      });
      writeOk({
        ok: true,
        pack_id: loaded.pack.id,
        version: loaded.pack.version,
      });
    });

  // Phase 7 communities — nested detect|report over LPA library (COM-01, D-06)
  const communities = defaultGroupHelp(
    program
      .command('communities')
      .description('Detect communities and write theme reports (non-SoT)'),
  );

  communities
    .command('detect')
    .description(
      'Run pure-TS label-propagation community detection; write communities/ sidecars',
    )
    .option('--min-size <n>', 'minimum community size (default 3)', parseIntOpt)
    .option('--max-iter <n>', 'max LPA iterations (default 20)', parseIntOpt)
    .action(
      (opts: { minSize?: number; maxIter?: number }, cmd: Command) => {
        const result = detectCommunities(
          withDir(
            {
              write: true,
              ...(opts.minSize !== undefined ? { minSize: opts.minSize } : {}),
              ...(opts.maxIter !== undefined
                ? { maxIterations: opts.maxIter }
                : {}),
            },
            globalDir(cmd),
          ),
        );
        writeOk({
          ok: true,
          community_count: result.communities.length,
          iterations: result.iterations,
          stopped_reason: result.stopped_reason,
          nodes_considered: result.nodes_considered,
          edges_considered: result.edges_considered,
          dropped_small_count: result.dropped_small_count,
          communities: result.communities.map((c) => ({
            id: c.id,
            size: c.size,
            label: c.label,
            stable_key: c.stable_key,
          })),
          index_path: result.index_path,
          report_paths: result.report_paths,
        });
      },
    );

  communities
    .command('report')
    .description(
      'Rewrite community theme markdown from communities/index.json (no re-detect)',
    )
    .action((_opts: unknown, cmd: Command) => {
      const paths = writeCommunityReports(withDir({}, globalDir(cmd)));
      writeOk({
        ok: true,
        index_path: paths.index_path,
        report_paths: paths.report_paths,
      });
    });

  // Phase 5 grounding verbs — thin K22 adapters over packSubgraph / answer (D-06)
  program
    .command('pack')
    .description('Pack a grounded subgraph for a natural-language question')
    .argument('<question>', 'question text')
    .option('--budget <n>', 'token budget', parseIntOpt)
    .action((question: string, opts: { budget?: number }, cmd: Command) => {
      const result = packSubgraph(
        withDir(
          {
            question,
            ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
          },
          globalDir(cmd),
        ),
      );
      writeOk(result);
    });

  // Opt-in embedding sidecar (semantic seed fallback)
  const embeddings = defaultGroupHelp(
    program
      .command('embeddings')
      .description('Opt-in embedding sidecar for semantic seed fallback'),
  );

  embeddings
    .command('build')
    .description(
      'Embed node labels/aliases via llm.embeddings config into embeddings.v1.json',
    )
    .action((_opts: unknown, cmd: Command): Promise<void> => {
      const dir = globalDir(cmd);
      return buildEmbeddingSidecar(withDir({}, dir)).then((result) => {
        writeOk({ ok: true, ...result });
      });
    });

  embeddings
    .command('status')
    .description('Show embedding sidecar freshness and coverage')
    .action((_opts: unknown, cmd: Command) => {
      const storeRoot = resolveStoreRoot(
        withDir({}, globalDir(cmd)) as { dir?: string },
      );
      const sidecar = loadEmbeddingSidecar(storeRoot);
      const config = readEmbeddingsConfig(storeRoot);
      writeOk({
        configured: config !== null,
        exists: sidecar !== null,
        ...(sidecar !== null
          ? {
              model: sidecar.model,
              entries: sidecar.entries.length,
              built_at: sidecar.built_at,
              graph_built_at: sidecar.graph_built_at,
            }
          : {}),
      });
    });

  const answerAction = (
    question: string,
    opts: {
      budget?: number;
      applyPromptResult?: boolean;
      llm?: string | boolean;
      global?: boolean;
      semantic?: boolean;
    },
    cmd: Command,
  ): void | Promise<void> => {
    const flagMode = parseLlmFlag(opts.llm);
    const mode = resolveLlmMode(flagMode === undefined ? {} : { flagMode });
    const dir = globalDir(cmd);

    // Live http answer — explicit --llm http only (D-01). Config supplies
    // provider/endpoint; abstention still happens before any network call.
    if (mode === 'http' && opts.applyPromptResult !== true) {
      const http = readStoreLlmHttp(dir);
      return answerHttp(
        withDir(
          {
            question,
            ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
            llmMode: 'http' as const,
            llmHttp: {
              baseUrl: http.baseUrl,
              model: http.model,
              apiKeyEnv: http.apiKeyEnv,
              provider: http.provider,
            },
          },
          dir,
        ),
      ).then((result) => {
        writeOk(result);
      });
    }

    // Semantic seed fallback (async, opt-in): retries a no_seeds_matched
    // abstain with embedding-sidecar candidates as fallback seeds.
    if (opts.semantic === true && opts.applyPromptResult !== true) {
      return answerSemantic(
        withDir(
          {
            question,
            ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
            ...(opts.global === true ? { global: true } : {}),
          },
          dir,
        ),
      ).then((result) => {
        writeOk(result);
      });
    }

    const result = answer(
      withDir(
        {
          question,
          ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
          ...(opts.global === true ? { global: true } : {}),
          ...(opts.applyPromptResult === true
            ? {
                applyPromptResult: true,
                promptResult: readPromptResult(
                  withDir({ stage: 'answer' as const }, dir),
                ),
              }
            : {}),
          ...(mode !== 'none' ? { llmMode: mode } : {}),
        },
        dir,
      ),
    );
    writeOk(result);
  };

  program
    .command('answer')
    .description('Deterministic grounded answer with triple citations')
    .argument('<question>', 'question text')
    .option('--budget <n>', 'token budget', parseIntOpt)
    .option('--global', 'corpus-level theme answer from communities')
    .option('--semantic', 'retry no-seed abstains with embedding-sidecar seeds (async)')
    .option(
      '--apply-prompt-result',
      'apply store .prompt-answer-result.json (Ajv + citation gate)',
    )
    .option(
      '--llm [mode]',
      'optional LLM mode: omit/true→prompt, or prompt|http (D-01)',
    )
    .action(answerAction);

  // Friendlier alias for answer
  program
    .command('ask')
    .description('Alias for answer — grounded multi-hop Q&A with citations')
    .argument('<question>', 'question text')
    .option('--budget <n>', 'token budget', parseIntOpt)
    .option('--global', 'corpus-level theme answer from communities')
    .option('--semantic', 'retry no-seed abstains with embedding-sidecar seeds (async)')
    .option(
      '--apply-prompt-result',
      'apply store .prompt-answer-result.json (Ajv + citation gate)',
    )
    .option(
      '--llm [mode]',
      'optional LLM mode: omit/true→prompt, or prompt|http (D-01)',
    )
    .action(answerAction);

  // Optional LLM prompt apply (LLM-01 / D-02 / D-03)
  const promptCmd = defaultGroupHelp(
    program
      .command('prompt')
      .description('LLM prompt file-exchange helpers (opt-in; default offline)'),
  );

  promptCmd
    .command('apply')
    .description(
      'Apply validated prompt result for extract|normalize|answer|maintain',
    )
    .argument('<stage>', 'extract | normalize | answer | maintain (not query)')
    .option(
      '--question <text>',
      'question for answer stage (packs subgraph for citation gate)',
    )
    .option('--budget <n>', 'token budget when packing for answer', parseIntOpt)
    .action(
      (
        stageArg: string,
        opts: { question?: string; budget?: number },
        cmd: Command,
      ) => {
        const stage = requirePromptFileStage(stageArg);
        const dir = globalDir(cmd);
        const resultObj = readPromptResult(
          withDir({ stage }, dir) as { stage: typeof stage; dir?: string },
        );

        if (stage === 'answer') {
          if (opts.question === undefined || opts.question.length === 0) {
            throw new GraphError(
              GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
              'prompt apply answer requires --question to pack subgraph',
            );
          }
          const pack = packSubgraph(
            withDir(
              {
                question: opts.question,
                ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
              },
              dir,
            ),
          );
          if (pack.triples.length === 0) {
            writeOk({
              stage: 'answer',
              mode: 'abstain',
              abstained: true,
              reason: GSD_GRAPH_REASON.EMPTY_SUBGRAPH,
              pack,
            });
            return;
          }
          const applied = promptApply({
            stage: 'answer',
            result: resultObj,
            pack,
          });
          writeOk(applied);
          return;
        }

        const applied = promptApply({ stage, result: resultObj });

        // Extract results now merge into the store: sanitize to INFERRED
        // llm/prompt provenance, then run the normalize/review/publish path.
        if (applied.stage === 'extract') {
          const sanitized = sanitizeExtractCandidates(applied, {
            extractorTag: 'llm/prompt',
            ...(extractPromptVersion(
              dir !== undefined ? { dir } : {},
            ) !== ''
              ? {
                  promptVersion: extractPromptVersion(
                    dir !== undefined ? { dir } : {},
                  ),
                }
              : {}),
          });
          const merged = mergeCandidates(
            withDir(
              { nodes: sanitized.nodes, triples: sanitized.triples },
              dir,
            ),
          );
          writeOk({
            stage: 'extract',
            candidate_nodes: sanitized.nodes.length,
            candidate_triples: sanitized.triples.length,
            node_count: merged.node_count,
            triple_count: merged.triple_count,
            review_pending: merged.review_pending,
            store_dir: merged.store_dir,
          });
          return;
        }

        writeOk(applied);
      },
    );

  return program;
}

/** Parse --llm [mode] from commander (true when flag alone; string when valued). */
function parseLlmFlag(
  raw: string | boolean | undefined,
): import('./types').LlmMode | boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === true || raw === '') return true;
  if (raw === false) return false;
  if (raw === 'prompt' || raw === 'http' || raw === 'none') return raw;
  // Unknown string — treat as usage later; default resolve will ignore invalid via none
  if (typeof raw === 'string') {
    return raw as import('./types').LlmMode;
  }
  return undefined;
}

/**
 * Handle top-level -V/--version and -U/--update without a subcommand.
 * Commander subcommands still work: `gsd-graph version`, `gsd-graph update`.
 */
function handleTopLevelMetaFlags(argv: string[]): number | null {
  // Apply pretty/compact flags for meta output
  if (argv.includes('--compact')) jsonPrettyOverride = false;
  else if (argv.includes('--pretty')) jsonPrettyOverride = true;
  else jsonPrettyOverride = undefined;

  if (!isSelfMetaArgv(argv)) return null;

  const wantsUpdate = argvWantsUpdate(argv);
  const wantsVersion = argvWantsVersion(argv);

  try {
    if (wantsUpdate) {
      // update implies showing result; if both flags, update then report new version
      const result = withSpinner('Updating gsd-graph…', (report) =>
        selfUpdate({ cwd: process.cwd(), onProgress: report }),
      );
      writeOk(result);
      return 0;
    }
    if (wantsVersion) {
      writeOk(getVersionInfo({ checkLatest: argv.includes('--check') }));
      return 0;
    }
  } catch (err) {
    if (err instanceof GraphError) {
      writeErrorJson({
        ok: false,
        reason: err.reason,
        message: err.message,
      });
      return mapCliError(err);
    }
    writeErrorJson({
      ok: false,
      reason: 'usage',
      message: errorMessage(err),
    });
    return 1;
  }
  return null;
}

/** Shared exit-code + JSON mapping for main() errors (sync and async paths). */
function handleMainError(err: unknown): number {
  if (err instanceof GraphError) {
    writeErrorJson({
      ok: false,
      reason: err.reason,
      message: err.message,
    });
    return mapCliError(err);
  }
  if (err instanceof CommanderError) {
    // -h / --help / `help` already printed human text via writeOut
    if (
      err.code === 'commander.helpDisplayed' ||
      err.code === 'commander.help'
    ) {
      return 0;
    }
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

/** True when argv requests network work (`--llm http`, `--semantic`, embeddings build). */
export function argvNeedsAsync(argv: string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--llm' && argv[i + 1] === 'http') return true;
    if (a === '--llm=http') return true;
    if (a === '--semantic') return true;
    if (a === 'embeddings' && argv[i + 1] === 'build') return true;
  }
  return false;
}

/**
 * CLI entry used by bin/gsd-graph.js and tests (D-11).
 * Returns process exit code; does not call process.exit.
 * Commands that hit the network (`--llm http`) return a Promise<number>;
 * everything else stays synchronous (D-01: offline by default).
 */
export function main(argv: string[]): number | Promise<number> {
  const metaCode = handleTopLevelMetaFlags(argv);
  if (metaCode !== null) return metaCode;

  const program = buildProgram();

  if (argvNeedsAsync(argv)) {
    return program
      .parseAsync(argv)
      .then(() => 0)
      .catch((err: unknown) => handleMainError(err));
  }

  try {
    program.parse(argv);
    return 0;
  } catch (err) {
    return handleMainError(err);
  }
}

// Local debug: node dist/cli.js … (published bin always calls main explicitly)
if (require.main === module) {
  Promise.resolve(main(process.argv)).then((code) => {
    process.exitCode = code;
  });
}
