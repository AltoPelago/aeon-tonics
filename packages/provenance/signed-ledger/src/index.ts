import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type webcrypto,
} from 'node:crypto';

export interface LedgerSignature {
  readonly algorithm: 'ed25519';
  readonly keyId: string;
  readonly value: string;
}

export interface SignedLedgerEntry {
  readonly format: 'aeon.ledger.entry';
  readonly version: 1;
  readonly index: number;
  readonly id: string;
  readonly timestamp: string;
  readonly previousHash: string | null;
  readonly payloadHash: string;
  readonly entryHash: string;
  readonly signature: LedgerSignature;
  readonly payload: LedgerPayload;
}

export type LedgerPayload =
  | AeonEditLedgerPayload
  | AeonUndoLedgerPayload
  | GenericLedgerPayload;

export interface AeonEditLedgerPayload extends Record<string, unknown> {
  readonly kind: 'aeon.edit.applied';
  readonly tool: 'aeon-edit';
  readonly command: string;
  readonly file: string;
  readonly target: string;
  readonly beforeHash: string;
  readonly afterHash: string;
}

export interface AeonUndoLedgerPayload extends Record<string, unknown> {
  readonly kind: 'aeon.edit.undone';
  readonly tool: 'aeon-edit';
  readonly command: 'undo';
  readonly file: string;
  readonly target: string;
  readonly beforeHash: string;
  readonly afterHash: string;
}

export interface GenericLedgerPayload extends Record<string, unknown> {
  readonly kind: string;
}

export interface LedgerKeyPair {
  readonly format: 'aeon.ledger.key';
  readonly version: 1;
  readonly algorithm: 'ed25519';
  readonly keyId: string;
  readonly privateJwk: webcrypto.JsonWebKey;
  readonly publicJwk: webcrypto.JsonWebKey;
}

export interface LedgerPublicKey {
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly publicJwk: webcrypto.JsonWebKey;
}

export interface LedgerKeyring {
  readonly format?: 'aeon.ledger.keyring';
  readonly version?: 1;
  readonly keys: readonly LedgerPublicKey[];
}

export interface AppendLedgerOptions {
  readonly key: LedgerKeyPair;
  readonly id?: string;
  readonly timestamp?: string;
}

export interface LedgerVerificationResult {
  readonly ok: boolean;
  readonly entries: number;
  readonly head: string | null;
  readonly signers: readonly string[];
  readonly diagnostics: readonly LedgerDiagnostic[];
}

export interface LedgerDiagnostic {
  readonly index: number;
  readonly code: string;
  readonly message: string;
}

interface UnsignedEntryBody {
  readonly format: 'aeon.ledger.entry';
  readonly version: 1;
  readonly index: number;
  readonly id: string;
  readonly timestamp: string;
  readonly previousHash: string | null;
  readonly payloadHash: string;
  readonly signature: Omit<LedgerSignature, 'value'>;
  readonly payload: LedgerPayload;
}

export function generateLedgerKeyPair(keyId: string): LedgerKeyPair {
  const keys = generateKeyPairSync('ed25519');
  return {
    format: 'aeon.ledger.key',
    version: 1,
    algorithm: 'ed25519',
    keyId,
    privateJwk: keys.privateKey.export({ format: 'jwk' }),
    publicJwk: keys.publicKey.export({ format: 'jwk' }),
  };
}

export function ledgerPublicKeyFromKeyPair(key: LedgerKeyPair): LedgerPublicKey {
  return {
    keyId: key.keyId,
    algorithm: key.algorithm,
    publicJwk: key.publicJwk,
  };
}

export function appendLedgerEntry(
  existingEntries: readonly SignedLedgerEntry[],
  payload: LedgerPayload,
  options: AppendLedgerOptions,
): SignedLedgerEntry {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const index = existingEntries.length;
  const previous = existingEntries.at(-1);
  const previousHash = previous?.entryHash ?? null;
  const id = options.id ?? `${timestamp}-${randomId()}`;
  const payloadHash = sha256(canonicalizeLedgerPayload(payload));
  const unsigned = unsignedEntryBody({
    index,
    id,
    timestamp,
    previousHash,
    payloadHash,
    keyId: options.key.keyId,
    payload,
  });
  const canonicalUnsigned = canonicalizeLedgerPayload(unsigned);
  const entryHash = sha256(canonicalUnsigned);
  const signatureValue = sign(null, Buffer.from(canonicalUnsigned, 'utf8'), createPrivateKey({
    key: options.key.privateJwk,
    format: 'jwk',
  })).toString('base64');
  return {
    ...unsigned,
    entryHash,
    signature: {
      ...unsigned.signature,
      value: signatureValue,
    },
  };
}

