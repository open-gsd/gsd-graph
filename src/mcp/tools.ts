// gsd-graph — MCP tool handlers mapping to public library APIs (MCP-01 / D-06 / D-10)

import { z } from 'zod';
import {
  answer,
  build,
  loadReviewQueue,
  packSubgraph,
  query,
  resolveStoreRoot,
  reviewResolve,
  status,
} from '../index';
import { GraphError } from '../errors';

/** Read tools registered by default (D-06, MCP-01). */
export const DEFAULT_READ_TOOL_NAMES = [
  'graph_status',
  'graph_query',
  'graph_pack',
  'graph_answer',
  'graph_review_list',
] as const;

/** Privileged write tools — off unless explicitly enabled (D-06, T-06-07). */
export const WRITE_TOOL_NAMES = [
  'graph_build',
  'graph_review_resolve',
] as const;

export type DefaultReadToolName = (typeof DEFAULT_READ_TOOL_NAMES)[number];
export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];
export type McpToolName = DefaultReadToolName | WriteToolName;

export interface McpGateOptions {
  allowBuild?: boolean;
  allowReviewWrite?: boolean;
  /** Default store dir when tool args omit dir (from --dir). */
  defaultDir?: string;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Zod raw shapes for tool() inputSchema (SDK 1.x). */
export const toolSchemas = {
  graph_status: {
    dir: z
      .string()
      .optional()
      .describe('Store directory override (resolveStoreRoot)'),
  },
  graph_query: {
    dir: z.string().optional().describe('Store directory override'),
    term: z.string().optional().describe('seed_expand term'),
    hops: z.number().optional().describe('Hop count for seed_expand / neighborhood'),
    budget: z.number().nullable().optional().describe('Token budget (null skips trim)'),
    id: z.string().optional().describe('Neighborhood seed node id'),
    path_from: z.string().optional().describe('Path query start node id'),
    path_to: z.string().optional().describe('Path query end node id'),
    path_max_depth: z.number().optional().describe('Path max depth'),
    types: z.array(z.string()).optional().describe('Filter: node types'),
    predicates: z.array(z.string()).optional().describe('Filter: predicates'),
  },
  graph_pack: {
    question: z.string().describe('Natural-language question for packSubgraph'),
    dir: z.string().optional().describe('Store directory override'),
    hops: z.number().optional().describe('Hop expansion depth'),
    k_seeds: z.number().optional().describe('Max seed count'),
    budget: z.number().nullable().optional().describe('Token budget'),
  },
  graph_answer: {
    question: z.string().describe('Natural-language question for grounded answer'),
    dir: z.string().optional().describe('Store directory override'),
    hops: z.number().optional().describe('Hop expansion depth'),
    k_seeds: z.number().optional().describe('Max seed count'),
    budget: z.number().nullable().optional().describe('Token budget'),
  },
  graph_review_list: {
    dir: z.string().optional().describe('Store directory override'),
  },
  graph_build: {
    corpus: z.string().describe('Corpus root to discover under (privileged)'),
    dir: z.string().optional().describe('Store directory override'),
    full: z.boolean().optional().describe('Force full re-extract'),
    ontology: z.string().optional().describe('Ontology pack id or path'),
  },
  graph_review_resolve: {
    id: z.string().describe('Review item id'),
    action: z.enum(['accept', 'reject']).describe('Resolve action'),
    dir: z.string().optional().describe('Store directory override'),
    extend_ontology: z
      .boolean()
      .optional()
      .describe('Allow ontology.lock extension on accept (privileged)'),
  },
} as const;

function jsonResult(data: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

function errorResult(err: unknown): McpToolResult {
  if (err instanceof GraphError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: true,
            reason: err.reason,
            message: err.message,
          }),
        },
      ],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

function resolveDir(
  argsDir: string | undefined,
  defaultDir: string | undefined,
): string | undefined {
  if (argsDir !== undefined && argsDir !== '') return argsDir;
  if (defaultDir !== undefined && defaultDir !== '') return defaultDir;
  return undefined;
}

function withDirOpt<T extends object>(
  base: T,
  dir: string | undefined,
): T & { dir?: string } {
  if (dir === undefined) return base;
  return { ...base, dir };
}

/** Compute registered tool names for the given gates (no SDK / no stdio). */
export function listRegisteredToolNames(opts?: McpGateOptions): string[] {
  const names: string[] = [...DEFAULT_READ_TOOL_NAMES];
  if (opts?.allowBuild === true) {
    names.push('graph_build');
  }
  if (opts?.allowReviewWrite === true) {
    names.push('graph_review_resolve');
  }
  return names;
}

