// gsd-graph — secret-pattern redaction for extract labels (discretion)

/**
 * Replace common secret-like tokens with `[REDACTED]` before labels/descriptions
 * are emitted (RESEARCH pitfall 5 / T-02-02).
 *
 * Patterns:
 * - OpenAI-style `sk-…` tokens
 * - AWS access key ids `AKIA…`
 * - PEM private key blocks
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;

  // PEM private key blocks (BEGIN … PRIVATE KEY … END)
  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    '[REDACTED]',
  );

  // AWS access key ids: AKIA + 16 alphanumeric
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]');

  // sk- tokens (OpenAI-style and similar): sk- followed by long alnum/[_-]
  out = out.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]');

  return out;
}
