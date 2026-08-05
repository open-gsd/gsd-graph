// gsd-graph — export graph.v1 to mermaid / graphml / cypher / html viewer

/**
 * Read-only projections of the published graph for humans and other tools.
 * Never a source of truth (D-04): exports are disposable artifacts derived
 * from graph.v1.json at the moment of export.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSD_GRAPH_REASON, GraphError } from '../errors';
import { loadGraphV1 } from '../io/load-graph';
import { confineUnderRoot, ensureStoreRoot, resolveStoreRoot } from '../io/paths';
import type { GraphV1Document } from '../types';

export type ExportFormat = 'mermaid' | 'graphml' | 'cypher' | 'html';

export interface ExportOptions {
  /** Store directory override (resolveStoreRoot) when graph absent. */
  dir?: string;
  /** In-memory graph — skips loadGraphV1 (tests). */
  graph?: GraphV1Document;
  format: ExportFormat;
  /** Output file path; default `<store>/exports/graph.<ext>`. */
  out?: string;
  /** Cap on exported triples (default 5000; largest exports stay readable). */
  maxTriples?: number;
}

export interface ExportResult {
  format: ExportFormat;
  path: string;
  node_count: number;
  triple_count: number;
  truncated: boolean;
}

const EXTENSIONS: Record<ExportFormat, string> = {
  mermaid: 'mmd',
  graphml: 'graphml',
  cypher: 'cypher',
  html: 'html',
};

const DEFAULT_MAX_TRIPLES = 5000;

export function isExportFormat(value: string): value is ExportFormat {
  return (
    value === 'mermaid' ||
    value === 'graphml' ||
    value === 'cypher' ||
    value === 'html'
  );
}

/** Mermaid-safe node key (alphanumeric + underscore). */
function mermaidKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '#quot;');
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cypherEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

interface ExportView {
  nodes: Array<{ id: string; type: string; label: string }>;
  triples: Array<{ s: string; p: string; o: string; confidence: string }>;
  truncated: boolean;
}

function projectView(graph: GraphV1Document, maxTriples: number): ExportView {
  const triples = graph.triples
    .slice(0, maxTriples)
    .map((t) => ({ s: t.s, p: t.p, o: t.o, confidence: t.confidence }));
  const connected = new Set<string>();
  for (const t of triples) {
    connected.add(t.s);
    connected.add(t.o);
  }
  // Keep connected nodes first, then isolated up to a sane cap.
  const nodes = graph.nodes
    .filter((n) => connected.has(n.id))
    .map((n) => ({ id: n.id, type: n.type, label: n.label }));
  return {
    nodes,
    triples,
    truncated: graph.triples.length > maxTriples,
  };
}

export function renderMermaid(view: ExportView): string {
  const lines: string[] = ['graph LR'];
  for (const n of view.nodes) {
    lines.push(`  ${mermaidKey(n.id)}["${escapeQuotes(n.label || n.id)}"]`);
  }
  for (const t of view.triples) {
    lines.push(`  ${mermaidKey(t.s)} -->|${t.p}| ${mermaidKey(t.o)}`);
  }
  return lines.join('\n') + '\n';
}

export function renderGraphml(view: ExportView): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
    '  <key id="predicate" for="edge" attr.name="predicate" attr.type="string"/>',
    '  <key id="confidence" for="edge" attr.name="confidence" attr.type="string"/>',
    '  <graph id="gsd-graph" edgedefault="directed">',
  ];
  for (const n of view.nodes) {
    parts.push(
      `    <node id="${xmlEscape(n.id)}">` +
        `<data key="label">${xmlEscape(n.label)}</data>` +
        `<data key="type">${xmlEscape(n.type)}</data>` +
        `</node>`,
    );
  }
  view.triples.forEach((t, i) => {
    parts.push(
      `    <edge id="e${i}" source="${xmlEscape(t.s)}" target="${xmlEscape(t.o)}">` +
        `<data key="predicate">${xmlEscape(t.p)}</data>` +
        `<data key="confidence">${xmlEscape(t.confidence)}</data>` +
        `</edge>`,
    );
  });
  parts.push('  </graph>', '</graphml>', '');
  return parts.join('\n');
}

