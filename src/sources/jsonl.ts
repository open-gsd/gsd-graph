// gsd-graph — JSON/JSONL structured field-map extract (EXT-02)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * JSONL / JSON field map (preferred multi-hop fixtures, D-03 / EXT-02):
 *  {
 *    "id"?: string,          // optional explicit node id; else type:slug(label)
 *    "type": string,
 *    "label": string,
 *    "aliases"?: string[],
 *    "edges"?: Array<{ "p": string, "o": string | { "id"?|"type"|"label" } }>
 *  }
 * Arrays of records (JSON array file) or one JSON object per line (JSONL).
 * All emitted triples confidence EXTRACTED, extractor: 'jsonl/field-map'.
 * Offline only (D-01) — no network, no LLM.
 */

import type {
  ExtractDiagnostic,
  ExtractResult,
  GraphNode,
  ProvenanceEntry,
  Triple,
} from '../types';
import { nodeId, tripleId } from '../pipeline/ids';
import { redactSecrets } from './redact';

const EXTRACTOR = 'jsonl/field-map';

interface FieldMapEdge {
  p?: unknown;
  o?: unknown;
}

interface FieldMapRecord {
  id?: unknown;
  type?: unknown;
  label?: unknown;
  aliases?: unknown;
  edges?: unknown;
}

/**
 * Parse JSON array documents or line-delimited JSONL into EXTRACTED candidates.
 */
export function extractJsonl(
  sourcePath: string,
  content: string,
  contentHash: string,
): ExtractResult {
  const nodesById = new Map<string, GraphNode>();
  const triples: Triple[] = [];
  const diagnostics: ExtractDiagnostic[] = [];

  if (content == null || content.length === 0) {
    diagnostics.push({
      path: sourcePath,
      code: 'CONTENT_EMPTY',
      message: 'Source content is empty',
    });
    return { nodes: [], triples: [], diagnostics };
  }

  const records = parseRecords(sourcePath, content, diagnostics);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const lineHint = rec.line;
    const raw = rec.value;

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      diagnostics.push({
        path: sourcePath,
        code: 'RECORD_INVALID',
        message: `Record at line ${lineHint} is not a JSON object`,
      });
      continue;
    }

    const record = raw as FieldMapRecord;
    const type =
      typeof record.type === 'string' ? record.type.trim() : '';
    const labelRaw =
      typeof record.label === 'string' ? record.label : '';

    if (!type || !labelRaw.trim()) {
      diagnostics.push({
        path: sourcePath,
        code: 'RECORD_INVALID',
        message: `Record at line ${lineHint} missing required type or label`,
      });
      continue;
    }

    const label = redactSecrets(labelRaw.trim());
    const id =
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id.trim()
        : nodeId(type, label);

    const aliases = normalizeAliases(record.aliases);
    const nodePartial: {
      id: string;
      type: string;
      label: string;
      aliases?: string[];
    } = { id, type, label };
    if (aliases) nodePartial.aliases = aliases;
    upsertNode(nodesById, nodePartial);

    if (!Array.isArray(record.edges)) continue;

    for (const edgeRaw of record.edges as FieldMapEdge[]) {
      if (
        edgeRaw === null ||
        typeof edgeRaw !== 'object' ||
        Array.isArray(edgeRaw)
      ) {
        diagnostics.push({
          path: sourcePath,
          code: 'EDGE_INVALID',
          message: `Edge on record line ${lineHint} is not an object`,
        });
        continue;
      }

      const p =
        typeof edgeRaw.p === 'string' ? edgeRaw.p.trim() : '';
      if (!p) {
        diagnostics.push({
          path: sourcePath,
          code: 'EDGE_INVALID',
          message: `Edge on record line ${lineHint} missing predicate p`,
        });
        continue;
      }

      const objectId = resolveObjectId(
        edgeRaw.o,
        nodesById,
        sourcePath,
        lineHint,
        diagnostics,
      );
      if (!objectId) continue;

      pushTriple(triples, {
        s: id,
        p,
        o: objectId,
        sourcePath,
        contentHash,
      });
    }
  }

  return {
    nodes: [...nodesById.values()],
    triples,
    diagnostics,
  };
}

