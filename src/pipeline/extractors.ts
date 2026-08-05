// gsd-graph — extension-keyed extractor registry (EXT-01 seam)

/**
 * Extraction breadth is the product: every new source format used to be a
 * hardcoded switch in extractByPath + build. The registry makes formats
 * pluggable — built-ins register at module load, embedders can add their own
 * via registerExtractor, and discovery derives its default extension set from
 * whatever is registered.
 */

import { GSD_GRAPH_REASON, GraphError } from '../errors';
import type { ExtractResult } from '../types';
import { extractJsonl } from '../sources/jsonl';
import { extractMarkdown } from '../sources/markdown';
import { extractYaml } from '../sources/yaml';

export interface Extractor {
  /** Registry id, recorded in sources.manifest + provenance extractor field. */
  id: string;
  /** Lowercase extensions (with leading dot) this extractor claims. */
  extensions: readonly string[];
  extract(
    absPath: string,
    content: string,
    contentHash: string,
  ): ExtractResult;
}

const byExtension = new Map<string, Extractor>();

export interface RegisterExtractorOptions {
  /** Allow claiming an extension another extractor already owns. */
  replace?: boolean;
}

/**
 * Register an extractor for its declared extensions.
 * Collisions fail loudly unless opts.replace — silent shadowing of a
 * built-in would corrupt provenance expectations.
 */
export function registerExtractor(
  extractor: Extractor,
  opts?: RegisterExtractorOptions,
): void {
  for (const raw of extractor.extensions) {
    const ext = raw.toLowerCase();
    if (!ext.startsWith('.') || ext.length < 2) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `extractor ${extractor.id} declares invalid extension "${raw}" (want ".ext")`,
      );
    }
    const existing = byExtension.get(ext);
    if (existing !== undefined && existing.id !== extractor.id && opts?.replace !== true) {
      throw new GraphError(
        GSD_GRAPH_REASON.SCHEMA_INVALID,
        `extension ${ext} already claimed by extractor ${existing.id} (pass replace to override)`,
      );
    }
    byExtension.set(ext, extractor);
  }
}

/** Extractor for a lowercase extension (with dot), or undefined. */
export function extractorForExtension(ext: string): Extractor | undefined {
  return byExtension.get(ext.toLowerCase());
}

/** All registered extractors (unique, registration order). */
export function listExtractors(): Extractor[] {
  const seen = new Set<string>();
  const out: Extractor[] = [];
  for (const e of byExtension.values()) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/** All extensions with a registered extractor (for discovery defaults). */
export function registeredExtensions(): string[] {
  return [...byExtension.keys()].sort();
}

// --- Built-ins ---

registerExtractor({
  id: 'markdown',
  extensions: ['.md', '.markdown', '.txt'],
  extract: (absPath, content, contentHash) =>
    extractMarkdown(absPath, content, contentHash),
});

registerExtractor({
  id: 'jsonl',
  extensions: ['.jsonl'],
  extract: (absPath, content, contentHash) =>
    extractJsonl(absPath, content, contentHash, { format: 'jsonl' }),
});

registerExtractor({
  // Never treat pretty-printed OpenAPI/vendor dumps as JSONL.
  id: 'json-document',
  extensions: ['.json'],
  extract: (absPath, content, contentHash) =>
    extractJsonl(absPath, content, contentHash, { format: 'json-document' }),
});

registerExtractor({
  id: 'yaml',
  extensions: ['.yml', '.yaml'],
  extract: (absPath, content, contentHash) =>
    extractYaml(absPath, content, contentHash),
});
