#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  runAeonGuard,
  type AeonGuardAdviceExit,
  type AeonGuardCommand,
  type AeonGuardFormat,
} from './index.js';

interface ParsedArgs {
  readonly adviceOnly: boolean;
  readonly adviceExit?: AeonGuardAdviceExit;
  readonly cloneScope?: string;
  readonly command?: AeonGuardCommand;
  readonly examples: boolean;
  readonly inputs: readonly string[];
  readonly format: AeonGuardFormat;
  readonly graphPrefix: boolean;
  readonly external: boolean;
  readonly help: boolean;
  readonly out?: string;
  readonly scope?: string;
  readonly target?: string;
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes('--ai')) {
    process.stdout.write(`${aiWorkflow()}\n`);
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
  if (parsed.examples) {
    process.stdout.write(`${examplesWorkflow()}\n`);
    return 0;
  }
  if (parsed.command === undefined) {
    process.stderr.write(`Expected a command.\n\n${usage()}\n`);
    return 2;
  }

  try {
    const result = await runAeonGuard(parsed.inputs, {
      command: parsed.command,
      adviceOnly: parsed.adviceOnly,
      ...(parsed.adviceExit === undefined ? {} : { adviceExit: parsed.adviceExit }),
      format: parsed.format,
      graphPrefix: parsed.graphPrefix,
      external: parsed.external,
      ...(parsed.cloneScope === undefined ? {} : { cloneScope: parsed.cloneScope }),
      ...(parsed.scope === undefined ? {} : { scope: parsed.scope }),
      ...(parsed.target === undefined ? {} : { target: parsed.target }),
    });
    if (parsed.out === undefined) {
      process.stdout.write(result.output);
    } else {
      await writeOutput(parsed.out, result.output);
    }
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parsed.format === 'json' || parsed.format === 'sarif') {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 2;
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs | string {
  let command: AeonGuardCommand | undefined;
  const positionals: string[] = [];
  let adviceOnly = false;
  let adviceExit: AeonGuardAdviceExit | undefined;
  let examples = false;
  let format: AeonGuardFormat = 'text';
  let graphPrefix = false;
  let external = false;
  let help = false;
  let cloneScope: string | undefined;
  let out: string | undefined;
  let scope: string | undefined;
  let targetFlag: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (command === undefined && isCommand(arg)) {
      command = arg;
      continue;
    }
    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--json':
        format = 'json';
        break;
      case '--advice':
        adviceOnly = true;
        break;
      case '--examples':
        examples = true;
        break;
      case '--advice-exit':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --advice-exit';
          }
          if (!isAdviceExit(value)) {
            return `Invalid --advice-exit: ${value}`;
          }
          adviceExit = value;
          index += 1;
        }
        break;
      case '--format':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --format';
          }
          if (!isFormat(value)) {
            return `Invalid --format: ${value}`;
          }
          format = value;
          index += 1;
        }
        break;
      case '--graph-prefix':
        graphPrefix = true;
        break;
      case '--external':
        external = true;
        break;
      case '--out':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --out';
        }
        out = argv[index + 1];
        index += 1;
        break;
      case '--clone-scope':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --clone-scope';
        }
        cloneScope = argv[index + 1];
        index += 1;
        break;
      case '--scope':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --scope';
        }
        scope = argv[index + 1];
        index += 1;
        break;
      case '--target':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --target';
        }
        targetFlag = argv[index + 1];
        index += 1;
        break;
      default:
        if (arg.startsWith('-')) {
          return `Unknown option: ${arg}`;
        }
        positionals.push(arg);
        break;
    }
  }

  if (help) {
    return {
      ...(command === undefined ? {} : { command }),
      inputs: [],
      adviceOnly,
      ...(adviceExit === undefined ? {} : { adviceExit }),
      examples,
      format,
      graphPrefix,
      external,
      help,
      ...(out === undefined ? {} : { out }),
    };
  }
  if (command === undefined) {
    return {
      inputs: [],
      adviceOnly,
      ...(adviceExit === undefined ? {} : { adviceExit }),
      examples,
      format,
      graphPrefix,
      external,
      help,
      ...(out === undefined ? {} : { out }),
    };
  }
  if (command === 'edit-preflight' || command === 'decide') {
    if (positionals.length < 1) {
      return `${command} requires at least one input.`;
    }
    if (targetFlag === undefined && scope === undefined && cloneScope === undefined) {
      return `${command} requires --target, --scope, --clone-scope, or some combination of them.`;
    }
    return {
      command,
      adviceOnly,
      ...(adviceExit === undefined ? {} : { adviceExit }),
      examples,
      inputs: positionals,
      format,
      graphPrefix,
      external,
      help,
      ...(out === undefined ? {} : { out }),
      ...(cloneScope === undefined ? {} : { cloneScope }),
      ...(scope === undefined ? {} : { scope }),
      ...(targetFlag === undefined ? {} : { target: targetFlag }),
    };
  }
  const targetRequired = command !== 'pointers' && command !== 'summary';
  if (targetRequired && positionals.length < 2) {
    return `${command} requires at least one input and a target path.`;
  }
  if (!targetRequired && positionals.length < 1) {
    return `${command} requires at least one input.`;
  }
  const target = targetRequired ? positionals[positionals.length - 1] : undefined;
  const inputs = targetRequired ? positionals.slice(0, -1) : positionals;

  return {
    command,
    adviceOnly,
    ...(adviceExit === undefined ? {} : { adviceExit }),
    examples,
    inputs,
    format,
    graphPrefix,
    external,
    help,
    ...(out === undefined ? {} : { out }),
    ...(target === undefined ? {} : { target }),
  };
}

