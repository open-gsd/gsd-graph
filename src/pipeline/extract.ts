// gsd-graph — per-file extract orchestrator by extension (EXT-01/02)

/**
 * Routes a corpus file to the correct offline extractor (D-01, D-03, D-12).
 * Never fetches URLs or invokes LLM.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ExtractResult } from '../types';
import { fingerprintFile } from '../sources/fingerprint';
import { extractMarkdown } from '../sources/markdown';
import { extractJsonl } from '../sources/jsonl';

export interface ExtractByPathOptions {
  /** Precomputed content hash; when omitted, fingerprintFile(absPath) is used. */
  contentHash?: string;
}

/**
 * Read a local file, fingerprint if needed, and extract by extension:
 * - .md / .markdown / .txt → extractMarkdown
 * - .json → whole-document JSON field-map only (never line-by-line JSONL)
 * - .jsonl → one JSON value per line
 * - other → empty result + UNSUPPORTED_EXTENSION diagnostic
 */
export function extractByPath(
  absPath: string,
  opts?: ExtractByPathOptions,
): ExtractResult {
  const contentHash = opts?.contentHash ?? fingerprintFile(absPath);
  const content = readFileSync(absPath, 'utf8');
  const ext = path.extname(absPath).toLowerCase();

  switch (ext) {
    case '.md':
    case '.markdown':
    case '.txt':
      return extractMarkdown(absPath, content, contentHash);
    case '.json':
      // Never treat pretty-printed OpenAPI/vendor dumps as JSONL.
      return extractJsonl(absPath, content, contentHash, {
        format: 'json-document',
      });
    case '.jsonl':
      return extractJsonl(absPath, content, contentHash, { format: 'jsonl' });
    default:
      return {
        nodes: [],
        triples: [],
        diagnostics: [
          {
            path: absPath,
            code: 'UNSUPPORTED_EXTENSION',
            message: `No extractor registered for extension "${ext || '(none)'}"`,
          },
        ],
      };
  }
}
