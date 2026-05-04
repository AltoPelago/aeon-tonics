import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

test('CLI prints embedded agent workflow with --ai', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--ai']);

  assert.match(result.stdout, /AEON Lint AI Workflow/);
  assert.match(result.stdout, /aeon-lint repo\/ --references/);
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AEON Lint Examples/);
  assert.match(result.stdout, /examples\/search-graph-lint-workflow/);
  assert.match(result.stdout, /examples\/guard-workflow/);
  assert.match(result.stdout, /examples\/guard-decide-workflow/);
});

test('CLI emits JSON lint output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.format, 'aeon.lint');
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-pointer');
      return true;
    },
  );
});

test('CLI emits SARIF lint output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--format', 'sarif']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.version, '2.1.0');
      assert.equal(parsed.runs[0].tool.driver.name, 'aeon-lint');
      assert.equal(parsed.runs[0].results[0].ruleId, 'no-pointer');
      return true;
    },
  );
});

test('CLI supports incoming-reference rule with references filter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--references', '$.base', '--rule', 'no-incoming-reference', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-incoming-reference');
      return true;
    },
  );
});

test('CLI supports pointer-under scoped checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }\notherPtr = ~>base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--pointer-under', '$.app', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-pointer-under');
      assert.equal(parsed.findings[0].from, '$.app.ptr');
      return true;
    },
  );
});

test('CLI supports clone-into scoped checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { theme = ~base }\nother = ~base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--clone-into', '$.app', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-clone-into');
      assert.equal(parsed.findings[0].from, '$.app.theme');
      return true;
    },
  );
});

test('CLI supports pointer-under scopes loaded from files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  const scopeFile = join(dir, 'pointer-scopes.txt');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }\notherPtr = ~>base', 'utf8');
  await writeFile(scopeFile, '# protected scopes\n$.app\n', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--pointer-under-file', scopeFile, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-pointer-under');
      assert.equal(parsed.findings[0].from, '$.app.ptr');
      return true;
    },
  );
});

test('CLI supports graph-derived pointer-under scoped checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }\npanel:object = { ptr = ~>base }', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--pointer-under-graph-prefix', '$.app', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-pointer-under');
      assert.equal(parsed.findings[0].from, '$.app.ptr');
      return true;
    },
  );
});

test('CLI supports clone-into scopes loaded from files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  const scopeFile = join(dir, 'clone-scopes.txt');
  await writeFile(file, 'base:string = "x"\napp:object = { theme = ~base }\nother = ~base', 'utf8');
  await writeFile(scopeFile, '# protected scopes\n$.app\n', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--clone-into-file', scopeFile, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-clone-into');
      assert.equal(parsed.findings[0].from, '$.app.theme');
      return true;
    },
  );
});

test('CLI supports graph-derived clone-into scoped checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { theme = ~base }\npanel:object = { theme = ~base }', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--clone-into-graph-prefix', '$.app', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].rule, 'no-clone-into');
      assert.equal(parsed.findings[0].from, '$.app.theme');
      return true;
    },
  );
});

test('CLI can pass when no findings are produced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--rule', 'no-external-reference', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.findings.length, 0);
});

test('CLI rejects invalid rule values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--rule', 'no-clone']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --rule: no-clone/);
      return true;
    },
  );
});

test('CLI rejects invalid output format values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--format', 'xml']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --format: xml/);
      return true;
    },
  );
});

test('CLI reports missing scope files as usage failures in json mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--pointer-under-file', join(dir, 'missing.txt'), '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.ok, false);
      assert.match(parsed.error.message, /ENOENT/);
      return true;
    },
  );
});
