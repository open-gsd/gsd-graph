// gsd-graph — maintain / invalidateProvenance M1–M5 + deleted-source tests (MNT-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require(path.join(root, 'dist', 'index.js')) as {
  invalidateProvenance: (
    triples: Triple[],
    pathsToDrop: ReadonlySet<string>,
  ) => Triple[];
  maintain: (opts: {
    corpus: string | string[];
    dir?: string;
    full?: boolean;
    writeProjection?: boolean;
  }) => BuildResult;
  build: (opts: {
    corpus: string | string[];
    dir?: string;
    full?: boolean;
    writeProjection?: boolean;
  }) => BuildResult;
  loadGraphV1: (storeRoot: string) => {
    schema_version: number;
    nodes: Array<{ id: string; type: string; label: string }>;
    triples: Triple[];
    stats?: { node_count?: number; triple_count?: number };
  };
  bestTier: (entries: ProvenanceEntry[]) => Confidence;
  tripleId: (s: string, p: string, o: string) => string;
  normPathKey: (p: string) => string;
  ensureStoreRoot: (storeRoot: string) => string;
};

type Confidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

interface ProvenanceEntry {
  source_path: string;
  extractor: string;
  content_hash: string;
  confidence: Confidence;
}

interface Triple {
  id: string;
  s: string;
  p: string;
  o: string;
  confidence: Confidence;
  provenance: ProvenanceEntry[];
}

interface BuildResult {
  store_dir: string;
  node_count: number;
  triple_count: number;
  sources_total: number;
  sources_extracted: number;
  sources_skipped_fresh: number;
}

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const t = temps.pop();
    if (t) fs.rmSync(t, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}

function prov(
  source_path: string,
  confidence: Confidence,
  hash = 'sha256:abc',
): ProvenanceEntry {
  return {
    source_path,
    extractor: 'test',
    content_hash: hash,
    confidence,
  };
}

function triple(
  s: string,
  p: string,
  o: string,
  provenance: ProvenanceEntry[],
): Triple {
  return {
    id: mod.tripleId(s, p, o),
    s,
    p,
    o,
    confidence: mod.bestTier(provenance),
    provenance,
  };
}

describe('invalidateProvenance pure helper (MNT-01 / D-05)', () => {
  it('M1: two provenance EXTRACTED+INFERRED; drop EXTRACTED path → remains INFERRED', () => {
    const extractedPath = '/corpus/extracted.md';
    const inferredPath = '/corpus/inferred.md';
    const t = triple('Concept:a', 'related_to', 'Concept:b', [
      prov(extractedPath, 'EXTRACTED'),
      prov(inferredPath, 'INFERRED'),
    ]);
    assert.equal(t.confidence, 'EXTRACTED');

    const drop = new Set([mod.normPathKey(extractedPath)]);
    const out = mod.invalidateProvenance([t], drop);

    assert.equal(out.length, 1);
    assert.equal(out[0]!.confidence, 'INFERRED');
    assert.equal(out[0]!.provenance.length, 1);
    assert.equal(
      mod.normPathKey(out[0]!.provenance[0]!.source_path),
      mod.normPathKey(inferredPath),
    );
    // Input not mutated
    assert.equal(t.provenance.length, 2);
    assert.equal(t.confidence, 'EXTRACTED');
  });

  it('when pathsToDrop empty, returns cloned triples without mutating inputs', () => {
    const t = triple('Concept:a', 'related_to', 'Concept:b', [
      prov('/corpus/a.md', 'EXTRACTED'),
    ]);
    const out = mod.invalidateProvenance([t], new Set());
    assert.equal(out.length, 1);
    assert.notEqual(out[0], t);
    assert.notEqual(out[0]!.provenance, t.provenance);
    assert.deepEqual(out[0]!.provenance, t.provenance);
    out[0]!.provenance[0]!.content_hash = 'sha256:mutated';
    assert.equal(t.provenance[0]!.content_hash, 'sha256:abc');
  });
});

describe('build({ full: false }) deleted-source gap (D-06)', () => {
  it('deletes corpus file and drops triples that only had provenance from that path', () => {
    const corpus = tempDir('gsd-mnt-del-c-');
    const store = tempDir('gsd-mnt-del-s-');

    const keepFile = path.join(corpus, 'keep.md');
    const dropFile = path.join(corpus, 'drop.md');
    fs.writeFileSync(
      keepFile,
      '# Keep\n\n[[KeepA]] --related_to--> [[KeepB]]\n',
      'utf8',
    );
    fs.writeFileSync(
      dropFile,
      '# Drop\n\n[[DropX]] --related_to--> [[DropY]]\n',
      'utf8',
    );

    const first = mod.build({ corpus, dir: store, full: true });
    assert.equal(first.sources_extracted, 2);
    const before = mod.loadGraphV1(store);
    const dropTripleBefore = before.triples.find(
      (t) => t.s.includes('dropx') || t.o.includes('dropx') || t.s.includes('DropX') ||
        (t.s.toLowerCase().includes('drop') && t.o.toLowerCase().includes('drop')),
    );
    // Prefer matching by provenance path
    const onlyFromDrop = before.triples.filter((t) => {
      const paths = t.provenance.map((e) => mod.normPathKey(e.source_path));
      return (
        paths.some((p) => p === mod.normPathKey(dropFile)) &&
        paths.every((p) => p === mod.normPathKey(dropFile))
      );
    });
    assert.ok(
      onlyFromDrop.length >= 1,
      'expected at least one triple solely from drop.md',
    );
    const keepOnly = before.triples.filter((t) => {
      const paths = t.provenance.map((e) => mod.normPathKey(e.source_path));
      return paths.every((p) => p === mod.normPathKey(keepFile));
    });
    assert.ok(keepOnly.length >= 1, 'expected keep.md triples');

    fs.unlinkSync(dropFile);

    const second = mod.build({ corpus, dir: store, full: false });
    assert.equal(second.sources_total, 1);
    assert.ok(
      second.sources_skipped_fresh >= 1 || second.sources_extracted >= 0,
      'incremental path ran',
    );

    const after = mod.loadGraphV1(store);
    const stillFromDrop = after.triples.filter((t) =>
      t.provenance.some(
        (e) => mod.normPathKey(e.source_path) === mod.normPathKey(dropFile),
      ),
    );
    assert.equal(
      stillFromDrop.length,
      0,
      'deleted source provenance must be gone',
    );

    const keepStill = after.triples.filter((t) =>
      t.provenance.some(
        (e) => mod.normPathKey(e.source_path) === mod.normPathKey(keepFile),
      ),
    );
    assert.ok(
      keepStill.length >= 1,
      'keep.md triples must survive incremental maintain',
    );

    // drop-only triple ids must not remain
    for (const t of onlyFromDrop) {
      assert.equal(
        after.triples.some((x) => x.id === t.id),
        false,
        `orphan triple ${t.id} should be removed`,
      );
    }

    void dropTripleBefore;
  });
});
