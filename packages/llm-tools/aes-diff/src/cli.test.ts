import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { createAesPatch, diffAes } from './index.js';

const execFileAsync = promisify(execFile);
const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

test('CLI emits text diff output for two AEON files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const before = join(dir, 'before.aeon');
  const after = join(dir, 'after.aeon');
  await writeFile(before, 'a = 1\n', 'utf8');
  await writeFile(after, 'a = 2\nb = true\n', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, before, after]);

  assert.match(result.stdout, /AES diff: 1 added, 0 removed, 1 changed, 0 unchanged/);
  assert.match(result.stdout, /\+ \$\.b/);
  assert.match(result.stdout, /~ \$\.a \(value\)/);
});

test('CLI prints embedded agent workflow with --ai', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--ai']);

  assert.match(result.stdout, /AES Diff agent workflow/);
  assert.match(result.stdout, /aes-diff --summary before\.aeon after\.aeon/);
  assert.match(result.stdout, /1: --check found semantic changes/);
  assert.match(result.stdout, /aeon-edit plan-\*/);
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AES Diff Examples/);
  assert.match(result.stdout, /examples\/diff-edit-workflow/);
  assert.match(result.stdout, /examples\/apply-workflow/);
});

test('CLI emits JSON summary and supports check exit code', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const before = join(dir, 'before.aeon');
  const after = join(dir, 'after.aeon');
  await writeFile(before, 'a = 1\n', 'utf8');
  await writeFile(after, 'a = 2\n', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, '--check', '--summary', before, after]),
    (error: unknown) => {
      assert.equal((error as { code?: number }).code, 1);
      const stdout = String((error as { stdout?: string }).stdout ?? '');
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.headline, '1 semantic AES change; 0 added; 0 removed; 1 changed.');
      assert.deepEqual(parsed.paths, ['$.a']);
      return true;
    },
  );
});

test('CLI can compare AES JSON inputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const before = join(dir, 'before.aes.json');
  const after = join(dir, 'after.aes.json');
  const beforeEvents = compile('a = 1\n');
  const afterEvents = compile('a = 2\nb = true\n');

  assert.equal(beforeEvents.errors.length, 0);
  assert.equal(afterEvents.errors.length, 0);

  await writeFile(before, JSON.stringify({ events: beforeEvents.events }), 'utf8');
  await writeFile(after, JSON.stringify(afterEvents.events), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, '--from-aes', '--json', before, after]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.summary.added, 1);
  assert.equal(parsed.summary.changed, 1);
  assert.deepEqual(
    parsed.changes.map((change: { readonly kind: string; readonly path: string }) => [change.kind, change.path]),
    [
      ['changed', '$.a'],
      ['added', '$.b'],
    ],
  );
});

test('CLI can scope diffs to a path subtree', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const before = join(dir, 'before.aeon');
  const after = join(dir, 'after.aeon');
  await writeFile(before, 'app = { count:number = 1 }\nother = "old"\n', 'utf8');
  await writeFile(after, 'app = { count:number = 2 }\nother = "new"\n', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, '--path', '$.app', before, after]);

  assert.match(result.stdout, /~ \$\.app \(value\)/);
  assert.match(result.stdout, /~ \$\.app\.count \(value\)/);
  assert.doesNotMatch(result.stdout, /\$\.other/);
});

test('CLI can emit non-applying patch JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const before = join(dir, 'before.aeon');
  const after = join(dir, 'after.aeon');
  await writeFile(before, 'a = 1\nold = true\n', 'utf8');
  await writeFile(after, 'a = 2\nnew = "ok"\n', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, '--patch', before, after]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.format, 'aes.patch');
  assert.equal(parsed.applicable, true);
  assert.deepEqual(
    parsed.operations.map((operation: { readonly op: string; readonly path: string }) => [operation.op, operation.path]),
    [
      ['replace', '$.a'],
      ['add', '$.new'],
      ['remove', '$.old'],
    ],
  );
});

test('CLI can apply patch JSON to AES JSON input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const base = join(dir, 'base.aes.json');
  const patchFile = join(dir, 'patch.json');
  const before = compile('a = 1\nold = true\n');
  const after = compile('a = 2\nnew = "ok"\n');

  assert.equal(before.errors.length, 0);
  assert.equal(after.errors.length, 0);

  await writeFile(base, JSON.stringify({ events: before.events }), 'utf8');
  await writeFile(patchFile, JSON.stringify(createAesPatch(diffAes(before.events, after.events))), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'apply', '--from-aes', base, patchFile]);
  const parsed = JSON.parse(result.stdout);
  const verification = diffAes(parsed.events, after.events);

  assert.equal(Array.isArray(parsed.events), true);
  assert.equal(verification.changes.length, 0);
});

test('CLI apply rejects stale AES bases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aes-diff-'));
  const base = join(dir, 'base.aes.json');
  const patchFile = join(dir, 'patch.json');
  const before = compile('a = 1\n');
  const after = compile('a = 2\n');
  const stale = compile('a = 3\n');

  assert.equal(before.errors.length, 0);
  assert.equal(after.errors.length, 0);
  assert.equal(stale.errors.length, 0);

  await writeFile(base, JSON.stringify({ events: stale.events }), 'utf8');
  await writeFile(patchFile, JSON.stringify(createAesPatch(diffAes(before.events, after.events))), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'apply', '--from-aes', base, patchFile]),
    (error: unknown) => {
      assert.equal((error as { code?: number }).code, 2);
      const parsed = JSON.parse(String((error as { stdout?: string }).stdout ?? ''));
      assert.equal(parsed.ok, false);
      assert.equal(parsed.diagnostics[0]?.code, 'PATCH_STALE_BASE');
      return true;
    },
  );
});

test('CLI returns usage errors for invalid arguments', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, '--unknown']),
    (error: unknown) => {
      assert.equal((error as { code?: number }).code, 2);
      assert.match(String((error as { stderr?: string }).stderr ?? ''), /Unknown option/);
      return true;
    },
  );
});