interface ParsedRecord {
  value: unknown;
  line: number;
}

function parseRecords(
  sourcePath: string,
  content: string,
  diagnostics: ExtractDiagnostic[],
): ParsedRecord[] {
  const trimmed = content.trimStart();

  // JSON array document (pretty-printed or compact)
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(content) as unknown;
      if (!Array.isArray(arr)) {
        diagnostics.push({
          path: sourcePath,
          code: 'JSON_INVALID',
          message: 'Top-level JSON is not an array',
        });
        return [];
      }
      return arr.map((value, i) => ({ value, line: i + 1 }));
    } catch (err) {
      diagnostics.push({
        path: sourcePath,
        code: 'JSON_INVALID',
        message: `Failed to parse JSON array: ${err instanceof Error ? err.message : String(err)}`,
      });
      return [];
    }
  }

  // JSONL: one object per line
  const lines = content.split(/\r?\n/);
  const out: ParsedRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? '';
    if (line.trim().length === 0) continue;
    try {
      out.push({ value: JSON.parse(line), line: lineNum });
    } catch (err) {
      diagnostics.push({
        path: sourcePath,
        code: 'JSON_LINE_INVALID',
        message: `Invalid JSON on line ${lineNum}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return out;
}

function normalizeAliases(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const aliases = raw
    .filter((a): a is string => typeof a === 'string')
    .map((a) => redactSecrets(a.trim()))
    .filter((a) => a.length > 0);
  return aliases.length > 0 ? aliases : undefined;
}

function resolveObjectId(
  o: unknown,
  nodesById: Map<string, GraphNode>,
  sourcePath: string,
  lineHint: number,
  diagnostics: ExtractDiagnostic[],
): string | null {
  if (typeof o === 'string' && o.trim().length > 0) {
    return o.trim();
  }

  if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
    const obj = o as { id?: unknown; type?: unknown; label?: unknown };
    if (typeof obj.id === 'string' && obj.id.trim().length > 0) {
      const id = obj.id.trim();
      // If type+label also present, ensure node exists under that id
      if (
        typeof obj.type === 'string' &&
        typeof obj.label === 'string' &&
        obj.type.trim() &&
        obj.label.trim()
      ) {
        upsertNode(nodesById, {
          id,
          type: obj.type.trim(),
          label: redactSecrets(obj.label.trim()),
        });
      }
      return id;
    }

    const type = typeof obj.type === 'string' ? obj.type.trim() : '';
    const labelRaw = typeof obj.label === 'string' ? obj.label : '';
    if (type && labelRaw.trim()) {
      const label = redactSecrets(labelRaw.trim());
      const id = nodeId(type, label);
      upsertNode(nodesById, { id, type, label });
      return id;
    }
  }

  diagnostics.push({
    path: sourcePath,
    code: 'EDGE_INVALID',
    message: `Edge on record line ${lineHint} has unresolvable object o`,
  });
  return null;
}

function upsertNode(
  nodesById: Map<string, GraphNode>,
  partial: {
    id: string;
    type: string;
    label: string;
    aliases?: string[];
  },
): void {
  const existing = nodesById.get(partial.id);
  if (existing) {
    if (partial.aliases && partial.aliases.length > 0) {
      const set = new Set([...(existing.aliases ?? []), ...partial.aliases]);
      existing.aliases = [...set];
    }
    return;
  }
  const node: GraphNode = {
    id: partial.id,
    type: partial.type,
    label: partial.label,
  };
  if (partial.aliases && partial.aliases.length > 0) {
    node.aliases = partial.aliases;
  }
  nodesById.set(partial.id, node);
}

function pushTriple(
  triples: Triple[],
  args: {
    s: string;
    p: string;
    o: string;
    sourcePath: string;
    contentHash: string;
  },
): void {
  const provenance: ProvenanceEntry = {
    source_path: args.sourcePath,
    extractor: EXTRACTOR,
    content_hash: args.contentHash,
    confidence: 'EXTRACTED',
  };

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
    confidence: 'EXTRACTED',
    provenance: [provenance],
  });
}
