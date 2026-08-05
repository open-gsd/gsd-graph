// gsd-graph — CLI adapter (commander) + K22 exit mapping

import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { GSD_GRAPH_REASON, GraphError } from './errors';
import { resolveStoreRoot } from './io/paths';
import { loadOntologyPack } from './ontology/load-pack';
import { promptApply } from './llm/apply';
import { resolveLlmMode } from './llm/provider';
import {
  readPromptResult,
  requirePromptFileStage,
} from './llm/prompt-files';
import { answer } from './pipeline/answer';
import { build } from './pipeline/build';
import {
  detectCommunities,
  writeCommunityReports,
} from './pipeline/communities';
import { diff } from './pipeline/diff';
import { init } from './pipeline/init';
import { withSpinner } from './cli/spinner';
import { enable } from './pipeline/enable';
import { projectSync } from './pipeline/project-sync';
import { packSubgraph } from './pipeline/pack';
import { query } from './pipeline/query';
import { writeGraphReport } from './pipeline/report';
import { repair } from './pipeline/repair';
import { loadReviewQueue, reviewResolve } from './pipeline/review';
import {
  snapshotList,
  snapshotRestore,
  snapshotSave,
} from './pipeline/snapshot';
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
    .action(
      (
        opts: {
          autoUpdate?: boolean;
          report?: boolean;
          communities?: boolean;
          skipSync?: boolean;
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
            onProgress: report,
          }),
        );
        writeOk(result);
      },
    );

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
    .action(
      (
        opts: {
          full?: boolean;
          corpus?: string[];
          communities?: boolean;
          report?: boolean;
        },
        cmd: Command,
      ) => {
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
              onProgress: report,
            }),
        );
        writeOk(result);
      },
    );

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
  const snapshot = program
    .command('snapshot')
    .description('Save, list, or restore named graph.v1 snapshots');

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

  const review = program
    .command('review')
    .description('List or resolve review-queue items');

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

  review
    .command('accept')
    .description('Accept a pending review item')
    .argument('<id>', 'review item id')
    .option(
      '--extend-ontology',
      'allow ontology.lock extend on unknown type/predicate accept',
    )
    .action(
      (id: string, opts: { extendOntology?: boolean }, cmd: Command) => {
        const storeRoot = resolveStoreRoot(
          withDir({}, globalDir(cmd)) as { dir?: string },
        );
        reviewResolve({
          storeRoot,
          id,
          action: 'accept',
          ...(opts.extendOntology === true
            ? { extendOntology: true }
            : {}),
        });
        writeOk({ ok: true, id, action: 'accept' });
      },
    );

  review
    .command('reject')
    .description('Reject a pending review item')
    .argument('<id>', 'review item id')
    .action((id: string, _opts: unknown, cmd: Command) => {
      const storeRoot = resolveStoreRoot(
        withDir({}, globalDir(cmd)) as { dir?: string },
      );
      reviewResolve({ storeRoot, id, action: 'reject' });
      writeOk({ ok: true, id, action: 'reject' });
    });

  const ontology = program
    .command('ontology')
    .description('Show or validate an ontology pack');

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
  const communities = program
    .command('communities')
    .description('Detect communities and write theme reports (non-SoT)');

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

  const answerAction = (
    question: string,
    opts: {
      budget?: number;
      applyPromptResult?: boolean;
      llm?: string | boolean;
    },
    cmd: Command,
  ) => {
    const flagMode = parseLlmFlag(opts.llm);
    const mode = resolveLlmMode(flagMode === undefined ? {} : { flagMode });
    const result = answer(
      withDir(
        {
          question,
          ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
          ...(opts.applyPromptResult === true
            ? {
                applyPromptResult: true,
                promptResult: readPromptResult(
                  withDir({ stage: 'answer' as const }, globalDir(cmd)),
                ),
              }
            : {}),
          ...(mode !== 'none' ? { llmMode: mode } : {}),
        },
        globalDir(cmd),
      ),
    );
    writeOk(result);
  };

  program
    .command('answer')
    .description('Deterministic grounded answer with triple citations')
    .argument('<question>', 'question text')
    .option('--budget <n>', 'token budget', parseIntOpt)
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
  const promptCmd = program
    .command('prompt')
    .description('LLM prompt file-exchange helpers (opt-in; default offline)');

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
