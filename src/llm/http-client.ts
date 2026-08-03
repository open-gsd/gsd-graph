// gsd-graph — OpenAI-compatible chat completions via injectable fetch (D-05)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Thin HTTP LLM client — no openai SDK. Only used when resolveLlmMode is http.
 * API key read from env name after mode is http; never from ambient alone (D-05).
 */

import { GSD_GRAPH_REASON, GraphError } from '../errors';

export interface HttpChatCompletionOptions {
  /** Base URL without trailing slash (e.g. https://api.openai.com). */
  baseUrl: string;
  /** Model id for chat completions. */
  model: string;
  /** Messages (OpenAI chat format). */
  messages: Array<{ role: string; content: string }>;
  /**
   * Env var *name* holding the API key (e.g. OPENAI_API_KEY).
   * Read only when calling; missing key → PROMPT_RESULT_INVALID.
   */
  apiKeyEnv?: string;
  /** Injectable fetch for tests (D-05, D-12). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Env map for key lookup; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Sampling temperature (default 0 for determinism). */
  temperature?: number;
}

export interface HttpChatCompletionResult {
  content: string;
  raw: unknown;
}

/**
 * POST {baseUrl}/v1/chat/completions — OpenAI-compatible (D-05).
 * Non-OK HTTP or empty content → GraphError PROMPT_RESULT_INVALID (D-02).
 */
export async function httpChatCompletion(
  opts: HttpChatCompletionOptions,
): Promise<HttpChatCompletionResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'http chat: fetch implementation not available',
    );
  }

  const base = opts.baseUrl.replace(/\/+$/, '');
  const url = `${base}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (opts.apiKeyEnv !== undefined && opts.apiKeyEnv.length > 0) {
    const env = opts.env ?? process.env;
    const key = env[opts.apiKeyEnv];
    if (key === undefined || key.length === 0) {
      throw new GraphError(
        GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
        `http chat: API key env ${opts.apiKeyEnv} is empty or unset`,
        { apiKeyEnv: opts.apiKeyEnv },
      );
    }
    headers.authorization = `Bearer ${key}`;
  }

  const body = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0,
  };

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `http chat network error: ${message}`,
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 500);
    } catch {
      detail = '';
    }
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `http chat non-OK status ${response.status}${detail ? `: ${detail}` : ''}`,
      { status: response.status },
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `http chat invalid JSON body: ${message}`,
    );
  }

  const content = extractContent(raw);
  if (content === undefined || content.length === 0) {
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      'http chat empty choices[0].message.content',
      { raw },
    );
  }

  return { content, raw };
}

function extractContent(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (first === null || typeof first !== 'object') return undefined;
  const message = (first as { message?: unknown }).message;
  if (message === null || typeof message !== 'object') return undefined;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== 'string') return undefined;
  return content;
}

/**
 * Parse chat content as JSON prompt-result object (fail-closed).
 * Strips optional markdown fences.
 */
export function parseHttpPromptResultJson(content: string): unknown {
  let text = content.trim();
  // Strip ```json ... ``` fences if present
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(text);
  if (fence !== null && fence[1] !== undefined) {
    text = fence[1].trim();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GraphError(
      GSD_GRAPH_REASON.PROMPT_RESULT_INVALID,
      `http chat content is not valid JSON prompt result: ${message}`,
    );
  }
}
