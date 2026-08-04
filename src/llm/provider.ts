// gsd-graph — LLM mode resolution (none | prompt | http); never ambient (D-01)

/**
 * Central resolveLlmMode: explicit flag wins; config only when flag absent; else none.
 * Never enables from API key presence alone (D-01, T-06-04).
 */

import type { LlmMode } from '../types';

export type { LlmMode };

export interface ResolveLlmModeInput {
  /**
   * Explicit flag from CLI/API:
   * - true → 'prompt' (--llm alone)
   * - 'prompt' | 'http' → that mode
   * - false | 'none' → treated as explicit none when provided
   * - undefined → fall through to config
   */
  flagMode?: LlmMode | boolean;
  /** config.llm.mode when present */
  configMode?: LlmMode | string | null;
}

/**
 * Resolve effective LLM mode (D-01 / RESEARCH Pattern 1).
 *
 * Precedence:
 * 1. explicit flagMode true → prompt; 'prompt'|'http' → that mode; false|'none' → none
 * 2. configMode 'prompt'|'http' → that mode
 * 3. else none
 */
export function resolveLlmMode(input: ResolveLlmModeInput = {}): LlmMode {
  const { flagMode, configMode } = input;

  if (flagMode === true) return 'prompt';
  if (flagMode === 'prompt' || flagMode === 'http') return flagMode;
  if (flagMode === false || flagMode === 'none') return 'none';

  if (configMode === 'prompt' || configMode === 'http') return configMode;

  return 'none';
}
