import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  discoverAeonGraphFiles,
  formatAeonGraphDot,
  formatAeonGraphPaths,
  formatAeonGraphSummaryText,
  formatAeonGraphText,
  graphAeonFiles,
  graphAesEvents,
  summarizeAeonGraph,
} from './index.js';

const source = [
  'base:string = "x"',
  'ref = ~base',
  'ptr = ~>base',
  'obj:object = { nested = ~base }',
].join('\n');

const deepSource = [
  'base:string = "x"',
  'obj:object = {',
  '  child:object = {',
  '    leaf:string = "green"',
  '  }',
  '  copy = ~base',
  '}',
].join('\n');

test('graphAesEvents emits nodes plus containment and reference edges', () => {
  const compiled = compile(source, { maxAttributeDepth: 2 });
  assert.equal(compiled.errors.length, 0);

  const graph = graphAesEvents(compiled.events, { file: 'doc.aeon' });

  assert.deepEqual(graph.nodes.map((node) => node.path), ['$.base', '$.ref', '$.ptr', '$.obj', '$.obj.nested']);
  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.nested', 'contains'],
    ['$.ref', '$.base', 'clone'],
    ['$.ptr', '$.base', 'pointer'],
    ['$.obj.nested', '$.base', 'clone'],
  ]);
});

test('graphAesEvents renders reference attribute targets with explicit attribute-space segments', () => {
  const compiled = compile(
    'base@{meta:string = "x", "x.y":string = "dot"}:string = "x"\nref = ~base.@.meta\nquoted = ~base.@.["x.y"]',
    { maxAttributeDepth: 2 },
  );
  assert.equal(compiled.errors.length, 0);

  const graph = graphAesEvents(compiled.events, { file: 'doc.aeon' });

  assert.deepEqual(
    graph.edges.filter((edge) => edge.kind === 'clone').map((edge) => [edge.from, edge.to]),
    [
      ['$.ref', '$.base.@.meta'],
      ['$.quoted', '$.base.@.["x.y"]'],
    ],
  );
  assert.equal(graph.edges.some((edge) => edge.to.includes('base@')), false);
});

test('graphAeonFiles discovers files and filters incoming references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const nested = join(dir, 'nested');
  await mkdir(nested);
  const one = join(dir, 'one.aeon');
  const two = join(nested, 'two.aeon');
  await writeFile(one, source, 'utf8');
  await writeFile(two, 'theme:string = "dark"\nuseTheme = ~theme', 'utf8');

  const files = await discoverAeonGraphFiles([dir]);
  const graph = await graphAeonFiles([dir], { references: '$.base' });

  assert.deepEqual(files, [one, two].sort());
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.edges.every((edge) => edge.kind !== 'contains'), true);
  assert.equal(graph.nodes.some((node) => node.path === '$.base'), true);
  assert.equal(graph.nodes.some((node) => node.path === '$.theme'), false);
});

test('graphAeonFiles filters structural containment around a path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), source, 'utf8');

  const graph = await graphAeonFiles([dir], { path: '$.obj' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.nested', 'contains'],
  ]);
  assert.deepEqual(graph.nodes.map((node) => node.path).sort(), ['$.obj', '$.obj.nested']);
});

test('graphAeonFiles filters by edge kind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), source, 'utf8');

  const graph = await graphAeonFiles([dir], { edgeKind: 'pointer' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.ptr', '$.base', 'pointer'],
  ]);
  assert.deepEqual(graph.nodes.map((node) => node.path).sort(), ['$.base', '$.ptr']);
});

test('graphAeonFiles composes path and edge kind filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), source, 'utf8');

  const graph = await graphAeonFiles([dir], { edgeKind: 'contains', path: '$.obj' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.nested', 'contains'],
  ]);
});

test('graphAeonFiles filters by source path prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), deepSource, 'utf8');

  const graph = await graphAeonFiles([dir], { fromPathPrefix: '$.obj', edgeKind: 'contains' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.child', 'contains'],
    ['$.obj.child', '$.obj.child.leaf', 'contains'],
    ['$.obj', '$.obj.copy', 'contains'],
  ]);
});

