import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { createAesPatch, diffAeon } from '../../aes-diff/dist/index.js';
import {
  generateLedgerKeyPair,
  ledgerPublicKeyFromKeyPair,
  parseLedgerJsonl,
  verifyLedger,
} from '../../../provenance/signed-ledger/dist/index.js';

const execFileAsync = promisify(execFile);
const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

const before = 'aeon:mode = "strict"\napp:object = { status:string = "draft" }';
const after = 'aeon:mode = "strict"\napp:object = { status:string = "ready" }';

test('CLI prints embedded agent workflow with --ai', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--ai']);

  assert.match(result.stdout, /AEON Apply AI Workflow/);
  assert.match(result.stdout, /aeon-apply patch\.json repo\/ --check --json/);
  assert.match(result.stdout, /PATCH_STALE_BASE/);
  assert.match(result.stdout, /aeon-edit undo file\.aeon --log/);
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AEON Apply Examples/);
  assert.match(result.stdout, /examples\/apply-workflow/);
  assert.match(result.stdout, /examples\/guard-apply-workflow/);
});

test('CLI dry-runs patches and emits JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, patchFile, target, '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.format, 'aeon.apply');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.write, false);
  assert.equal(parsed.targets[0].applied, false);
});

test('CLI writes accepted patches when --write is provided', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, patchFile, target, '--write']);
  const written = await readFile(target, 'utf8');

  assert.match(result.stdout, /applied/);
  assert.match(written, /status:string="ready"/);
});

test('CLI writes compatible edit logs and signed ledger events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  const ledger = join(dir, 'ledger.jsonl');
  const keyFile = join(dir, 'key.json');
  const key = generateLedgerKeyPair('aeon-apply-test');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before, 'utf8');
  await writeFile(keyFile, `${JSON.stringify(key, null, 2)}\n`, 'utf8');

  const result = await execFileAsync(process.execPath, [
    cliPath,
    patchFile,
    target,
    '--write',
    '--log',
    log,
    '--ledger',
    ledger,
    '--ledger-key',
    keyFile,
    '--json',
  ]);
  const parsed = JSON.parse(result.stdout);
  const logRecord = JSON.parse(await readFile(log, 'utf8'));
  const entries = parseLedgerJsonl(await readFile(ledger, 'utf8'));
  const verified = verifyLedger(entries, [ledgerPublicKeyFromKeyPair(key)]);

  assert.equal(parsed.targets[0].logRecordId, logRecord.id);
  assert.equal(logRecord.format, 'aeon.edit.log');
  assert.equal(logRecord.command, 'apply');
  assert.equal(verified.ok, true);
  assert.equal(entries[0]?.payload.kind, 'aeon.apply.applied');
  assert.equal(entries[0]?.payload.editLogRecordId, logRecord.id);
});

test('CLI writes AEON edit logs that compile cleanly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.aeon');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before, 'utf8');

  const result = await execFileAsync(process.execPath, [
    cliPath,
    patchFile,
    target,
    '--write',
    '--log',
    log,
    '--log-format',
    'aeon',
    '--json',
  ]);
  const parsed = JSON.parse(result.stdout);
  const logText = await readFile(log, 'utf8');
  const compiled = compile(logText, { maxAttributeDepth: 2 });

  assert.equal(parsed.targets[0].logRecordId.length > 0, true);
  assert.equal(compiled.errors.length, 0);
  assert.match(logText, /command:string="apply"/);
});

test('CLI requires write mode for provenance outputs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before, 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, patchFile, target, '--log', join(dir, 'log.jsonl')]),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Log and ledger output require --write/);
      return true;
    },
  );
});

test('CLI requires --log when --log-format is provided', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before, 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, patchFile, target, '--write', '--log-format', 'aeon']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Log format requires --log/);
      return true;
    },
  );
});

test('CLI exits non-zero for stale targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const patchFile = join(dir, 'patch.json');
  const target = join(dir, 'doc.aeon');
  await writeFile(patchFile, `${JSON.stringify(createAesPatch(diffAeon(before, after)), null, 2)}\n`, 'utf8');
  await writeFile(target, before.replace('"draft"', '"other"'), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, patchFile, target, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.targets[0].diagnostics[0].code, 'PATCH_STALE_BASE');
      return true;
    },
  );
});