function usage(): string {
  return [
    'Usage:',
    '  aeon-guard summary <file-or-dir>... [--format text|json] [--out file]',
    '  aeon-guard decide <file-or-dir>... [--target path] [--scope path] [--clone-scope path] [--graph-prefix] [--external] [--format text|json] [--advice-exit proceed|warn|block] [--out file]',
    '  aeon-guard edit-preflight <file-or-dir>... [--target path] [--scope path] [--clone-scope path] [--graph-prefix] [--external] [--format text|json] [--advice] [--advice-exit proceed|warn|block] [--out file]',
    '  aeon-guard pointers <file-or-dir>... [--format text|json|sarif] [--out file]',
    '  aeon-guard pointer-under <file-or-dir>... <scope-path> [--graph-prefix] [--format text|json|sarif] [--out file]',
    '  aeon-guard clone-into <file-or-dir>... <scope-path> [--graph-prefix] [--format text|json|sarif] [--out file]',
    '  aeon-guard incoming <file-or-dir>... <target-path> [--external] [--format text|json|sarif] [--out file]',
    '  aeon-guard --ai',
    '  aeon-guard --examples',
  ].join('\n');
}

function isCommand(value: string): value is AeonGuardCommand {
  return value === 'clone-into'
    || value === 'decide'
    || value === 'edit-preflight'
    || value === 'incoming'
    || value === 'pointer-under'
    || value === 'pointers'
    || value === 'summary';
}

function isFormat(value: string): value is AeonGuardFormat {
  return value === 'json' || value === 'sarif' || value === 'text';
}

function isAdviceExit(value: string): value is AeonGuardAdviceExit {
  return value === 'block' || value === 'proceed' || value === 'warn';
}

function aiWorkflow(): string {
  return [
    '# AEON Guard AI Workflow',
    '',
    'Use aeon-guard when you want a short, intention-shaped preflight command rather than composing aeon-lint and aeon-graph flags by hand.',
    '',
    'Recommended loop:',
    '',
    '```sh',
    'aeon-guard summary repo/ --json',
    "aeon-guard decide repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --json",
    "aeon-guard decide repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice-exit block --json",
    "aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --json",
    "aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice",
    "aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice --advice-exit block",
    "aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out preflight.json",
    "aeon-guard pointers repo/ --json",
    "aeon-guard pointer-under repo/ '$.app' --json",
    "aeon-guard pointer-under repo/ '$.app' --graph-prefix --json",
    "aeon-guard clone-into repo/ '$.app' --json",
    "aeon-guard clone-into repo/ '$.app' --graph-prefix --json",
    "aeon-guard incoming repo/ '$.shared.theme' --json",
    "aeon-guard incoming repo/ '$.shared.theme' --external --json",
    '```',
    '',
    'Rules for agents:',
    '',
    '- Start with summary when you need a quick feel for graph size, diagnostics, and pointer risk.',
    '- Use decide when you only want the compact recommendation shape and not the full preflight report.',
    '- Use edit-preflight before aeon-edit or aeon-apply when the changed target path, mutable working scope, or protected clone scope matter.',
    '- Use edit-preflight --advice when a script only needs a compact block, warn, or proceed recommendation.',
    '- Use --advice-exit block when warn should still print but not fail the command.',
    '- Use pointers when any live aliasing is enough to block the next step.',
    '- Use --graph-prefix when a broad subtree should first collapse to exact graph-derived endpoints.',
    '- Use incoming before rename, replace, or delete work on a shared path.',
    '- Use incoming --external when same-file references are acceptable but cross-file coupling is not.',
  ].join('\n');
}

function examplesWorkflow(): string {
  return [
    '# AEON Guard Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/guard-workflow',
    '  Summary and preflight artifact workflow.',
    '- examples/guard-apply-workflow',
    '  Full preflight report plus decide, then continue to aeon-apply dry-run.',
    '- examples/guard-apply-blocked-workflow',
    '  Full preflight report plus decide, then stop before aeon-apply on warn.',
    '- examples/guard-decide-workflow',
    '  Standalone summary and decide flow, including --advice-exit behavior.',
    '',
    'Run them from the workspace root:',
    '',
    '```sh',
    'sh examples/guard-workflow/run.sh',
    'sh examples/guard-apply-workflow/run.sh',
    'sh examples/guard-apply-blocked-workflow/run.sh',
    'sh examples/guard-decide-workflow/run.sh',
    '```',
  ].join('\n');
}

async function writeOutput(file: string, output: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, output, 'utf8');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
