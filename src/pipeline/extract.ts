// gsd-graph — per-file extract orchestrator over the extractor registry (EXT-01/02)

/**
 * Routes a corpus file to its registered extractor (D-01, D-03, D-12).
 * Built-ins: markdown (.md/.markdown/.txt with frontmatter), json-document
 * (.json), jsonl (.jsonl), yaml (.yml/.yaml). New formats register via
 * registerExtractor — no core edits. Never fetches URLs or invokes LLM.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ExtractResult } from '../types';
import { fingerprintFile } from '../sources/fingerprint';
import { extractorForExtension } from './extractors';

export interface ExtractByPathOptions {
  /** Precomputed content hash; when omitted, fingerprintFile(absPath) is used. */
  contentHash?: string;
}

/**
 * Read a local file, fingerprint if needed, and extract via the registry.
 * Unregistered extensions return an empty result + UNSUPPORTED_EXTENSION.
 */
export function extractByPath(
  absPath: string,
  opts?: ExtractByPathOptions,
): ExtractResult {
  const ext = path.extname(absPath).toLowerCase();
  const extractor = extractorForExtension(ext);
  if (extractor === undefined) {
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

  const contentHash = opts?.contentHash ?? fingerprintFile(absPath);
  const content = readFileSync(absPath, 'utf8');
  return extractor.extract(absPath, content, contentHash);
}