test('graphAeonFiles filters by target path prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), deepSource, 'utf8');

  const graph = await graphAeonFiles([dir], { toPathPrefix: '$.obj', edgeKind: 'contains' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.child', 'contains'],
    ['$.obj.child', '$.obj.child.leaf', 'contains'],
    ['$.obj', '$.obj.copy', 'contains'],
  ]);
});

test('graphAeonFiles does not overmatch sibling path prefixes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), [
    'app:object = { child:string = "x" }',
    'appTheme:object = { color:string = "blue" }',
  ].join('\n'), 'utf8');

  const graph = await graphAeonFiles([dir], { fromPathPrefix: '$.app', edgeKind: 'contains' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to]), [
    ['$.app', '$.app.child'],
  ]);
});

test('graphAeonFiles filters descendant scopes through containment edges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), deepSource, 'utf8');

  const graph = await graphAeonFiles([dir], { descendants: '$.obj' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.child', 'contains'],
    ['$.obj.child', '$.obj.child.leaf', 'contains'],
    ['$.obj', '$.obj.copy', 'contains'],
    ['$.obj.copy', '$.base', 'clone'],
  ]);
  assert.deepEqual(graph.nodes.map((node) => node.path).sort(), ['$.base', '$.obj', '$.obj.child', '$.obj.child.leaf', '$.obj.copy']);
});

test('graphAeonFiles filters ancestor scopes through containment edges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'doc.aeon'), deepSource, 'utf8');

  const graph = await graphAeonFiles([dir], { ancestors: '$.obj.child.leaf', edgeKind: 'contains' });

  assert.deepEqual(graph.edges.map((edge) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.child', 'contains'],
    ['$.obj.child', '$.obj.child.leaf', 'contains'],
  ]);
  assert.deepEqual(graph.nodes.map((node) => node.path).sort(), ['$.obj', '$.obj.child', '$.obj.child.leaf']);
});

test('graphAeonFiles reports compile diagnostics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  await writeFile(join(dir, 'bad.aeon'), 'broken:number = ', 'utf8');

  const graph = await graphAeonFiles([dir]);

  assert.equal(graph.nodes.length, 0);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.diagnostics.length > 0, true);
});

test('formatAeonGraphText renders compact graph output', () => {
  const text = formatAeonGraphText({
    format: 'aeon.graph',
    version: 1,
    nodes: [{ file: 'doc.aeon', path: '$.base', kind: 'string', datatype: 'string' }],
    edges: [{ file: 'doc.aeon', from: '$.ref', to: '$.base', kind: 'clone' }],
    diagnostics: [],
  });

  assert.match(text, /AEON graph: 1 nodes, 1 edges, 0 diagnostics/);
  assert.match(text, /node doc\.aeon \$\.base string :string/);
  assert.match(text, /edge doc\.aeon \$\.ref -clone-> \$\.base/);
});

test('formatAeonGraphPaths renders unique sorted edge endpoints', () => {
  const paths = formatAeonGraphPaths({
    format: 'aeon.graph',
    version: 1,
    nodes: [],
    edges: [
      { file: 'doc.aeon', from: '$.ptr', to: '$.base', kind: 'pointer' },
      { file: 'doc.aeon', from: '$.clone', to: '$.base', kind: 'clone' },
    ],
    diagnostics: [],
  });

  assert.equal(paths, '$.base\n$.clone\n$.ptr\n');
});

test('formatAeonGraphPaths can isolate source or target paths', () => {
  const result = {
    format: 'aeon.graph' as const,
    version: 1 as const,
    nodes: [],
    edges: [
      { file: 'doc.aeon', from: '$.ptr', to: '$.base', kind: 'pointer' as const },
      { file: 'doc.aeon', from: '$.clone', to: '$.base', kind: 'clone' as const },
    ],
    diagnostics: [],
  };

  assert.equal(formatAeonGraphPaths(result, { from: true }), '$.clone\n$.ptr\n');
  assert.equal(formatAeonGraphPaths(result, { to: true }), '$.base\n');
});

