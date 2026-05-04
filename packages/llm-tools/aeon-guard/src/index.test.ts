import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAeonGuard } from './index.js';

test('runAeonGuard summary returns graph summary output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await runAeonGuard([dir], { command: 'summary', format: 'json' });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 0);
  assert.equal(parsed.format, 'aeon.graph.summary');
  assert.equal(parsed.counts.byEdgeKind.pointer, 1);
});

test('runAeonGuard pointers wraps no-pointer lint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await runAeonGuard([dir], { command: 'pointers', format: 'json' });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 1);
  assert.equal(parsed.findings[0].rule, 'no-pointer');
});

test('runAeonGuard pointer-under supports graph-prefix mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base }\npanel:object = { ptr = ~>base }', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'pointer-under',
    target: '$.app',
    graphPrefix: true,
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 1);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].from, '$.app.ptr');
});

test('runAeonGuard incoming supports external mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\ncopy = ~base', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'incoming',
    target: '$.base',
    external: true,
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 0);
  assert.equal(parsed.findings.length, 0);
});

test('runAeonGuard edit-preflight combines summary and focused checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base\n  theme = ~base }\ncopy = ~base', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'edit-preflight',
    target: '$.base',
    scope: '$.app',
    cloneScope: '$.app',
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 1);
  assert.equal(parsed.format, 'aeon.guard.preflight');
  assert.equal(parsed.summary.counts.byEdgeKind.pointer, 1);
  assert.equal(parsed.checks.length, 3);
  assert.equal(parsed.advice, 'warn');
  assert.deepEqual(parsed.checks.map((check: { readonly kind: string }) => check.kind).sort(), ['clone-into', 'incoming', 'pointer-under']);
});

test('runAeonGuard edit-preflight advice-only returns compact advice output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base }', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'edit-preflight',
    scope: '$.app',
    adviceOnly: true,
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 1);
  assert.deepEqual(parsed, {
    format: 'aeon.guard.advice',
    version: 1,
    ok: false,
    advice: 'warn',
  });
});

test('runAeonGuard edit-preflight advice-only can soft-pass warn with advice-exit block', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base }', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'edit-preflight',
    scope: '$.app',
    adviceOnly: true,
    adviceExit: 'block',
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 0);
  assert.equal(parsed.advice, 'warn');
});

test('runAeonGuard edit-preflight advice-only can require proceed with advice-exit proceed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'value:string = "x"', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'edit-preflight',
    target: '$.value',
    adviceOnly: true,
    adviceExit: 'proceed',
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 1);
  assert.equal(parsed.advice, 'proceed');
});

test('runAeonGuard decide emits compact advice without needing adviceOnly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base }', 'utf8');

  const result = await runAeonGuard([dir], {
    command: 'decide',
    scope: '$.app',
    format: 'json',
  });
  const parsed = JSON.parse(result.output);

  assert.equal(result.exitCode, 1);
  assert.deepEqual(parsed, {
    format: 'aeon.guard.advice',
    version: 1,
    ok: false,
    advice: 'warn',
  });
});
