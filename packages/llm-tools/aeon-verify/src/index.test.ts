import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLedgerEntry,
  formatLedgerJsonl,
  generateLedgerKeyPair,
} from '../../../provenance/signed-ledger/dist/index.js';
import {
  verifyAeonSource,
} from './index.js';

const source = [
  'aeon:mode = "strict"',
  'app:object = {',
  '  count:number = 1',
  '}',
].join('\n');

test('verifyAeonSource accepts valid AEON and emits checks', () => {
  const result = verifyAeonSource(source, { strict: true, file: 'doc.aeon' });

  assert.equal(result.ok, true);
  assert.equal(result.file, 'doc.aeon');
  assert.equal(result.events > 0, true);
  assert.deepEqual(result.checks.map((check) => check.kind), ['parse', 'aes', 'strict']);
});

test('verifyAeonSource reports strict-mode requirement failures', () => {
  const result = verifyAeonSource('app:number = 1', { strict: true });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'STRICT_MODE_REQUIRED'), true);
});

test('verifyAeonSource reports compile diagnostics', () => {
  const result = verifyAeonSource('app:number = ');

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.kind === 'parse')?.ok, false);
  assert.equal(result.diagnostics.length > 0, true);
});

test('verifyAeonSource verifies signed ledgers and expected heads', () => {
  const key = generateLedgerKeyPair('verify-test');
  const entry = appendLedgerEntry([], {
    kind: 'aeon.edit.applied',
    tool: 'aeon-edit',
    command: 'set',
    file: 'doc.aeon',
    target: 'doc.aeon',
    beforeHash: 'sha256:before',
    afterHash: 'sha256:after',
  }, { key, id: 'entry-1', timestamp: '2026-04-26T00:00:00.000Z' });

  const result = verifyAeonSource(source, {
    ledgerText: formatLedgerJsonl([entry]),
    ledgerKeyText: JSON.stringify(key),
    expectHead: entry.entryHash,
  });

  assert.equal(result.ok, true);
  assert.equal(result.ledger?.ok, true);
  assert.equal(result.checks.find((check) => check.kind === 'ledger')?.ok, true);
});

test('verifyAeonSource reports expected-head mismatches', () => {
  const key = generateLedgerKeyPair('verify-test');
  const entry = appendLedgerEntry([], { kind: 'example.event' }, {
    key,
    id: 'entry-1',
    timestamp: '2026-04-26T00:00:00.000Z',
  });

  const result = verifyAeonSource(source, {
    ledgerText: formatLedgerJsonl([entry]),
    ledgerKeyText: JSON.stringify(key),
    expectHead: 'sha256:not-the-head',
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'LEDGER_HEAD_MISMATCH'), true);
});
