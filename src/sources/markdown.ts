// gsd-graph — deterministic Markdown/text extract (EXT-01)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * OQ-1 MD edge grammar (locked):
 *  1. Wiki: [[Label]] → Concept + mentions EXTRACTED (from Document when set)
 *  2. MD link: [label](url-or-path) → mentions EXTRACTED (path not fetched)
 *  3. Heading: /^#{1,2}\s+(.+)$/ → Document + Topic + Document--about-->Topic EXTRACTED
 *  4. Edge line (primary family):
 *       [[A]] --predicate--> [[B]]
 *       Subject --predicate--> Object
 *       Subject -predicate-> Object
 *     predicate must match /^[a-z][a-z0-9_]*$/ (policy later)
 *  5. Definition-ish: /^([^:\n]{1,80})\s*:\s+(.+)$/ → Concept description only (no causes)
 *  6. Tags: #topic-token on token boundary → Topic + mentions EXTRACTED
 *  Free prose alone does NOT emit typed causation edges (D-01 honesty).
 */

import type {
  ExtractResult,
  GraphNode,
  ProvenanceEntry,
  Triple,
} from '../types';
import { nodeId, tripleId } from '../pipeline/ids';
import { redactSecrets } from './redact';

const PREDICATE_RE = /^[a-z][a-z0-9_]*$/;

/** Primary: [[A]] --predicate--> [[B]] */
const EDGE_WIKI_RE =
  /\[\[([^\]]+)\]\]\s*--([a-z][a-z0-9_]*)-->\s*\[\[([^\]]+)\]\]/;

/** Subject --predicate--> Object (unlinked labels) */
const EDGE_LONG_RE =
  /^(.+?)\s+--([a-z][a-z0-9_]*)-->\s+(.+?)\s*$/;

/** Subject -predicate-> Object */
const EDGE_SHORT_RE =
  /^(.+?)\s+-([a-z][a-z0-9_]*)->\s+(.+?)\s*$/;

