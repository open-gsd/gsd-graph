// gsd-graph — normalize: multiset provenance, best_tier, exact merge, policy gate

import { applyUnknownPolicy } from '../ontology/policy';
import type { LoadedOntology } from '../ontology/types';
import type {
  ExtractDiagnostic,
  GraphNode,
  ProvenanceEntry,
  ReviewItem,
  ReviewKind,
  Triple,
} from '../types';
import {
  bestTier,
  nodeId,
  reviewItemId,
  slugifyLabel,
  tripleId,
} from './ids';

export interface NormalizeInput {
  ontology: LoadedOntology;
  nodes: GraphNode[];
  triples: Triple[];
  /** Optional fixed timestamp for stable review item created_at in tests. */
  now?: string;
  /** Progress callback for long normalizes (CLI spinner). */
  onProgress?: (message: string) => void;
}

export interface NormalizeOutput {
  nodes: GraphNode[];
  triples: Triple[];
  reviewItems: ReviewItem[];
  diagnostics: ExtractDiagnostic[];
}

/**
 * Normalize candidate nodes/triples under the closed ontology pack (D-05/D-06/D-07).
 *
 * - Multiset provenance union on (s,p,o); confidence = bestTier(entries) (NORM-01)
 * - Exact same-type id/alias merge only; same_as is advisory (NORM-02 / Task 2)
 * - Unknown type/predicate via applyUnknownPolicy (D-07)
 */