export function renderCypher(view: ExportView): string {
  const lines: string[] = [
    '// gsd-graph export — MERGE-idempotent Cypher',
  ];
  for (const n of view.nodes) {
    const type = n.type.replace(/[^a-zA-Z0-9_]/g, '_') || 'Node';
    lines.push(
      `MERGE (n:${type} {id: '${cypherEscape(n.id)}'}) SET n.label = '${cypherEscape(n.label)}';`,
    );
  }
  for (const t of view.triples) {
    const rel = t.p.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    lines.push(
      `MATCH (a {id: '${cypherEscape(t.s)}'}), (b {id: '${cypherEscape(t.o)}'}) ` +
        `MERGE (a)-[r:${rel}]->(b) SET r.confidence = '${cypherEscape(t.confidence)}';`,
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Self-contained interactive viewer: inline data + vanilla-JS force layout,
 * no external requests (works offline and under strict CSP).
 */
export function renderHtml(view: ExportView, title = 'gsd-graph'): string {
  const data = JSON.stringify({ nodes: view.nodes, triples: view.triples });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xmlEscape(title)} — graph</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 13px/1.4 system-ui, sans-serif; }
  #bar { padding: 8px 12px; display: flex; gap: 12px; align-items: center; border-bottom: 1px solid #8884; }
  #bar input { flex: 0 0 240px; padding: 4px 8px; }
  #meta { opacity: .7; }
  svg { width: 100vw; height: calc(100vh - 42px); display: block; cursor: grab; }
  line { stroke: #8886; stroke-width: 1.2; }
  text.edge { font-size: 9px; fill: #888; }
  circle { fill: #4f7cd1; }
  circle.dim { opacity: .15; }
  circle.hit { fill: #e0762e; }
  text.node { font-size: 10px; fill: currentColor; }
  text.node.dim { opacity: .15; }
</style>
</head>
<body>
<div id="bar">
  <strong>${xmlEscape(title)}</strong>
  <input id="q" placeholder="filter nodes…">
  <span id="meta"></span>
</div>
<svg id="view"></svg>
<script>
const DATA = ${data};
const svg = document.getElementById('view');
const NS = 'http://www.w3.org/2000/svg';
const W = () => svg.clientWidth, H = () => svg.clientHeight;
const nodes = DATA.nodes.map((n, i) => ({ ...n,
  x: W()/2 + Math.cos(i*2.399) * (80 + 6*Math.sqrt(i)) ,
  y: H()/2 + Math.sin(i*2.399) * (80 + 6*Math.sqrt(i)), vx: 0, vy: 0 }));
const byId = new Map(nodes.map(n => [n.id, n]));
const edges = DATA.triples.filter(t => byId.has(t.s) && byId.has(t.o));
document.getElementById('meta').textContent =
  nodes.length + ' nodes · ' + edges.length + ' edges';
const g = document.createElementNS(NS, 'g');
svg.appendChild(g);
const lines = edges.map(e => { const l = document.createElementNS(NS, 'line'); g.appendChild(l); return l; });
const labels = edges.map(e => { const t = document.createElementNS(NS, 'text');
  t.setAttribute('class','edge'); t.textContent = e.p; g.appendChild(t); return t; });
const circles = nodes.map(n => { const c = document.createElementNS(NS, 'circle');
  c.setAttribute('r', 5); c.appendChild(document.createElementNS(NS,'title')).textContent = n.id + ' (' + n.type + ')';
  g.appendChild(c); return c; });
const texts = nodes.map(n => { const t = document.createElementNS(NS, 'text');
  t.setAttribute('class','node'); t.textContent = n.label || n.id; g.appendChild(t); return t; });
let tx = 0, ty = 0, scale = 1;
function tick() {
  for (const n of nodes) { n.vx *= .85; n.vy *= .85; }
  for (let i = 0; i < nodes.length; i++) for (let j = i+1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    let dx = b.x-a.x, dy = b.y-a.y, d2 = dx*dx+dy*dy || 1;
    if (d2 < 90000) { const f = 800/d2; dx *= f; dy *= f; a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy; }
  }
  for (const e of edges) {
    const a = byId.get(e.s), b = byId.get(e.o);
    const dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy) || 1;
    const f = (d-90)/d*.02;
    a.vx += dx*f; a.vy += dy*f; b.vx -= dx*f; b.vy -= dy*f;
  }
  for (const n of nodes) { n.x += n.vx; n.y += n.vy; }
  edges.forEach((e, i) => {
    const a = byId.get(e.s), b = byId.get(e.o);
    lines[i].setAttribute('x1', a.x); lines[i].setAttribute('y1', a.y);
    lines[i].setAttribute('x2', b.x); lines[i].setAttribute('y2', b.y);
    labels[i].setAttribute('x', (a.x+b.x)/2); labels[i].setAttribute('y', (a.y+b.y)/2);
  });
  nodes.forEach((n, i) => {
    circles[i].setAttribute('cx', n.x); circles[i].setAttribute('cy', n.y);
    texts[i].setAttribute('x', n.x + 7); texts[i].setAttribute('y', n.y + 3);
  });
  g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
}
let frames = 0;
(function loop() { tick(); if (++frames < 600) requestAnimationFrame(loop); })();
let drag = null;
svg.addEventListener('mousedown', e => { drag = { x: e.clientX - tx, y: e.clientY - ty }; });
window.addEventListener('mousemove', e => { if (drag) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; tick(); } });
window.addEventListener('mouseup', () => { drag = null; });
svg.addEventListener('wheel', e => { e.preventDefault();
  scale = Math.min(4, Math.max(.2, scale * (e.deltaY < 0 ? 1.1 : .9))); tick(); }, { passive: false });
document.getElementById('q').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  nodes.forEach((n, i) => {
    const hit = q && (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    circles[i].setAttribute('class', q ? (hit ? 'hit' : 'dim') : '');
    texts[i].setAttribute('class', 'node' + (q && !hit ? ' dim' : ''));
  });
});
</script>
</body>
</html>
`;
}

/**
 * Export the published graph to a file in the requested format.
 */
export function exportGraph(opts: ExportOptions): ExportResult {
  if (!isExportFormat(opts.format)) {
    throw new GraphError(
      GSD_GRAPH_REASON.SCHEMA_INVALID,
      `unknown export format: ${String(opts.format)} (mermaid | graphml | cypher | html)`,
    );
  }

  const storeRoot = ensureStoreRoot(
    resolveStoreRoot(opts.dir !== undefined ? { dir: opts.dir } : {}),
  );
  const graph = opts.graph ?? loadGraphV1(storeRoot);
  const view = projectView(graph, opts.maxTriples ?? DEFAULT_MAX_TRIPLES);

  let content: string;
  switch (opts.format) {
    case 'mermaid':
      content = renderMermaid(view);
      break;
    case 'graphml':
      content = renderGraphml(view);
      break;
    case 'cypher':
      content = renderCypher(view);
      break;
    case 'html':
      content = renderHtml(view, path.basename(path.dirname(storeRoot)));
      break;
  }

  let outPath: string;
  if (opts.out !== undefined) {
    outPath = path.resolve(opts.out);
  } else {
    const exportsDir = confineUnderRoot(storeRoot, 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    outPath = path.join(exportsDir, `graph.${EXTENSIONS[opts.format]}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');

  return {
    format: opts.format,
    path: outPath,
    node_count: view.nodes.length,
    triple_count: view.triples.length,
    truncated: view.truncated,
  };
}
