// gsd-graph — opt-in embedding sidecar for semantic seed fallback

/**
 * Vocabulary mismatch ("auth service" vs "authentication-svc") is the #1
 * recall ceiling of lexical seeding. This sidecar embeds node labels/aliases
 * at build time into a DISPOSABLE store file and offers cosine-ranked seed
 * candidates as a FALLBACK only — traversal, budget, and citations stay
 * deterministic, and the default path never touches the network (D-01).
 *
 * Provider: any OpenAI-compatible /v1/embeddings endpoint, configured under
 * store config.json `llm.embeddings` ({ base_url, model, api_key_env }).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { loadGraphV1Cached } from '../io/graph-cache';
import { confineUnderRoot, resolveStoreRoot, storeFile } from '../io/paths';
import type { GraphV1Document } from '../types';

export const EMBEDDINGS_BASENAME = 'embeddings.v1.json';

/** Hard cap on embedded nodes per sidecar (payload + latency sanity). */
export const EMBEDDINGS_MAX_NODES = 20_000;

/** Labels per embeddings API request. */
const BATCH_SIZE = 100;

export interface EmbeddingsConfig {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}

export interface EmbeddingEntry {
  id: string;
  /** sha256:12 of the embedded text (label + aliases) for incremental reuse. */
  text_hash: string;
  vector: number[];
}

export interface EmbeddingSidecarDocument {
  schema_version: 1;
  model: string;
  base_url: string;
  built_at: string;
  /** graph built_at this sidecar was computed against (staleness signal). */
  graph_built_at: string;
  entries: EmbeddingEntry[];
}

export interface SemanticSeedCandidate {
  id: string;
  score: number;
}

/** Read store config.json `llm.embeddings` (null when not configured). */
export function readEmbeddingsConfig(
  storeRoot: string,
): EmbeddingsConfig | null {
  const configPath = storeFile(storeRoot, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      llm?: {
        embeddings?: {
          base_url?: unknown;
          model?: unknown;
          api_key_env?: unknown;
        };
      };
    };
    const e = raw.llm?.embeddings;
    if (e === undefined) return null;
    return {
      baseUrl:
        typeof e.base_url === 'string' && e.base_url.length > 0
          ? e.base_url
          : 'https://api.openai.com',
      model:
        typeof e.model === 'string' && e.model.length > 0
          ? e.model
          : 'text-embedding-3-small',
      apiKeyEnv:
        typeof e.api_key_env === 'string' && e.api_key_env.length > 0
          ? e.api_key_env
          : 'OPENAI_API_KEY',
    };
  } catch {
    return null;
  }
}

function textOf(node: GraphV1Document['nodes'][number]): string {
  const parts = [node.label, ...(node.aliases ?? [])];
  return parts.filter((p) => p.length > 0).join(' · ');
}

function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)}`;
}

async function fetchEmbeddings(
  inputs: readonly string[],
  config: EmbeddingsConfig,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv,
): Promise<number[][]> {
  const apiKey = env[config.apiKeyEnv];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `embeddings require ${config.apiKeyEnv} in the environment`,
    );
  }
  const url = `${config.baseUrl.replace(/\/$/, '')}/v1/embeddings`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: inputs }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `embeddings request failed: ${res.status} ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    data?: Array<{ index?: number; embedding?: number[] }>;
  };
  const out: number[][] = new Array(inputs.length);
  for (const [i, d] of (json.data ?? []).entries()) {
    const idx = typeof d.index === 'number' ? d.index : i;
    if (Array.isArray(d.embedding)) out[idx] = d.embedding;
  }
  if (out.some((v) => v === undefined)) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'embeddings response missing vectors',
    );
  }
  return out;
}

export interface BuildEmbeddingSidecarOptions {
  dir?: string;
  /** Config override; default from store config.json llm.embeddings. */
  config?: EmbeddingsConfig;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  onProgress?: (message: string) => void;
  now?: string;
}

export interface BuildEmbeddingSidecarResult {
  path: string;
  embedded: number;
  reused: number;
  skipped: number;
  model: string;
}

