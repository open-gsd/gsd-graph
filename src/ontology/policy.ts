// gsd-graph — unknown type/predicate policy matrix (ONT-02, D-05)

import type {
  LoadedOntology,
  PolicyDecision,
  UnknownPolicy,
} from './types';

/**
 * Apply the pack's unknown type/predicate policy matrix.
 *
 * - Known allowlist member → allow
 * - review → do not write candidate (never expands lock)
 * - coerce → type→Concept, predicate→related_to
 * - drop → discard candidate
 *
 * Missing policy fields: treat as review when pack.strict is true
 * (DESIGN: strict defaults both to review).
 */
export function applyUnknownPolicy(
  loaded: LoadedOntology,
  kind: 'type' | 'predicate',
  proposed: string,
): PolicyDecision {
  const allowlist =
    kind === 'type' ? loaded.typeSet : loaded.predicateSet;

  if (allowlist.has(proposed)) {
    return { action: 'allow' };
  }

  const policy = resolvePolicy(loaded, kind);

  switch (policy) {
    case 'review':
      return { action: 'review' };
    case 'drop':
      return { action: 'drop' };
    case 'coerce':
      return {
        action: 'coerce',
        coercedTo: kind === 'type' ? 'Concept' : 'related_to',
      };
    default: {
      // Exhaustiveness: treat unknown policy values as review (fail-closed).
      const _exhaustive: never = policy;
      void _exhaustive;
      return { action: 'review' };
    }
  }
}

function resolvePolicy(
  loaded: LoadedOntology,
  kind: 'type' | 'predicate',
): UnknownPolicy {
  const raw =
    kind === 'type'
      ? loaded.pack.unknown_type_policy
      : loaded.pack.unknown_predicate_policy;

  if (raw === 'review' || raw === 'coerce' || raw === 'drop') {
    return raw;
  }

  // Missing/invalid: DESIGN strict defaults both to review.
  if (loaded.pack.strict !== false) {
    return 'review';
  }
  // Non-strict default when omitted is coerce (DESIGN table).
  return 'coerce';
}
