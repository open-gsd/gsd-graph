// gsd-graph — flat YAML / markdown-frontmatter extract (no dependencies)

/**
 * Planning corpora carry their densest machine-readable structure in YAML:
 * frontmatter (status, depends_on, owner, tags) and standalone .yaml files.
 * This extractor parses a deliberately FLAT subset — top-level scalars,
 * inline [a, b] lists, and `- item` block lists. Nested maps are skipped
 * (never guessed at).
 *
 * Mapping (honest by design — ontology policy still gates every predicate):
 * - `title` → Document label · `description`/`summary` → Document description
 * - tag keys (`tags`, `topics`, `keywords`) → Document —mentions→ Topic
 * - relational keys (depends_on, blocked_by, requires, …) → Document —<key>→
 *   Concept per value; unknown predicates land in the review queue as usual
 * - every other scalar key (status, owner, priority, …) folds into the
 *   Document description as `key: value` — searchable, no fake edges
 */

import path from 'node:path';
import type {
  ExtractDiagnostic,
  ExtractResult,
  GraphNode,
  ProvenanceEntry,
  Triple,
} from '../types';
import { nodeId, tripleId } from '../pipeline/ids';
import { redactSecrets } from './redact';

const PREDICATE_RE = /^[a-z][a-z0-9_]*$/;

/** Keys whose values become Document —mentions→ Topic edges. */
const TAG_KEYS = new Set(['tags', 'topics', 'keywords']);

/** Keys treated as node fields rather than edges. */
const FIELD_KEYS = new Set(['title', 'description', 'summary']);

/**
 * Keys that read as relationships — union of shipped ontology pack predicate
 * vocabularies plus common planning aliases. Values become Concept edges with
 * the key as predicate; the ontology unknown-policy decides their fate.
 */
export const YAML_RELATIONAL_KEYS: ReadonlySet<string> = new Set([
  'related_to',
  'mentions',
  'part_of',
  'derived_from',
  'causes',
  'supports',
  'contradicts',
  'located_in',
  'works_for',
  'authored',
  'about',
  'member_of',
  'precedes',
  'depends_on',
  'blocked_by',
  'blocks',
  'requires',
  'uses',
  'implements',
  'delivers',
  'owns',
  'mitigates',
  'deploys',
  'cites',
  'evaluates',
  'uses_method',
  'same_as',
]);

export interface FlatYamlEntry {
  key: string;
  /** Scalar → one value; list → each item. Empty for null/empty values. */
  values: string[];
  isList: boolean;
  /** 1-indexed line of the key within the parsed block. */
  line: number;
}

export interface ParseFlatYamlResult {
  entries: FlatYamlEntry[];
  diagnostics: ExtractDiagnostic[];
}

function unquote(raw: string): string {
  const v = raw.trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function stripComment(raw: string): string {
  // Cheap comment strip: ` #` outside quotes. Quoted values are unquoted later.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) {
      if (i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t') {
        return raw.slice(0, i);
      }
    }
  }
  return raw;
}

function parseInlineList(raw: string): string[] | null {
  const v = raw.trim();
  if (!v.startsWith('[') || !v.endsWith(']')) return null;
  const inner = v.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return inner
    .split(',')
    .map((part) => unquote(part))
    .filter((part) => part.length > 0);
}

/**
 * Parse the flat top-level subset of a YAML document.
 * Indented (nested) content is skipped; block lists (`- item`) attach to the
 * preceding top-level key.
 */
export function parseFlatYaml(
  content: string,
  sourcePath = '(yaml)',
): ParseFlatYamlResult {
  const entries: FlatYamlEntry[] = [];
  const diagnostics: ExtractDiagnostic[] = [];
  const lines = content.split(/\r?\n/);

  let current: FlatYamlEntry | null = null;
  let skippedNested = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = stripComment(lines[i] ?? '');
    if (raw.trim().length === 0) continue;
    if (raw.trim() === '---' || raw.trim() === '...') continue;

    const indented = /^[ \t]/.test(raw);
    const trimmed = raw.trim();

    // Block list item — attaches to the open key (indented or not).
    if (trimmed.startsWith('- ') || trimmed === '-') {
      if (current !== null) {
        const item = unquote(trimmed.replace(/^-\s*/, ''));
        if (item.length > 0 && !item.includes(':')) {
          current.isList = true;
          current.values.push(item);
          continue;
        }
        if (item.includes(':')) {
          // List of maps — out of the flat subset.
          skippedNested = true;
          continue;
        }
      }
      continue;
    }

    if (indented) {
      // Nested map content — out of the flat subset, never guessed at.
      skippedNested = true;
      continue;
    }

    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const valueRaw = trimmed.slice(colon + 1).trim();

    if (!/^[A-Za-z_][\w-]*$/.test(key)) {
      continue;
    }

    const entry: FlatYamlEntry = {
      key: key.toLowerCase(),
      values: [],
      isList: false,
      line: lineNum,
    };

    if (valueRaw.length > 0) {
      const inline = parseInlineList(valueRaw);
      if (inline !== null) {
        entry.isList = true;
        entry.values = inline;
      } else {
        const v = unquote(valueRaw);
        if (v.length > 0 && v !== 'null' && v !== '~') {
          entry.values = [v];
        }
      }
    }

    entries.push(entry);
    // Only a key with no inline value can collect block list items.
    current = valueRaw.length === 0 ? entry : null;
  }

  if (skippedNested) {
    diagnostics.push({
      path: sourcePath,
      code: 'YAML_NESTED_SKIPPED',
      message:
        'nested YAML structures skipped — flat keys, inline lists, and block lists only',
    });
  }

  return { entries, diagnostics };
}

