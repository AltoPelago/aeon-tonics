#!/usr/bin/env node
import {
  formatAeonVerificationText,
  verifyAeonFile,
} from './index.js';

interface ParsedArgs {
  readonly file?: string;
  readonly json: boolean;
  readonly strict: boolean;
  readonly ledger?: string;
  readonly ledgerKey?: string;
  readonly expectHead?: string;
  readonly help: boolean;
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (typeof parsed === 'string') {
    process.stderr.write(`${parsed}\n\n${usage()}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  try {
    const result = await verifyAeonFile(required(parsed.file, 'file'), {
      strict: parsed.strict,
      ...(parsed.ledger === undefined ? {} : { ledger: parsed.ledger }),
      ...(parsed.ledgerKey === undefined ? {} : { ledgerKey: parsed.ledgerKey }),
      ...(parsed.expectHead === undefined ? {} : { expectHead: parsed.expectHead }),
    });
    process.stdout.write(parsed.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatAeonVerificationText(result));
    return result.ok ? 0 : 2;
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

function parseArgs(argv: readonly string[]): ParsedArgs | string {
  let json = false;
  let strict = false;
  let ledger: string | undefined;
  let ledgerKey: string | undefined;
  let expectHead: string | undefined;
  let help = false;
  const files: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--json':
        json = true;
        break;
      case '--strict':
        strict = true;
        break;
      case '--ledger':
        ledger = requiredArg(argv, index, '--ledger');
        index += 1;
        break;
      case '--ledger-key':
        ledgerKey = requiredArg(argv, index, '--ledger-key');
        index += 1;
        break;
      case '--expect-head':
        expectHead = requiredArg(argv, index, '--expect-head');
        index += 1;
        break;
      default:
        if (arg.startsWith('-')) {
          return `Unknown option: ${arg}`;
        }
        files.push(arg);
    }
  }

  if (files.length > 1) {
    return 'Expected a single AEON file.';
  }

  return {
    ...(files[0] === undefined ? {} : { file: files[0] }),
    json,
    strict,
    ...(ledger === undefined ? {} : { ledger }),
    ...(ledgerKey === undefined ? {} : { ledgerKey }),
    ...(expectHead === undefined ? {} : { expectHead }),
    help,
  };
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
    '  aeon-verify <file.aeon> [--strict] [--json]',
    '  aeon-verify <file.aeon> --ledger <ledger.jsonl> --ledger-key <key.json> [--expect-head hash] [--json]',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
