// gsd-graph — corpus discovery with realpath confinement (EXT-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import type { ExtractDiagnostic } from '../types';

/** Default max file size: 8 MiB (T-02-03). */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const DEFAULT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.markdown',
  '.json',
  '.jsonl',
]);

export interface DiscoverSourcesOptions {
  /**
   * Optional basename/extension globs.
   * Default matches md, txt, markdown, json, and jsonl under each root.
   */
  globs?: string[];
  /** Skip files larger than this many bytes (default 8 MiB). */
  maxBytes?: number;
}

export interface DiscoverSourcesResult {
  files: string[];
  diagnostics: ExtractDiagnostic[];
}

/**
 * Discover corpus source files under one or more roots.
 *
 * - Missing root → GraphError CORPUS_NOT_FOUND
 * - realpath of each file must stay under realpath(root) else PATH_ESCAPE
 * - Files > maxBytes omitted with FILE_TOO_LARGE diagnostic
 * - Returned paths are absolute and deterministically sorted
 */
export function discoverSources(
  corpus: string | string[],
  opts?: DiscoverSourcesOptions,
): DiscoverSourcesResult {
  const roots = Array.isArray(corpus) ? corpus : [corpus];
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const extensionFilter = buildExtensionFilter(opts?.globs);

  const files: string[] = [];
  const diagnostics: ExtractDiagnostic[] = [];

  for (const root of roots) {
    const absRoot = path.resolve(root);
    if (!fs.existsSync(absRoot)) {
      throw new GraphError(
        GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
        `corpus root not found: ${root}`,
        { root: absRoot },
      );
    }

    let rootReal: string;
    try {
      rootReal = fs.realpathSync.native(absRoot);
    } catch {
      throw new GraphError(
        GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
        `corpus root not found: ${root}`,
        { root: absRoot },
      );
    }

    const st = fs.statSync(rootReal);
    if (!st.isDirectory()) {
      throw new GraphError(
        GSD_GRAPH_REASON.CORPUS_NOT_FOUND,
        `corpus root is not a directory: ${root}`,
        { root: rootReal },
      );
    }

    walk(rootReal, rootReal, extensionFilter, maxBytes, files, diagnostics);
  }

  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { files, diagnostics };
}

function walk(
  rootReal: string,
  dir: string,
  extensionFilter: (filePath: string) => boolean,
  maxBytes: number,
  files: string[],
  diagnostics: ExtractDiagnostic[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const joined = path.join(dir, entry.name);

    let real: string;
    try {
      real = fs.realpathSync.native(joined);
    } catch {
      // dangling symlink etc.
      continue;
    }

    // Confine every realpath under the corpus root (T-02-01)
    ensureUnderRoot(rootReal, real, joined);

    let st: fs.Stats;
    try {
      st = fs.statSync(real);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      walk(rootReal, real, extensionFilter, maxBytes, files, diagnostics);
      continue;
    }

    if (!st.isFile()) continue;
    if (!extensionFilter(real)) continue;

    if (st.size > maxBytes) {
      diagnostics.push({
        path: real,
        code: 'FILE_TOO_LARGE',
        message: `file exceeds maxBytes (${maxBytes}): ${st.size} bytes`,
      });
      continue;
    }

    files.push(real);
  }
}

function ensureUnderRoot(rootReal: string, resolved: string, candidate: string): void {
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (resolved !== rootReal && !resolved.startsWith(prefix)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PATH_ESCAPE,
      `path escapes corpus root: ${candidate}`,
      { root: rootReal, candidate, resolved },
    );
  }
}

/**
 * Build a path matcher from optional globs.
 * Without globs: default extension set.
 * With globs: match by extension extracted from patterns like `**\/*.{md,txt}`
 * or `*.md`, or basename includes.
 */
function buildExtensionFilter(
  globs?: string[],
): (filePath: string) => boolean {
  if (!globs || globs.length === 0) {
    return (filePath: string) =>
      DEFAULT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  const exts = new Set<string>();
  const basenames: string[] = [];

  for (const g of globs) {
    // **/*.{md,txt,markdown}
    const brace = g.match(/\{([^}]+)\}/);
    if (brace) {
      for (const part of brace[1]!.split(',')) {
        const p = part.trim();
        if (p.startsWith('.')) exts.add(p.toLowerCase());
        else exts.add(`.${p.toLowerCase()}`);
      }
      continue;
    }
    // *.md or **/*.json
    const extMatch = g.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) {
      exts.add(`.${extMatch[1]!.toLowerCase()}`);
      continue;
    }
    basenames.push(path.basename(g));
  }

  return (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (exts.size > 0 && exts.has(ext)) return true;
    if (basenames.length > 0) {
      const base = path.basename(filePath);
      return basenames.some((b) => base === b || base.includes(b));
    }
    return false;
  };
}