const HEADING_RE = /^(#{1,2})\s+(.+)$/;
const WIKI_RE = /\[\[([^\]]+)\]\]/g;
const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const TAG_RE = /(^|[\s([{])#([a-zA-Z][\w-]*)\b/g;
const DEFINITION_RE = /^([^:\n]{1,80})\s*:\s+(.+)$/;

/** Typed multi-hop predicates that free prose must never invent offline. */
const TYPED_MULTI_HOP = new Set([
  'causes',
  'supports',
  'contradicts',
  'precedes',
  'depends_on',
]);

export function extractMarkdown(
  sourcePath: string,
  content: string,
  contentHash: string,
): ExtractResult {
  const nodesById = new Map<string, GraphNode>();
  const triples: Triple[] = [];
  const diagnostics: ExtractResult['diagnostics'] = [];

  const lines = content.split(/\r?\n/);
  let currentDocumentId: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i] ?? '';
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) continue;

    // 3. Headings H1/H2
    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      const title = redactSecrets(heading[2]!.trim());
      const docId = upsertNode(nodesById, {
        type: 'Document',
        label: title,
      });
      const topicId = upsertNode(nodesById, {
        type: 'Topic',
        label: title,
      });
      currentDocumentId = docId;
      pushTriple(triples, {
        s: docId,
        p: 'about',
        o: topicId,
        sourcePath,
        extractor: 'markdown/heading',
        contentHash,
        confidence: 'EXTRACTED',
        span: { start_line: lineNum, end_line: lineNum },
      });
      continue;
    }

    // 4. Edge lines (primary family) — try before wiki/link scan so edge line
    // owns the full line and does not double-emit mentions-only.
    const edge = matchEdgeLine(line.trim());
    if (edge) {
      const sLabel = redactSecrets(stripWiki(edge.s).trim());
      const oLabel = redactSecrets(stripWiki(edge.o).trim());
      const p = edge.p;
      if (PREDICATE_RE.test(p) && sLabel && oLabel) {
        const sId = upsertNode(nodesById, { type: 'Concept', label: sLabel });
        const oId = upsertNode(nodesById, { type: 'Concept', label: oLabel });
        pushTriple(triples, {
          s: sId,
          p,
          o: oId,
          sourcePath,
          extractor: 'markdown/edge-line',
          contentHash,
          confidence: 'EXTRACTED',
          span: { start_line: lineNum, end_line: lineNum },
        });
        continue;
      }
    }

    // 5. Definition-ish (skip if looks like URL scheme or list marker noise)
    const def = DEFINITION_RE.exec(line.trim());
    if (def && !line.trim().startsWith('#') && !looksLikeEdgeOrLinkOnly(line)) {
      const term = redactSecrets(def[1]!.trim());
      const description = redactSecrets(def[2]!.trim());
      // Avoid eating MD links / wiki-only lines as definitions
      if (
        term.length > 0 &&
        !term.includes('[') &&
        !term.startsWith('http') &&
        description.length > 0
      ) {
        const id = upsertNode(nodesById, {
          type: 'Concept',
          label: term,
          description,
        });
        const existing = nodesById.get(id);
        if (existing && !existing.description) {
          existing.description = description;
        } else if (existing && description) {
          existing.description = description;
        }
        // No causation triple from definitions (OQ-1 rule 4 / D-01)
        // Still scan rest of line for wiki/links/tags below if mixed — definitions
        // are whole-line exclusive when matched.
        continue;
      }
    }

    // 1 + 2 + 6: wiki, md links, tags on the line
    let matchedStructure = false;

    // Wiki links
    WIKI_RE.lastIndex = 0;
    let wm: RegExpExecArray | null;
    while ((wm = WIKI_RE.exec(line)) !== null) {
      matchedStructure = true;
      const label = redactSecrets(wm[1]!.trim());
      if (!label) continue;
      const conceptId = upsertNode(nodesById, {
        type: 'Concept',
        label,
      });
      if (currentDocumentId) {
        pushTriple(triples, {
          s: currentDocumentId,
          p: 'mentions',
          o: conceptId,
          sourcePath,
          extractor: 'markdown/wiki',
          contentHash,
          confidence: 'EXTRACTED',
          span: { start_line: lineNum, end_line: lineNum },
        });
      }
    }

    // Markdown links
    MD_LINK_RE.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = MD_LINK_RE.exec(line)) !== null) {
      matchedStructure = true;
      const label = redactSecrets(lm[1]!.trim());
      const target = lm[2]!.trim();
      if (!label) continue;
      // Prefer Concept for labels; Document when target looks like a path/url
      const isPathLike =
        /^(https?:\/\/|\/|\.\/|\.\.\/|[A-Za-z]:\\)/.test(target) ||
        /\.(md|markdown|txt|json|jsonl)(\b|$)/i.test(target);
      const type = isPathLike ? 'Document' : 'Concept';
      const objId = upsertNode(nodesById, { type, label });
      if (currentDocumentId === null) {
        currentDocumentId = ensureSourceDocument(nodesById, sourcePath);
      }
      const linkSubj: string = currentDocumentId;
      pushTriple(triples, {
        s: linkSubj,
        p: 'mentions',
        o: objId,
        sourcePath,
        extractor: 'markdown/link',
        contentHash,
        confidence: 'EXTRACTED',
        span: { start_line: lineNum, end_line: lineNum },
      });
    }

    // Tags #topic-token
    TAG_RE.lastIndex = 0;
    let tm: RegExpExecArray | null;
    while ((tm = TAG_RE.exec(line)) !== null) {
      matchedStructure = true;
      const tag = redactSecrets(tm[2]!.trim());
      if (!tag) continue;
      const topicId = upsertNode(nodesById, { type: 'Topic', label: tag });
      if (currentDocumentId === null) {
        currentDocumentId = ensureSourceDocument(nodesById, sourcePath);
      }
      const tagSubj: string = currentDocumentId;
      pushTriple(triples, {
        s: tagSubj,
        p: 'mentions',
        o: topicId,
        sourcePath,
        extractor: 'markdown/tag',
        contentHash,
        confidence: 'EXTRACTED',
        span: { start_line: lineNum, end_line: lineNum },
      });
    }

    // Free prose: do not invent typed multi-hop EXTRACTED edges.
    // Optional weak INFERRED mentions are intentionally omitted when no
    // wiki/tag structure is present (D-01 honesty / K24).
    void matchedStructure;
    void TYPED_MULTI_HOP;
  }

  return {
    nodes: [...nodesById.values()],
    triples,
    diagnostics,
  };
}

