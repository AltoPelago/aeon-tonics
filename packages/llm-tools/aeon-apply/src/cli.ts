#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  formatAeonApplyText,
  parseAesPatchJson,
  planAeonApply,
} from './index.js';

interface ParsedArgs {
  readonly examples: boolean;
  readonly patch?: string;
  readonly targets: readonly string[];
  readonly json: boolean;
  readonly write: boolean;
  readonly log?: string;
  readonly logFormat?: 'jsonl' | 'aeon';
  readonly ledger?: string;
  readonly ledgerKey?: string;
  readonly help: boolean;
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes('--ai')) {
    process.stdout.write(`${aiWorkflow()}\n`);
    return 0;
  }
  if (argv.includes('--examples')) {
    process.stdout.write(`${examplesWorkflow()}\n`);
    return 0;
  }

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
    const patch = parseAesPatchJson(await readFile(required(parsed.patch, 'patch'), 'utf8'));
    const result = await planAeonApply(patch, parsed.targets, {
      write: parsed.write,
      ...(parsed.log === undefined ? {} : { log: parsed.log }),
      ...(parsed.logFormat === undefined ? {} : { logFormat: parsed.logFormat }),
      ...(parsed.ledger === undefined ? {} : { ledger: parsed.ledger }),
      ...(parsed.ledgerKey === undefined ? {} : { ledgerKey: parsed.ledgerKey }),
    });
    process.stdout.write(parsed.json ? `${JSON.stringify(result, null, 2)}\n` : formatAeonApplyText(result));
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
  let write = false;
  let examples = false;
  let help = false;
  let log: string | undefined;
  let logFormat: 'jsonl' | 'aeon' | undefined;
  let ledger: string | undefined;
  let ledgerKey: string | undefined;
  const positional: string[] = [];

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
      case '--examples':
        examples = true;
        break;
      case '--check':
        write = false;
        break;
      case '--write':
        write = true;
        break;
      case '--log':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --log';
        }
        log = argv[index + 1];
        index += 1;
        break;
      case '--log-format': {
        const value = argv[index + 1];
        if (value !== 'jsonl' && value !== 'aeon') {
          return 'Missing or invalid value for --log-format. Expected jsonl or aeon';
        }
        logFormat = value;
        index += 1;
        break;
      }
      case '--ledger':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --ledger';
        }
        ledger = argv[index + 1];
        index += 1;
        break;
      case '--ledger-key':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --ledger-key';
        }
        ledgerKey = argv[index + 1];
        index += 1;
        break;
      default:
        if (arg.startsWith('-')) {
          return `Unknown option: ${arg}`;
        }
        positional.push(arg);
    }
  }

  if (!help && positional.length < 2) {
    return 'Expected a patch file and at least one target file or directory.';
  }
  if (!help && !write && (log !== undefined || ledger !== undefined || ledgerKey !== undefined)) {
    return 'Log and ledger output require --write.';
  }
  if (!help && logFormat !== undefined && log === undefined) {
    return 'Log format requires --log.';
  }
  if (!help && (ledger !== undefined) !== (ledgerKey !== undefined)) {
    return 'Ledger output requires both --ledger and --ledger-key.';
  }

  const [patch, ...targets] = positional;
  return {
    ...(patch === undefined ? {} : { patch }),
    targets,
    examples,
    json,
    write,
    ...(log === undefined ? {} : { log }),
    ...(logFormat === undefined ? {} : { logFormat }),
    ...(ledger === undefined ? {} : { ledger }),
    ...(ledgerKey === undefined ? {} : { ledgerKey }),
    help,
  };
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
    '  aeon-apply <patch.json> <file-or-dir>... [--check] [--json]',
    '  aeon-apply <patch.json> <file-or-dir>... --write [--log log.jsonl|log.aeon] [--json]',
    '  aeon-apply <patch.json> <file-or-dir>... --write --ledger ledger.jsonl --ledger-key key.json [--json]',
    '  aeon-apply --ai',
    '  aeon-apply --examples',
    '',
    'Dry-run is the default. Patch input must be aes-diff --patch JSON.',
  ].join('\n');
}

function aiWorkflow(): string {
  return [
    '# AEON Apply AI Workflow',
    '',
    'Use aeon-apply when you already have an aes.patch and need to test whether it can safely land on one or more AEON targets.',
    '',
    'Recommended loop:',
    '',
    '```sh',
    'aes-diff --patch before.aeon after.aeon > patch.json',
    "aeon-search repo/ --path '$.app.status' --json",
    'aeon-apply patch.json repo/ --check --json',
    'aeon-apply patch.json repo/ --write --log .aeon-edit/log.jsonl --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json',
    'aeon-verify changed-file.aeon --strict',
    '```',
    '',
    'Rules for agents:',
    '',
    '- Always dry-run before write.',
    '- Treat PATCH_STALE_BASE as a hard stop for that target.',
    '- Inspect blocked targets instead of forcing or rewriting the patch blindly.',
    '- Prefer narrowing target files with aeon-search before applying repo-wide patches.',
    '- Use aes-diff after writing to verify semantic results.',
    '- Use --log for undo compatibility with aeon-edit undo.',
    '- Use --ledger and --ledger-key when the apply event needs signed provenance.',
    '',
    'AEON-native log variant:',
    '',
    '```sh',
    'aeon-apply patch.json file.aeon --write --log .aeon-edit/log.aeon --log-format aeon',
    'aeon-edit undo file.aeon --log .aeon-edit/log.aeon --write',
    '```',
  ].join('\n');
}

function examplesWorkflow(): string {
  return [
    '# AEON Apply Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/apply-workflow',
    '  Build an aes.patch, dry-run it, write it, and verify the result.',
    '- examples/guard-apply-workflow',
    '  Full guard preflight, compact decide, then continue to aeon-apply dry-run.',
    '- examples/guard-apply-blocked-workflow',
    '  Full guard preflight, compact decide, then stop before aeon-apply on warn.',
    '',
    'Run them from the workspace root:',
    '',
    '```sh',
    'sh examples/apply-workflow/run.sh',
    'sh examples/guard-apply-workflow/run.sh',
    'sh examples/guard-apply-blocked-workflow/run.sh',
    '```',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
