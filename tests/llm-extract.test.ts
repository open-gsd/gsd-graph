// gsd-graph — LLM extraction wiring: http/prompt modes, merge, batch review
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  init: (opts: { cwd?: string; dir?: string; ontology?: string }) => {
    ontology: string;
  };
  build: (opts: {
    corpus: string | string[];
    dir?: string;
    full?: boolean;
    ontology?: string;
  }) => { node_count: number; triple_count: number; review_pending: number };
  mergeCandidates: (opts: {
    dir?: string;
    nodes: unknown[];
    triples: unknown[];
  }) => {
    node_count: number;
    triple_count: number;
    review_pending: number;
    candidate_triples: number;
  };
  loadGraphV1: (storeRoot: string) => {
    triples: Array<{
      s: string;
      p: string;
      o: string;
      confidence: string;
      provenance: Array<{ extractor: string; confidence: string }>;
    }>;
    ontology_pack_id: string;
  };
  loadReviewQueue: (storeRoot: string) => {
    items: Array<{ id: string; kind: string; status: string }>;
  };
  reviewResolveBatch: (opts: {
    storeRoot: string;
    action: 'accept' | 'reject';
    all?: boolean;
    kind?: string;
    predicate?: string;
    extendOntology?: boolean;
  }) => { resolved: string[]; skipped: Array<{ id: string; reason: string }> };
  collectLlmSources: (corpus: string | string[]) => {
    files: Array<{ source_path: string; content: string; content_hash: string }>;
    skipped: Array<{ path: string; reason: string }>;
  };
  sanitizeExtractCandidates: (
    result: { nodes?: unknown[]; triples?: unknown[] },
    opts: { extractorTag: string; sourcePath?: string; contentHash?: string },
  ) => {
    nodes: unknown[];
    triples: Array<{
      confidence: string;
      provenance: Array<{ extractor: string; confidence: string }>;
    }>;
  };
  llmExtractHttp: (
    files: Array<{ source_path: string; content: string; content_hash: string }>,
    opts: {
      baseUrl: string;
      model: string;
      provider?: 'openai' | 'anthropic';
      apiKeyEnv?: string;
      allowedTypes: string[];
      allowedPredicates: string[];
      fetchImpl?: unknown;
      env?: Record<string, string>;
    },
  ) => Promise<{
    nodes: unknown[];
    triples: unknown[];
    sources_extracted: number;
    failures: Array<{ path: string; reason: string }>;
  }>;
  writeExtractPromptRequest: (opts: {
    dir?: string;
    cwd?: string;
    corpus: string | string[];
    allowedTypes: string[];
    allowedPredicates: string[];
  }) => { request: { path: string }; sources: number };
  httpChatCompletion: (opts: {
    baseUrl: string;
    model: string;
    provider?: 'openai' | 'anthropic';
    apiKeyEnv?: string;
    messages: Array<{ role: string; content: string }>;
    fetchImpl?: unknown;
    env?: Record<string, string>;
  }) => Promise<{ content: string }>;
  defaultApiKeyEnv: (provider: 'openai' | 'anthropic') => string;
  nodeId: (type: string, label: string) => string;
  tripleId: (s: string, p: string, o: string) => string;
};

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function candidateTriple(
  s: string,
  p: string,
  o: string,
  sourcePath = '/tmp/doc.md',
): object {
  return {
    id: mod.tripleId(s, p, o),
    s,
    p,
    o,
    confidence: 'EXTRACTED', // deliberately wrong — sanitize must clamp
    provenance: [
      {
        source_path: sourcePath,
        extractor: 'whatever',
        content_hash: 'sha256:x',
        confidence: 'EXTRACTED',
      },
    ],
  };
}

describe('sanitizeExtractCandidates (D-02 honesty clamp)', () => {
  it('forces INFERRED confidence and llm extractor tag', () => {
    const out = mod.sanitizeExtractCandidates(
      {
        nodes: [{ id: 'Concept:a', type: 'Concept', label: 'A' }],
        triples: [candidateTriple('Concept:a', 'depends_on', 'Concept:b')],
      },
      { extractorTag: 'llm/http' },
    );
    assert.equal(out.triples.length, 1);
    assert.equal(out.triples[0]!.confidence, 'INFERRED');
    for (const e of out.triples[0]!.provenance) {
      assert.equal(e.confidence, 'INFERRED');
      assert.equal(e.extractor, 'llm/http');
    }
  });

  it('synthesizes provenance when the result omitted it', () => {
    const bare = candidateTriple('Concept:a', 'causes', 'Concept:b') as {
      provenance: unknown[];
    };
    bare.provenance = [];
    const out = mod.sanitizeExtractCandidates(
      { nodes: [], triples: [bare as never] },
      { extractorTag: 'llm/prompt', sourcePath: '/x/doc.md' },
    );
    assert.equal(out.triples[0]!.provenance.length, 1);
    assert.equal(out.triples[0]!.provenance[0]!.extractor, 'llm/prompt');
  });
});

