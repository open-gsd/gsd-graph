// gsd-graph — JSON/JSONL structured field-map extract (EXT-02)

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

/** How to interpret a `.json` / `.jsonl` source file. */
export type JsonExtractFormat = 'auto' | 'json-document' | 'jsonl';

export interface ExtractJsonlOptions {
  /**
   * - `json-document` — whole-file JSON only (use for `.json`; never line-by-line)
   * - `jsonl` — one JSON value per line (use for `.jsonl`)
   * - `auto` — document parse first, then JSONL fallback (tests / legacy)
   */
  format?: JsonExtractFormat;
}

/** Cap noisy per-record diagnostics (OpenAPI arrays, vendor dumps, etc.). */
const MAX_RECORD_DIAGNOSTICS = 8;

/**
 * Parse JSON array documents or line-delimited JSONL into EXTRACTED candidates.
 */
export function extractJsonl(
  sourcePath: string,
  content: string,
  contentHash: string,
  opts?: ExtractJsonlOptions,
): ExtractResult {
  const nodesById = new Map<string, GraphNode>();
  const triples: Triple[] = [];
  const diagnostics: ExtractDiagnostic[] = [];
  const format: JsonExtractFormat = opts?.format ?? 'auto';

  if (content == null || content.length === 0) {
    diagnostics.push({
      path: sourcePath,
      code: 'CONTENT_EMPTY',
      message: 'Source content is empty',
    });
    return { nodes: [], triples: [], diagnostics };
  }

  const records = parseRecords(sourcePath, content, diagnostics, format);
  let recordDiagCount = 0;
  let recordDiagSuppressed = 0;

  const pushRecordDiag = (d: ExtractDiagnostic): void => {
    if (recordDiagCount < MAX_RECORD_DIAGNOSTICS) {
      diagnostics.push(d);
      recordDiagCount += 1;
    } else {
      recordDiagSuppressed += 1;
    }
  };

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const lineHint = rec.line;
    const raw = rec.value;

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      pushRecordDiag({
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
      pushRecordDiag({
        path: sourcePath,
        code: 'RECORD_INVALID',
        message:
          `Record at line ${lineHint} missing required type or label ` +
          `(expected field-map {type,label,edges?}; plain OpenAPI/config/vendor JSON is skipped)`,
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
        pushRecordDiag({
          path: sourcePath,
          code: 'EDGE_INVALID',
          message: `Edge on record line ${lineHint} is not an object`,
        });
        continue;
      }

      const p =
        typeof edgeRaw.p === 'string' ? edgeRaw.p.trim() : '';
      if (!p) {
        pushRecordDiag({
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

  if (recordDiagSuppressed > 0) {
    diagnostics.push({
      path: sourcePath,
      code: 'RECORD_DIAGNOSTICS_TRUNCATED',
      message: `Suppressed ${recordDiagSuppressed} additional record diagnostics (cap ${MAX_RECORD_DIAGNOSTICS} per file). File is likely not field-map graph data.`,
    });
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

/** Cap per-file line diagnostics so pretty-printed dumps don't flood CLI. */
const MAX_JSONL_LINE_DIAGNOSTICS = 8;

function parseJsonDocument(
  sourcePath: string,
  content: string,
  diagnostics: ExtractDiagnostic[],
): ParsedRecord[] {
  try {
    const value = JSON.parse(content) as unknown;
    if (Array.isArray(value)) {
      return value.map((v, i) => ({ value: v, line: i + 1 }));
    }
    return [{ value, line: 1 }];
  } catch (err) {
    diagnostics.push({
      path: sourcePath,
      code: 'JSON_INVALID',
      message: `Failed to parse JSON document (not field-map data; skipped): ${err instanceof Error ? err.message : String(err)}`,
    });
    return [];
  }
}

function parseJsonlLines(
  sourcePath: string,
  content: string,
  diagnostics: ExtractDiagnostic[],
): ParsedRecord[] {
  const lines = content.split(/\r?\n/);
  const out: ParsedRecord[] = [];
  let lineDiagCount = 0;
  let suppressed = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? '';
    if (line.trim().length === 0) continue;
    try {
      out.push({ value: JSON.parse(line), line: lineNum });
    } catch (err) {
      if (lineDiagCount < MAX_JSONL_LINE_DIAGNOSTICS) {
        diagnostics.push({
          path: sourcePath,
          code: 'JSON_LINE_INVALID',
          message: `Invalid JSON on line ${lineNum}: ${err instanceof Error ? err.message : String(err)}`,
        });
        lineDiagCount += 1;
      } else {
        suppressed += 1;
      }
    }
  }
  if (suppressed > 0) {
    diagnostics.push({
      path: sourcePath,
      code: 'JSON_LINE_INVALID_TRUNCATED',
      message: `Suppressed ${suppressed} additional JSON_LINE_INVALID diagnostics (cap ${MAX_JSONL_LINE_DIAGNOSTICS} per file). File is likely pretty-printed JSON, not JSONL field-map records.`,
    });
  }
  return out;
}

function parseRecords(
  sourcePath: string,
  content: string,
  diagnostics: ExtractDiagnostic[],
  format: JsonExtractFormat,
): ParsedRecord[] {
  // `.json` files: whole-document only — never emit per-line spam.
  if (format === 'json-document') {
    return parseJsonDocument(sourcePath, content, diagnostics);
  }

  // `.jsonl` files: strict line mode.
  if (format === 'jsonl') {
    return parseJsonlLines(sourcePath, content, diagnostics);
  }

  // auto: document parse for array/object documents, else JSONL.
  const trimmed = content.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const value = JSON.parse(content) as unknown;
      if (Array.isArray(value)) {
        return value.map((v, i) => ({ value: v, line: i + 1 }));
      }
      return [{ value, line: 1 }];
    } catch {
      // Fall through to JSONL only when whole-document parse fails
      // (true multi-line JSONL of compact objects).
    }
  }
  return parseJsonlLines(sourcePath, content, diagnostics);
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
