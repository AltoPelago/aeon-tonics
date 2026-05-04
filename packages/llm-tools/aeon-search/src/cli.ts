#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  formatAeonSearchPaths,
  formatAeonSearchText,
  searchAeonFiles,
  type AeonSearchQuery,
} from './index.js';

type OutputFormat = 'json' | 'paths' | 'text';

interface ParsedArgs {
  readonly examples: boolean;
  readonly inputs: readonly string[];
  readonly query: AeonSearchQuery;
  readonly format: OutputFormat;
  readonly out?: string;
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
  if (parsed.examples) {
    process.stdout.write(`${examplesWorkflow()}\n`);
    return 0;
  }

  try {
    const result = await searchAeonFiles(parsed.inputs, parsed.query);
    const output = formatResult(result, parsed.format);
    if (parsed.out === undefined) {
      process.stdout.write(output);
    } else {
      await writeOutput(parsed.out, output);
    }
    return result.diagnostics.length > 0 ? 2 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parsed.format === 'json') {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 2;
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs | string {
  const inputs: string[] = [];
  let format: OutputFormat = 'text';
  let examples = false;
  let help = false;
  let out: string | undefined;
  let path: string | undefined;
  let pathPrefix: string | undefined;
  let value: string | undefined;
  let datatype: string | undefined;
  let kind: string | undefined;

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
      case '--paths':
        format = 'paths';
        break;
      case '--format':
        {
          const formatValue = argv[index + 1];
          if (formatValue === undefined) {
            return 'Missing value for --format';
          }
          if (!isOutputFormat(formatValue)) {
            return `Invalid --format: ${formatValue}`;
          }
          format = formatValue;
          index += 1;
        }
        break;
      case '--out':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --out';
        }
        out = argv[index + 1];
        index += 1;
        break;
      case '--path':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --path';
        }
        path = argv[index + 1];
        index += 1;
        break;
      case '--path-prefix':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --path-prefix';
        }
        pathPrefix = argv[index + 1];
        index += 1;
        break;
      case '--value':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --value';
        }
        value = argv[index + 1];
        index += 1;
        break;
      case '--datatype':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --datatype';
        }
        datatype = argv[index + 1];
        index += 1;
        break;
      case '--kind':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --kind';
        }
        kind = argv[index + 1];
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

  return {
    inputs,
    query: {
      ...(path === undefined ? {} : { path }),
      ...(pathPrefix === undefined ? {} : { pathPrefix }),
      ...(value === undefined ? {} : { value }),
      ...(datatype === undefined ? {} : { datatype }),
      ...(kind === undefined ? {} : { kind }),
    },
    format,
    examples,
    ...(out === undefined ? {} : { out }),
    help,
  };
}

function usage(): string {
  return [
    'Usage:',
    '  aeon-search <file-or-dir>... [--json]',
    '  aeon-search <file-or-dir>... [--format text|json|paths]',
    '  aeon-search <file-or-dir>... [--format text|json|paths] [--out file]',
    '  aeon-search <file-or-dir>... --path <path> [--json]',
    '  aeon-search <file-or-dir>... --path-prefix <path> [--json]',
    '  aeon-search <file-or-dir>... --value <aeon-value-preview> [--json]',
    '  aeon-search <file-or-dir>... --datatype <datatype> [--json]',
    '  aeon-search <file-or-dir>... --kind <kind> [--json]',
    '  aeon-search <file-or-dir>... --kind reference --format paths',
    '  aeon-search --examples',
  ].join('\n');
}

function isOutputFormat(value: string): value is OutputFormat {
  return value === 'json' || value === 'paths' || value === 'text';
}

function formatResult(
  result: Awaited<ReturnType<typeof searchAeonFiles>>,
  format: OutputFormat,
): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (format === 'paths') {
    return formatAeonSearchPaths(result);
  }
  return formatAeonSearchText(result);
}

async function writeOutput(file: string, output: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, output, 'utf8');
}

function examplesWorkflow(): string {
  return [
    '# AEON Search Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/search-graph-lint-workflow',
    '  Discover semantic paths, graph dependencies, and lint protected scopes.',
    '- examples/guard-decide-workflow',
    '  Use guard summary and compact decide output around risky pointer scopes.',
    '',
    'Run them from the workspace root:',
    '',
    '```sh',
    'sh examples/search-graph-lint-workflow/run.sh',
    'sh examples/guard-decide-workflow/run.sh',
    '```',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