export function normalize(input: NormalizeInput): NormalizeOutput {
  const { ontology } = input;
  const now = input.now ?? new Date().toISOString();
  const progress = input.onProgress;
  const diagnostics: ExtractDiagnostic[] = [];
  const reviewItems: ReviewItem[] = [];
  const reviewSeen = new Set<string>();

  // 1. Canonicalize node ids (explicit id kept; else type:slug)
  // Collision on canonical slug for distinct keepers uses numeric suffixes -2, -3
  // only when forced unique ids are required (same type+slug, different identity
  // intent without alias match — Task 2 merge handles true alias cases first).
  progress?.(
    `Normalizing: canonicalize ${input.nodes.length.toLocaleString('en-US')} nodes…`,
  );
  const canonicalNodes = canonicalizeNodes(input.nodes);

  // 2. Exact same-type id + alias merge (Task 2 expands; Task 1 merges identical ids)
  progress?.(
    `Normalizing: merge aliases (${canonicalNodes.length.toLocaleString('en-US')} nodes)…`,
  );
  const { nodes: mergedNodes, idRewrite } = mergeExactSameType(canonicalNodes, {
    now,
    reviewItems,
    reviewSeen,
    ...(progress !== undefined ? { onProgress: progress } : {}),
  });

  // Rewrite triple endpoints through merge map
  progress?.(
    `Normalizing: rewrite ${input.triples.length.toLocaleString('en-US')} triple endpoints…`,
  );
  const rewrittenTriples = input.triples.map((t) => ({
    ...t,
    s: idRewrite.get(t.s) ?? t.s,
    o: idRewrite.get(t.o) ?? t.o,
  }));

  // 3–6. Policy gate + multiset dedup
  const nodeById = new Map(mergedNodes.map((n) => [n.id, n]));
  const tripleMap = new Map<string, Triple>();
  const totalTriples = rewrittenTriples.length;
  // Report often enough that a blocked event loop still looks alive.
  const tripleStep = Math.max(50, Math.floor(totalTriples / 40) || 1);

  for (let ti = 0; ti < rewrittenTriples.length; ti++) {
    const raw = rewrittenTriples[ti]!;
    if (ti === 0 || (ti + 1) % tripleStep === 0 || ti + 1 === totalTriples) {
      progress?.(
        `Normalizing triples ${ti + 1}/${totalTriples.toLocaleString('en-US')}…`,
      );
    }
    let p = raw.p;
    let s = raw.s;
    let o = raw.o;

    // Policy-check endpoint types when nodes are present
    const sNode = nodeById.get(s);
    const oNode = nodeById.get(o);

    if (sNode) {
      const typeDecision = applyUnknownPolicy(ontology, 'type', sNode.type);
      if (typeDecision.action === 'review') {
        pushReview(
          reviewItems,
          reviewSeen,
          'type_unknown',
          {
            proposed_type: sNode.type,
            node: { id: sNode.id, type: sNode.type, label: sNode.label },
          },
          now,
        );
        continue;
      }
      if (typeDecision.action === 'drop') {
        continue;
      }
      if (typeDecision.action === 'coerce' && typeDecision.coercedTo) {
        sNode.type = typeDecision.coercedTo;
        // Re-id only if id was type-prefixed canonically — keep explicit id stability.
        // Coerce type field; leave id as-is to avoid cascading rewrites (A4 soft).
      }
    }

    if (oNode) {
      const typeDecision = applyUnknownPolicy(ontology, 'type', oNode.type);
      if (typeDecision.action === 'review') {
        pushReview(
          reviewItems,
          reviewSeen,
          'type_unknown',
          {
            proposed_type: oNode.type,
            node: { id: oNode.id, type: oNode.type, label: oNode.label },
          },
          now,
        );
        continue;
      }
      if (typeDecision.action === 'drop') {
        continue;
      }
      if (typeDecision.action === 'coerce' && typeDecision.coercedTo) {
        oNode.type = typeDecision.coercedTo;
      }
    }

    const predDecision = applyUnknownPolicy(ontology, 'predicate', p);
    if (predDecision.action === 'review') {
      pushReview(
        reviewItems,
        reviewSeen,
        'predicate_unknown',
        {
          proposed_p: p,
          triple: {
            s,
            p,
            o,
            provenance: raw.provenance,
          },
        },
        now,
      );
      // D-07: do not write the contested triple
      continue;
    }
    if (predDecision.action === 'drop') {
      continue;
    }
    if (predDecision.action === 'coerce' && predDecision.coercedTo) {
      p = predDecision.coercedTo;
    }

    // same_as is advisory when allowed — write edge, never rewrite node ids (D-06)
    const key = `${s}\0${p}\0${o}`;
    const existing = tripleMap.get(key);
    if (existing) {
      existing.provenance = unionProvenance(
        existing.provenance,
        raw.provenance ?? [],
        now,
      );
      existing.confidence = bestTier(existing.provenance);
      if (raw.score !== undefined) {
        existing.score =
          existing.score === undefined
            ? raw.score
            : Math.max(existing.score, raw.score);
      }
      mergeSupersession(existing, raw);
    } else {
      const provenance = unionProvenance([], raw.provenance ?? [], now);
      const triple: Triple = {
        id: tripleId(s, p, o),
        s,
        p,
        o,
        confidence: bestTier(provenance),
        provenance,
      };
      if (raw.score !== undefined) triple.score = raw.score;
      mergeSupersession(triple, raw);
      tripleMap.set(key, triple);
    }
  }

  // Conflict surfacing (never suppression): reciprocal cycles on directional
  // predicates and supports/contradicts on the same endpoints go to review.
  detectConflicts(tripleMap, reviewItems, reviewSeen, now);

  return {
    nodes: mergedNodes,
    triples: [...tripleMap.values()],
    reviewItems,
    diagnostics,
  };
}

/**
 * Directional predicates where A→B and B→A together read as a contradiction
 * or a cycle worth a human look (planning corpora reverse decisions often).
 */
export const DIRECTIONAL_PREDICATES: ReadonlySet<string> = new Set([
  'causes',
  'depends_on',
  'blocked_by',
  'blocks',
  'precedes',
  'part_of',
  'requires',
  'uses',
  'implements',
  'delivers',
  'derived_from',
  'authored',
  'owns',
  'mitigates',
  'deploys',
  'cites',
  'works_for',
  'located_in',
  'member_of',
  'uses_method',
  'evaluates',
]);

