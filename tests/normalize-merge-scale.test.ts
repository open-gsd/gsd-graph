// gsd-graph — alias merge pass: output parity with the pairwise scan + work bounds (#4)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const root = join(__dirname, '..');

interface Node {
  id: string;
  type: string;
  label: string;
  description?: string;
  aliases?: string[];
}

interface ReviewItem {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  updated_at: null;
  payload: Record<string, unknown>;
  decision: null;
}

interface MergeCtx {
  now: string;
  reviewItems: ReviewItem[];
  reviewSeen: Set<string>;
  onProgress?: (message: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(join(root, 'dist', 'index.js')) as {
  loadOntologyPack: (opts?: { packIdOrPath?: string }) => unknown;
  normalize: (input: {
    ontology: unknown;
    nodes: Node[];
    triples: Array<{
      id: string;
      s: string;
      p: string;
      o: string;
      confidence: string;
      provenance: Array<{
        source_path: string;
        extractor: string;
        content_hash: string;
        confidence: string;
      }>;
    }>;
    now?: string;
  }) => { nodes: Node[]; triples: Array<{ s: string; o: string }> };
  reviewItemId: (kind: string, payload: unknown) => string;
  slugifyLabel: (label: string) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeMod = require(
  join(root, 'dist', 'pipeline', 'normalize.js'),
) as {
  mergeExactSameType: (
    nodes: Node[],
    ctx: MergeCtx,
  ) => {
    nodes: Node[];
    idRewrite: Map<string, string>;
    candidatePairs: number;
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const idsMod = require(join(root, 'dist', 'pipeline', 'ids.js')) as {
  slugifyLabel: (label: string) => string;
};

const { slugifyLabel, reviewItemId } = mod;

// ---------------------------------------------------------------------------
// Reference: the pairwise O(n²) merge as it was before #4, kept verbatim so
// the indexed implementation can be checked against it.
// ---------------------------------------------------------------------------

function refPushReview(
  items: ReviewItem[],
  seen: Set<string>,
  kind: string,
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

function refCloneNode(n: Node): Node {
  const out: Node = { id: n.id, type: n.type, label: n.label };
  if (n.description !== undefined) out.description = n.description;
  if (n.aliases !== undefined) out.aliases = [...n.aliases];
  return out;
}

function refLocalPart(id: string): string {
  const idx = id.indexOf(':');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function refNodeSlugs(n: Node): Set<string> {
  const s = new Set<string>();
  s.add(slugifyLabel(n.label));
  s.add(refLocalPart(n.id));
  if (n.aliases) {
    for (const a of n.aliases) s.add(slugifyLabel(a));
  }
  return s;
}

function refExactAliasMatch(a: Node, b: Node): boolean {
  const aSlugs = refNodeSlugs(a);
  const bSlugs = refNodeSlugs(b);
  for (const s of aSlugs) {
    if (bSlugs.has(s)) return true;
  }
  return false;
}

function refSlugAcronym(slug: string): string | null {
  const words = slug.split('-').filter((w) => w.length > 0);
  if (words.length < 2) return null;
  return words.map((w) => w[0]!).join('');
}

function refSuggestsAliasMatch(a: Node, b: Node): boolean {
  const aSlugs = refNodeSlugs(a);
  const bSlugs = refNodeSlugs(b);
  for (const sa of aSlugs) {
    for (const sb of bSlugs) {
      if (sa.length < 2 || sb.length < 2) continue;
      if (sa === `${sb}s` || sb === `${sa}s`) return true;
      const acA = refSlugAcronym(sa);
      const acB = refSlugAcronym(sb);
      if (acA !== null && acA === sb) return true;
      if (acB !== null && acB === sa) return true;
    }
  }
  return false;
}

function refMergeInto(keeper: Node, drop: Node): void {
  const aliasSet = new Set<string>(keeper.aliases ?? []);
  aliasSet.add(slugifyLabel(drop.label));
  if (drop.aliases) {
    for (const a of drop.aliases) aliasSet.add(slugifyLabel(a));
  }
  if (!keeper.description && drop.description) {
    keeper.description = drop.description;
  }
  if (!keeper.label && drop.label) {
    keeper.label = drop.label;
  }
  keeper.aliases = [...aliasSet];
}

function referenceMergeExactSameType(
  nodes: Node[],
  ctx: MergeCtx,
): { nodes: Node[]; idRewrite: Map<string, string> } {
  const idRewrite = new Map<string, string>();
  const byId = new Map<string, Node>();

  for (const n of nodes) {
    const existing = byId.get(n.id);
    if (!existing) {
      byId.set(n.id, refCloneNode(n));
      continue;
    }
    if (existing.type === n.type) {
      refMergeInto(existing, n);
      idRewrite.set(n.id, existing.id);
    } else {
      refPushReview(
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
      let suffix = 2;
      let alt = `${n.id}-${suffix}`;
      while (byId.has(alt)) {
        suffix += 1;
        alt = `${n.id}-${suffix}`;
      }
      const copy = refCloneNode({ ...n, id: alt });
      byId.set(alt, copy);
      idRewrite.set(n.id, alt);
    }
  }

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
        if (refExactAliasMatch(a, b)) {
          refPushReview(
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

      if (refExactAliasMatch(a, b)) {
        refMergeInto(a, b);
        idRewrite.set(b.id, a.id);
        for (const [from, to] of idRewrite) {
          if (to === b.id) idRewrite.set(from, a.id);
        }
        byId.delete(b.id);
        dropped.add(b.id);
        continue;
      }

      if (refSuggestsAliasMatch(a, b)) {
        refPushReview(
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

// ---------------------------------------------------------------------------
// Seeded synthetic corpus: colliding labels across and within types, explicit
// and duplicate ids, acronym/plural aliases, empty and punctuation-only labels.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticNodes(
  n: number,
  opts: { seed: number; vocab: number; unicode: boolean },
): Node[] {
  const rnd = mulberry32(opts.seed);
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.floor(rnd() * arr.length)]!;
  const types = ['Concept', 'Decision', 'Person', 'Topic'];
  // Unicode set includes letters NFKC/lowercase rewrite (ß, İ, the ﬁ ligature).
  const letters = opts.unicode
    ? 'abcdefghijklmnopqrstuvwxyzéßİﬁ1'
    : 'abcdefghijklmnop';
  const words: string[] = [];
  for (let w = 0; w < opts.vocab; w++) {
    const len = 1 + Math.floor(rnd() * 4);
    let word = '';
    for (let q = 0; q < len; q++) word += pick([...letters]);
    if (rnd() < 0.15) word += 's';
    words.push(word);
  }
  const label = (): string => {
    const r = rnd();
    if (r < 0.01) return '';
    if (r < 0.015) return '!!!';
    const k = 1 + Math.floor(rnd() * 3);
    const parts: string[] = [];
    for (let i = 0; i < k; i++) parts.push(pick(words));
    let l = parts.join(rnd() < 0.5 ? ' ' : '-');
    if (rnd() < 0.3) l = l.toUpperCase();
    if (rnd() < 0.05) l = `${l}s`;
    return l;
  };
  const nodes: Node[] = [];
  for (let k = 0; k < n; k++) {
    const type = pick(types);
    const lab = label();
    const r = rnd();
    let id: string;
    if (r < 0.6) id = `${type.toLowerCase()}:${slugifyLabel(lab)}`;
    else if (r < 0.8) id = `${type.toLowerCase()}:${slugifyLabel(label())}`;
    else if (r < 0.95) id = nodes.length > 0 ? pick(nodes).id : `x:${k}`;
    else id = slugifyLabel(label());
    const node: Node = { id, type, label: lab };
    const nAliases = Math.floor(rnd() * 3);
    if (nAliases > 0) {
      const s = slugifyLabel(lab);
      const aliases: string[] = [];
      for (let q = 0; q < nAliases; q++) {
        const ar = rnd();
        if (ar < 0.3) aliases.push(s.split('-').map((w) => w[0]).join(''));
        else if (ar < 0.5) aliases.push(`${s}s`);
        else if (ar < 0.6) aliases.push(s.endsWith('s') ? s.slice(0, -1) : s);
        else aliases.push(label());
      }
      node.aliases = aliases;
    }
    if (rnd() < 0.3) node.description = `d${k}`;
    nodes.push(node);
  }
  return nodes;
}

function runMerge(
  impl: (nodes: Node[], ctx: MergeCtx) => {
    nodes: Node[];
    idRewrite: Map<string, string>;
  },
  nodes: Node[],
) {
  const ctx: MergeCtx = {
    now: '2026-10-25T00:00:00.000Z',
    reviewItems: [],
    reviewSeen: new Set<string>(),
    onProgress: (m) => progress.push(m),
  };
  const progress: string[] = [];
  const out = impl(structuredClone(nodes), ctx);
  return {
    nodes: out.nodes,
    idRewrite: [...out.idRewrite.entries()],
    reviewItems: ctx.reviewItems,
    progress,
  };
}

function countAliases(nodes: readonly Node[]): number {
  return nodes.reduce((sum, n) => sum + (n.aliases?.length ?? 0), 0);
}

describe('alias merge pass matches the pairwise scan (#4)', () => {
  const cases = [
    { n: 3000, seed: 1, vocab: 400, unicode: false },
    { n: 2000, seed: 2, vocab: 60, unicode: true },
    { n: 1500, seed: 3, vocab: 15, unicode: false },
  ];
  for (const c of cases) {
    const name = `n=${c.n}, vocab=${c.vocab}${c.unicode ? ', unicode' : ''}`;
    it(`same merges, keepers, rewrites and review items (${name})`, () => {
      const nodes = syntheticNodes(c.n, c);
      const expected = runMerge(referenceMergeExactSameType, nodes);
      const actual = runMerge(normalizeMod.mergeExactSameType, nodes);

      // The corpus must exercise every branch, or equality proves little.
      const reasons = new Set(
        expected.reviewItems.map((r) => r.payload.reason as string),
      );
      for (const reason of [
        'cross_type_id_collision',
        'cross_type_label_clash',
        'alias_suggestion',
      ]) {
        assert.ok(reasons.has(reason), `corpus produces ${reason}`);
      }
      assert.ok(expected.nodes.length < c.n / 1.2, 'corpus produces merges');

      assert.deepStrictEqual(actual, expected);
    });
  }

  it('merges transitively through absorbed aliases and rewrites triples', () => {
    const out = mod.normalize({
      ontology: mod.loadOntologyPack({ packIdOrPath: 'general' }),
      nodes: [
        { id: 'concept:ledger', type: 'Concept', label: 'Ledger' },
        {
          id: 'concept:books',
          type: 'Concept',
          label: 'Books',
          aliases: ['Ledger'],
        },
        // Same id → pass-1 merge into concept:books (rewrite books → books)
        { id: 'concept:books', type: 'Concept', label: 'Book keeping' },
        // Matches only via an alias concept:ledger absorbs from concept:books
        {
          id: 'concept:accounts',
          type: 'Concept',
          label: 'Accounts',
          aliases: ['book-keeping'],
        },
      ],
      triples: [
        {
          id: 't_placeholder',
          s: 'concept:books',
          p: 'related_to',
          o: 'concept:accounts',
          confidence: 'EXTRACTED',
          provenance: [
            {
              source_path: 'a.md',
              extractor: 'test',
              content_hash: 'sha256:aaaa',
              confidence: 'EXTRACTED',
            },
          ],
        },
      ],
      now: '2026-10-25T00:00:00.000Z',
    });
    assert.deepEqual(
      out.nodes.map((n) => n.id),
      ['concept:ledger'],
    );
    assert.equal(out.triples.length, 1);
    assert.equal(out.triples[0]!.s, 'concept:ledger');
    assert.equal(out.triples[0]!.o, 'concept:ledger');
  });
});

describe('alias merge pass work is linear in input + output (#4)', () => {
  function measure(n: number) {
    const nodes = syntheticNodes(n, {
      seed: 11,
      vocab: Math.floor(n / 2),
      unicode: true,
    });
    const original = idsMod.slugifyLabel;
    let slugCalls = 0;
    idsMod.slugifyLabel = (label: string) => {
      slugCalls += 1;
      return original(label);
    };
    try {
      const reviewItems: ReviewItem[] = [];
      const out = normalizeMod.mergeExactSameType(structuredClone(nodes), {
        now: '2026-10-25T00:00:00.000Z',
        reviewItems,
        reviewSeen: new Set<string>(),
      });
      const merges = nodes.length - out.nodes.length;
      return {
        slugCalls,
        candidatePairs: out.candidatePairs,
        input: nodes.length + countAliases(nodes),
        output: merges + reviewItems.length,
        keepers: out.nodes.length + merges,
      };
    } finally {
      idsMod.slugifyLabel = original;
    }
  }

  for (const n of [4000, 16000]) {
    it(`bounds slugifyLabel calls and candidate pairs (n=${n})`, () => {
      const m = measure(n);
      // Guard against a patch that silently stopped counting.
      assert.ok(m.slugCalls >= n, `counted slugifyLabel calls (n=${n})`);
      // Slug work depends on the input only: each label/alias is slugged a
      // small constant number of times (the pairwise scan: per pair).
      assert.ok(
        m.slugCalls <= 4 * m.input,
        `slugifyLabel calls ${m.slugCalls} ≤ 4·${m.input}`,
      );
      // Every visited pair is either output (merge / review item) or one of a
      // bounded number of near-misses per slug.
      assert.ok(
        m.candidatePairs <= 4 * (m.input + m.output),
        `candidate pairs ${m.candidatePairs} ≤ 4·(${m.input} + ${m.output})`,
      );
      const allPairs = (m.keepers * (m.keepers - 1)) / 2;
      assert.ok(
        m.candidatePairs < allPairs / 100,
        `candidate pairs ${m.candidatePairs} ≪ all pairs ${allPairs}`,
      );
    });
  }
});
