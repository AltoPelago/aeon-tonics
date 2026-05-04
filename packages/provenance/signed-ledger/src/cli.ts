#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  appendLedgerEntry,
  generateLedgerKeyPair,
  ledgerPublicKeyFromKeyPair,
  parseLedgerJsonl,
  verifyLedger,
  type GenericLedgerPayload,
  type LedgerKeyPair,
  type LedgerKeyring,
  type LedgerPayload,
} from './index.js';

interface ParsedArgs {
  readonly command: string;
  readonly json: boolean;
  readonly ledger?: string;
  readonly event?: string;
  readonly key?: string;
  readonly keyId?: string;
  readonly keyring?: string;
  readonly expectHead?: string;
  readonly out?: string;
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (typeof parsed === 'string') {
    process.stderr.write(`${parsed}\n\n${usage()}\n`);
    return 2;
  }
  if (parsed.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  try {
    switch (parsed.command) {
      case 'keygen':
        return await runKeygen(parsed);
      case 'append':
        return await runAppend(parsed);
      case 'verify':
        return await runVerify(parsed);
      case 'inspect':
        return await runInspect(parsed);
      case 'head':
        return await runHead(parsed);
      default:
        process.stderr.write(`Unknown command: ${parsed.command}\n\n${usage()}\n`);
        return 2;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 2;
  }
}

async function runKeygen(args: ParsedArgs): Promise<number> {
  const key = generateLedgerKeyPair(args.keyId ?? 'local-dev');
  const output = JSON.stringify(key, null, 2) + '\n';
  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, output, 'utf8');
    process.stdout.write(args.json
      ? `${JSON.stringify({ ok: true, command: 'keygen', keyId: key.keyId, out: args.out }, null, 2)}\n`
      : `wrote ${args.out}\n`);
    return 0;
  }
  process.stdout.write(output);
  return 0;
}

async function runAppend(args: ParsedArgs): Promise<number> {
  const ledgerPath = required(args.ledger, 'ledger');
  const [ledgerText, eventText, keyText] = await Promise.all([
    readOptionalFile(ledgerPath),
    readFile(required(args.event, 'event'), 'utf8'),
    readFile(required(args.key, 'key'), 'utf8'),
  ]);
  const entries = parseLedgerJsonl(ledgerText);
  const payload = parsePayload(eventText);
  const key = JSON.parse(keyText) as LedgerKeyPair;
  const entry = appendLedgerEntry(entries, payload, { key });
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
  process.stdout.write(args.json
    ? `${JSON.stringify({ ok: true, command: 'append', entry }, null, 2)}\n`
    : `appended ${entry.id}\n`);
  return 0;
}

async function runVerify(args: ParsedArgs): Promise<number> {
  const [ledgerText, keyringText] = await Promise.all([
    readFile(required(args.ledger, 'ledger'), 'utf8'),
    readFile(required(args.keyring ?? args.key, 'keyring'), 'utf8'),
  ]);
  const entries = parseLedgerJsonl(ledgerText);
  const keyring = parseKeyring(keyringText);
  const result = verifyLedger(entries, keyring);
  const diagnostics = args.expectHead && result.head !== args.expectHead
    ? [
      ...result.diagnostics,
      {
        index: entries.length > 0 ? entries.length - 1 : 0,
        code: 'HEAD_MISMATCH',
        message: `Expected head ${args.expectHead}, found ${result.head ?? '(empty)'}.`,
      },
    ]
    : result.diagnostics;
  const checked = {
    ...result,
    ok: result.ok && diagnostics.length === 0,
    diagnostics,
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
  } else if (checked.ok) {
    process.stdout.write(`ledger ok: ${checked.entries} entries, head ${checked.head ?? '(empty)'}\n`);
  } else {
    process.stdout.write([
      `ledger invalid: ${checked.diagnostics.length} diagnostics`,
      ...checked.diagnostics.map((diagnostic) => `${diagnostic.index} ${diagnostic.code}: ${diagnostic.message}`),
      '',
    ].join('\n'));
  }
  return checked.ok ? 0 : 2;
}

async function runInspect(args: ParsedArgs): Promise<number> {
  const entries = parseLedgerJsonl(await readFile(required(args.ledger, 'ledger'), 'utf8'));
  const value = {
    entries: entries.length,
    head: entries.at(-1)?.entryHash ?? null,
    signers: [...new Set(entries.map((entry) => entry.signature.keyId))].sort(),
    records: entries.map((entry) => ({
      id: entry.id,
      index: entry.index,
      timestamp: entry.timestamp,
      previousHash: entry.previousHash,
      entryHash: entry.entryHash,
      keyId: entry.signature.keyId,
      kind: entry.payload.kind,
    })),
  };
  process.stdout.write(args.json
    ? `${JSON.stringify({ ok: true, command: 'inspect', value }, null, 2)}\n`
    : renderInspection(value));
  return 0;
}