function mergeSupersession(target: Triple, raw: Triple): void {
  if (raw.supersedes !== undefined && raw.supersedes.length > 0) {
    target.supersedes = [
      ...new Set([...(target.supersedes ?? []), ...raw.supersedes]),
    ];
  }
  if (raw.superseded_by !== undefined && raw.superseded_by.length > 0) {
    target.superseded_by = [
      ...new Set([...(target.superseded_by ?? []), ...raw.superseded_by]),
    ];
  }
}

function detectConflicts(
  tripleMap: Map<string, Triple>,
  reviewItems: ReviewItem[],
  reviewSeen: Set<string>,
  now: string,
): void {
  for (const t of tripleMap.values()) {
    // Reciprocal cycle on a directional predicate: emit once per unordered pair.
    if (DIRECTIONAL_PREDICATES.has(t.p) && t.s < t.o) {
      const reverse = tripleMap.get(`${t.o}\0${t.p}\0${t.s}`);
      if (reverse !== undefined) {
        pushReview(
          reviewItems,
          reviewSeen,
          'conflict',
          {
            reason: 'reciprocal_cycle',
            p: t.p,
            a: t.s,
            b: t.o,
            triples: [t.id, reverse.id],
          },
          now,
        );
      }
    }
    // supports vs contradicts on identical endpoints.
    if (t.p === 'supports') {
      const opposing = tripleMap.get(`${t.s}\0contradicts\0${t.o}`);
      if (opposing !== undefined) {
        pushReview(
          reviewItems,
          reviewSeen,
          'conflict',
          {
            reason: 'opposing_predicates',
            s: t.s,
            o: t.o,
            triples: [t.id, opposing.id],
          },
          now,
        );
      }
    }
  }
}

function canonicalizeNodes(nodes: GraphNode[]): GraphNode[] {
  // Track assigned ids. Identical id (any type) is left for mergeExactSameType —
  // same-type merges, cross-type gets review + suffix there.
  // Collision suffixes -2, -3 apply only when two *generated* ids would collide
  // after missing-id fill (forced unique canonical ids).
  const generated = new Set<string>();
  const out: GraphNode[] = [];

  for (const n of nodes) {
    const hadExplicit = Boolean(n.id && n.id.length > 0);
    let id = hadExplicit ? n.id : nodeId(n.type, n.label);
    if (!hadExplicit && generated.has(id)) {
      let suffix = 2;
      let candidate = `${id}-${suffix}`;
      while (generated.has(candidate)) {
        suffix += 1;
        candidate = `${id}-${suffix}`;
      }
      id = candidate;
    }
    generated.add(id);
    out.push({
      id,
      type: n.type,
      label: n.label,
      ...(n.description !== undefined ? { description: n.description } : {}),
      ...(n.aliases !== undefined ? { aliases: [...n.aliases] } : {}),
    });
  }
  return out;
}

/**
 * Exact same-type merge (NORM-02 / D-06):
 * - Identical id + same type → single keeper
 * - Same type where one's label/alias slug equals the other's id local part → merge
 * - Cross-type clashes → entity_merge review (no auto-merge)
 * - No fuzzy/Levenshtein matching
 */
