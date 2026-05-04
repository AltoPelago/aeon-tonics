import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  compile,
  formatPath,
  type AssignmentEvent,
  type CompileOptions,
} from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';

export interface AeonGraphOptions {
  readonly ancestors?: string;
  readonly compileOptions?: CompileOptions;
  readonly descendants?: string;
  readonly edgeKind?: AeonGraphEdgeKind;
  readonly fromPathPrefix?: string;
  readonly path?: string;
  readonly references?: string;
  readonly toPathPrefix?: string;
}

export interface AeonGraphResult {
  readonly format: 'aeon.graph';
  readonly version: 1;
  readonly nodes: readonly AeonGraphNode[];
  readonly edges: readonly AeonGraphEdge[];
  readonly diagnostics: readonly AeonGraphDiagnostic[];
}

export interface AeonGraphSummary {
  readonly format: 'aeon.graph.summary';
  readonly version: 1;
  readonly counts: {
    readonly files: number;
    readonly nodes: number;
    readonly edges: number;
    readonly diagnostics: number;
    readonly byEdgeKind: Record<AeonGraphEdgeKind, number>;
  };
  readonly files: readonly string[];
  readonly highRisk: {
    readonly pointerEdges: readonly AeonGraphEdge[];
    readonly pointerPaths: readonly string[];
  };
  readonly diagnostics: readonly AeonGraphDiagnostic[];
}

export interface AeonGraphNode {
  readonly file: string;
  readonly path: string;
  readonly kind: string;
  readonly datatype?: string;
}

export interface AeonGraphEdge {
  readonly file: string;
  readonly from: string;
  readonly to: string;
  readonly kind: AeonGraphEdgeKind;
}

export type AeonGraphEdgeKind = 'contains' | 'clone' | 'pointer';
export type AeonGraphDotTheme = 'agent' | 'plain';

export interface AeonGraphDotOptions {
  readonly theme?: AeonGraphDotTheme;
}

export interface AeonGraphDiagnostic {
  readonly file: string;
  readonly code: string;
  readonly message: string;
}

export async function discoverAeonGraphFiles(inputs: readonly string[]): Promise<readonly string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    await collectAeonFiles(resolve(input), files);
  }
  return [...new Set(files)].sort();
}

export async function graphAeonFiles(
  inputs: readonly string[],
  options: AeonGraphOptions = {},
): Promise<AeonGraphResult> {
  const files = await discoverAeonGraphFiles(inputs);
  const nodes: AeonGraphNode[] = [];
  const edges: AeonGraphEdge[] = [];
  const diagnostics: AeonGraphDiagnostic[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const compiled = compile(source, {
      maxAttributeDepth: 2,
      ...options.compileOptions,
    });
    if (compiled.errors.length > 0) {
      diagnostics.push(...compiled.errors.map((error) => ({
        file,
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      })));
      continue;
    }
    const graph = graphAesEvents(compiled.events, { file });
    nodes.push(...graph.nodes);
    edges.push(...graph.edges);
  }

  return filterGraph({
    format: 'aeon.graph',
    version: 1,
    nodes,
    edges,
    diagnostics,
  }, options);
}

export function graphAesEvents(
  events: readonly AssignmentEvent[],
  options: { readonly file?: string } = {},
): Pick<AeonGraphResult, 'nodes' | 'edges'> {
  const file = options.file ?? '';
  const nodes = events.map((event): AeonGraphNode => {
    const datatype = typeof event.datatype === 'string' ? event.datatype : undefined;
    return {
      file,
      path: formatPath(event.path),
      kind: eventKind(event),
      ...(datatype === undefined ? {} : { datatype }),
    };
  });
  const containmentEdges = nodes
    .map((node): AeonGraphEdge | undefined => {
      const parent = parentPath(node.path);
      if (parent === undefined || !nodes.some((candidate) => candidate.path === parent)) {
        return undefined;
      }
      return {
        file: node.file,
        from: parent,
        to: node.path,
        kind: 'contains',
      };
    })
    .filter((edge): edge is AeonGraphEdge => edge !== undefined);
  const referenceEdges = events.flatMap((event): AeonGraphEdge[] => {
    const value = event.value as { readonly type?: unknown; readonly path?: unknown };
    if (value.type !== 'CloneReference' && value.type !== 'PointerReference') {
      return [];
    }
    if (!Array.isArray(value.path)) {
      return [];
    }
    return [{
      file,
      from: formatPath(event.path),
      to: formatReferencePath(value.path),
      kind: value.type === 'PointerReference' ? 'pointer' : 'clone',
    }];
  });
  return { nodes, edges: [...containmentEdges, ...referenceEdges] };
}