/**
 * Dispatch a tool call to public library APIs only (D-10).
 * Never reads graph.json projection as SoT. No stdout logging (T-06-10).
 */
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  opts?: McpGateOptions,
): Promise<McpToolResult> {
  try {
    const defaultDir = opts?.defaultDir;
    switch (name) {
      case 'graph_status': {
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const result = status(dir !== undefined ? { dir } : undefined);
        return jsonResult(result);
      }
      case 'graph_query': {
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const qOpts: Parameters<typeof query>[0] = withDirOpt({}, dir);
        if (typeof args.term === 'string') qOpts.term = args.term;
        if (typeof args.hops === 'number') qOpts.hops = args.hops;
        if (args.budget === null) qOpts.budget = null;
        else if (typeof args.budget === 'number') qOpts.budget = args.budget;
        if (typeof args.id === 'string') qOpts.id = args.id;
        if (Array.isArray(args.types)) {
          qOpts.types = args.types.filter((t): t is string => typeof t === 'string');
        }
        if (Array.isArray(args.predicates)) {
          qOpts.predicates = args.predicates.filter(
            (p): p is string => typeof p === 'string',
          );
        }
        if (typeof args.path_from === 'string' && typeof args.path_to === 'string') {
          const pathOpt: { from: string; to: string; maxDepth?: number } = {
            from: args.path_from,
            to: args.path_to,
          };
          if (typeof args.path_max_depth === 'number') {
            pathOpt.maxDepth = args.path_max_depth;
          }
          qOpts.path = pathOpt;
        }
        return jsonResult(query(qOpts));
      }
      case 'graph_pack': {
        if (typeof args.question !== 'string' || args.question.length === 0) {
          throw new Error('graph_pack requires question');
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const packOpts: Parameters<typeof packSubgraph>[0] = withDirOpt(
          { question: args.question },
          dir,
        );
        if (typeof args.hops === 'number') packOpts.hops = args.hops;
        if (typeof args.k_seeds === 'number') packOpts.kSeeds = args.k_seeds;
        if (args.budget === null) packOpts.budget = null;
        else if (typeof args.budget === 'number') packOpts.budget = args.budget;
        return jsonResult(packSubgraph(packOpts));
      }
      case 'graph_answer': {
        if (typeof args.question !== 'string' || args.question.length === 0) {
          throw new Error('graph_answer requires question');
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const answerOpts: Parameters<typeof answer>[0] = withDirOpt(
          { question: args.question },
          dir,
        );
        if (typeof args.hops === 'number') answerOpts.hops = args.hops;
        if (typeof args.k_seeds === 'number') answerOpts.kSeeds = args.k_seeds;
        if (args.budget === null) answerOpts.budget = null;
        else if (typeof args.budget === 'number') answerOpts.budget = args.budget;
        return jsonResult(answer(answerOpts));
      }
      case 'graph_review_list': {
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const storeRoot = resolveStoreRoot(
          dir !== undefined ? { dir } : undefined,
        );
        const queue = loadReviewQueue(storeRoot);
        const pending = queue.items.filter((item) => item.status === 'pending');
        return jsonResult({
          store_dir: storeRoot,
          count: pending.length,
          items: pending,
        });
      }
      case 'graph_build': {
        if (opts?.allowBuild !== true) {
          throw new Error(
            'graph_build is not enabled (set --allow-build or mcp.allow_build)',
          );
        }
        if (typeof args.corpus !== 'string' || args.corpus.length === 0) {
          throw new Error('graph_build requires corpus');
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const buildOpts: Parameters<typeof build>[0] = withDirOpt(
          { corpus: args.corpus },
          dir,
        );
        if (args.full === true) buildOpts.full = true;
        if (typeof args.ontology === 'string') buildOpts.ontology = args.ontology;
        return jsonResult(build(buildOpts));
      }
      case 'graph_review_resolve': {
        if (opts?.allowReviewWrite !== true) {
          throw new Error(
            'graph_review_resolve is not enabled (set --allow-review-write or mcp.allow_review_write)',
          );
        }
        if (typeof args.id !== 'string' || args.id.length === 0) {
          throw new Error('graph_review_resolve requires id');
        }
        if (args.action !== 'accept' && args.action !== 'reject') {
          throw new Error('graph_review_resolve requires action accept|reject');
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const storeRoot = resolveStoreRoot(
          dir !== undefined ? { dir } : undefined,
        );
        const resolveOpts: Parameters<typeof reviewResolve>[0] = {
          storeRoot,
          id: args.id,
          action: args.action,
        };
        if (args.extend_ontology === true) {
          resolveOpts.extendOntology = true;
        }
        reviewResolve(resolveOpts);
        return jsonResult({ ok: true, id: args.id, action: args.action });
      }
      default:
        throw new Error(`Unknown MCP tool: ${name}`);
    }
  } catch (err) {
    return errorResult(err);
  }
}

export const TOOL_DESCRIPTIONS: Record<McpToolName, string> = {
  graph_status:
    'Read graph store status (counts, freshness). Uses graph.v1.json only — never projection as SoT.',
  graph_query:
    'Structured graph query (term seed_expand, path, neighborhood, or filter). Read-only.',
  graph_pack:
    'Pack a grounded subgraph for a natural-language question (packSubgraph). Read-only.',
  graph_answer:
    'Deterministic grounded answer over packSubgraph. Read-only; no ambient LLM.',
  graph_review_list:
    'List pending review-queue items. Read-only; does not accept/reject.',
  graph_build:
    'PRIVILEGED: Build graph from corpus (mutates store). Off unless --allow-build / mcp.allow_build.',
  graph_review_resolve:
    'PRIVILEGED: Accept or reject a review item (mutates store). Off unless --allow-review-write / mcp.allow_review_write.',
};
