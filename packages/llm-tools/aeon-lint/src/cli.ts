#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_AEON_LINT_RULES,
  formatAeonLintSarif,
  formatAeonLintText,
  lintAeonFiles,
  type AeonLintRule,
} from './index.js';

type OutputFormat = 'json' | 'sarif' | 'text';

interface ParsedArgs {
  readonly examples: boolean;
  readonly inputs: readonly string[];
  readonly format: OutputFormat;
  readonly help: boolean;
  readonly rules: readonly AeonLintRule[];
  readonly cloneInto: readonly string[];
  readonly cloneIntoFiles: readonly string[];
  readonly cloneIntoGraphPrefixes: readonly string[];
  readonly pointerUnder: readonly string[];
  readonly pointerUnderFiles: readonly string[];
  readonly pointerUnderGraphPrefixes: readonly string[];
  readonly path?: string;
  readonly references?: string;
  readonly descendants?: string;
  readonly ancestors?: string;
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

  try {
    const cloneInto = await loadScopeArgs(parsed.cloneInto, parsed.cloneIntoFiles);
    const pointerUnder = await loadScopeArgs(parsed.pointerUnder, parsed.pointerUnderFiles);
    const result = await lintAeonFiles(parsed.inputs, {
      cloneInto,
      cloneIntoGraphPrefixes: parsed.cloneIntoGraphPrefixes,
      pointerUnder,
      pointerUnderGraphPrefixes: parsed.pointerUnderGraphPrefixes,
      rules: parsed.rules,
      ...(parsed.path === undefined ? {} : { path: parsed.path }),
      ...(parsed.references === undefined ? {} : { references: parsed.references }),
      ...(parsed.descendants === undefined ? {} : { descendants: parsed.descendants }),
      ...(parsed.ancestors === undefined ? {} : { ancestors: parsed.ancestors }),
    });
    process.stdout.write(formatResult(result, parsed.format));
    return result.ok ? 0 : 1;
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
  const inputs: string[] = [];
  let examples = false;
  let format: OutputFormat = 'text';
  let help = false;
  const rules: AeonLintRule[] = [];
  const cloneInto: string[] = [];
  const cloneIntoFiles: string[] = [];
  const cloneIntoGraphPrefixes: string[] = [];
  const pointerUnder: string[] = [];
  const pointerUnderFiles: string[] = [];
  const pointerUnderGraphPrefixes: string[] = [];
  let path: string | undefined;
  let references: string | undefined;
  let descendants: string | undefined;
  let ancestors: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--json':
        format = 'json';
        break;
      case '--examples':
        examples = true;
        break;
      case '--format':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --format';
          }
          if (!isOutputFormat(value)) {
            return `Invalid --format: ${value}`;
          }
          format = value;
          index += 1;
        }
        break;
      case '--rule':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --rule';
          }
          if (!isRule(value)) {
            return `Invalid --rule: ${value}`;
          }
          rules.push(value);
          index += 1;
        }
        break;
      case '--clone-into':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --clone-into';
        }
        cloneInto.push(argv[index + 1]!);
        index += 1;
        break;
      case '--clone-into-file':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --clone-into-file';
        }
        cloneIntoFiles.push(argv[index + 1]!);
        index += 1;
        break;
      case '--clone-into-graph-prefix':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --clone-into-graph-prefix';
        }
        cloneIntoGraphPrefixes.push(argv[index + 1]!);
        index += 1;
        break;
      case '--pointer-under':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --pointer-under';
        }
        pointerUnder.push(argv[index + 1]!);
        index += 1;
        break;
      case '--pointer-under-graph-prefix':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --pointer-under-graph-prefix';
        }
        pointerUnderGraphPrefixes.push(argv[index + 1]!);
        index += 1;
        break;
      case '--pointer-under-file':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --pointer-under-file';
        }
        pointerUnderFiles.push(argv[index + 1]!);
        index += 1;
        break;
      case '--path':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --path';
        }
        path = argv[index + 1];
        index += 1;
        break;
      case '--references':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --references';
        }
        references = argv[index + 1];
        index += 1;
        break;
      case '--descendants':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --descendants';
        }
        descendants = argv[index + 1];
        index += 1;
        break;
      case '--ancestors':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --ancestors';
        }
        ancestors = argv[index + 1];
        index += 1;
        break;
      default:
        if (arg.startsWith('-')) {
          return `Unknown option: ${arg}`;
        }
        inputs.push(arg);
    }
  }

  if (!help && !examples && inputs.length === 0) {
    return 'Expected at least one file or directory.';
  }

  const hasScopedRules = cloneInto.length > 0
    || cloneIntoFiles.length > 0
    || cloneIntoGraphPrefixes.length > 0
    || pointerUnder.length > 0
    || pointerUnderFiles.length > 0
    || pointerUnderGraphPrefixes.length > 0;
  const resolvedRules = rules.length === 0
    ? (hasScopedRules ? [] : [...DEFAULT_AEON_LINT_RULES])
    : [...new Set(rules)];

  return {
    examples,
    inputs,
    format,
    help,
    cloneInto: [...new Set(cloneInto)],
    cloneIntoFiles: [...new Set(cloneIntoFiles)],
    cloneIntoGraphPrefixes: [...new Set(cloneIntoGraphPrefixes)],
    pointerUnder: [...new Set(pointerUnder)],
    pointerUnderFiles: [...new Set(pointerUnderFiles)],
    pointerUnderGraphPrefixes: [...new Set(pointerUnderGraphPrefixes)],
    rules: resolvedRules,
    ...(path === undefined ? {} : { path }),
    ...(references === undefined ? {} : { references }),
    ...(descendants === undefined ? {} : { descendants }),
    ...(ancestors === undefined ? {} : { ancestors }),
  };
}