/** Build (or incrementally refresh) the embedding sidecar for the store. */
export async function buildEmbeddingSidecar(
  opts?: BuildEmbeddingSidecarOptions,
): Promise<BuildEmbeddingSidecarResult> {
  const storeRoot = resolveStoreRoot(
    opts?.dir !== undefined ? { dir: opts.dir } : {},
  );
  const config = opts?.config ?? readEmbeddingsConfig(storeRoot);
  if (config === null) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'embeddings are not configured — add llm.embeddings ({ base_url?, model?, api_key_env? }) to the store config.json',
    );
  }
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const env = opts?.env ?? process.env;
  const graph = loadGraphV1Cached(storeRoot);

  const prior = loadEmbeddingSidecar(storeRoot);
  const priorByHash = new Map<string, EmbeddingEntry>();
  if (prior !== null && prior.model === config.model) {
    for (const e of prior.entries) priorByHash.set(`${e.id}\0${e.text_hash}`, e);
  }

  const entries: EmbeddingEntry[] = [];
  const pending: Array<{ id: string; text: string; text_hash: string }> = [];
  let reused = 0;
  let skipped = 0;

  for (const node of graph.nodes) {
    if (entries.length + pending.length >= EMBEDDINGS_MAX_NODES) {
      skipped += 1;
      continue;
    }
    const text = textOf(node);
    if (text.length === 0) {
      skipped += 1;
      continue;
    }
    const text_hash = hashText(text);
    const hit = priorByHash.get(`${node.id}\0${text_hash}`);
    if (hit !== undefined) {
      entries.push(hit);
      reused += 1;
      continue;
    }
    pending.push({ id: node.id, text, text_hash });
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    opts?.onProgress?.(
      `Embedding ${Math.min(i + batch.length, pending.length)}/${pending.length} node labels…`,
    );
    const vectors = await fetchEmbeddings(
      batch.map((b) => b.text),
      config,
      fetchImpl,
      env,
    );
    for (const [j, b] of batch.entries()) {
      entries.push({ id: b.id, text_hash: b.text_hash, vector: vectors[j]! });
    }
  }

  const doc: EmbeddingSidecarDocument = {
    schema_version: 1,
    model: config.model,
    base_url: config.baseUrl,
    built_at: opts?.now ?? new Date().toISOString(),
    graph_built_at: graph.built_at,
    entries,
  };
  const outPath = confineUnderRoot(storeRoot, EMBEDDINGS_BASENAME);
  fs.writeFileSync(outPath, JSON.stringify(doc), 'utf8');

  return {
    path: outPath,
    embedded: pending.length,
    reused,
    skipped,
    model: config.model,
  };
}

/** Load the sidecar (null when absent/unreadable — semantic fallback disabled). */
export function loadEmbeddingSidecar(
  storeRoot: string,
): EmbeddingSidecarDocument | null {
  try {
    const p = confineUnderRoot(storeRoot, EMBEDDINGS_BASENAME);
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as EmbeddingSidecarDocument;
    if (doc.schema_version !== 1 || !Array.isArray(doc.entries)) return null;
    return doc;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Minimum cosine similarity for a semantic seed candidate. */
export const SEMANTIC_SEED_MIN_SIMILARITY = 0.25;

export interface SemanticSeedOptions {
  dir?: string;
  k?: number;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Config override; default from store config.json. */
  config?: EmbeddingsConfig;
}

/**
 * Cosine-ranked seed candidates for a question via the sidecar.
 * Returns [] when the sidecar or config is absent — callers treat that as
 * "semantic fallback unavailable", never as an error.
 */
export async function semanticSeedCandidates(
  question: string,
  opts?: SemanticSeedOptions,
): Promise<SemanticSeedCandidate[]> {
  const storeRoot = resolveStoreRoot(
    opts?.dir !== undefined ? { dir: opts.dir } : {},
  );
  const sidecar = loadEmbeddingSidecar(storeRoot);
  if (sidecar === null || sidecar.entries.length === 0) return [];
  const config = opts?.config ?? readEmbeddingsConfig(storeRoot);
  if (config === null) return [];

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const env = opts?.env ?? process.env;
  const [queryVector] = await fetchEmbeddings(
    [question],
    config,
    fetchImpl,
    env,
  );

  const k = opts?.k ?? 5;
  const scored = sidecar.entries
    .map((e) => ({ id: e.id, score: cosineSimilarity(queryVector!, e.vector) }))
    .filter((c) => c.score >= SEMANTIC_SEED_MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, k);
}
