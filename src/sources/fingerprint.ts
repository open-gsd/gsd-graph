// gsd-graph — sha256 source content fingerprints (EXT-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Fingerprint a file as `sha256:` + lowercase hex of **raw file bytes**
 * (OQ-3 / D-04 / EXT-03). Does not re-encode text.
 */
export function fingerprintFile(absPath: string): string {
  const bytes = readFileSync(absPath);
  const hex = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${hex}`;
}
