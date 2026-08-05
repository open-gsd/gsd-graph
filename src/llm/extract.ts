// gsd-graph — LLM-assisted extraction: corpus → INFERRED triple candidates

/**
 * Turns prose the deterministic extractor cannot read into candidate triples,
 * without weakening the honesty contract (D-01/D-02):
 * - http mode: per-source chat completion → Ajv-validated extract result
 * - prompt mode: write `.prompt-extract.json` for the host agent; the agent's
 *   `.prompt-extract-result.json` merges via `prompt apply extract`
 * - Every accepted candidate is stamped INFERRED with llm/* extractor
 *   provenance; ontology policy gating still applies downstream in normalize.
 */

import { readFileSync, statSync } from 'node:fs';
import type { GraphNode, ProvenanceEntry, Triple } from '../types';
import { discoverSources } from '../sources/discover';
import { fingerprintFile } from '../sources/fingerprint';
import { redactSecrets } from '../sources/redact';
import { promptApply } from './apply';
import {
  defaultApiKeyEnv,
  httpChatCompletion,
  parseHttpPromptResultJson,
  type LlmHttpProvider,
} from './http-client';
import {
  writePromptRequest,
  type WritePromptRequestResult,
} from './prompt-files';

/** Per-source content cap sent to the LLM (bytes). */
export const LLM_EXTRACT_MAX_SOURCE_BYTES = 64 * 1024;
/** Max sources per LLM extraction run. */
export const LLM_EXTRACT_MAX_SOURCES = 50;

export interface LlmSourceFile {
  source_path: string;
  content: string;
  content_hash: string;
}

