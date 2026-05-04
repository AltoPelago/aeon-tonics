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

test('CLI searches AEON files by path and emits JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app:object = {',
    '  status:string = "draft"',
    '}',
  ].join('\n'), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, dir, '--path', '$.app.status', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.format, 'aeon.search');
  assert.equal(parsed.matches.length, 1);
  assert.equal(parsed.matches[0].file, file);
  assert.equal(parsed.matches[0].preview, '"draft"');
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AEON Search Examples/);
  assert.match(result.stdout, /examples\/search-graph-lint-workflow/);
  assert.match(result.stdout, /examples\/guard-decide-workflow/);
});

test('CLI searches by kind in human mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'view:node = <panel:node>', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--kind', 'node']);

  assert.match(result.stdout, /AEON search: 1 matches, 0 diagnostics/);
  assert.match(result.stdout, /\$\.view node :node = <panel>/);
});

test('CLI can emit unique matched paths for downstream tooling', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'app:object = {',
    '  one:string = "x"',
    '  two:string = "y"',
    '}',
    'appCopy = ~app.one',
  ].join('\n'), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--path-prefix', '$.app', '--format', 'paths']);

  assert.equal(result.stdout, ['$.app', '$.app.one', '$.app.two'].join('\n') + '\n');
});

test('CLI can write unique matched paths directly to an output file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  const file = join(dir, 'doc.aeon');
  const out = join(dir, 'scopes', 'app-paths.txt');
  await writeFile(file, [
    'app:object = {',
    '  one:string = "x"',
    '}',
  ].join('\n'), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--path-prefix', '$.app', '--format', 'paths', '--out', out]);
  const written = await readFile(out, 'utf8');

  assert.equal(result.stdout, '');
  assert.equal(written, '$.app\n$.app.one\n');
});

test('CLI exits non-zero when searched files fail to compile', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
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

test('CLI reports missing option values as usage errors', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, '--path']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Missing value for --path/);
      return true;
    },
  );
});

test('CLI rejects invalid output format values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--format', 'yaml']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --format: yaml/);
      return true;
    },
  );
});
