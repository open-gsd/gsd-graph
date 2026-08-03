// gsd-graph — stable id helpers (slug, node, triple, review)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { createHash } from 'node:crypto';
import type { Confidence, ProvenanceEntry } from '../types';

const TIER_RANK: Record<Confidence, number> = {
  EXTRACTED: 2,
  INFERRED: 1,
  AMBIGUOUS: 0,
};

/**
 * Shared confidence tier rank (D-02 / QRY-02).
 * EXTRACTED=2, INFERRED=1, AMBIGUOUS=0 — same table as bestTier.
 */
export function confidenceRank(c: Confidence): number {
  return TIER_RANK[c];
}

/**
 * NFKC-lower slug: non letter/number runs → `-`, trim hyphens; empty → `unnamed`.
 */
export function slugifyLabel(label: string): string {
  const n = label.normalize('NFKC').toLowerCase();
  const slug = n.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'unnamed';
}

/** Canonical node id: `${type}:${slugifyLabel(label)}` (D-05 prep). */
export function nodeId(type: string, label: string): string {
  return `${type}:${slugifyLabel(label)}`;
}

/**
 * Stable triple id: `t_` + first 16 hex of sha256(`${s}\0${p}\0${o}`) (K20).
 * Pattern: ^t_[0-9a-f]{16}$
 */
export function tripleId(s: string, p: string, o: string): string {
  const hex = createHash('sha256')
    .update(`${s}\0${p}\0${o}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `t_${hex}`;
}

/**
 * Highest confidence tier among provenance entries.
 * Rank: EXTRACTED=2, INFERRED=1, AMBIGUOUS=0 (D-05).
 * Empty entries → AMBIGUOUS.
 */
export function bestTier(entries: readonly ProvenanceEntry[]): Confidence {
  let best: Confidence = 'AMBIGUOUS';
  for (const e of entries) {
    if (TIER_RANK[e.confidence] > TIER_RANK[best]) {
      best = e.confidence;
    }
  }
  return best;
}

/**
 * JSON with recursively sorted object keys and no insignificant whitespace
 * variance (OQ-3/A3). Arrays keep order; non-plain objects are not expected.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

/**
 * Review queue item id: `rv_` + first 8 hex of sha256(`${kind}\0${stableStringify(payload)}`) (D-08).
 */
export function reviewItemId(kind: string, stablePayload: unknown): string {
  const canonical = stableStringify(stablePayload);
  const hex = createHash('sha256')
    .update(`${kind}\0${canonical}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
  return `rv_${hex}`;
}
