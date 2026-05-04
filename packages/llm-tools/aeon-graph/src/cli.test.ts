import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

test('CLI prints embedded agent workflow with --ai', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--ai']);

  assert.match(result.stdout, /AEON Graph AI Workflow/);
  assert.match(result.stdout, /aeon-graph repo\/ --references/);
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AEON Graph Examples/);
  assert.match(result.stdout, /examples\/search-graph-lint-workflow/);
  assert.match(result.stdout, /examples\/guard-workflow/);
});

test('CLI emits JSON graph output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nref = ~base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--references', '$.base', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.format, 'aeon.graph');
  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.edges[0].from, '$.ref');
  assert.equal(parsed.edges[0].to, '$.base');
});

test('CLI can inspect structural containment around a path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'obj:object = { nested:string = "x" }', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--path', '$.obj', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.edges[0].kind, 'contains');
  assert.equal(parsed.edges[0].from, '$.obj');
  assert.equal(parsed.edges[0].to, '$.obj.nested');
});

test('CLI filters graph output by edge kind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'pointer', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.edges[0].kind, 'pointer');
  assert.equal(parsed.edges[0].from, '$.ptr');
  assert.equal(parsed.edges[0].to, '$.base');
});

test('CLI filters graph output to descendants', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nobj:object = { child:object = { leaf:string = "x" } }', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--descendants', '$.obj', '--edge-kind', 'contains', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.deepEqual(parsed.edges.map((edge: { readonly from: string; readonly to: string; readonly kind: string }) => [edge.from, edge.to, edge.kind]), [
    ['$.obj', '$.obj.child', 'contains'],
    ['$.obj.child', '$.obj.child.leaf', 'contains'],
  ]);
});

test('CLI filters graph output to ancestors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'obj:object = { child:object = { leaf:string = "x" } }', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--ancestors', '$.obj.child.leaf', '--edge-kind', 'contains', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.deepEqual(parsed.nodes.map((node: { readonly path: string }) => node.path).sort(), ['$.obj', '$.obj.child', '$.obj.child.leaf']);
});

test('CLI emits DOT graph output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--format', 'dot']);

  assert.match(result.stdout, /^digraph "aeon\.graph" \{/);
  assert.match(result.stdout, /"\$\.copy" -> "\$\.base" \[label="clone", style=dashed\];/);
});

test('CLI emits graph paths for downstream scope files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'pointer', '--format', 'paths', '--from']);

  assert.equal(result.stdout, '$.ptr\n');
});

test('CLI emits graph target paths for downstream scope files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'clone', '--format', 'paths', '--to']);

  assert.equal(result.stdout, '$.base\n');
});

test('CLI filters graph paths by source path prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }\npanel:object = { ptr = ~>base }', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'pointer', '--from-path-prefix', '$.app', '--format', 'paths', '--from']);

  assert.equal(result.stdout, '$.app.ptr\n');
});

test('CLI filters graph paths by target path prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'shared:object = { theme:string = "dark" }\nappTheme = ~shared.theme\nother:string = "x"', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'clone', '--to-path-prefix', '$.shared', '--format', 'paths', '--to']);

  assert.equal(result.stdout, '$.shared.theme\n');
});

test('CLI can write graph source paths directly to an output file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  const out = join(dir, 'scopes', 'pointer-sources.txt');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'pointer', '--format', 'paths', '--from', '--out', out]);
  const written = await readFile(out, 'utf8');

  assert.equal(result.stdout, '');
  assert.equal(written, '$.ptr\n');
});

test('CLI emits JSON graph summary output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--summary', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.format, 'aeon.graph.summary');
  assert.equal(parsed.counts.byEdgeKind.clone, 1);
  assert.equal(parsed.counts.byEdgeKind.pointer, 1);
  assert.deepEqual(parsed.highRisk.pointerPaths, ['$.base', '$.ptr']);
});

test('CLI emits text graph summary output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--summary']);

  assert.match(result.stdout, /AEON graph summary:/);
  assert.match(result.stdout, /edges: 0 contains, 0 clone, 1 pointer/);
  assert.match(result.stdout, /high risk pointer paths: \$\.base, \$\.ptr/);
});

test('CLI can fail preflight when pointer edges are present', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--summary', '--json', '--fail-on', 'pointer']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.counts.byEdgeKind.pointer, 1);
      return true;
    },
  );
});

test('CLI fail-on pointer respects graph filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'clone', '--summary', '--json', '--fail-on', 'pointer']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.counts.byEdgeKind.clone, 1);
  assert.equal(parsed.counts.byEdgeKind.pointer, 0);
});

test('CLI can combine fail-on policies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--summary', '--fail-on', 'diagnostic', '--fail-on', 'pointer']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stdout ?? '', /edges: 0 contains, 0 clone, 1 pointer/);
      return true;
    },
  );
});

test('CLI can fail preflight when incoming references are present', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--references', '$.base', '--summary', '--json', '--fail-on', 'incoming-reference']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.counts.byEdgeKind.clone, 1);
      assert.equal(parsed.counts.byEdgeKind.pointer, 0);
      return true;
    },
  );
});

test('CLI fail-on incoming-reference respects target filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nother:string = "y"', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--references', '$.other', '--summary', '--json', '--fail-on', 'incoming-reference']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.counts.byEdgeKind.clone, 0);
  assert.equal(parsed.counts.byEdgeKind.pointer, 0);
});

test('CLI fail-on external-reference does not fail same-file references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--summary', '--json', '--fail-on', 'external-reference']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.counts.byEdgeKind.clone, 1);
  assert.equal(parsed.counts.byEdgeKind.pointer, 1);
});

test('CLI emits themed DOT graph output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--format', 'dot', '--dot-theme', 'agent']);

  assert.match(result.stdout, /graph \[rankdir=LR, bgcolor="#fbf7ef", pad="0\.35"\];/);
  assert.match(result.stdout, /"\$\.ptr" -> "\$\.base" \[label="pointer", style=bold, color="#c2410c", penwidth="2\.2"\];/);
});

test('CLI rejects invalid edge kind values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--edge-kind', 'reference']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --edge-kind: reference/);
      return true;
    },
  );
});

test('CLI rejects invalid output format values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--format', 'svg']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --format: svg/);
      return true;
    },
  );
});

test('CLI rejects invalid DOT theme values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--format', 'dot', '--dot-theme', 'neon']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --dot-theme: neon/);
      return true;
    },
  );
});

test('CLI rejects invalid fail-on values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--fail-on', 'reference']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --fail-on: reference/);
      return true;
    },
  );
});

test('CLI exits non-zero when searched files fail to compile', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-graph-'));
  const file = join(dir, 'bad.aeon');
  await writeFile(file, 'broken:number = ', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.diagnostics.length > 0, true);
      return true;
    },
  );
});