export function verifyLedger(
  entries: readonly SignedLedgerEntry[],
  keyring: LedgerKeyring | readonly LedgerPublicKey[],
): LedgerVerificationResult {
  const keys = new Map(normalizeKeyring(keyring).map((key) => [key.keyId, key]));
  const diagnostics: LedgerDiagnostic[] = [];
  const signers = new Set<string>();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    signers.add(entry.signature.keyId);
    const key = keys.get(entry.signature.keyId);
    const previous = entries[index - 1];
    const expectedPreviousHash = previous?.entryHash ?? null;
    const payloadHash = sha256(canonicalizeLedgerPayload(entry.payload));
    const unsigned = unsignedEntryBody({
      index: entry.index,
      id: entry.id,
      timestamp: entry.timestamp,
      previousHash: entry.previousHash,
      payloadHash: entry.payloadHash,
      keyId: entry.signature.keyId,
      payload: entry.payload,
    });
    const canonicalUnsigned = canonicalizeLedgerPayload(unsigned);
    const entryHash = sha256(canonicalUnsigned);

    if (entry.index !== index) {
      diagnostics.push({ index, code: 'INDEX_MISMATCH', message: `Expected index ${index}, found ${entry.index}.` });
    }
    if (entry.previousHash !== expectedPreviousHash) {
      diagnostics.push({ index, code: 'PREVIOUS_HASH_MISMATCH', message: 'previousHash does not match the prior entryHash.' });
    }
    if (entry.payloadHash !== payloadHash) {
      diagnostics.push({ index, code: 'PAYLOAD_HASH_MISMATCH', message: 'payloadHash does not match the canonical payload.' });
    }
    if (entry.entryHash !== entryHash) {
      diagnostics.push({ index, code: 'ENTRY_HASH_MISMATCH', message: 'entryHash does not match the canonical entry body.' });
    }
    if (!key) {
      diagnostics.push({ index, code: 'UNKNOWN_SIGNER', message: `No public key found for keyId ${entry.signature.keyId}.` });
      continue;
    }
    const signatureOk = verify(null, Buffer.from(canonicalUnsigned, 'utf8'), createPublicKey({
      key: key.publicJwk,
      format: 'jwk',
    }), Buffer.from(entry.signature.value, 'base64'));
    if (!signatureOk) {
      diagnostics.push({ index, code: 'SIGNATURE_MISMATCH', message: 'Signature does not verify for this entry.' });
    }
  }

  return {
    ok: diagnostics.length === 0,
    entries: entries.length,
    head: entries.at(-1)?.entryHash ?? null,
    signers: [...signers].sort(),
    diagnostics,
  };
}

export function parseLedgerJsonl(text: string): readonly SignedLedgerEntry[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SignedLedgerEntry);
}

export function formatLedgerJsonl(entries: readonly SignedLedgerEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length > 0 ? '\n' : '');
}

export function canonicalizeLedgerPayload(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

export function hashText(value: string): string {
  return sha256(value);
}

function unsignedEntryBody(options: {
  readonly index: number;
  readonly id: string;
  readonly timestamp: string;
  readonly previousHash: string | null;
  readonly payloadHash: string;
  readonly keyId: string;
  readonly payload: LedgerPayload;
}): UnsignedEntryBody {
  return {
    format: 'aeon.ledger.entry',
    version: 1,
    index: options.index,
    id: options.id,
    timestamp: options.timestamp,
    previousHash: options.previousHash,
    payloadHash: options.payloadHash,
    signature: {
      algorithm: 'ed25519',
      keyId: options.keyId,
    },
    payload: options.payload,
  };
}

function normalizeKeyring(keyring: LedgerKeyring | readonly LedgerPublicKey[]): readonly LedgerPublicKey[] {
  return Array.isArray(keyring) ? keyring as readonly LedgerPublicKey[] : (keyring as LedgerKeyring).keys;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortCanonical);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortCanonical((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('base64url')}`;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
