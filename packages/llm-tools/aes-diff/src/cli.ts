#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  applyAesPatch,
  createAesPatch,
  diffAes,
  diffAeon,
  diffTelex,
  encodePatchedTelex,
  formatAesDiffJson,
  formatAesDiffText,
  parseAesTelex,
  summarizeAesDiff,
  type AesEvent,
  type AesDiffResult,
  type AesPatch,
  type DiffAeonOptions,
} from './index.js';
import type { AssignmentEvent } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';

interface CliOptions extends DiffAeonOptions {
  readonly examples: boolean;
  readonly json: boolean;
  readonly summary: boolean;
  readonly patch: boolean;
  readonly check: boolean;
  readonly includeUnchanged: boolean;
  readonly fromAes: boolean;
  readonly fromTelex: boolean;
  readonly pathFilters: readonly string[];
  readonly files: readonly string[];
}

interface CliError {
  readonly code: string;
  readonly message: string;
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

  if (argv[0] === 'apply') {
    return applyMain(argv.slice(1));
  }

  const parsed = parseArgs(argv);
  if ('code' in parsed) {
    writeError(parsed);
    return parsed.code === 'HELP' ? 0 : 2;
  }

  const [beforeFile, afterFile] = parsed.files;
  if (!beforeFile || !afterFile) {
    writeError({
      code: 'USAGE',
      message: usage(),
    });
    return 2;
  }

  try {
    const [beforeText, afterText] = await Promise.all([
      readFile(beforeFile, 'utf8'),
      readFile(afterFile, 'utf8'),
    ]);
    const diff = parsed.fromTelex
      ? diffTelex(beforeText, afterText, parsed)
      : parsed.fromAes
        ? diffAes(parseAesInput(beforeText, beforeFile), parseAesInput(afterText, afterFile), parsed)
        : diffAeon(beforeText, afterText, parsed);
    const interoperableDiff: AesDiffResult<AesEvent> = diff;
    const output = parsed.patch
      ? `${JSON.stringify(createAesPatch(interoperableDiff), null, 2)}\n`
      : parsed.summary
      ? `${JSON.stringify(summarizeAesDiff(interoperableDiff), null, 2)}\n`
      : parsed.json
        ? formatAesDiffJson(interoperableDiff).text
        : formatAesDiffText(interoperableDiff, { includeUnchanged: parsed.includeUnchanged }).text;

    process.stdout.write(output);

    if (diff.diagnostics.length > 0) {
      return 2;
    }
    if (parsed.check && diff.changes.length > 0) {
      return 1;
    }
    return 0;
  } catch (error) {
    writeError({
      code: 'IO_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
    return 2;
  }
}

async function applyMain(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('code' in parsed) {
    writeError(parsed);
    return parsed.code === 'HELP' ? 0 : 2;
  }
  if (!parsed.fromAes && !parsed.fromTelex) {
    writeError({
      code: 'USAGE',
      message: `Patch application requires --from-aes or --from-telex\n\n${usage()}`,
    });
    return 2;
  }

  const [baseFile, patchFile] = parsed.files;
  if (!baseFile || !patchFile) {
    writeError({
      code: 'USAGE',
      message: usage(),
    });
    return 2;
  }

  try {
    const [baseText, patchText] = await Promise.all([
      readFile(baseFile, 'utf8'),
      readFile(patchFile, 'utf8'),
    ]);
    if (parsed.fromTelex) {
      const base = parseAesTelex(baseText);
      const result = applyAesPatch(
        base.records,
        parsePatchInput(patchText, patchFile),
        parsed,
      );
      if (result.ok) {
        process.stdout.write(encodePatchedTelex(result.events, base));
      } else {
        process.stdout.write(`${JSON.stringify({ ok: false, diagnostics: result.diagnostics }, null, 2)}\n`);
      }
      return result.ok ? 0 : 2;
    }

    const result = applyAesPatch(
      parseAesInput(baseText, baseFile),
      parsePatchInput(patchText, patchFile),
      parsed,
    );

    process.stdout.write(`${JSON.stringify(result.ok
      ? { events: result.events }
      : { ok: false, diagnostics: result.diagnostics }, null, 2)}\n`);
    return result.ok ? 0 : 2;
  } catch (error) {
    writeError({
      code: 'IO_ERROR',
      message: error instanceof Error ? error.message : String(error),
    });
    return 2;
  }
}

function parseArgs(argv: readonly string[]): CliOptions | CliError {
  const files: string[] = [];
  let json = false;
  let summary = false;
  let patch = false;
  let check = false;
  let examples = false;
  let includeUnchanged = false;
  let fromAes = false;
  let fromTelex = false;
  const pathFilters: string[] = [];
  let includeHeaders = true;
  let includeMetadata = true;
  let includeSourceSpans = false;
  let strictUniquePaths = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '--help':
      case '-h':
        return { code: 'HELP', message: usage() };
      case '--json':
        json = true;
        break;
      case '--examples':
        examples = true;
        break;
      case '--summary':
        summary = true;
        json = true;
        break;
      case '--patch':
        patch = true;
        json = true;
        break;
      case '--check':
        check = true;
        break;
      case '--from-aes':
        fromAes = true;
        break;
      case '--from-telex':
        fromTelex = true;
        break;
      case '--include-unchanged':
        includeUnchanged = true;
        break;
      case '--no-headers':
        includeHeaders = false;
        break;
      case '--no-metadata':
        includeMetadata = false;
        break;
      case '--spans':
        includeSourceSpans = true;
        break;
      case '--allow-duplicates':
        strictUniquePaths = false;
        break;
      case '--path': {
        const value = argv[index + 1];
        if (!value) {
          return {
            code: 'USAGE',
            message: `Missing value for --path\n\n${usage()}`,
          };
        }
        pathFilters.push(value);
        index += 1;
        break;
      }
      default:
        if (arg.startsWith('--path=')) {
          pathFilters.push(arg.slice('--path='.length));
          break;
        }
        if (arg.startsWith('-')) {
          return {
            code: 'UNKNOWN_OPTION',
            message: `Unknown option: ${arg}\n\n${usage()}`,
          };
        }
        files.push(arg);
        break;
    }
  }

