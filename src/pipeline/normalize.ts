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
 *
 * Exported for tests only (not part of the package index).
 */
export function mergeExactSameType(
  nodes: GraphNode[],
  ctx: {
    now: string;
    reviewItems: ReviewItem[];
    reviewSeen: Set<string>;
    onProgress?: (message: string) => void;
  },
): {
  nodes: GraphNode[];
  idRewrite: Map<string, string>;
  /** Candidate keeper pairs visited in pass 2 (work counter for tests). */
  candidatePairs: number;
} {
  const idRewrite = new Map<string, string>();
  const byId = new Map<string, GraphNode>();
  const aliasSets = new Map<GraphNode, Set<string>>();

  // Pass 1: merge exact same id (same type). Different type same id → review.
  for (const n of nodes) {
    const existing = byId.get(n.id);
    if (!existing) {
      byId.set(n.id, cloneNode(n));
      continue;
    }
    if (existing.type === n.type) {
      mergeInto(existing, n, aliasSets);
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

  // Pass 2: exact same-type alias / label slug matches against keeper id
  // local part.
  //
  // Semantics are those of a pairwise scan: for each keeper a (in order) and
  // each later, not-yet-dropped keeper b (in order), compare a — including
  // aliases absorbed earlier in the same scan — with b. Only pairs that share
  // a slug (exact merge / cross-type clash) or a plural/acronym form (alias
  // suggestion) can produce anything, so candidates come from indexes instead
  // of an all-pairs loop, and are visited in ascending keeper order so merges,
  // keepers and review items come out in the same order as the pairwise scan.
  const keepers = [...byId.values()];
  const nKeepers = keepers.length;
  const dropped = new Uint8Array(nKeepers);
  const mergeStep = Math.max(1, Math.floor(nKeepers / 50) || 1);
  // Slug sets are computed once per keeper; only the current keeper `a` can
  // change (it absorbs aliases), and its set is updated on each merge.
  const slugs: Set<string>[] = keepers.map(nodeSlugs);
  const acronyms: Set<string>[] = slugs.map(slugAcronyms);
  // slug → ascending keeper indices with that slug (any type).
  const bySlug = new Map<string, number[]>();
  // type + acronym → ascending keeper indices with a slug of that acronym.
  const byAcronym = new Map<string, number[]>();
  for (let k = 0; k < nKeepers; k++) {
    for (const s of slugs[k]!) appendIndex(bySlug, s, k);
    const type = keepers[k]!.type;
    for (const ac of acronyms[k]!) appendIndex(byAcronym, `${type}\0${ac}`, k);
  }
  // Merged-away id → keeper id; resolved with path compression at the end.
  const absorbedBy = new Map<string, string>();
  let candidatePairs = 0;

  for (let i = 0; i < nKeepers; i++) {
    if (i === 0 || (i + 1) % mergeStep === 0 || i + 1 === nKeepers) {
      ctx.onProgress?.(
        `Normalizing: alias merge ${i + 1}/${nKeepers.toLocaleString('en-US')}…`,
      );
    }
    if (dropped[i] === 1) continue;
    const a = keepers[i]!;
    const queue = new CandidateQueue(dropped);
    const enqueued = new Set<string>();
    // Queue every later keeper that could match slug `s` of `a`.
    const enqueue = (s: string, after: number): void => {
      if (enqueued.has(s)) return;
      enqueued.add(s);
      queue.pushAfter(bySlug.get(s), after);
      if (s.length < 2) return;
      queue.pushAfter(bySlug.get(`${s}s`), after);
      if (s.endsWith('s')) queue.pushAfter(bySlug.get(s.slice(0, -1)), after);
      const ac = slugAcronym(s);
      if (ac !== null) queue.pushAfter(bySlug.get(ac), after);
      queue.pushAfter(byAcronym.get(`${a.type}\0${s}`), after);
    };
    for (const s of slugs[i]!) enqueue(s, i);

    let last = -1;
    while (queue.size > 0) {
      const j = queue.pop();
      candidatePairs += 1;
      if (j === last) continue;
      last = j;
      if (dropped[j] === 1) continue;
      const b = keepers[j]!;
      const aSlugs = slugs[i]!;
      const bSlugs = slugs[j]!;

      if (a.type !== b.type) {
        // Cross-type same label/alias slug → advisory review, no merge
        if (sharesNormalizedLabel(aSlugs, bSlugs)) {
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

      if (exactAliasMatch(aSlugs, bSlugs)) {
        // Keep first-seen (lower index)
        const labelBefore = a.label;
        const added = mergeInto(a, b, aliasSets);
        // Later keepers matching the absorbed aliases are candidates too.
        if (a.label !== labelBefore) {
          slugs[i] = nodeSlugs(a);
          acronyms[i] = slugAcronyms(slugs[i]!);
          for (const s of slugs[i]!) enqueue(s, j);
        } else {
          for (const v of added) {
            const s = slugifyLabel(v);
            aSlugs.add(s);
            const ac = s.length >= 2 ? slugAcronym(s) : null;
            if (ac !== null) acronyms[i]!.add(ac);
            enqueue(s, j);
          }
        }
        idRewrite.set(b.id, a.id);
        absorbedBy.set(b.id, a.id);
        byId.delete(b.id);
        dropped[j] = 1;
        continue;
      }

      // Near-alias (plural / acronym) — suggest-only via review queue,
      // never auto-merge (NORM-02: no fuzzy merges without a human).
      if (suggestsAliasMatch(aSlugs, bSlugs, acronyms[i]!, acronyms[j]!)) {
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

  // Chain rewrites that point at a merged-away keeper → its final keeper.
  if (absorbedBy.size > 0) {
    for (const [from, to] of idRewrite) {
      const target = resolveAbsorbed(absorbedBy, to);
      if (target !== to) idRewrite.set(from, target);
    }
  }

  return { nodes: [...byId.values()], idRewrite, candidatePairs };
}

function appendIndex(
  index: Map<string, number[]>,
  key: string,
  k: number,
): void {
  const list = index.get(key);
  if (list === undefined) index.set(key, [k]);
  else if (list[list.length - 1] !== k) list.push(k);
}

/** Find with path compression over the merged-away → keeper map. */
function resolveAbsorbed(absorbedBy: Map<string, string>, id: string): string {
  let root = id;
  let next = absorbedBy.get(root);
  while (next !== undefined) {
    root = next;
    next = absorbedBy.get(root);
  }
  let cur = id;
  while (cur !== root) {
    const parent = absorbedBy.get(cur)!;
    absorbedBy.set(cur, root);
    cur = parent;
  }
  return root;
}

/**
 * Candidate keeper indices for one keeper `a`, popped in ascending order
 * (binary min-heap; duplicates allowed, the caller skips repeats).
 *
 * Callers push with a non-decreasing `after` (the current position), so an
 * index list pushed once already covers every later push of the same list and
 * is skipped. Dropped keepers are pruned from index lists as they are scanned,
 * so a slug shared by many merged-away nodes is not rescanned for every later
 * keeper.
 */
class CandidateQueue {
  private readonly items: number[] = [];
  private readonly pushed = new Set<number[]>();

  constructor(private readonly dropped: Uint8Array) {}

  get size(): number {
    return this.items.length;
  }

  /**
   * Push every live index in the ascending `list` that is greater than
   * `after`; dropped indices in that range are removed from `list`.
   */
  pushAfter(list: number[] | undefined, after: number): void {
    if (list === undefined || this.pushed.has(list)) return;
    this.pushed.add(list);
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid]! <= after) lo = mid + 1;
      else hi = mid;
    }
    let w = lo;
    for (let k = lo; k < list.length; k++) {
      const v = list[k]!;
      if (this.dropped[v] === 1) continue;
      list[w++] = v;
      this.push(v);
    }
    list.length = w;
  }

  push(value: number): void {
    const items = this.items;
    let idx = items.length;
    items.push(value);
    while (idx > 0) {
      const parent = (idx - 1) >>> 1;
      if (items[parent]! <= value) break;
      items[idx] = items[parent]!;
      idx = parent;
    }
    items[idx] = value;
  }

  pop(): number {
    const items = this.items;
    const top = items[0]!;
    const tail = items.pop()!;
    if (items.length > 0) {
      let idx = 0;
      const n = items.length;
      for (;;) {
        const l = 2 * idx + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && items[r]! < items[l]! ? r : l;
        if (items[c]! >= tail) break;
        items[idx] = items[c]!;
        idx = c;
      }
      items[idx] = tail;
    }
    return top;
  }
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
function exactAliasMatch(
  aSlugs: ReadonlySet<string>,
  bSlugs: ReadonlySet<string>,
): boolean {
  // Iterate the smaller set: a keeper that absorbed many aliases is large.
  const [small, large] =
    aSlugs.size <= bSlugs.size ? [aSlugs, bSlugs] : [bSlugs, aSlugs];
  for (const s of small) {
    if (large.has(s)) return true;
  }
  return false;
}

function sharesNormalizedLabel(
  aSlugs: ReadonlySet<string>,
  bSlugs: ReadonlySet<string>,
): boolean {
  return exactAliasMatch(aSlugs, bSlugs);
}

/** "ledger-service" → "ls" (initials of slug words, ≥2 words only). */
function slugAcronym(slug: string): string | null {
  const words = slug.split('-').filter((w) => w.length > 0);
  if (words.length < 2) return null;
  return words.map((w) => w[0]!).join('');
}

/** Acronyms of the slugs that take part in alias suggestions (length ≥ 2). */
function slugAcronyms(slugs: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const s of slugs) {
    if (s.length < 2) continue;
    const ac = slugAcronym(s);
    if (ac !== null) out.add(ac);
  }
  return out;
}

/**
 * Conservative near-alias detection for suggest-only merges:
 * - plural: one slug is the other + trailing "s" ("service" / "services")
 * - acronym: one slug equals the initials of the other's words ("ls" / "ledger-service")
 * Only slugs of length ≥ 2 on both sides count.
 * Never used for auto-merge — only feeds entity_merge review items.
 *
 * The relation is symmetric, so this walks the smaller slug set and looks the
 * plural / singular / acronym forms up in the larger one (`*Acronyms` are
 * `slugAcronyms` of the matching slug set).
 */
function suggestsAliasMatch(
  aSlugs: ReadonlySet<string>,
  bSlugs: ReadonlySet<string>,
  aAcronyms: ReadonlySet<string>,
  bAcronyms: ReadonlySet<string>,
): boolean {
  const aSmaller = aSlugs.size <= bSlugs.size;
  const small = aSmaller ? aSlugs : bSlugs;
  const large = aSmaller ? bSlugs : aSlugs;
  const largeAcronyms = aSmaller ? bAcronyms : aAcronyms;
  for (const s of small) {
    if (s.length < 2) continue;
    // plural on the large side
    if (large.has(`${s}s`)) return true;
    // plural on the small side (the singular must keep length ≥ 2)
    if (s.length >= 3 && s.endsWith('s') && large.has(s.slice(0, -1))) {
      return true;
    }
    // small slug's initials name a large-side slug (acronyms have length ≥ 2)
    const ac = slugAcronym(s);
    if (ac !== null && large.has(ac)) return true;
    // a large-side slug's initials name the small slug
    if (largeAcronyms.has(s)) return true;
  }
  return false;
}

/**
 * Merge `drop` into `keeper`; returns the alias values offered to the keeper.
 *
 * `aliasSets` caches each keeper's alias set across merges, so a keeper that
 * absorbs many nodes appends to its alias list instead of rebuilding it each
 * time. The resulting list is the same: existing aliases (deduplicated, first
 * occurrence kept) followed by new values in the order they were offered.
 */
function mergeInto(
  keeper: GraphNode,
  drop: GraphNode,
  aliasSets: Map<GraphNode, Set<string>>,
): string[] {
  let aliasSet = aliasSets.get(keeper);
  if (aliasSet === undefined) {
    aliasSet = new Set<string>(keeper.aliases ?? []);
    keeper.aliases = [...aliasSet];
    aliasSets.set(keeper, aliasSet);
  }
  const aliases = keeper.aliases!;
  const added = [slugifyLabel(drop.label)];
  if (drop.aliases) {
    for (const a of drop.aliases) added.push(slugifyLabel(a));
  }
  for (const a of added) {
    if (aliasSet.has(a)) continue;
    aliasSet.add(a);
    aliases.push(a);
  }
  // Prefer non-empty description
  if (!keeper.description && drop.description) {
    keeper.description = drop.description;
  }
  // Prefer non-empty label if keeper empty
  if (!keeper.label && drop.label) {
    keeper.label = drop.label;
  }
  return added;
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
