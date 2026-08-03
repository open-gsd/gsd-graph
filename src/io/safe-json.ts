// gsd-graph — safe JSON read / atomic temp write helpers
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import fs from 'node:fs';

/**
 * Read a UTF-8 JSON file and parse it.
 * Throws SyntaxError on invalid JSON (caller maps to SCHEMA_INVALID as needed).
 */
export function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

/**
 * Write JSON to a path: UTF-8, pretty optional, trailing newline.
 * Opens/creates file, writes, fsyncs, closes — for use on temp paths before rename.
 */
export function writeJsonAtomicTemp(
  filePath: string,
  value: unknown,
  opts?: { pretty?: boolean },
): void {
  const body =
    (opts?.pretty === false
      ? JSON.stringify(value)
      : JSON.stringify(value, null, 2)) + '\n';
  const fd = fs.openSync(filePath, 'w');
  try {
    fs.writeFileSync(fd, body, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