function matchEdgeLine(
  line: string,
): { s: string; p: string; o: string } | null {
  const wiki = EDGE_WIKI_RE.exec(line);
  if (wiki) {
    return { s: wiki[1]!, p: wiki[2]!, o: wiki[3]! };
  }
  // Prefer long form --p--> before short -p->
  const long = EDGE_LONG_RE.exec(line);
  if (long && PREDICATE_RE.test(long[2]!)) {
    const s = stripWiki(long[1]!).trim();
    const o = stripWiki(long[3]!).trim();
    if (s && o && !s.includes('--') && !o.includes('-->')) {
      return { s, p: long[2]!, o };
    }
  }
  const short = EDGE_SHORT_RE.exec(line);
  if (short && PREDICATE_RE.test(short[2]!)) {
    const s = stripWiki(short[1]!).trim();
    const o = stripWiki(short[3]!).trim();
    if (s && o) {
      return { s, p: short[2]!, o };
    }
  }
  return null;
}

function stripWiki(s: string): string {
  return s.replace(/^\[\[/, '').replace(/\]\]$/, '');
}

function looksLikeEdgeOrLinkOnly(line: string): boolean {
  return (
    EDGE_WIKI_RE.test(line) ||
    /\[\[/.test(line) ||
    /\[[^\]]+\]\([^)]+\)/.test(line)
  );
}

function ensureSourceDocument(
  nodesById: Map<string, GraphNode>,
  sourcePath: string,
): string {
  const base = sourcePath.split(/[/\\]/).pop() || sourcePath;
  return upsertNode(nodesById, { type: 'Document', label: base });
}

function upsertNode(
  nodesById: Map<string, GraphNode>,
  partial: { type: string; label: string; description?: string },
): string {
  const label = redactSecrets(partial.label);
  const id = nodeId(partial.type, label);
  const existing = nodesById.get(id);
  if (existing) {
    if (partial.description && !existing.description) {
      existing.description = redactSecrets(partial.description);
    }
    return id;
  }
  const node: GraphNode = {
    id,
    type: partial.type,
    label,
  };
  if (partial.description) {
    node.description = redactSecrets(partial.description);
  }
  nodesById.set(id, node);
  return id;
}

function pushTriple(
  triples: Triple[],
  args: {
    s: string;
    p: string;
    o: string;
    sourcePath: string;
    extractor: string;
    contentHash: string;
    confidence: ProvenanceEntry['confidence'];
    span?: ProvenanceEntry['span'];
  },
): void {
  const provenance: ProvenanceEntry = {
    source_path: args.sourcePath,
    extractor: args.extractor,
    content_hash: args.contentHash,
    confidence: args.confidence,
  };
  if (args.span) provenance.span = args.span;

  const id = tripleId(args.s, args.p, args.o);
  const existing = triples.find((t) => t.id === id);
  if (existing) {
    const key = `${provenance.source_path}|${provenance.extractor}|${provenance.content_hash}|${provenance.confidence}`;
    const has = existing.provenance.some(
      (e) =>
        `${e.source_path}|${e.extractor}|${e.content_hash}|${e.confidence}` ===
        key,
    );
    if (!has) existing.provenance.push(provenance);
    return;
  }
  triples.push({
    id,
    s: args.s,
    p: args.p,
    o: args.o,
    confidence: args.confidence,
    provenance: [provenance],
  });
}