async function runHead(args: ParsedArgs): Promise<number> {
  const entries = parseLedgerJsonl(await readFile(required(args.ledger, 'ledger'), 'utf8'));
  const head = entries.at(-1)?.entryHash ?? null;
  process.stdout.write(args.json
    ? `${JSON.stringify({ ok: true, command: 'head', entries: entries.length, head }, null, 2)}\n`
    : `${head ?? '(empty)'}\n`);
  return 0;
}

function parseArgs(argv: readonly string[]): ParsedArgs | string {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  let json = false;
  let ledger: string | undefined;
  let event: string | undefined;
  let key: string | undefined;
  let keyId: string | undefined;
  let keyring: string | undefined;
  let expectHead: string | undefined;
  let out: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    switch (arg) {
      case '--help':
      case '-h':
        return { command: 'help', json: false };
      case '--json':
        json = true;
        break;
      case '--ledger':
        ledger = requiredArg(args, index, '--ledger');
        index += 1;
        break;
      case '--event':
        event = requiredArg(args, index, '--event');
        index += 1;
        break;
      case '--key':
        key = requiredArg(args, index, '--key');
        index += 1;
        break;
      case '--key-id':
        keyId = requiredArg(args, index, '--key-id');
        index += 1;
        break;
      case '--keyring':
        keyring = requiredArg(args, index, '--keyring');
        index += 1;
        break;
      case '--expect-head':
        expectHead = requiredArg(args, index, '--expect-head');
        index += 1;
        break;
      case '--out':
        out = requiredArg(args, index, '--out');
        index += 1;
        break;
      default:
        return arg.startsWith('-') ? `Unknown option: ${arg}` : `Unexpected argument: ${arg}`;
    }
  }

  return {
    command,
    json,
    ...(ledger === undefined ? {} : { ledger }),
    ...(event === undefined ? {} : { event }),
    ...(key === undefined ? {} : { key }),
    ...(keyId === undefined ? {} : { keyId }),
    ...(keyring === undefined ? {} : { keyring }),
    ...(expectHead === undefined ? {} : { expectHead }),
    ...(out === undefined ? {} : { out }),
  };
}

function parsePayload(text: string): LedgerPayload {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as { readonly kind?: unknown }).kind !== 'string') {
    throw new Error('Ledger event must be a JSON object with a string kind.');
  }
  return parsed as GenericLedgerPayload;
}

function parseKeyring(text: string): LedgerKeyring {
  const parsed = JSON.parse(text) as LedgerKeyring | LedgerKeyPair;
  if ('privateJwk' in parsed && 'publicJwk' in parsed) {
    return {
      format: 'aeon.ledger.keyring',
      version: 1,
      keys: [ledgerPublicKeyFromKeyPair(parsed)],
    };
  }
  return parsed;
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && (error as { readonly code?: unknown }).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function renderInspection(value: {
  readonly entries: number;
  readonly head: string | null;
  readonly signers: readonly string[];
  readonly records: readonly {
    readonly id: string;
    readonly index: number;
    readonly timestamp: string;
    readonly entryHash: string;
    readonly keyId: string;
    readonly kind: string;
  }[];
}): string {
  return [
    `entries: ${value.entries}`,
    `head: ${value.head ?? '(empty)'}`,
    `signers: ${value.signers.length > 0 ? value.signers.join(', ') : '(none)'}`,
    ...value.records.map((record) => `${record.index} ${record.id} ${record.kind} ${record.keyId} ${record.entryHash}`),
    '',
  ].join('\n');
}

function requiredArg(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required ${label}`);
  }
  return value;
}

function usage(): string {
  return [
    'Usage:',
    '  aeon-ledger keygen --out key.json [--key-id id] [--json]',
    '  aeon-ledger append --ledger ledger.jsonl --event event.json --key key.json [--json]',
    '  aeon-ledger verify --ledger ledger.jsonl (--keyring keyring.json | --key key.json) [--expect-head hash] [--json]',
    '  aeon-ledger inspect --ledger ledger.jsonl [--json]',
    '  aeon-ledger head --ledger ledger.jsonl [--json]',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
