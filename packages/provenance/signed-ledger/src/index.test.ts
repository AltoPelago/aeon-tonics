import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLedgerEntry,
  canonicalizeLedgerPayload,
  formatLedgerJsonl,
  generateLedgerKeyPair,
  ledgerPublicKeyFromKeyPair,
  parseLedgerJsonl,
  verifyLedger,
  type LedgerPayload,
} from './index.js';

const editPayload: LedgerPayload = {
  kind: 'aeon.edit.applied',
  tool: 'aeon-edit',
  command: 'set',
  file: 'file.aeon',
  target: 'file.aeon',
  beforeHash: 'sha256:before',
  afterHash: 'sha256:after',
  affectedPaths: ['$.app.count'],
};

test('canonicalizeLedgerPayload sorts object keys recursively', () => {
  const first = canonicalizeLedgerPayload({ b: 2, a: { d: 4, c: 3 } });
  const second = canonicalizeLedgerPayload({ a: { c: 3, d: 4 }, b: 2 });

  assert.equal(first, second);
  assert.equal(first, '{"a":{"c":3,"d":4},"b":2}');
});

test('appendLedgerEntry signs entries and links the hash chain', () => {
  const key = generateLedgerKeyPair('local-dev');
  const first = appendLedgerEntry([], editPayload, {
    key,
    id: 'entry-1',
    timestamp: '2026-04-26T09:45:00.000Z',
  });
  const second = appendLedgerEntry([first], {
    kind: 'aeon.edit.undone',
    tool: 'aeon-edit',
    command: 'undo',
    file: 'file.aeon',
    target: 'file.aeon',
    beforeHash: 'sha256:after',
    afterHash: 'sha256:before',
    undoneLedgerEntryId: first.id,
  }, {
    key,
    id: 'entry-2',
    timestamp: '2026-04-26T09:46:00.000Z',
  });

  assert.equal(first.index, 0);
  assert.equal(first.previousHash, null);
  assert.equal(second.index, 1);
  assert.equal(second.previousHash, first.entryHash);

  const result = verifyLedger([first, second], [ledgerPublicKeyFromKeyPair(key)]);
  assert.equal(result.ok, true);
  assert.equal(result.entries, 2);
  assert.equal(result.head, second.entryHash);
  assert.deepEqual(result.signers, ['local-dev']);
});

test('verifyLedger detects tampered payloads', () => {
  const key = generateLedgerKeyPair('local-dev');
  const entry = appendLedgerEntry([], editPayload, {
    key,
    id: 'entry-1',
    timestamp: '2026-04-26T09:45:00.000Z',
  });
  const tampered = {
    ...entry,
    payload: {
      ...entry.payload,
      afterHash: 'sha256:tampered',
    },
  };

  const result = verifyLedger([tampered], [ledgerPublicKeyFromKeyPair(key)]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'PAYLOAD_HASH_MISMATCH',
    'ENTRY_HASH_MISMATCH',
    'SIGNATURE_MISMATCH',
  ]);
});

test('JSONL formatting round-trips entries', () => {
  const key = generateLedgerKeyPair('local-dev');
  const entry = appendLedgerEntry([], editPayload, {
    key,
    id: 'entry-1',
    timestamp: '2026-04-26T09:45:00.000Z',
  });

  const parsed = parseLedgerJsonl(formatLedgerJsonl([entry]));

  assert.deepEqual(parsed, [entry]);
});
