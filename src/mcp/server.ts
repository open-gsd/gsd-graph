// gsd-graph — MCP stdio server create/start with default-off write gates (MCP-01 / D-06)

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
  /** SDK 1.x resource registration (optional across SDK minor versions). */
  resource?(
    name: string,
    uri: string,
    handler: (uri: URL) => Promise<{
      contents: Array<{ uri: string; text: string; mimeType?: string }>;
    }>,
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
  register('graph_why', toolSchemas.graph_why);
  register('graph_resolve', toolSchemas.graph_resolve);
  register('graph_diff', toolSchemas.graph_diff);
  register('graph_communities', toolSchemas.graph_communities);
  register('graph_review_list', toolSchemas.graph_review_list);

  // Privileged write tools — only when explicitly enabled (D-06, T-06-07)
  if (gate.allowBuild === true) {
    register('graph_build', toolSchemas.graph_build);
    register('graph_sync', toolSchemas.graph_sync);
  }
  if (gate.allowReviewWrite === true) {
    register('graph_review_resolve', toolSchemas.graph_review_resolve);
  }

  // Resources: session-start briefing material for hosts that read resources.
  registerStoreResources(server, gate.defaultDir);

  return { server, toolNames };
}

/**
 * Expose GRAPH_REPORT.md and community theme reports as MCP resources so
 * hosts get a free store briefing without spending tool calls.
 */
function registerStoreResources(
  server: McpServerInstance,
  defaultDir: string | undefined,
): void {
  if (typeof server.resource !== 'function') return;

  const readStoreText = (relParts: string[]): string | null => {
    try {
      // Lazy require to keep server bootstrap free of store deps.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lib = require('../index') as {
        resolveStoreRoot: (o?: { dir?: string }) => string;
        confineUnderRoot: (root: string, candidate: string) => string;
      };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path');
      const root = lib.resolveStoreRoot(
        defaultDir !== undefined && defaultDir !== '' ? { dir: defaultDir } : {},
      );
      const p = lib.confineUnderRoot(root, path.join(...relParts));
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  };

  server.resource(
    'graph-report',
    'gsd-graph://report',
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text:
            readStoreText(['GRAPH_REPORT.md']) ??
            'GRAPH_REPORT.md not found — run `gsd-graph report` (or sync with report enabled).',
        },
      ],
    }),
  );

  server.resource(
    'graph-communities',
    'gsd-graph://communities',
    async (uri) => {
      const index = readStoreText(['communities', 'index.json']);
      let text: string;
      if (index === null) {
        text =
          'communities/index.json not found — run `gsd-graph communities detect`.';
      } else {
        text = index;
        try {
          const parsed = JSON.parse(index) as {
            communities?: Array<{ id?: string }>;
          };
          const reports: string[] = [];
          for (const c of parsed.communities ?? []) {
            if (typeof c.id !== 'string') continue;
            const md = readStoreText(['communities', `community-${c.id}.md`]);
            if (md !== null) reports.push(md);
          }
          if (reports.length > 0) {
            text = reports.join('\n\n---\n\n');
          }
        } catch {
          // keep raw index text
        }
      }
      return {
        contents: [
          { uri: uri.href, mimeType: 'text/markdown', text },
        ],
      };
    },
  );
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