export interface CollectLlmSourcesResult {
  files: LlmSourceFile[];
  /** Paths skipped (size cap / file cap / read errors) with reasons. */
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Discover corpus sources and load their contents for LLM extraction.
 * Applies redaction and hard size/count caps; never throws on a bad file.
 */
export function collectLlmSources(
  corpus: string | string[],
): CollectLlmSourcesResult {
  const discovered = discoverSources(corpus, {});
  const files: LlmSourceFile[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const file of discovered.files) {
    if (files.length >= LLM_EXTRACT_MAX_SOURCES) {
      skipped.push({
        path: file,
        reason: `source cap ${LLM_EXTRACT_MAX_SOURCES} reached`,
      });
      continue;
    }
    try {
      const st = statSync(file);
      if (st.size > LLM_EXTRACT_MAX_SOURCE_BYTES) {
        skipped.push({
          path: file,
          reason: `exceeds ${LLM_EXTRACT_MAX_SOURCE_BYTES} bytes`,
        });
        continue;
      }
      files.push({
        source_path: file,
        content: redactSecrets(readFileSync(file, 'utf8')),
        content_hash: fingerprintFile(file),
      });
    } catch (err) {
      skipped.push({
        path: file,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { files, skipped };
}

export interface SanitizedCandidates {
  nodes: GraphNode[];
  triples: Triple[];
}

/**
 * Clamp validated LLM extract output to honest provenance (D-02):
 * - confidence forced to INFERRED (LLM output is never EXTRACTED)
 * - extractor forced to the given llm/* tag
 * - triples without provenance get a synthesized entry for the source
 */
export function sanitizeExtractCandidates(
  result: { nodes?: GraphNode[]; triples?: Triple[] },
  opts: { extractorTag: string; sourcePath?: string; contentHash?: string },
): SanitizedCandidates {
  const nodes = (result.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    label: redactSecrets(n.label),
    ...(n.description !== undefined
      ? { description: redactSecrets(n.description) }
      : {}),
    ...(n.aliases !== undefined ? { aliases: [...n.aliases] } : {}),
  }));

  const triples = (result.triples ?? []).map((t) => {
    const provenance: ProvenanceEntry[] = (
      t.provenance.length > 0
        ? t.provenance
        : [
            {
              source_path: opts.sourcePath ?? '(llm)',
              extractor: opts.extractorTag,
              content_hash: opts.contentHash ?? 'sha256:unknown',
              confidence: 'INFERRED' as const,
            },
          ]
    ).map((e) => ({
      ...e,
      extractor: opts.extractorTag,
      confidence: 'INFERRED' as const,
    }));
    return {
      ...t,
      confidence: 'INFERRED' as const,
      provenance,
    };
  });

  return { nodes, triples };
}

export interface LlmExtractHttpOptions {
  baseUrl: string;
  model: string;
  provider?: LlmHttpProvider;
  apiKeyEnv?: string;
  /** Ontology allowlists embedded in the system prompt. */
  allowedTypes: readonly string[];
  allowedPredicates: readonly string[];
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  onProgress?: (message: string) => void;
}

export interface LlmExtractHttpResult extends SanitizedCandidates {
  sources_extracted: number;
  failures: Array<{ path: string; reason: string }>;
}

/** System prompt for per-source extract completions. */
export function buildExtractSystemPrompt(
  allowedTypes: readonly string[],
  allowedPredicates: readonly string[],
): string {
  return [
    'You extract knowledge-graph candidates for gsd-graph.',
    'Return JSON only matching prompt-extract-result schema: { "nodes": [...], "triples": [...] }.',
    `Node id format "Type:kebab-slug". Allowed node types: ${allowedTypes.join(', ')}.`,
    `Allowed predicates: ${allowedPredicates.join(', ')}. Never invent other predicates.`,
    'Each triple: { "id": "t_x", "s": "<node id>", "p": "<predicate>", "o": "<node id>", "confidence": "INFERRED", "provenance": [{ "source_path": "<given>", "extractor": "llm/http", "content_hash": "<given>", "confidence": "INFERRED", "span": { "start_line": N } }] }.',
    'Only emit relationships the text actually states. If unsure, omit. Empty arrays are a valid answer.',
  ].join('\n');
}

/**
 * Extract candidates from sources via an OpenAI- or Anthropic-compatible
 * endpoint. Per-source failures are recorded and never abort the run.
 */
export async function llmExtractHttp(
  files: readonly LlmSourceFile[],
  opts: LlmExtractHttpOptions,
): Promise<LlmExtractHttpResult> {
  const provider = opts.provider ?? 'openai';
  const apiKeyEnv = opts.apiKeyEnv ?? defaultApiKeyEnv(provider);
  const system = buildExtractSystemPrompt(
    opts.allowedTypes,
    opts.allowedPredicates,
  );

  const nodes: GraphNode[] = [];
  const triples: Triple[] = [];
  const failures: Array<{ path: string; reason: string }> = [];
  let sources_extracted = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    opts.onProgress?.(
      `LLM extract ${i + 1}/${files.length}: ${file.source_path}`,
    );
    try {
      const completion = await httpChatCompletion({
        baseUrl: opts.baseUrl,
        model: opts.model,
        provider,
        apiKeyEnv,
        ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.env !== undefined ? { env: opts.env } : {}),
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `source_path: ${file.source_path}\ncontent_hash: ${file.content_hash}\n\n${file.content}`,
          },
        ],
      });
      const resultObj = parseHttpPromptResultJson(completion.content);
      const applied = promptApply({ stage: 'extract', result: resultObj });
      if (applied.stage !== 'extract') continue;
      const sanitized = sanitizeExtractCandidates(applied, {
        extractorTag: 'llm/http',
        sourcePath: file.source_path,
        contentHash: file.content_hash,
      });
      nodes.push(...sanitized.nodes);
      triples.push(...sanitized.triples);
      sources_extracted += 1;
    } catch (err) {
      failures.push({
        path: file.source_path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { nodes, triples, sources_extracted, failures };
}

export interface WriteExtractRequestOptions {
  dir?: string;
  cwd?: string;
  corpus: string | string[];
  allowedTypes: readonly string[];
  allowedPredicates: readonly string[];
}

export interface WriteExtractRequestOutput {
  request: WritePromptRequestResult;
  sources: number;
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Prompt mode: write `.prompt-extract.json` bundling corpus contents and the
 * allowlists so the host agent can produce `.prompt-extract-result.json`.
 * The result merges into the store via `gsd-graph prompt apply extract`.
 */
export function writeExtractPromptRequest(
  opts: WriteExtractRequestOptions,
): WriteExtractRequestOutput {
  const { files, skipped } = collectLlmSources(opts.corpus);
  const request = writePromptRequest({
    stage: 'extract',
    ...(opts.dir !== undefined ? { dir: opts.dir } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    payload: {
      instructions: buildExtractSystemPrompt(
        opts.allowedTypes,
        opts.allowedPredicates,
      ),
      files,
      apply_with: 'gsd-graph prompt apply extract',
    },
  });
  return { request, sources: files.length, skipped };
}
