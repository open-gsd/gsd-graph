// gsd-graph — MCP tool handlers mapping to public library APIs (MCP-01 / D-06 / D-10)

import { z } from 'zod';
import {
  answer,
  build,
  detectCommunities,
  diff,
  loadGraphV1Cached,
  loadReviewQueue,
  packSubgraph,
  projectSync,
  query,
  resolveNodeTerm,
  resolveStoreRoot,
  reviewResolve,
  status,
  suggestSeeds,
  tokenizeQuestion,
  why,
} from '../index';
import { GraphError } from '../errors';

/** Read tools registered by default (D-06, MCP-01). */
export const DEFAULT_READ_TOOL_NAMES = [
  'graph_status',
  'graph_query',
  'graph_pack',
  'graph_answer',
  'graph_why',
  'graph_resolve',
  'graph_diff',
  'graph_communities',
  'graph_review_list',
] as const;

/** Privileged write tools — off unless explicitly enabled (D-06, T-06-07). */
export const WRITE_TOOL_NAMES = [
  'graph_build',
  'graph_sync',
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
    global: z
      .boolean()
      .optional()
      .describe('Force corpus-level community/theme answer'),
  },
  graph_why: {
    from: z.string().describe('Source term (label, alias, or node id)'),
    to: z.string().describe('Target term (label, alias, or node id)'),
    depth: z.number().optional().describe('Max path depth'),
    dir: z.string().optional().describe('Store directory override'),
  },
  graph_resolve: {
    term: z.string().describe('Human term to resolve to a node id'),
    dir: z.string().optional().describe('Store directory override'),
  },
  graph_diff: {
    snapshot: z
      .string()
      .optional()
      .describe('Named snapshot (default: last-diff-base)'),
    dir: z.string().optional().describe('Store directory override'),
  },
  graph_communities: {
    min_size: z.number().optional().describe('Minimum community size (default 3)'),
    max_iter: z.number().optional().describe('Max LPA iterations (default 20)'),
    write: z
      .boolean()
      .optional()
      .describe('Also write communities/ sidecars (disposable, non-SoT)'),
    dir: z.string().optional().describe('Store directory override'),
  },
  graph_sync: {
    full: z.boolean().optional().describe('Force full re-extract'),
    corpus: z
      .array(z.string())
      .optional()
      .describe('Extra corpus roots merged into auto brownfield resolve'),
    dir: z.string().optional().describe('Store directory override'),
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
    names.push('graph_build', 'graph_sync');
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
        if (args.global === true) answerOpts.global = true;
        return jsonResult(answer(answerOpts));
      }
      case 'graph_why': {
        if (typeof args.from !== 'string' || typeof args.to !== 'string') {
          throw new Error('graph_why requires from and to');
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const whyOpts: Parameters<typeof why>[0] = withDirOpt(
          { from: args.from, to: args.to },
          dir,
        );
        if (typeof args.depth === 'number') whyOpts.maxDepth = args.depth;
        return jsonResult(why(whyOpts));
      }
      case 'graph_resolve': {
        if (typeof args.term !== 'string' || args.term.length === 0) {
          throw new Error('graph_resolve requires term');
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const storeRoot = resolveStoreRoot(
          dir !== undefined ? { dir } : undefined,
        );
        const graph = loadGraphV1Cached(storeRoot);
        const id = resolveNodeTerm(graph, args.term);
        const node =
          id !== null ? graph.nodes.find((n) => n.id === id) ?? null : null;
        const suggestions =
          id === null
            ? suggestSeeds(graph, tokenizeQuestion(args.term))
            : [];
        return jsonResult({
          term: args.term,
          id,
          node,
          ...(suggestions.length > 0 ? { suggestions } : {}),
        });
      }
      case 'graph_diff': {
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const diffOpts: Parameters<typeof diff>[0] = withDirOpt({}, dir);
        if (typeof args.snapshot === 'string' && args.snapshot.length > 0) {
          diffOpts.snapshot = args.snapshot;
        }
        return jsonResult(diff(diffOpts));
      }
      case 'graph_communities': {
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const comOpts: Parameters<typeof detectCommunities>[0] = withDirOpt(
          {},
          dir,
        );
        if (typeof args.min_size === 'number') comOpts.minSize = args.min_size;
        if (typeof args.max_iter === 'number') {
          comOpts.maxIterations = args.max_iter;
        }
        comOpts.write = args.write === true;
        const det = detectCommunities(comOpts);
        return jsonResult({
          community_count: det.communities.length,
          iterations: det.iterations,
          stopped_reason: det.stopped_reason,
          communities: det.communities.map((c) => ({
            id: c.id,
            label: c.label,
            size: c.size,
            top_nodes: c.top_nodes.slice(0, 5),
            top_predicates: c.top_predicates.slice(0, 3),
          })),
          ...(det.index_path !== undefined ? { index_path: det.index_path } : {}),
        });
      }
      case 'graph_sync': {
        if (opts?.allowBuild !== true) {
          throw new Error(
            'graph_sync is not enabled (set --allow-build or mcp.allow_build)',
          );
        }
        const dir = resolveDir(
          typeof args.dir === 'string' ? args.dir : undefined,
          defaultDir,
        );
        const syncOpts: Parameters<typeof projectSync>[0] = withDirOpt(
          { cwd: process.cwd() },
          dir,
        );
        if (args.full === true) syncOpts.full = true;
        if (Array.isArray(args.corpus)) {
          const extra = args.corpus.filter(
            (c): c is string => typeof c === 'string' && c.length > 0,
          );
          if (extra.length > 0) syncOpts.extraCorpus = extra;
        }
        return jsonResult(projectSync(syncOpts));
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
    'Grounded multi-hop answer with citations. Overview questions get community-theme answers. PREFER this over re-reading planning docs. Read-only; no ambient LLM.',
  graph_why:
    'Explain how two concepts connect — shortest path as cited prose. Read-only.',
  graph_resolve:
    'Resolve a human term to a node id (with did-you-mean suggestions on miss). Read-only.',
  graph_diff:
    'Diff current graph against a snapshot or the last-build baseline. Read-only.',
  graph_communities:
    'Detect corpus-level theme communities (label propagation). Read-only unless write=true (disposable sidecars only).',
  graph_review_list:
    'List pending review-queue items. Read-only; does not accept/reject.',
  graph_build:
    'PRIVILEGED: Build graph from corpus (mutates store). Off unless --allow-build / mcp.allow_build.',
  graph_sync:
    'PRIVILEGED: Incremental project sync (auto brownfield corpus). Off unless --allow-build / mcp.allow_build.',
  graph_review_resolve:
    'PRIVILEGED: Accept or reject a review item (mutates store). Off unless --allow-review-write / mcp.allow_review_write.',
};
