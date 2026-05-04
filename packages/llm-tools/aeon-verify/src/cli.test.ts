import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  appendLedgerEntry,
  formatLedgerJsonl,
  generateLedgerKeyPair,
} from '../../../provenance/signed-ledger/dist/index.js';

const execFileAsync = promisify(execFile);
const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

const source = [
  'aeon:mode = "strict"',
  'app:object = {',
  '  count:number = 1',
  '}',
].join('\n');

test('CLI verifies a valid strict file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-verify-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, file, '--strict', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.file, file);
  assert.equal(parsed.checks.some((check: { readonly kind: string }) => check.kind === 'strict'), true);
});

test('CLI exits non-zero for invalid files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-verify-'));
  const file = join(dir, 'bad.aeon');
  await writeFile(file, 'app:number = ', 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, file, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.ok, false);
      return true;
    },
  );
});

test('CLI verifies ledger inputs and expected head', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-verify-'));
  const file = join(dir, 'doc.aeon');
  const ledger = join(dir, 'ledger.jsonl');
  const keyFile = join(dir, 'key.json');
  const key = generateLedgerKeyPair('verify-cli');
  const entry = appendLedgerEntry([], { kind: 'example.event' }, {
    key,
    id: 'entry-1',
    timestamp: '2026-04-26T00:00:00.000Z',
  });
  await writeFile(file, source, 'utf8');
  await writeFile(keyFile, JSON.stringify(key), 'utf8');
  await writeFile(ledger, formatLedgerJsonl([entry]), 'utf8');

  const result = await execFileAsync(process.execPath, [
    cliPath,
    file,
    '--ledger',
    ledger,
    '--ledger-key',
    keyFile,
    '--expect-head',
    entry.entryHash,
    '--json',
  ]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.ledger.ok, true);
});
