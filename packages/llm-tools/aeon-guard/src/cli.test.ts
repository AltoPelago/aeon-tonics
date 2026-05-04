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

  assert.match(result.stdout, /AEON Guard AI Workflow/);
  assert.match(result.stdout, /aeon-guard incoming/);
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AEON Guard Examples/);
  assert.match(result.stdout, /examples\/guard-decide-workflow/);
  assert.match(result.stdout, /examples\/guard-apply-workflow/);
});

test('CLI summary emits JSON graph summary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'summary', file, '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.format, 'aeon.graph.summary');
  assert.equal(parsed.counts.byEdgeKind.pointer, 1);
});

test('CLI edit-preflight emits combined JSON report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base\n  theme = ~base }\ncopy = ~base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'edit-preflight', file, '--target', '$.base', '--scope', '$.app', '--clone-scope', '$.app', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.format, 'aeon.guard.preflight');
      assert.equal(parsed.checks.length, 3);
      return true;
    },
  );
});

test('CLI decide emits compact JSON advice output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'decide', file, '--scope', '$.app', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.deepEqual(parsed, {
        format: 'aeon.guard.advice',
        version: 1,
        ok: false,
        advice: 'warn',
      });
      return true;
    },
  );
});

test('CLI can write edit-preflight reports directly to an output file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  const out = join(dir, 'reports', 'preflight.json');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base\n  theme = ~base }\ncopy = ~base', 'utf8');

  const execution = await execFileAsync(
    process.execPath,
    [cliPath, 'edit-preflight', file, '--target', '$.base', '--scope', '$.app', '--clone-scope', '$.app', '--json', '--out', out],
  ).then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error: error as { readonly code?: number; readonly stdout?: string } }),
  );
  const written = JSON.parse(await readFile(out, 'utf8'));

  assert.equal(execution.ok, false);
  if (execution.ok) {
    assert.fail('Expected edit-preflight with --out to exit non-zero.');
  }
  assert.equal(execution.error.code, 1);
  assert.equal(execution.error.stdout, '');
  assert.equal(written.format, 'aeon.guard.preflight');
  assert.equal(written.checks.length, 3);
});

test('CLI edit-preflight --advice emits compact advice output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'edit-preflight', file, '--scope', '$.app', '--advice', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.deepEqual(parsed, {
        format: 'aeon.guard.advice',
        version: 1,
        ok: false,
        advice: 'warn',
      });
      return true;
    },
  );
});

test('CLI edit-preflight --advice --advice-exit block soft-passes warn', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'edit-preflight', file, '--scope', '$.app', '--advice', '--advice-exit', 'block', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.advice, 'warn');
});

test('CLI rejects invalid advice-exit values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'value:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'edit-preflight', file, '--target', '$.value', '--advice', '--advice-exit', 'maybe']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Invalid --advice-exit: maybe/);
      return true;
    },
  );
});

test('CLI pointers wraps no-pointer lint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\nptr = ~>base', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'pointers', file, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings[0].rule, 'no-pointer');
      return true;
    },
  );
});

test('CLI pointer-under supports graph-prefix mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\napp:object = { ptr = ~>base }\npanel:object = { ptr = ~>base }', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'pointer-under', file, '$.app', '--graph-prefix', '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 1);
      assert.equal(parsed.findings.length, 1);
      assert.equal(parsed.findings[0].from, '$.app.ptr');
      return true;
    },
  );
});

test('CLI incoming supports external mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"\ncopy = ~base', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'incoming', file, '$.base', '--external', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.findings.length, 0);
});

test('CLI rejects missing targets for targeted commands', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'incoming', file]),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /incoming requires at least one input and a target path/);
      return true;
    },
  );
});

test('CLI rejects edit-preflight without target or scope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'edit-preflight', file]),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /edit-preflight requires --target, --scope, --clone-scope, or some combination of them/);
      return true;
    },
  );
});

test('CLI rejects decide without target or scope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-guard-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'base:string = "x"', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'decide', file]),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /decide requires --target, --scope, --clone-scope, or some combination of them/);
      return true;
    },
  );
});
