// gsd-graph — human wrap-up stats for enable/sync (stderr only)

import path from 'node:path';
import pc from 'picocolors';
import type { EnableResult, ProjectSyncResult } from '../types';

function isQuiet(): boolean {
  if (process.env.GSD_GRAPH_NO_SUMMARY === '1') return true;
  // Explicit progress/log mode forces wrap-up (including CI tests).
  if (
    process.env.GSD_GRAPH_PROGRESS === '1' ||
    process.env.GSD_GRAPH_PROGRESS === 'true'
  ) {
    return false;
  }
  // Default: quiet in CI / non-TTY so agent JSON pipelines stay clean.
  if (process.env.CI === 'true' || process.env.CI === '1') return true;
  return !process.stderr.isTTY;
}

function n(num: number): string {
  return num.toLocaleString('en-US');
}

function rel(p: string, cwd: string = process.cwd()): string {
  const r = path.relative(cwd, p);
  if (!r || r.startsWith('..')) return p;
  return r.startsWith('.') ? r : `./${r}`;
}

function line(label: string, value: string): string {
  const pad = label.padEnd(14);
  return `  ${pc.dim(pad)} ${value}`;
}

/**
 * Print a human-readable enable wrap-up to stderr (never stdout).
 */
export function printEnableWrapup(
  result: EnableResult,
  cwd: string = process.cwd(),
): void {
  if (isQuiet()) return;

  const lines: string[] = [];
  lines.push('');
  lines.push(pc.green(pc.bold('✔ gsd-graph enabled')));
  lines.push('');
  lines.push(line('Store', rel(result.store_dir, cwd)));
  lines.push(
    line('Auto-update', result.auto_update ? pc.green('on') : pc.yellow('off')),
  );
  lines.push(
    line(
      'Skill',
      result.skills_installed.length > 0
        ? pc.green(`installed (${result.skills_installed.length})`)
        : pc.dim('skipped'),
    ),
  );
  lines.push(line('Hooks', rel(result.hooks_dir, cwd)));

  if (result.sync) {
    appendSyncStats(lines, result.sync, cwd);
  } else {
    lines.push(line('Graph', pc.dim('not built (--skip-sync)')));
  }

  if (result.mcp) {
    const okHosts = result.mcp.hosts.filter((h) => h.ok && h.action !== 'skipped');
    const failed = result.mcp.hosts.filter((h) => !h.ok);
    lines.push(
      line(
        'MCP',
        failed.length === 0
          ? pc.green(
              `registered (${okHosts.map((h) => h.host).join(', ') || 'none'})`,
            )
          : pc.yellow(
              `partial — ${failed.map((h) => h.host).join(', ')} failed`,
            ),
      ),
    );
  } else {
    lines.push(
      line('MCP', pc.dim('not installed — gsd-graph mcp install')),
    );
  }

  lines.push('');
  lines.push(pc.bold('  Next'));
  lines.push(`    ${pc.cyan(result.next.ask)}`);
  lines.push(`    ${pc.cyan(result.next.status)}`);
  if (result.next.mcp) {
    lines.push(`    ${pc.cyan(result.next.mcp)}`);
  }
  if (result.auto_update) {
    lines.push(
      `    ${pc.dim('Hook:')} ${rel(result.next.hook, cwd)} ${pc.dim('(PostToolUse Bash)')}`,
    );
  }
  lines.push('');

  process.stderr.write(lines.join('\n') + '\n');
}

/**
 * Print a human-readable sync wrap-up to stderr.
 */
export function printSyncWrapup(
  result: ProjectSyncResult,
  cwd: string = process.cwd(),
): void {
  if (isQuiet()) return;

  const lines: string[] = [];
  lines.push('');
  lines.push(
    pc.green(
      pc.bold(
        result.full ? '✔ Full project sync complete' : '✔ Project sync complete',
      ),
    ),
  );
  lines.push('');
  lines.push(line('Store', rel(result.store_dir, cwd)));
  appendSyncStats(lines, result, cwd);
  lines.push('');
  lines.push(pc.bold('  Next'));
  lines.push(`    ${pc.cyan('gsd-graph ask "your multi-hop question"')}`);
  lines.push(`    ${pc.cyan('gsd-graph status')}`);
  lines.push('');

  process.stderr.write(lines.join('\n') + '\n');
}

function appendSyncStats(
  lines: string[],
  sync: ProjectSyncResult,
  cwd: string,
): void {
  const b = sync.build;
  lines.push(line('Nodes', pc.bold(n(b.node_count))));
  lines.push(line('Triples', pc.bold(n(b.triple_count))));
  lines.push(
    line(
      'Sources',
      `${n(b.sources_extracted)} extracted · ${n(b.sources_skipped_fresh)} fresh · ${n(b.sources_total)} total`,
    ),
  );
  lines.push(
    line(
      'Review',
      b.review_pending > 0
        ? pc.yellow(`${n(b.review_pending)} pending`)
        : pc.green('0 pending'),
    ),
  );
  if (b.diagnostics.length > 0) {
    lines.push(
      line(
        'Diagnostics',
        pc.yellow(
          `${n(b.diagnostics.length)} (non-fatal; openapi/vendor JSON often skipped)`,
        ),
      ),
    );
  } else {
    lines.push(line('Diagnostics', pc.green('0')));
  }
  if (sync.report_written) {
    lines.push(line('Report', rel(path.join(sync.store_dir, 'GRAPH_REPORT.md'), cwd)));
  }
  if (sync.communities_written) {
    lines.push(line('Communities', pc.green('written')));
  }
  lines.push(
    line(
      'Corpus',
      sync.corpus.map((c) => rel(c, cwd)).join(', ') || pc.dim('(none)'),
    ),
  );
  lines.push(line('Mode', sync.full ? 'full' : 'incremental'));
  lines.push(line('Engine', `${b.engine} ${b.engine_version}`));
}