export function formatAeonGraphText(result: AeonGraphResult): string {
  const lines = [
    `AEON graph: ${result.nodes.length} nodes, ${result.edges.length} edges, ${result.diagnostics.length} diagnostics`,
    ...result.nodes.map((node) => [
      'node',
      node.file,
      node.path,
      node.kind,
      node.datatype ? `:${node.datatype}` : '',
    ].join(' ').replace(/\s+/g, ' ').trim()),
    ...result.edges.map((edge) => `edge ${edge.file} ${edge.from} -${edge.kind}-> ${edge.to}`),
    ...result.diagnostics.map((diagnostic) => `${diagnostic.file} ${diagnostic.code}: ${diagnostic.message}`),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatAeonGraphPaths(
  result: AeonGraphResult,
  options: {
    readonly from?: boolean;
    readonly to?: boolean;
  } = {},
): string {
  const includeFrom = options.from ?? (!options.from && !options.to);
  const includeTo = options.to ?? (!options.from && !options.to);
  const paths = uniqueSorted(result.edges.flatMap((edge) => [
    ...(includeFrom ? [edge.from] : []),
    ...(includeTo ? [edge.to] : []),
  ]));
  return `${paths.join('\n')}${paths.length === 0 ? '' : '\n'}`;
}

export function summarizeAeonGraph(result: AeonGraphResult): AeonGraphSummary {
  const pointerEdges = result.edges.filter((edge) => edge.kind === 'pointer');
  return {
    format: 'aeon.graph.summary',
    version: 1,
    counts: {
      files: uniqueSorted([...result.nodes.map((node) => node.file), ...result.edges.map((edge) => edge.file), ...result.diagnostics.map((diagnostic) => diagnostic.file)]).length,
      nodes: result.nodes.length,
      edges: result.edges.length,
      diagnostics: result.diagnostics.length,
      byEdgeKind: {
        contains: result.edges.filter((edge) => edge.kind === 'contains').length,
        clone: result.edges.filter((edge) => edge.kind === 'clone').length,
        pointer: pointerEdges.length,
      },
    },
    files: uniqueSorted([...result.nodes.map((node) => node.file), ...result.edges.map((edge) => edge.file), ...result.diagnostics.map((diagnostic) => diagnostic.file)]),
    highRisk: {
      pointerEdges,
      pointerPaths: uniqueSorted(pointerEdges.flatMap((edge) => [edge.from, edge.to])),
    },
    diagnostics: result.diagnostics,
  };
}

export function formatAeonGraphSummaryText(summary: AeonGraphSummary): string {
  const lines = [
    `AEON graph summary: ${summary.counts.files} files, ${summary.counts.nodes} nodes, ${summary.counts.edges} edges, ${summary.counts.diagnostics} diagnostics`,
    `edges: ${summary.counts.byEdgeKind.contains} contains, ${summary.counts.byEdgeKind.clone} clone, ${summary.counts.byEdgeKind.pointer} pointer`,
    `high risk pointer paths: ${summary.highRisk.pointerPaths.length === 0 ? 'none' : summary.highRisk.pointerPaths.join(', ')}`,
    ...summary.diagnostics.map((diagnostic) => `${diagnostic.file} ${diagnostic.code}: ${diagnostic.message}`),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatAeonGraphDot(result: AeonGraphResult, options: AeonGraphDotOptions = {}): string {
  const theme = options.theme ?? 'plain';
  const lines = [
    'digraph "aeon.graph" {',
    ...dotGraphHeader(theme),
    ...result.nodes.map((node) => `  ${dotId(node.path)} [${dotAttrs(dotNodeAttrs(node, theme))}];`),
    ...result.edges.map((edge) => `  ${dotId(edge.from)} -> ${dotId(edge.to)} [${dotAttrs(dotEdgeAttrs(edge.kind, theme))}];`),
    ...result.diagnostics.map((diagnostic, index) => `  ${dotId(`diagnostic:${index}`)} [${dotAttrs(dotDiagnosticAttrs(diagnostic, theme))}];`),
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

function filterGraph(result: AeonGraphResult, options: AeonGraphOptions): AeonGraphResult {
  if (
    !options.ancestors
    && !options.descendants
    && !options.edgeKind
    && !options.fromPathPrefix
    && !options.path
    && !options.references
    && !options.toPathPrefix
  ) {
    return result;
  }
  const descendantPaths = options.descendants === undefined
    ? undefined
    : collectDescendantPaths(result.edges, options.descendants);
  const ancestorPaths = options.ancestors === undefined
    ? undefined
    : collectAncestorPaths(result.edges, options.ancestors);
  const edges = result.edges.filter((edge) => {
    const ancestorMatch = ancestorPaths === undefined || ancestorScopedEdgeMatch(edge, ancestorPaths);
    const descendantMatch = descendantPaths === undefined || descendantScopedEdgeMatch(edge, descendantPaths);
    const edgeKindMatch = options.edgeKind === undefined || edge.kind === options.edgeKind;
    const fromPrefixMatch = options.fromPathPrefix === undefined || pathMatchesPrefix(edge.from, options.fromPathPrefix);
    const pathMatch = options.path === undefined || edge.from === options.path || edge.to === options.path;
    const referenceMatch = options.references === undefined || (edge.kind !== 'contains' && edge.to === options.references);
    const toPrefixMatch = options.toPathPrefix === undefined || pathMatchesPrefix(edge.to, options.toPathPrefix);
    return ancestorMatch && descendantMatch && edgeKindMatch && fromPrefixMatch && pathMatch && referenceMatch && toPrefixMatch;
  });
  const visiblePaths = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const nodes = result.nodes.filter((node) => (
    visiblePaths.has(node.path)
      || node.path === options.ancestors
      || node.path === options.descendants
      || node.path === options.path
      || node.path === options.references
  ));
  return {
    ...result,
    nodes,
    edges,
  };
}

function collectDescendantPaths(edges: readonly AeonGraphEdge[], root: string): Set<string> {
  const paths = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (edge.kind === 'contains' && paths.has(edge.from) && !paths.has(edge.to)) {
        paths.add(edge.to);
        changed = true;
      }
    }
  }
  return paths;
}

function collectAncestorPaths(edges: readonly AeonGraphEdge[], child: string): Set<string> {
  const paths = new Set([child]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (edge.kind === 'contains' && paths.has(edge.to) && !paths.has(edge.from)) {
        paths.add(edge.from);
        changed = true;
      }
    }
  }
  return paths;
}

function ancestorScopedEdgeMatch(edge: AeonGraphEdge, paths: ReadonlySet<string>): boolean {
  if (edge.kind === 'contains') {
    return paths.has(edge.from) && paths.has(edge.to);
  }
  return paths.has(edge.from);
}

function descendantScopedEdgeMatch(edge: AeonGraphEdge, paths: ReadonlySet<string>): boolean {
  return paths.has(edge.from) || (edge.kind === 'contains' && paths.has(edge.to));
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function dotGraphHeader(theme: AeonGraphDotTheme): readonly string[] {
  if (theme === 'agent') {
    return [
      '  graph [rankdir=LR, bgcolor="#fbf7ef", pad="0.35"];',
      '  node [shape=box, style="rounded,filled", fontname="Menlo", fontsize=10, color="#7a6a57", fillcolor="#fffdf7"];',
      '  edge [fontname="Menlo", fontsize=9, arrowsize=0.8];',
    ];
  }
  return [
    '  graph [rankdir=LR];',
    '  node [shape=box, style="rounded"];',
  ];
}

function dotNodeAttrs(node: AeonGraphNode, theme: AeonGraphDotTheme): Record<string, string> {
  const label = dotNodeLabel(node);
  if (theme === 'plain') {
    return { label };
  }
  if (node.kind === 'reference') {
    return { label, fillcolor: '#eef6ff', color: '#3778a8' };
  }
  if (node.kind === 'node') {
    return { label, fillcolor: '#f4edff', color: '#7963a8' };
  }
  return { label, fillcolor: '#fffdf7', color: '#7a6a57' };
}

function dotEdgeAttrs(kind: AeonGraphEdgeKind, theme: AeonGraphDotTheme): Record<string, string> {
  if (theme === 'agent') {
    if (kind === 'contains') {
      return { label: kind, style: 'solid', color: '#7a6a57', penwidth: '1.2' };
    }
    if (kind === 'pointer') {
      return { label: kind, style: 'bold', color: '#c2410c', penwidth: '2.2' };
    }
    return { label: kind, style: 'dashed', color: '#2563eb', penwidth: '1.6' };
  }
  return { label: kind, style: dotEdgeStyle(kind) };
}

function dotDiagnosticAttrs(diagnostic: AeonGraphDiagnostic, theme: AeonGraphDotTheme): Record<string, string> {
  const label = `${diagnostic.code}: ${diagnostic.message}`;
  if (theme === 'agent') {
    return { label, shape: 'note', style: 'filled', fillcolor: '#fee2e2', color: '#b91c1c' };
  }
  return { label, shape: 'note' };
}

function dotAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}=${dotAttrValue(key, value)}`)
    .join(', ');
}

function dotAttrValue(key: string, value: string): string {
  if (key === 'label') {
    return dotString(value);
  }
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value) ? value : dotString(value);
}

function dotEdgeStyle(kind: AeonGraphEdgeKind): string {
  if (kind === 'contains') {
    return 'solid';
  }
  if (kind === 'pointer') {
    return 'bold';
  }
  return 'dashed';
}

function dotId(value: string): string {
  return dotString(value);
}

function dotNodeLabel(node: AeonGraphNode): string {
  const datatype = node.datatype === undefined ? '' : `:${node.datatype}`;
  return `${node.path}\\n${node.kind}${datatype}`;
}

function dotString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function parentPath(path: string): string | undefined {
  if (path === '$') {
    return undefined;
  }
  if (path.endsWith(']')) {
    const bracket = path.lastIndexOf('[');
    return bracket <= 0 ? undefined : path.slice(0, bracket);
  }
  const dot = path.lastIndexOf('.');
  return dot <= 0 ? undefined : path.slice(0, dot);
}

function eventKind(event: AssignmentEvent): string {
  const value = event.value as { readonly type?: unknown };
  if (value.type === 'NodeLiteral') {
    return 'node';
  }
  if (value.type === 'CloneReference' || value.type === 'PointerReference') {
    return 'reference';
  }
  if (typeof value.type === 'string' && value.type.endsWith('Literal')) {
    return value.type.slice(0, -'Literal'.length).replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  }
  return typeof value.type === 'string' ? value.type : 'unknown';
}

function formatReferencePath(path: readonly unknown[]): string {
  let result = '$';
  for (const segment of path) {
    if (typeof segment === 'number') {
      result += `[${segment}]`;
      continue;
    }
    if (typeof segment === 'string') {
      result += /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)
        ? `.${segment}`
        : `[${JSON.stringify(segment)}]`;
      continue;
    }
    if (segment && typeof segment === 'object' && 'key' in segment && typeof (segment as { readonly key?: unknown }).key === 'string') {
      const key = (segment as { readonly key: string }).key;
      result += /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
        ? `.@${key}`
        : `.@[${JSON.stringify(key)}]`;
    }
  }
  return result;
}

async function collectAeonFiles(path: string, files: string[]): Promise<void> {
  const info = await stat(path);
  if (info.isFile()) {
    if (path.endsWith('.aeon')) {
      files.push(path);
    }
    return;
  }
  if (!info.isDirectory()) {
    return;
  }
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
      continue;
    }
    await collectAeonFiles(join(path, entry.name), files);
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { readonly code?: unknown }).code === 'string') {
    return (error as { readonly code: string }).code;
  }
  return 'AEON_COMPILE_ERROR';
}