describe('mergeCandidates (LLM merge path)', () => {
  it('merges INFERRED candidates through normalize + ontology gate', () => {
    const cwd = makeTmpDir('gsd-graph-llm-merge-');
    const dir = path.join(cwd, 'store');
    const corpus = path.join(cwd, 'docs');
    fs.mkdirSync(corpus, { recursive: true });
    fs.writeFileSync(
      path.join(corpus, 'a.md'),
      '# Alpha\n\nAlpha --causes--> Beta\n',
    );
    mod.init({ cwd, dir });
    mod.build({ corpus, dir, full: true });

    const sanitized = mod.sanitizeExtractCandidates(
      {
        nodes: [
          { id: mod.nodeId('Concept', 'Beta'), type: 'Concept', label: 'Beta' },
          {
            id: mod.nodeId('Concept', 'Gamma'),
            type: 'Concept',
            label: 'Gamma',
          },
        ],
        triples: [
          candidateTriple(
            mod.nodeId('Concept', 'Beta'),
            'causes',
            mod.nodeId('Concept', 'Gamma'),
          ),
        ],
      },
      { extractorTag: 'llm/http' },
    );

    const merged = mod.mergeCandidates({
      dir,
      nodes: sanitized.nodes,
      triples: sanitized.triples as unknown[],
    });
    assert.equal(merged.candidate_triples, 1);

    const graph = mod.loadGraphV1(dir);
    const llmTriple = graph.triples.find(
      (t) => t.p === 'causes' && t.o === mod.nodeId('Concept', 'Gamma'),
    );
    assert.ok(llmTriple, 'LLM candidate written to store');
    assert.equal(llmTriple!.confidence, 'INFERRED');
    // Deterministic triple untouched
    const detTriple = graph.triples.find(
      (t) => t.s === mod.nodeId('Concept', 'Alpha') && t.p === 'causes',
    );
    assert.ok(detTriple);
    assert.equal(detTriple!.confidence, 'EXTRACTED');
  });

  it('unknown predicates from LLM output still go to review, not the graph', () => {
    const cwd = makeTmpDir('gsd-graph-llm-review-');
    const dir = path.join(cwd, 'store');
    mod.init({ cwd, dir });

    const sanitized = mod.sanitizeExtractCandidates(
      {
        nodes: [
          { id: 'Concept:a', type: 'Concept', label: 'A' },
          { id: 'Concept:b', type: 'Concept', label: 'B' },
        ],
        triples: [candidateTriple('Concept:a', 'totally_invented', 'Concept:b')],
      },
      { extractorTag: 'llm/http' },
    );
    const merged = mod.mergeCandidates({
      dir,
      nodes: sanitized.nodes,
      triples: sanitized.triples as unknown[],
    });
    assert.equal(merged.triple_count, 0);
    assert.equal(merged.review_pending, 1);
  });
});

describe('reviewResolveBatch', () => {
  function storeWithPending(): string {
    const cwd = makeTmpDir('gsd-graph-batch-');
    const dir = path.join(cwd, 'store');
    mod.init({ cwd, dir });
    const mk = (p: string, o: string) =>
      mod.sanitizeExtractCandidates(
        {
          nodes: [
            { id: 'Concept:a', type: 'Concept', label: 'A' },
            { id: `Concept:${o}`, type: 'Concept', label: o },
          ],
          triples: [candidateTriple('Concept:a', p, `Concept:${o}`)],
        },
        { extractorTag: 'llm/http' },
      );
    const c1 = mk('blocked_by', 'b');
    const c2 = mk('blocked_by', 'c');
    const c3 = mk('invented_p', 'd');
    mod.mergeCandidates({
      dir,
      nodes: [...c1.nodes, ...c2.nodes, ...c3.nodes],
      triples: [
        ...(c1.triples as unknown[]),
        ...(c2.triples as unknown[]),
        ...(c3.triples as unknown[]),
      ],
    });
    return dir;
  }

  it('accepts by predicate filter with --extend-ontology semantics', () => {
    const dir = storeWithPending();
    const before = mod.loadReviewQueue(dir);
    assert.equal(
      before.items.filter((i) => i.status === 'pending').length,
      3,
    );

    const result = mod.reviewResolveBatch({
      storeRoot: dir,
      action: 'accept',
      predicate: 'blocked_by',
      extendOntology: true,
    });
    assert.equal(result.resolved.length, 2);
    assert.equal(result.skipped.length, 0);

    const graph = mod.loadGraphV1(dir);
    assert.equal(
      graph.triples.filter((t) => t.p === 'blocked_by').length,
      2,
    );
    const after = mod.loadReviewQueue(dir);
    assert.equal(after.items.filter((i) => i.status === 'pending').length, 1);
  });

  it('rejects everything pending with --all', () => {
    const dir = storeWithPending();
    const result = mod.reviewResolveBatch({
      storeRoot: dir,
      action: 'reject',
      all: true,
    });
    assert.equal(result.resolved.length, 3);
    const after = mod.loadReviewQueue(dir);
    assert.equal(after.items.filter((i) => i.status === 'pending').length, 0);
  });

  it('returns empty when no filters and no ids given (guard rail)', () => {
    const dir = storeWithPending();
    const result = mod.reviewResolveBatch({
      storeRoot: dir,
      action: 'accept',
    });
    assert.equal(result.resolved.length, 0);
  });
});

