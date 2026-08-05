// gsd-graph — answer-quality eval harness (seed recall, citation validity)

/**
 * Retrieval changes fly blind without a measurable target. `runEval` executes
 * a QA case file against the store (or an injected graph) and reports:
 * - per-case pass/fail against explicit expectations
 * - seed recall (expected seeds found / expected)
 * - citation validity (cited triple ids ⊆ pack triples — the grounding gate)
 * The QA file is the contract for landing ranking/stemming/embedding changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import type { GraphV1Document } from '../types';
import { answer } from './answer';
import { why } from './why';

export interface EvalWhyCase {
  from: string;
  to: string;
  expect_found: boolean;
}

export interface EvalCase {
  id: string;
  /** Question for answer(); omit when this is a why-only case. */
  question?: string;
  /** Node ids expected among pack seeds. */
  expect_seeds?: string[];
  /** Substrings expected in answer_markdown. */
  expect_answer_contains?: string[];
  /** Triple ids expected among citations. */
  expect_citations?: string[];
  /** Expect an abstain… */
  expect_abstain?: boolean;
  /** …with this machine reason (implies expect_abstain). */
  expect_abstain_reason?: string;
  /** Expect the global (community theme) mode. */
  expect_mode?: string;
  /** Path expectation via why(). */
  why?: EvalWhyCase;
}

export interface EvalFileDocument {
  schema_version: 1;
  cases: EvalCase[];
}

export interface EvalCaseResult {
  id: string;
  ok: boolean;
  failures: string[];
  seed_recall: number | null;
  citation_valid: boolean | null;
}

export interface EvalRunResult {
  store_dir: string | null;
  file: string | null;
  total: number;
  passed: number;
  failed: number;
  /** Mean seed recall across cases that declared expect_seeds. */
  seed_recall_avg: number | null;
  /** True when every produced citation stayed inside its pack. */
  citations_all_valid: boolean;
  cases: EvalCaseResult[];
}

export interface RunEvalOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** In-memory graph — skips store load (tests). */
  graph?: GraphV1Document;
  /** QA file path; default <cwd>/evals/gsd-graph.json then <store>/evals.json. */
  file?: string;
  /** Inline cases (skips file loading). */
  cases?: EvalCase[];
  cwd?: string;
}

function loadCases(opts: RunEvalOptions): { cases: EvalCase[]; file: string | null } {
  if (opts.cases !== undefined) return { cases: opts.cases, file: null };

  const cwd = opts.cwd ?? process.cwd();
  const candidates =
    opts.file !== undefined
      ? [path.resolve(cwd, opts.file)]
      : [
          path.resolve(cwd, 'evals', 'gsd-graph.json'),
          path.resolve(cwd, opts.dir ?? '.gsd-graph', 'evals.json'),
        ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let doc: EvalFileDocument;
    try {
      doc = JSON.parse(fs.readFileSync(p, 'utf8')) as EvalFileDocument;
    } catch (err) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `eval file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        { path: p },
      );
    }
    if (doc.schema_version !== 1 || !Array.isArray(doc.cases)) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        'eval file must be { schema_version: 1, cases: [...] }',
        { path: p },
      );
    }
    return { cases: doc.cases, file: p };
  }

  throw new GraphError(
    GSD_GRAPH_REASON.SCHEMA_INVALID,
    `no eval cases found — create evals/gsd-graph.json ({ schema_version: 1, cases: [{ id, question, expect_seeds?, expect_answer_contains?, expect_abstain? }] }) or pass --file`,
    { tried: candidates },
  );
}

function evalOne(c: EvalCase, opts: RunEvalOptions): EvalCaseResult {
  const failures: string[] = [];
  let seedRecall: number | null = null;
  let citationValid: boolean | null = null;

  if (c.question !== undefined) {
    const ans = answer({
      question: c.question,
      ...(opts.graph !== undefined ? { graph: opts.graph } : {}),
      ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
    });

    const wantsAbstain =
      c.expect_abstain === true || c.expect_abstain_reason !== undefined;
    if (wantsAbstain) {
      if (!ans.abstained) failures.push('expected abstain, got answer');
      if (
        c.expect_abstain_reason !== undefined &&
        ans.abstain_reason !== c.expect_abstain_reason
      ) {
        failures.push(
          `abstain_reason ${ans.abstain_reason ?? '(none)'} ≠ ${c.expect_abstain_reason}`,
        );
      }
    } else if (ans.abstained) {
      failures.push(
        `unexpected abstain (${ans.abstain_reason ?? 'no reason'})`,
      );
    }

    if (c.expect_mode !== undefined && ans.mode !== c.expect_mode) {
      failures.push(`mode ${ans.mode} ≠ ${c.expect_mode}`);
    }

    if (c.expect_seeds !== undefined && c.expect_seeds.length > 0) {
      const got = new Set(ans.pack.seeds);
      const hit = c.expect_seeds.filter((s) => got.has(s));
      seedRecall = hit.length / c.expect_seeds.length;
      if (hit.length !== c.expect_seeds.length) {
        const missing = c.expect_seeds.filter((s) => !got.has(s));
        failures.push(`missing seeds: ${missing.join(', ')}`);
      }
    }

    if (c.expect_answer_contains !== undefined) {
      for (const sub of c.expect_answer_contains) {
        if (!ans.answer_markdown.includes(sub)) {
          failures.push(`answer missing substring: ${sub}`);
        }
      }
    }

    // Grounding invariant: every citation must reference a pack triple.
    const packIds = new Set(ans.pack.triples.map((t) => t.id));
    citationValid = ans.pack.citations.every((cite) =>
      packIds.has(cite.triple_id),
    );
    if (!citationValid) failures.push('citation outside pack triples');

    if (c.expect_citations !== undefined) {
      const cited = new Set(ans.pack.citations.map((x) => x.triple_id));
      for (const id of c.expect_citations) {
        if (!cited.has(id)) failures.push(`missing citation: ${id}`);
      }
    }
  }

  if (c.why !== undefined) {
    const w = why({
      from: c.why.from,
      to: c.why.to,
      ...(opts.graph !== undefined ? { graph: opts.graph } : {}),
      ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
    });
    if (w.found !== c.why.expect_found) {
      failures.push(
        `why(${c.why.from}, ${c.why.to}) found=${w.found} ≠ ${c.why.expect_found}`,
      );
    }
  }

  if (c.question === undefined && c.why === undefined) {
    failures.push('case declares neither question nor why');
  }

  return {
    id: c.id,
    ok: failures.length === 0,
    failures,
    seed_recall: seedRecall,
    citation_valid: citationValid,
  };
}

/** Run the QA set; never throws on case failures (only on unusable input). */
export function runEval(opts: RunEvalOptions): EvalRunResult {
  const { cases, file } = loadCases(opts);
  const results = cases.map((c) => evalOne(c, opts));

  const recalls = results
    .map((r) => r.seed_recall)
    .filter((r): r is number => r !== null);
  const avg =
    recalls.length > 0
      ? recalls.reduce((a, b) => a + b, 0) / recalls.length
      : null;

  return {
    store_dir: opts.dir ?? null,
    file,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    seed_recall_avg: avg,
    citations_all_valid: results.every((r) => r.citation_valid !== false),
    cases: results,
  };
}
