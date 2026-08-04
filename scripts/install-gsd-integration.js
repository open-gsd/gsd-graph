#!/usr/bin/env node
// gsd-graph — thin wrapper around `gsd-graph enable` (prefer CLI directly)
'use strict';

/**
 * Prefer:
 *   npx gsd-graph enable
 *
 * Legacy:
 *   node scripts/install-gsd-integration.js [projectRoot] [--enable]
 *   --enable / --full → full enable (skill + hooks + config + sync)
 *   default          → install skill/hooks/config only (--skip-sync)
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pkgRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter((a) => a !== '--');
const projectRoot = path.resolve(
  args.find((a) => !a.startsWith('-')) || process.cwd(),
);
const full =
  args.includes('--enable') || args.includes('--full') || args.includes('-e');

const bin = path.join(pkgRoot, 'bin', 'gsd-graph.js');
const cliArgs = [bin, 'enable'];
if (!full) cliArgs.push('--skip-sync');

console.log(
  'Tip: run `npx gsd-graph enable` instead of this script.\n' +
    `→ node ${cliArgs.join(' ')}  (cwd: ${projectRoot})`,
);

const r = spawnSync(process.execPath, cliArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