/** Leading `---` frontmatter block, if present. */
export function splitFrontmatter(content: string): {
  yaml: string | null;
  /** 1-indexed line where the yaml block starts (after opening ---). */
  yamlStartLine: number;
  /** Content with the frontmatter block blanked line-for-line (spans stay stable). */
  bodyWithBlankedFrontmatter: string;
} {
  const lines = content.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') {
    return { yaml: null, yamlStartLine: 0, bodyWithBlankedFrontmatter: content };
  }
  for (let i = 1; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (t === '---' || t === '...') {
      const yaml = lines.slice(1, i).join('\n');
      const blanked = [...lines];
      for (let j = 0; j <= i; j++) blanked[j] = '';
      return {
        yaml,
        yamlStartLine: 2,
        bodyWithBlankedFrontmatter: blanked.join('\n'),
      };
    }
  }
  return { yaml: null, yamlStartLine: 0, bodyWithBlankedFrontmatter: content };
}

export interface YamlExtractOptions {
  /** Provenance extractor tag (default 'yaml/field'). */
  extractorTag?: string;
  /** Line offset added to entry lines (frontmatter inside markdown). */
  lineOffset?: number;
  /** Document label override (default: title key, else basename). */
  documentLabel?: string;
}

/**
 * Extract a Document + gated edges from flat YAML content.
 */
export function extractYaml(
  sourcePath: string,
  content: string,
  contentHash: string,
  opts?: YamlExtractOptions,
): ExtractResult {
  const extractor = opts?.extractorTag ?? 'yaml/field';
  const offset = opts?.lineOffset ?? 0;
  const { entries, diagnostics } = parseFlatYaml(content, sourcePath);

  const nodesById = new Map<string, GraphNode>();
  const triples = new Map<string, Triple>();

  if (entries.length === 0) {
    return { nodes: [], triples: [], diagnostics };
  }

  const titleEntry = entries.find(
    (e) => e.key === 'title' && e.values.length > 0,
  );
  const baseLabel =
    opts?.documentLabel ??
    (titleEntry !== undefined
      ? titleEntry.values[0]!
      : path.basename(sourcePath));
  const docLabel = redactSecrets(baseLabel);
  const docId = nodeId('Document', docLabel);
  const docNode: GraphNode = { id: docId, type: 'Document', label: docLabel };
  nodesById.set(docId, docNode);

  const descriptionNotes: string[] = [];

  const provenanceFor = (line: number): ProvenanceEntry => ({
    source_path: sourcePath,
    extractor,
    content_hash: contentHash,
    confidence: 'EXTRACTED',
    span: { start_line: line + offset, end_line: line + offset },
  });

  const addTriple = (
    s: string,
    p: string,
    o: string,
    line: number,
  ): void => {
    const id = tripleId(s, p, o);
    const prov = provenanceFor(line);
    const existing = triples.get(id);
    if (existing !== undefined) {
      existing.provenance.push(prov);
      return;
    }
    triples.set(id, {
      id,
      s,
      p,
      o,
      confidence: 'EXTRACTED',
      provenance: [prov],
    });
  };

  const upsertConcept = (type: string, label: string): string => {
    const clean = redactSecrets(label);
    const id = nodeId(type, clean);
    if (!nodesById.has(id)) {
      nodesById.set(id, { id, type, label: clean });
    }
    return id;
  };

  for (const entry of entries) {
    if (entry.values.length === 0) continue;

    if (FIELD_KEYS.has(entry.key)) {
      if (entry.key === 'title') continue; // consumed as label
      if (docNode.description === undefined) {
        docNode.description = redactSecrets(entry.values[0]!);
      }
      continue;
    }

    if (TAG_KEYS.has(entry.key)) {
      for (const v of entry.values) {
        const topicId = upsertConcept('Topic', v);
        addTriple(docId, 'mentions', topicId, entry.line);
      }
      continue;
    }

    if (YAML_RELATIONAL_KEYS.has(entry.key) && PREDICATE_RE.test(entry.key)) {
      for (const v of entry.values) {
        if (v.length > 120) continue; // long prose is not an entity ref
        const conceptId = upsertConcept('Concept', v);
        addTriple(docId, entry.key, conceptId, entry.line);
      }
      continue;
    }

    // Informational scalar/list — searchable description note, no fake edge.
    const rendered = `${entry.key}: ${entry.values.join(', ')}`;
    if (rendered.length <= 200) {
      descriptionNotes.push(redactSecrets(rendered));
    }
  }

  if (descriptionNotes.length > 0) {
    const notes = descriptionNotes.join(' · ');
    docNode.description =
      docNode.description === undefined || docNode.description.length === 0
        ? notes
        : `${docNode.description} · ${notes}`;
  }

  return {
    nodes: [...nodesById.values()],
    triples: [...triples.values()],
    diagnostics,
  };
}
