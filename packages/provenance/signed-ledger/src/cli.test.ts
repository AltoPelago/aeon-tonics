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

test('CLI keygen, append, inspect, and verify workflow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-ledger-'));
  const key = join(dir, 'key.json');
  const event = join(dir, 'event.json');
  const ledger = join(dir, 'ledger.jsonl');
  await writeFile(event, JSON.stringify({
    kind: 'aeon.edit.applied',
    tool: 'aeon-edit',
    command: 'set',
    file: 'file.aeon',
    target: 'file.aeon',
    beforeHash: 'sha256:before',
    afterHash: 'sha256:after',
  }), 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'keygen', '--out', key, '--key-id', 'local-dev']);
  await execFileAsync(process.execPath, [cliPath, 'append', '--ledger', ledger, '--event', event, '--key', key]);

  const ledgerText = await readFile(ledger, 'utf8');
  assert.match(ledgerText, /"format":"aeon\.ledger\.entry"/);
  assert.match(ledgerText, /"keyId":"local-dev"/);

  const inspect = await execFileAsync(process.execPath, [cliPath, 'inspect', '--ledger', ledger]);
  assert.match(inspect.stdout, /entries: 1/);
  assert.match(inspect.stdout, /aeon\.edit\.applied/);

  const verified = await execFileAsync(process.execPath, [cliPath, 'verify', '--ledger', ledger, '--key', key, '--json']);
  const result = JSON.parse(verified.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.entries, 1);
  assert.deepEqual(result.signers, ['local-dev']);
});

test('CLI verify fails on tampered ledgers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-ledger-'));
  const key = join(dir, 'key.json');
  const event = join(dir, 'event.json');
  const ledger = join(dir, 'ledger.jsonl');
  await writeFile(event, JSON.stringify({ kind: 'example.event', value: 1 }), 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'keygen', '--out', key]);
  await execFileAsync(process.execPath, [cliPath, 'append', '--ledger', ledger, '--event', event, '--key', key]);
  const entry = JSON.parse(await readFile(ledger, 'utf8'));
  entry.payload.value = 2;
  await writeFile(ledger, `${JSON.stringify(entry)}\n`, 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'verify', '--ledger', ledger, '--key', key, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const result = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(result.ok, false);
      assert.ok(result.diagnostics.some((diagnostic: { readonly code: string }) => diagnostic.code === 'SIGNATURE_MISMATCH'));
      return true;
    },
  );
});

test('CLI head and verify --expect-head detect rollback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-ledger-'));
  const key = join(dir, 'key.json');
  const event = join(dir, 'event.json');
  const ledger = join(dir, 'ledger.jsonl');
  await writeFile(event, JSON.stringify({ kind: 'example.event', value: 1 }), 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'keygen', '--out', key]);
  await execFileAsync(process.execPath, [cliPath, 'append', '--ledger', ledger, '--event', event, '--key', key]);
  await writeFile(event, JSON.stringify({ kind: 'example.event', value: 2 }), 'utf8');
  await execFileAsync(process.execPath, [cliPath, 'append', '--ledger', ledger, '--event', event, '--key', key]);

  const head = JSON.parse((await execFileAsync(process.execPath, [cliPath, 'head', '--ledger', ledger, '--json'])).stdout);
  const lines = (await readFile(ledger, 'utf8')).trimEnd().split('\n');
  await writeFile(ledger, `${lines[0]}\n`, 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [
      cliPath,
      'verify',
      '--ledger',
      ledger,
      '--key',
      key,
      '--expect-head',
      head.head,
      '--json',
    ]),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const result = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(result.ok, false);
      assert.ok(result.diagnostics.some((diagnostic: { readonly code: string }) => diagnostic.code === 'HEAD_MISMATCH'));
      return true;
    },
  );
});
