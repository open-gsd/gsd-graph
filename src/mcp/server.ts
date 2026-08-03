// gsd-graph — MCP stdio server create/start with default-off write gates (MCP-01 / D-06)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  handleToolCall,
  listRegisteredToolNames,
  TOOL_DESCRIPTIONS,
  toolSchemas,
  type McpGateOptions,
  type McpToolName,
} from './tools';

const MCP_PKG = '@modelcontextprotocol/sdk';

export interface CreateMcpServerOptions {
  allowBuild?: boolean;
  allowReviewWrite?: boolean;
  /** Default store dir for tools when args omit dir. */
  dir?: string;
  /** Override package version for server info. */
  version?: string;
}

/** Minimal McpServer surface used after dynamic import (CJS-safe). */
interface McpServerInstance {
  tool(
    name: string,
    description: string,
    params: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): unknown;
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}

function readPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function toGateOptions(opts?: CreateMcpServerOptions): McpGateOptions {
  const gate: McpGateOptions = {};
  if (opts?.allowBuild === true) gate.allowBuild = true;
  if (opts?.allowReviewWrite === true) gate.allowReviewWrite = true;
  if (opts?.dir !== undefined && opts.dir !== '') gate.defaultDir = opts.dir;
  return gate;
}

/**
 * Parse MCP CLI argv for privileged gates and default dir.
 * Does not write to stdout (stdio JSON-RPC integrity, T-06-10).
 */
export function parseMcpArgv(argv: string[]): CreateMcpServerOptions {
  const opts: CreateMcpServerOptions = {};
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--allow-build') {
      opts.allowBuild = true;
    } else if (a === '--allow-review-write') {
      opts.allowReviewWrite = true;
    } else if (a === '--dir' || a === '--store') {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        opts.dir = next;
        i++;
      }
    } else if (typeof a === 'string' && a.startsWith('--dir=')) {
      opts.dir = a.slice('--dir='.length);
    }
  }
  return opts;
}

/** Registered tool names for the given gates (no SDK / no stdio). */
export function listToolNames(opts?: CreateMcpServerOptions): string[] {
  return listRegisteredToolNames(toGateOptions(opts));
}

/**
 * Create MCP server with tool registration. Does not connect transport
 * so unit tests can inspect toolNames without hanging on stdin (D-12).
 */
export async function createGsdGraphMcpServer(
  opts?: CreateMcpServerOptions,
): Promise<{ server: McpServerInstance; toolNames: string[] }> {
  const mcpMod = await import(`${MCP_PKG}/server/mcp.js`);
  const McpServer = mcpMod.McpServer as new (info: {
    name: string;
    version: string;
  }) => McpServerInstance;

  const version = opts?.version ?? readPackageVersion();
  const server = new McpServer({ name: 'gsd-graph', version });
  const gate = toGateOptions(opts);
  const toolNames = listRegisteredToolNames(gate);

  const register = (name: McpToolName, schema: Record<string, z.ZodType>) => {
    server.tool(
      name,
      TOOL_DESCRIPTIONS[name],
      schema,
      async (args: Record<string, unknown>) => handleToolCall(name, args, gate),
    );
  };

  // Default read tools (D-06)
  register('graph_status', toolSchemas.graph_status);
  register('graph_query', toolSchemas.graph_query);
  register('graph_pack', toolSchemas.graph_pack);
  register('graph_answer', toolSchemas.graph_answer);
  register('graph_review_list', toolSchemas.graph_review_list);

  // Privileged write tools — only when explicitly enabled (D-06, T-06-07)
  if (gate.allowBuild === true) {
    register('graph_build', toolSchemas.graph_build);
  }
  if (gate.allowReviewWrite === true) {
    register('graph_review_resolve', toolSchemas.graph_review_resolve);
  }

  return { server, toolNames };
}

/** Connect stdio transport and serve (host process entry). */
export async function startGsdGraphMcp(
  opts?: CreateMcpServerOptions,
): Promise<void> {
  const { server } = await createGsdGraphMcpServer(opts);
  const { StdioServerTransport } = await import(`${MCP_PKG}/server/stdio.js`);
  const transport = new StdioServerTransport();
  // Startup diagnostics on stderr only — never stdout (T-06-10)
  process.stderr.write('[gsd-graph-mcp] starting stdio server\n');
  await server.connect(transport);
}

/** Re-export handler for offline unit tests (D-12). */
export { handleToolCall } from './tools';

/**
 * Bin entry: parse argv and start stdio server.
 * Errors go to stderr; exit non-zero on fatal bootstrap failure.
 */
export async function main(argv: string[] = process.argv): Promise<void> {
  const opts = parseMcpArgv(argv);
  await startGsdGraphMcp(opts);
}

// Direct execution when required from bin (not when imported by tests)
if (require.main === module) {
  main(process.argv).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[gsd-graph-mcp] fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
