// gsd-graph — vanilla .git/hooks/post-commit installer (editor-agnostic freshness)

/**
 * The Claude-Code PostToolUse hook only fires inside Claude Code. This
 * installs a plain git post-commit hook so every editor keeps the graph
 * fresh: a guarded marker block appended to (or removed from) the repo's
 * post-commit hook, running `gsd-graph sync` detached and never failing the
 * commit.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';

const MARKER_START = '# >>> gsd-graph post-commit >>>';
const MARKER_END = '# <<< gsd-graph post-commit <<<';

const HOOK_BLOCK = [
  MARKER_START,
  '# Incremental graph sync after each commit (never blocks; opt-out: gsd-graph hook install-git --remove)',
  'if command -v gsd-graph >/dev/null 2>&1; then',
  '  (gsd-graph sync >/dev/null 2>&1 &)',
  'fi',
  MARKER_END,
].join('\n');

export interface GitHookInstallOptions {
  cwd?: string;
  /** Remove the gsd-graph block instead of installing it. */
  remove?: boolean;
}

export interface GitHookInstallResult {
  ok: boolean;
  path: string;
  action: 'created' | 'appended' | 'already_installed' | 'removed' | 'absent';
}

function gitDir(cwd: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return path.resolve(cwd, out);
  } catch {
    throw new GraphError(
      GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
      'not a git repository — the post-commit hook needs one',
      { cwd },
    );
  }
}

/** Install (or remove) the gsd-graph block in .git/hooks/post-commit. */
export function installGitPostCommitHook(
  opts?: GitHookInstallOptions,
): GitHookInstallResult {
  const cwd = opts?.cwd ?? process.cwd();
  const hooksDir = path.join(gitDir(cwd), 'hooks');
  const hookPath = path.join(hooksDir, 'post-commit');

  const existing = fs.existsSync(hookPath)
    ? fs.readFileSync(hookPath, 'utf8')
    : null;

  if (opts?.remove === true) {
    if (existing === null || !existing.includes(MARKER_START)) {
      return { ok: true, path: hookPath, action: 'absent' };
    }
    const start = existing.indexOf(MARKER_START);
    const end = existing.indexOf(MARKER_END);
    const next =
      end >= 0
        ? existing.slice(0, start).replace(/\n+$/, '\n') +
          existing.slice(end + MARKER_END.length).replace(/^\n+/, '\n')
        : existing.slice(0, start);
    const trimmed = next.trim();
    if (trimmed === '#!/bin/sh' || trimmed.length === 0) {
      fs.rmSync(hookPath, { force: true });
    } else {
      fs.writeFileSync(hookPath, next, { mode: 0o755 });
    }
    return { ok: true, path: hookPath, action: 'removed' };
  }

  if (existing !== null && existing.includes(MARKER_START)) {
    return { ok: true, path: hookPath, action: 'already_installed' };
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  if (existing === null) {
    fs.writeFileSync(hookPath, `#!/bin/sh\n${HOOK_BLOCK}\n`, { mode: 0o755 });
    return { ok: true, path: hookPath, action: 'created' };
  }

  const sep = existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(hookPath, `${existing}${sep}\n${HOOK_BLOCK}\n`, {
    mode: 0o755,
  });
  return { ok: true, path: hookPath, action: 'appended' };
}