function mergeExactSameType(
  nodes: GraphNode[],
  ctx: {
    now: string;
    reviewItems: ReviewItem[];
    reviewSeen: Set<string>;
    onProgress?: (message: string) => void;
  },
): { nodes: GraphNode[]; idRewrite: Map<string, string> } {
  const idRewrite = new Map<string, string>();
  const byId = new Map<string, GraphNode>();

  // Pass 1: merge exact same id (same type). Different type same id → review.
  for (const n of nodes) {
    const existing = byId.get(n.id);
    if (!existing) {
      byId.set(n.id, cloneNode(n));
      continue;
    }
    if (existing.type === n.type) {
      mergeInto(existing, n);
      idRewrite.set(n.id, existing.id);
    } else {
      // Cross-type id collision — never auto-merge
      pushReview(
        ctx.reviewItems,
        ctx.reviewSeen,
        'entity_merge',
        {
          keep: existing.id,
          drop: n.id,
          keep_id: existing.id,
          drop_id: n.id,
          reason: 'cross_type_id_collision',
        },
        ctx.now,
      );
      // Keep both under distinct keys by suffixing the newcomer for storage
      let suffix = 2;
      let alt = `${n.id}-${suffix}`;
      while (byId.has(alt)) {
        suffix += 1;
        alt = `${n.id}-${suffix}`;
      }
      const copy = cloneNode({ ...n, id: alt });
      byId.set(alt, copy);
      idRewrite.set(n.id, alt);
    }
  }

  // Pass 2: exact same-type alias / label slug matches against keeper id local part
  // O(n²) over keepers — this is often the long pause after extract; report progress.
  const keepers = [...byId.values()];
  const dropped = new Set<string>();
  const nKeepers = keepers.length;
  const mergeStep = Math.max(1, Math.floor(nKeepers / 50) || 1);

  for (let i = 0; i < keepers.length; i++) {
    if (i === 0 || (i + 1) % mergeStep === 0 || i + 1 === nKeepers) {
      ctx.onProgress?.(
        `Normalizing: alias merge ${i + 1}/${nKeepers.toLocaleString('en-US')}…`,
      );
    }
    const a = keepers[i]!;
    if (dropped.has(a.id)) continue;
    for (let j = i + 1; j < keepers.length; j++) {
      const b = keepers[j]!;
      if (dropped.has(b.id)) continue;

      if (a.type !== b.type) {
        // Cross-type same label/alias slug → advisory review, no merge
        if (sharesNormalizedLabel(a, b)) {
          pushReview(
            ctx.reviewItems,
            ctx.reviewSeen,
            'entity_merge',
            {
              keep: a.id,
              drop: b.id,
              keep_id: a.id,
              drop_id: b.id,
              reason: 'cross_type_label_clash',
            },
            ctx.now,
          );
        }
        continue;
      }

      if (exactAliasMatch(a, b)) {
        // Keep first-seen (lower index)
        mergeInto(a, b);
        idRewrite.set(b.id, a.id);
        // Chain any prior rewrites pointing at b → a
        for (const [from, to] of idRewrite) {
          if (to === b.id) idRewrite.set(from, a.id);
        }
        byId.delete(b.id);
        dropped.add(b.id);
        continue;
      }

      // Near-alias (plural / acronym) — suggest-only via review queue,
      // never auto-merge (NORM-02: no fuzzy merges without a human).
      if (suggestsAliasMatch(a, b)) {
        pushReview(
          ctx.reviewItems,
          ctx.reviewSeen,
          'entity_merge',
          {
            keep: a.id,
            drop: b.id,
            keep_id: a.id,
            drop_id: b.id,
            reason: 'alias_suggestion',
          },
          ctx.now,
        );
      }
    }
  }

  return { nodes: [...byId.values()], idRewrite };
}

function cloneNode(n: GraphNode): GraphNode {
  const out: GraphNode = {
    id: n.id,
    type: n.type,
    label: n.label,
  };
  if (n.description !== undefined) out.description = n.description;
  if (n.aliases !== undefined) out.aliases = [...n.aliases];
  return out;
}