function usage(): string {
  return [
    'Usage:',
    '  aeon-lint <file-or-dir>... [--json]',
    '  aeon-lint <file-or-dir>... [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --rule no-diagnostic --rule no-pointer [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --pointer-under <path> [--pointer-under <path> ...] [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --pointer-under-file paths.txt [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --pointer-under-graph-prefix <path> [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --clone-into <path> [--clone-into <path> ...] [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --clone-into-file paths.txt [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --clone-into-graph-prefix <path> [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --references <path> --rule no-incoming-reference [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --references <path> --rule no-external-reference [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --path <path> [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --descendants <path> [--format text|json|sarif]',
    '  aeon-lint <file-or-dir>... --ancestors <path> [--format text|json|sarif]',
    '  aeon-lint --ai',
    '  aeon-lint --examples',
  ].join('\n');
}

function isRule(value: string): value is AeonLintRule {
  return value === 'no-clone-into'
    || value === 'no-diagnostic'
    || value === 'no-external-reference'
    || value === 'no-incoming-reference'
    || value === 'no-pointer'
    || value === 'no-pointer-under';
}

function isOutputFormat(value: string): value is OutputFormat {
  return value === 'json' || value === 'sarif' || value === 'text';
}

function formatResult(
  result: Awaited<ReturnType<typeof lintAeonFiles>>,
  format: OutputFormat,
): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (format === 'sarif') {
    return formatAeonLintSarif(result);
  }
  return formatAeonLintText(result);
}

async function loadScopeArgs(
  inlineValues: readonly string[],
  fileValues: readonly string[],
): Promise<readonly string[]> {
  const loaded = await Promise.all(fileValues.map(async (file) => loadScopeFile(file)));
  return [...new Set([...inlineValues, ...loaded.flat()])];
}

async function loadScopeFile(file: string): Promise<readonly string[]> {
  const source = await readFile(file, 'utf8');
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function aiWorkflow(): string {
  return [
    '# AEON Lint AI Workflow',
    '',
    'Use aeon-lint as a fast preflight when an agent wants a simple pass/fail answer before editing or applying patches.',
    '',
    'Recommended loop:',
    '',
    '```sh',
    'aeon-lint repo/ --json',
    "aeon-lint repo/ --pointer-under '$.app' --json",
    "aeon-lint repo/ --pointer-under-graph-prefix '$.app' --json",
    'aeon-lint repo/ --pointer-under-file pointer-scopes.txt --json',
    "aeon-lint repo/ --clone-into '$.app.theme' --json",
    "aeon-lint repo/ --clone-into-graph-prefix '$.app' --json",
    'aeon-lint repo/ --clone-into-file clone-scopes.txt --json',
    "aeon-lint repo/ --references '$.shared.theme' --rule no-incoming-reference --json",
    "aeon-lint repo/ --references '$.shared.theme' --rule no-external-reference --json",
    "aeon-lint repo/ --descendants '$.app' --rule no-pointer --json",
    "aeon-graph repo/ --references '$.shared.theme' --summary --json",
    "aeon-search repo/ --path-prefix '$.app'",
    'aes-diff --patch before.aeon after.aeon > patch.json',
    'aeon-apply patch.json repo/ --check --json',
    '```',
    '',
    'Rules for agents:',
    '',
    '- Start with aeon-lint when you need a guardrail, then drop to aeon-graph for deeper inspection.',
    '- Use --pointer-under to protect mutable subtrees from hidden aliasing behavior.',
    '- Use --pointer-under-graph-prefix when you want aeon-lint to derive exact pointer source paths from the graph first.',
    '- Use --pointer-under-file when a prior tool computed many sensitive scopes.',
    '- Use --clone-into to prevent copied values from landing inside protected canonical scopes.',
    '- Use --clone-into-graph-prefix when you want aeon-lint to derive exact clone receiver paths from the graph first.',
    '- Use --clone-into-file when the protected canonical scopes come from a batch plan.',
    '- Pair no-incoming-reference with --references before deleting or renaming a path.',
    '- Treat no-pointer findings as higher risk because they imply aliasing semantics at runtime.',
  ].join('\n');
}

function examplesWorkflow(): string {
  return [
    '# AEON Lint Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/search-graph-lint-workflow',
    '  Discover paths, derive protected scopes, and run focused lint checks.',
    '- examples/guard-workflow',
    '  Use lint and graph preflight outputs before edit or apply work.',
    '- examples/guard-decide-workflow',
    '  Compare default and soft-passed guard decisions around risky scopes.',
    '',
    'Run them from the workspace root:',
    '',
    '```sh',
    'sh examples/search-graph-lint-workflow/run.sh',
    'sh examples/guard-workflow/run.sh',
    'sh examples/guard-decide-workflow/run.sh',
    '```',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