describe('llmExtractHttp with injected fetch', () => {
  const files = [
    {
      source_path: '/x/notes.md',
      content: 'PayFlow depends on the Ledger service.',
      content_hash: 'sha256:notes',
    },
  ];
  const extractResult = {
    nodes: [
      { id: 'Concept:payflow', type: 'Concept', label: 'PayFlow' },
      { id: 'Concept:ledger', type: 'Concept', label: 'Ledger' },
    ],
    triples: [
      {
        id: 't_x',
        s: 'Concept:payflow',
        p: 'causes',
        o: 'Concept:ledger',
        confidence: 'INFERRED',
        provenance: [
          {
            source_path: '/x/notes.md',
            extractor: 'llm/http',
            content_hash: 'sha256:notes',
            confidence: 'INFERRED',
          },
        ],
      },
    ],
  };

  it('openai wire shape: /v1/chat/completions + Bearer key', async () => {
    let seenUrl = '';
    let seenAuth = '';
    const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
      seenUrl = url;
      seenAuth = init.headers.authorization ?? '';
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(extractResult) } }],
        }),
      };
    };
    const out = await mod.llmExtractHttp(files, {
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      apiKeyEnv: 'TEST_OPENAI_KEY',
      allowedTypes: ['Concept'],
      allowedPredicates: ['causes'],
      fetchImpl,
      env: { TEST_OPENAI_KEY: 'sk-test' },
    });
    assert.equal(seenUrl, 'https://api.openai.com/v1/chat/completions');
    assert.equal(seenAuth, 'Bearer sk-test');
    assert.equal(out.sources_extracted, 1);
    assert.equal(out.triples.length, 1);
    assert.equal(out.failures.length, 0);
  });

  it('anthropic wire shape: /v1/messages + x-api-key + content blocks', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    let seenBody: Record<string, unknown> = {};
    const fetchImpl = async (
      url: string,
      init: { headers: Record<string, string>; body: string },
    ) => {
      seenUrl = url;
      seenHeaders = init.headers;
      seenBody = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify(extractResult) }],
        }),
      };
    };
    const out = await mod.llmExtractHttp(files, {
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-5',
      provider: 'anthropic',
      allowedTypes: ['Concept'],
      allowedPredicates: ['causes'],
      fetchImpl,
      env: { ANTHROPIC_API_KEY: 'sk-ant-test' },
    });
    assert.equal(seenUrl, 'https://api.anthropic.com/v1/messages');
    assert.equal(seenHeaders['x-api-key'], 'sk-ant-test');
    assert.equal(seenHeaders['anthropic-version'], '2023-06-01');
    assert.ok(typeof seenBody.system === 'string');
    assert.ok(Array.isArray(seenBody.messages));
    assert.equal(
      (seenBody.messages as Array<{ role: string }>).every(
        (m) => m.role !== 'system',
      ),
      true,
    );
    assert.equal(out.sources_extracted, 1);
    assert.equal(out.triples.length, 1);
  });

  it('per-source failures are recorded, run continues', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    const out = await mod.llmExtractHttp(files, {
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      apiKeyEnv: 'TEST_OPENAI_KEY',
      allowedTypes: ['Concept'],
      allowedPredicates: ['causes'],
      fetchImpl,
      env: { TEST_OPENAI_KEY: 'sk-test' },
    });
    assert.equal(out.sources_extracted, 0);
    assert.equal(out.failures.length, 1);
    assert.match(out.failures[0]!.reason, /500/);
  });

  it('defaultApiKeyEnv maps providers', () => {
    assert.equal(mod.defaultApiKeyEnv('openai'), 'OPENAI_API_KEY');
    assert.equal(mod.defaultApiKeyEnv('anthropic'), 'ANTHROPIC_API_KEY');
  });
});

describe('writeExtractPromptRequest (prompt mode)', () => {
  it('bundles corpus contents + allowlists into .prompt-extract.json', () => {
    const cwd = makeTmpDir('gsd-graph-llm-prompt-');
    const dir = path.join(cwd, 'store');
    const corpus = path.join(cwd, 'docs');
    fs.mkdirSync(corpus, { recursive: true });
    fs.writeFileSync(
      path.join(corpus, 'notes.md'),
      'PayFlow depends on the Ledger service.\n',
    );
    mod.init({ cwd, dir });

    const out = mod.writeExtractPromptRequest({
      dir,
      corpus,
      allowedTypes: ['Concept'],
      allowedPredicates: ['depends_on'],
    });
    assert.equal(out.sources, 1);
    assert.ok(fs.existsSync(out.request.path));
    const envelope = JSON.parse(fs.readFileSync(out.request.path, 'utf8')) as {
      stage: string;
      payload: {
        files: Array<{ source_path: string; content: string }>;
        instructions: string;
      };
    };
    assert.equal(envelope.stage, 'extract');
    assert.equal(envelope.payload.files.length, 1);
    assert.match(envelope.payload.instructions, /depends_on/);
  });
});