function localPart(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function nodeSlugs(n: GraphNode): Set<string> {
  const s = new Set<string>();
  s.add(slugifyLabel(n.label));
  s.add(localPart(n.id));
  if (n.aliases) {
    for (const a of n.aliases) s.add(slugifyLabel(a));
  }
  return s;
}

/** Exact same-type alias: one's label/alias slug equals the other's id local part or label slug. */
function exactAliasMatch(a: GraphNode, b: GraphNode): boolean {
  const aSlugs = nodeSlugs(a);
  const bSlugs = nodeSlugs(b);
  for (const s of aSlugs) {
    if (bSlugs.has(s)) return true;
  }
  return false;
}

function sharesNormalizedLabel(a: GraphNode, b: GraphNode): boolean {
  return exactAliasMatch(a, b);
}

/** "ledger-service" → "ls" (initials of slug words, ≥2 words only). */
function slugAcronym(slug: string): string | null {
  const words = slug.split('-').filter((w) => w.length > 0);
  if (words.length < 2) return null;
  return words.map((w) => w[0]!).join('');
}

/**
 * Conservative near-alias detection for suggest-only merges:
 * - plural: one slug is the other + trailing "s" ("service" / "services")
 * - acronym: one slug equals the initials of the other's words ("ls" / "ledger-service")
 * Never used for auto-merge — only feeds entity_merge review items.
 */
function suggestsAliasMatch(a: GraphNode, b: GraphNode): boolean {
  const aSlugs = nodeSlugs(a);
  const bSlugs = nodeSlugs(b);
  for (const sa of aSlugs) {
    for (const sb of bSlugs) {
      if (sa.length < 2 || sb.length < 2) continue;
      if (sa === `${sb}s` || sb === `${sa}s`) return true;
      const acA = slugAcronym(sa);
      const acB = slugAcronym(sb);
      if (acA !== null && acA === sb) return true;
      if (acB !== null && acB === sa) return true;
    }
  }
  return false;
}

function mergeInto(keeper: GraphNode, drop: GraphNode): void {
  const aliasSet = new Set<string>(keeper.aliases ?? []);
  aliasSet.add(slugifyLabel(drop.label));
  if (drop.aliases) {
    for (const a of drop.aliases) aliasSet.add(slugifyLabel(a));
  }
  // Prefer non-empty description
  if (!keeper.description && drop.description) {
    keeper.description = drop.description;
  }
  // Prefer non-empty label if keeper empty
  if (!keeper.label && drop.label) {
    keeper.label = drop.label;
  }
  keeper.aliases = [...aliasSet];
}

function provenanceKey(e: ProvenanceEntry): string {
  return `${e.source_path}\0${e.extractor}\0${e.content_hash}\0${e.confidence}`;
}

/**
 * Multiset provenance union with observation timestamps: a never-seen entry
 * is stamped first_seen/last_seen = now (unless it already carries stamps
 * from a prior publish); a re-observed entry (unstamped duplicate from a
 * fresh extract) keeps its earliest first_seen and bumps last_seen to now.
 */
function unionProvenance(
  a: readonly ProvenanceEntry[],
  b: readonly ProvenanceEntry[],
  now: string,
): ProvenanceEntry[] {
  const map = new Map<string, ProvenanceEntry>();
  const add = (e: ProvenanceEntry): void => {
    const key = provenanceKey(e);
    const existing = map.get(key);
    if (existing === undefined) {
      const copy: ProvenanceEntry = { ...e };
      if (copy.first_seen === undefined) copy.first_seen = now;
      if (copy.last_seen === undefined) copy.last_seen = copy.first_seen;
      map.set(key, copy);
      return;
    }
    const firsts = [existing.first_seen, e.first_seen].filter(
      (x): x is string => x !== undefined,
    );
    existing.first_seen = firsts.sort()[0] ?? now;
    // An unstamped duplicate means this evidence was extracted again now.
    if (e.first_seen === undefined) {
      existing.last_seen = now;
    } else {
      const lasts = [existing.last_seen, e.last_seen].filter(
        (x): x is string => x !== undefined,
      );
      existing.last_seen = lasts.sort().pop() ?? now;
    }
  };
  for (const e of a) add(e);
  for (const e of b) add(e);
  return [...map.values()];
}

function pushReview(
  items: ReviewItem[],
  seen: Set<string>,
  kind: ReviewKind,
  payload: Record<string, unknown>,
  now: string,
): void {
  const id = reviewItemId(kind, payload);
  if (seen.has(id)) return;
  seen.add(id);
  items.push({
    id,
    kind,
    status: 'pending',
    created_at: now,
    updated_at: null,
    payload,
    decision: null,
  });
}