  if (files.length !== 2) {
    return {
      code: 'USAGE',
      message: usage(),
    };
  }
  if (fromAes && fromTelex) {
    return {
      code: 'USAGE',
      message: '--from-aes and --from-telex are mutually exclusive',
    };
  }

  return {
    json,
    examples,
    summary,
    patch,
    check,
    includeUnchanged,
    fromAes,
    fromTelex,
    pathFilters,
    files,
    includeHeaders,
    includeMetadata,
    includeSourceSpans,
    strictUniquePaths,
  };
}

function parseAesInput(text: string, file: string): readonly AssignmentEvent[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as readonly AssignmentEvent[];
  }
  if (isEventEnvelope(parsed)) {
    return parsed.events as readonly AssignmentEvent[];
  }
  throw new Error(`Expected ${file} to contain an AES event array or an object with an events array`);
}

function parsePatchInput<TEvent extends AesEvent>(text: string, file: string): AesPatch<TEvent> {
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as { readonly format?: unknown }).format === 'aes.patch' &&
    Array.isArray((parsed as { readonly operations?: unknown }).operations)
  ) {
    return parsed as AesPatch<TEvent>;
  }
  throw new Error(`Expected ${file} to contain an aes.patch object`);
}

function isEventEnvelope(value: unknown): value is { readonly events: readonly unknown[] } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { readonly events?: unknown }).events),
  );
}

function writeError(error: CliError): void {
  const stream = error.code === 'HELP' ? process.stdout : process.stderr;
  stream.write(`${error.message}${error.message.endsWith('\n') ? '' : '\n'}`);
}

function usage(): string {
  return [
    'Usage: aes-diff [options] <before.aeon> <after.aeon>',
    '       aes-diff apply --from-aes [options] <base.aes.json> <patch.json>',
    '       aes-diff apply --from-telex [options] <base.telex.aes> <patch.json>',
    '',
    'Options:',
    '  --ai                 Print agent workflow guidance',
    '  --examples           Print runnable workflow references',
    '  --json               Emit full JSON diff output',
    '  --summary            Emit compact JSON planning summary',
    '  --patch              Emit reviewable aes.patch JSON; does not apply',
    '  --check              Exit 1 when semantic changes are present',
    '  --from-aes           Read inputs as AES JSON arrays or { events } envelopes',
    '  --from-telex         Read complete portable AES inputs as Telex',
    '  --path <path>        Only compare a canonical path subtree; repeatable',
    '  --include-unchanged  Include unchanged count in text output',
    '  --no-headers         Ignore aeon:* header bindings',
    '  --no-metadata        Ignore binding metadata changes',
    '  --spans              Include source span changes',
    '  --allow-duplicates   Allow later duplicate paths to replace earlier paths',
    '  -h, --help           Show this help',
  ].join('\n');
}

function aiWorkflow(): string {
  return [
    'AES Diff agent workflow',
    '',
    'Safe review loop:',
    '  1. Compare AEON semantically:',
    '     aes-diff before.aeon after.aeon',
    '     aes-diff --json before.aeon after.aeon',
    '',
    '  2. Get a compact planning summary:',
    '     aes-diff --summary before.aeon after.aeon',
    '',
    '  3. Gate CI or agent checks:',
    '     aes-diff --check before.aeon after.aeon',
    '',
    '  4. Scope review to intended subtrees or domains:',
    '     aes-diff --path $.app before.aeon after.aeon',
    '     aes-diff --no-metadata before.aeon after.aeon',
    '',
    '  5. Build an AES-native patch when needed:',
    '     aes-diff --patch before.aeon after.aeon > patch.json',
    '     aes-diff apply --from-aes base.aes.json patch.json',
    '     aes-diff --from-telex before.telex.aes after.telex.aes',
    '',
    'Exit codes:',
    '  0: no semantic changes, or command succeeded',
    '  1: --check found semantic changes',
    '  2: diagnostics, parse failure, IO failure, or invalid arguments',
    '',
    'Rules for agents:',
    '  - Prefer --summary for planning and --json for programmatic review.',
    '  - Treat diagnostics as failure signals, even when partial diff data is present.',
    '  - Use --path to limit review to the intended subtree before acting on a diff.',
    '  - Use --patch only for AES-native patch review/application; it does not edit AEON source.',
    '  - For source edits, use aeon-edit plan-* -> batch --check -> batch --write.',
  ].join('\n');
}

function examplesWorkflow(): string {
  return [
    '# AES Diff Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/diff-edit-workflow',
    '  Review semantic changes, plan an edit, dry-run, write, and verify.',
    '- examples/apply-workflow',
    '  Build an aes.patch and dry-run or apply it against AEON targets.',
    '',
    'Run them from the workspace root:',
    '',
    '```sh',
    'sh examples/diff-edit-workflow/run.sh',
    'sh examples/apply-workflow/run.sh',
    '```',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