test('summarizeAeonGraph reports counts, files, pointer risk, and diagnostics', () => {
  const summary = summarizeAeonGraph({
    format: 'aeon.graph',
    version: 1,
    nodes: [
      { file: 'doc.aeon', path: '$.base', kind: 'string', datatype: 'string' },
      { file: 'doc.aeon', path: '$.ptr', kind: 'reference' },
    ],
    edges: [
      { file: 'doc.aeon', from: '$.ptr', to: '$.base', kind: 'pointer' },
      { file: 'doc.aeon', from: '$.obj', to: '$.obj.child', kind: 'contains' },
    ],
    diagnostics: [{ file: 'bad.aeon', code: 'AEON_ERROR', message: 'bad value' }],
  });

  assert.equal(summary.format, 'aeon.graph.summary');
  assert.deepEqual(summary.counts, {
    files: 2,
    nodes: 2,
    edges: 2,
    diagnostics: 1,
    byEdgeKind: { contains: 1, clone: 0, pointer: 1 },
  });
  assert.deepEqual(summary.files, ['bad.aeon', 'doc.aeon']);
  assert.deepEqual(summary.highRisk.pointerPaths, ['$.base', '$.ptr']);
  assert.equal(summary.highRisk.pointerEdges.length, 1);
});

test('formatAeonGraphSummaryText renders compact summary output', () => {
  const text = formatAeonGraphSummaryText({
    format: 'aeon.graph.summary',
    version: 1,
    counts: {
      files: 1,
      nodes: 2,
      edges: 1,
      diagnostics: 0,
      byEdgeKind: { contains: 0, clone: 0, pointer: 1 },
    },
    files: ['doc.aeon'],
    highRisk: {
      pointerEdges: [{ file: 'doc.aeon', from: '$.ptr', to: '$.base', kind: 'pointer' }],
      pointerPaths: ['$.base', '$.ptr'],
    },
    diagnostics: [],
  });

  assert.match(text, /AEON graph summary: 1 files, 2 nodes, 1 edges, 0 diagnostics/);
  assert.match(text, /edges: 0 contains, 0 clone, 1 pointer/);
  assert.match(text, /high risk pointer paths: \$\.base, \$\.ptr/);
});

test('formatAeonGraphDot renders graphviz output with escaped labels', () => {
  const dot = formatAeonGraphDot({
    format: 'aeon.graph',
    version: 1,
    nodes: [{ file: 'doc.aeon', path: '$["quoted"]', kind: 'string', datatype: 'string' }],
    edges: [{ file: 'doc.aeon', from: '$.ref', to: '$["quoted"]', kind: 'clone' }],
    diagnostics: [{ file: 'bad.aeon', code: 'AEON_ERROR', message: 'bad "thing"' }],
  });

  assert.match(dot, /^digraph "aeon\.graph" \{/);
  assert.match(dot, /"\$\[\\"quoted\\"\]" \[label="\$\[\\"quoted\\"\]\\\\nstring:string"\];/);
  assert.match(dot, /"\$\.ref" -> "\$\[\\"quoted\\"\]" \[label="clone", style=dashed\];/);
  assert.match(dot, /"diagnostic:0" \[label="AEON_ERROR: bad \\"thing\\"", shape=note\];/);
});

test('formatAeonGraphDot supports the agent visual theme', () => {
  const dot = formatAeonGraphDot({
    format: 'aeon.graph',
    version: 1,
    nodes: [
      { file: 'doc.aeon', path: '$.base', kind: 'string', datatype: 'string' },
      { file: 'doc.aeon', path: '$.ptr', kind: 'reference' },
    ],
    edges: [{ file: 'doc.aeon', from: '$.ptr', to: '$.base', kind: 'pointer' }],
    diagnostics: [{ file: 'bad.aeon', code: 'AEON_ERROR', message: 'bad value' }],
  }, { theme: 'agent' });

  assert.match(dot, /graph \[rankdir=LR, bgcolor="#fbf7ef", pad="0\.35"\];/);
  assert.match(dot, /"\$\.ptr" \[label="\$\.ptr\\\\nreference", fillcolor="#eef6ff", color="#3778a8"\];/);
  assert.match(dot, /"\$\.ptr" -> "\$\.base" \[label="pointer", style=bold, color="#c2410c", penwidth="2\.2"\];/);
  assert.match(dot, /"diagnostic:0" \[label="AEON_ERROR: bad value", shape=note, style=filled, fillcolor="#fee2e2", color="#b91c1c"\];/);
});
