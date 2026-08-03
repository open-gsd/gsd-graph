// gsd-graph — minimal GRAPH_REPORT.md writer from published graph.v1 (RPT-01, D-08)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Disposable human/agent summary of the published graph.
 *
 * Source of truth remains graph.v1.json only (D-08, D-10). Never reads
 * graph.json for counts. Report file is non-authoritative markdown.
 */

import fs from 'node:fs';
import { loadGraphV1 } from '../io/load-graph';
import { resolveStoreRoot, storeFile } from '../io/paths';
import { loadReviewQueue } from './review';

export interface WriteGraphReportOptions {
  /** Store directory override (resolveStoreRoot). */
  dir?: string;
  /** Max predicates to list (default 10). Sorted count desc, id asc. */
  topN?: number;
}

export interface WriteGraphReportResult {
  path: string;
  node_count: number;
  triple_count: number;
}

/**
 * Write GRAPH_REPORT.md under the store from published graph.v1 only (RPT-01).
 *
 * Header states non-authoritative / SoT is graph.v1.json (T-06-11).
 * Path is confined via storeFile basename (T-06-12).
 */
export function writeGraphReport(
  opts?: WriteGraphReportOptions,
): WriteGraphReportResult {
  const root = resolveStoreRoot(opts?.dir !== undefined ? { dir: opts.dir } : {});
  const graph = loadGraphV1(root); // never projection (D-08, D-10)
  const topN = opts?.topN ?? 10;

  const node_count = graph.stats?.node_count ?? graph.nodes.length;
  const triple_count = graph.stats?.triple_count ?? graph.triples.length;

  const counts = new Map<string, number>();
  for (const t of graph.triples) {
    counts.set(t.p, (counts.get(t.p) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN);

  let reviewPending: number | null = null;
  try {
    const queue = loadReviewQueue(root);
    reviewPending = queue.items.filter((i) => i.status === 'pending').length;
  } catch {
    // Optional: do not fail report when queue missing/unreadable
    reviewPending = null;
  }

  const lines: string[] = [
    '# GRAPH_REPORT',
    '',
    '> Non-authoritative summary. Source of truth is graph.v1.json.',
    '',
    `- engine: ${graph.engine} ${graph.engine_version}`,
    `- ontology: ${graph.ontology_pack_id}@${graph.ontology_version}`,
    `- built_at: ${graph.built_at}`,
    `- nodes: ${node_count}`,
    `- triples: ${triple_count}`,
  ];

  if (reviewPending !== null) {
    lines.push(`- review_pending: ${reviewPending}`);
  }

  lines.push('', '## Top predicates');
  if (top.length === 0) {
    lines.push('- (none)');
  } else {
    for (const [p, n] of top) {
      lines.push(`- ${p}: ${n}`);
    }
  }
  lines.push('');

  const out = storeFile(root, 'GRAPH_REPORT.md');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');

  return {
    path: out,
    node_count,
    triple_count,
  };
}
