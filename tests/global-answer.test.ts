// gsd-graph — global (community theme) answer fallback tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  answer: (opts: {
    question: string;
    graph: object;
    global?: boolean;
  }) => {
    mode: string;
    abstained: boolean;
    answer_markdown: string;
    pack: { triples: Array<{ id: string }>; citations: Array<{ triple_id: string }> };
  };
  OVERVIEW_QUESTION_RE: RegExp;
};

/** Two 4-cliques joined by nothing — two clear communities. */
function twoCliqueGraph(): object {
  const nodes: Array<{ id: string; type: string; label: string }> = [];
  const triples: Array<object> = [];
  let t = 0;
  const clique = (prefix: string): void => {
    const ids = [0, 1, 2, 3].map((i) => `Concept:${prefix}-${i}`);
    for (const [i, id] of ids.entries()) {
      nodes.push({ id, type: 'Concept', label: `${prefix} ${i}` });
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        triples.push({
          id: `t_${(t++).toString(16).padStart(16, '0')}`,
          s: ids[i],
          p: 'related_to',
          o: ids[j],
          confidence: 'EXTRACTED',
          provenance: [
            {
              source_path: `${prefix}.md`,
              extractor: 'markdown',
              content_hash: 'h',
              confidence: 'EXTRACTED',
              span: { start_line: i + 1, end_line: i + 1 },
            },
          ],
        });
      }
    }
  };
  clique('auth');
  clique('billing');
  return {
    schema_version: 1,
    engine: 'gsd-graph',
    engine_version: '0.0.0',
    ontology_pack_id: 'general',
    ontology_version: '1',
    built_at: '2026-01-01T00:00:00.000Z',
    nodes,
    triples,
  };
}

describe('OVERVIEW_QUESTION_RE', () => {
  it('matches the brownfield opening questions', () => {
    for (const q of [
      'what are the main areas of this project?',
      'give me an overview',
      'what is this codebase about?',
      'high-level architecture?',
      'what are the key themes?',
    ]) {
      assert.ok(mod.OVERVIEW_QUESTION_RE.test(q), q);
    }
    assert.ok(!mod.OVERVIEW_QUESTION_RE.test('why is phase 4 blocked?'));
  });
});

describe('global answer fallback', () => {
  it('overview question that packs empty answers from communities', () => {
    const ans = mod.answer({
      question: 'what are the main areas of this project?',
      graph: twoCliqueGraph(),
    });
    assert.equal(ans.mode, 'global');
    assert.equal(ans.abstained, false);
    assert.match(ans.answer_markdown, /## Themes/);
    assert.match(ans.answer_markdown, /## Citations/);
    // Citations ⊆ pack triples (grounding discipline holds in global mode)
    const tripleIds = new Set(ans.pack.triples.map((t) => t.id));
    for (const c of ans.pack.citations) {
      assert.ok(tripleIds.has(c.triple_id));
    }
  });

  it('non-overview question that packs empty still abstains', () => {
    const ans = mod.answer({
      question: 'why is zzzznonexistent blocked?',
      graph: twoCliqueGraph(),
    });
    assert.equal(ans.mode, 'abstain');
    assert.equal(ans.abstained, true);
  });

  it('global: true forces theme answer even when seeds would match', () => {
    const ans = mod.answer({
      question: 'auth 0?',
      graph: twoCliqueGraph(),
      global: true,
    });
    assert.equal(ans.mode, 'global');
    assert.match(ans.answer_markdown, /## Themes/);
  });
});
