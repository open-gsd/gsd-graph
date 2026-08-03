#!/usr/bin/env node
// gsd-graph — MCP stdio bin entry (MCP-01 / D-07)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
'use strict';
const { main } = require('../dist/mcp/server.js');
main(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[gsd-graph-mcp] fatal: ${message}\n`);
  process.exitCode = 1;
});
