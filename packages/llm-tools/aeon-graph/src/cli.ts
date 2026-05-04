#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  type AeonGraphDotTheme,
  type AeonGraphEdgeKind,
  formatAeonGraphDot,
  formatAeonGraphPaths,
  formatAeonGraphSummaryText,
  formatAeonGraphText,
  graphAeonFiles,
  summarizeAeonGraph,
} from './index.js';

type OutputFormat = 'dot' | 'json' | 'paths' | 'text';
type FailOn = 'diagnostic' | 'external-reference' | 'incoming-reference' | 'pointer';

interface ParsedArgs {
  readonly examples: boolean;
  readonly inputs: readonly string[];
  readonly ancestors?: string;
  readonly descendants?: string;
  readonly dotTheme: AeonGraphDotTheme;
  readonly edgeKind?: AeonGraphEdgeKind;
  readonly failOn: readonly FailOn[];
  readonly format: OutputFormat;
  readonly fromPaths: boolean;
  readonly fromPathPrefix?: string;
  readonly out?: string;
  readonly path?: string;
  readonly references?: string;
  readonly summary: boolean;
  readonly toPathPrefix?: string;
  readonly toPaths: boolean;
  readonly help: boolean;
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
    const result = await graphAeonFiles(parsed.inputs, {
      ...(parsed.ancestors === undefined ? {} : { ancestors: parsed.ancestors }),
      ...(parsed.descendants === undefined ? {} : { descendants: parsed.descendants }),
      ...(parsed.edgeKind === undefined ? {} : { edgeKind: parsed.edgeKind }),
      ...(parsed.fromPathPrefix === undefined ? {} : { fromPathPrefix: parsed.fromPathPrefix }),
      ...(parsed.path === undefined ? {} : { path: parsed.path }),
      ...(parsed.references === undefined ? {} : { references: parsed.references }),
      ...(parsed.toPathPrefix === undefined ? {} : { toPathPrefix: parsed.toPathPrefix }),
    });
    const summary = summarizeAeonGraph(result);
    const output = formatResult(result, summary, parsed.format, parsed.dotTheme, parsed.summary, parsed.fromPaths, parsed.toPaths);
    if (parsed.out === undefined) {
      process.stdout.write(output);
    } else {
      await writeOutput(parsed.out, output);
    }
    if (result.diagnostics.length > 0) {
      return 2;
    }
    return graphPolicyFailed(result, summary, parsed.failOn) ? 1 : 0;
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
  let ancestors: string | undefined;
  let descendants: string | undefined;
  let dotTheme: AeonGraphDotTheme = 'plain';
  let edgeKind: AeonGraphEdgeKind | undefined;
  const failOn: FailOn[] = [];
  let format: OutputFormat = 'text';
  let fromPaths = false;
  let fromPathPrefix: string | undefined;
  let examples = false;
  let help = false;
  let out: string | undefined;
  let path: string | undefined;
  let references: string | undefined;
  let summary = false;
  let toPathPrefix: string | undefined;
  let toPaths = false;

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
      case '--summary':
        summary = true;
        break;
      case '--from':
        fromPaths = true;
        break;
      case '--from-path-prefix':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --from-path-prefix';
        }
        fromPathPrefix = argv[index + 1];
        index += 1;
        break;
      case '--out':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --out';
        }
        out = argv[index + 1];
        index += 1;
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
      case '--to':
        toPaths = true;
        break;
      case '--to-path-prefix':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --to-path-prefix';
        }
        toPathPrefix = argv[index + 1];
        index += 1;
        break;
      case '--fail-on':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --fail-on';
          }
          if (!isFailOn(value)) {
            return `Invalid --fail-on: ${value}`;
          }
          failOn.push(value);
          index += 1;
        }
        break;
      case '--dot-theme':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --dot-theme';
          }
          if (!isDotTheme(value)) {
            return `Invalid --dot-theme: ${value}`;
          }
          dotTheme = value;
          index += 1;
        }
        break;
      case '--ancestors':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --ancestors';
        }
        ancestors = argv[index + 1];
        index += 1;
        break;
      case '--descendants':
        if (argv[index + 1] === undefined) {
          return 'Missing value for --descendants';
        }
        descendants = argv[index + 1];
        index += 1;
        break;
      case '--edge-kind':
        {
          const value = argv[index + 1];
          if (value === undefined) {
            return 'Missing value for --edge-kind';
          }
          if (!isEdgeKind(value)) {
            return `Invalid --edge-kind: ${value}`;
          }
          edgeKind = value;
          index += 1;
        }
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
    examples,
    ...(ancestors === undefined ? {} : { ancestors }),
    ...(descendants === undefined ? {} : { descendants }),
    dotTheme,
    ...(edgeKind === undefined ? {} : { edgeKind }),
    failOn,
    format,
    fromPaths,
    ...(fromPathPrefix === undefined ? {} : { fromPathPrefix }),
    ...(out === undefined ? {} : { out }),
    ...(path === undefined ? {} : { path }),
    ...(references === undefined ? {} : { references }),
    summary,
    ...(toPathPrefix === undefined ? {} : { toPathPrefix }),
    toPaths,
    help,
  };
}

function usage(): string {
  return [
    'Usage:',
    '  aeon-graph <file-or-dir>... [--json]',
    '  aeon-graph <file-or-dir>... --summary [--json]',
    '  aeon-graph <file-or-dir>... --fail-on pointer|incoming-reference|external-reference|diagnostic [--summary] [--json]',
    '  aeon-graph <file-or-dir>... [--format text|json|dot|paths] [--out file]',
    '  aeon-graph <file-or-dir>... [--format text|json|dot|paths]',
    '  aeon-graph <file-or-dir>... --format dot [--dot-theme plain|agent]',
    '  aeon-graph <file-or-dir>... --format paths [--from] [--to]',
    '  aeon-graph <file-or-dir>... --from-path-prefix <path> [--to-path-prefix <path>] [--format text|json|dot|paths]',
    '  aeon-graph <file-or-dir>... --path <path> [--format text|json|dot]',
    '  aeon-graph <file-or-dir>... --references <target-path> [--format text|json|dot]',
    '  aeon-graph <file-or-dir>... --descendants <path> [--format text|json|dot]',
    '  aeon-graph <file-or-dir>... --ancestors <path> [--format text|json|dot]',
    '  aeon-graph <file-or-dir>... --edge-kind contains|clone|pointer [--format text|json|dot]',
    '  aeon-graph --ai',
    '  aeon-graph --examples',
  ].join('\n');
}

function formatResult(
  result: Awaited<ReturnType<typeof graphAeonFiles>>,
  graphSummary: ReturnType<typeof summarizeAeonGraph>,
  format: OutputFormat,
  dotTheme: AeonGraphDotTheme,
  summary: boolean,
  fromPaths: boolean,
  toPaths: boolean,
): string {
  if (summary) {
    return format === 'json'
      ? `${JSON.stringify(graphSummary, null, 2)}\n`
      : formatAeonGraphSummaryText(graphSummary);
  }
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (format === 'dot') {
    return formatAeonGraphDot(result, { theme: dotTheme });
  }
  if (format === 'paths') {
    return formatAeonGraphPaths(result, {
      ...(fromPaths ? { from: true } : {}),
      ...(toPaths ? { to: true } : {}),
    });
  }
  return formatAeonGraphText(result);
}

function graphPolicyFailed(
  result: Awaited<ReturnType<typeof graphAeonFiles>>,
  summary: ReturnType<typeof summarizeAeonGraph>,
  failOn: readonly FailOn[],
): boolean {
  return failOn.some((policy) => {
    if (policy === 'diagnostic') {
      return summary.counts.diagnostics > 0;
    }
    if (policy === 'external-reference') {
      return hasExternalReference(result);
    }
    if (policy === 'incoming-reference') {
      return summary.counts.byEdgeKind.clone + summary.counts.byEdgeKind.pointer > 0;
    }
    return summary.counts.byEdgeKind.pointer > 0;
  });
}

function hasExternalReference(result: Awaited<ReturnType<typeof graphAeonFiles>>): boolean {
  const nodesByPath = new Map<string, Set<string>>();
  for (const node of result.nodes) {
    const files = nodesByPath.get(node.path) ?? new Set<string>();
    files.add(node.file);
    nodesByPath.set(node.path, files);
  }
  return result.edges.some((edge) => {
    if (edge.kind === 'contains') {
      return false;
    }
    const targetFiles = nodesByPath.get(edge.to);
    if (targetFiles === undefined || targetFiles.has(edge.file)) {
      return false;
    }
    return targetFiles.size > 0;
  });
}

function isDotTheme(value: string): value is AeonGraphDotTheme {
  return value === 'agent' || value === 'plain';
}

function isEdgeKind(value: string): value is AeonGraphEdgeKind {
  return value === 'contains' || value === 'clone' || value === 'pointer';
}

function isOutputFormat(value: string): value is OutputFormat {
  return value === 'dot' || value === 'json' || value === 'paths' || value === 'text';
}

function isFailOn(value: string): value is FailOn {
  return value === 'diagnostic' || value === 'external-reference' || value === 'incoming-reference' || value === 'pointer';
}

function aiWorkflow(): string {
  return [
    '# AEON Graph AI Workflow',
    '',
    'Use aeon-graph before migrations when references, clone boundaries, or pointer boundaries may make a path risky to edit.',
    '',
    'Recommended loop:',
    '',
    '```sh',
    "aeon-graph repo/ --references '$.shared.theme' --json",
    'aeon-graph repo/ --summary --json',
    'aeon-graph repo/ --summary --json --fail-on pointer',
    "aeon-graph repo/ --references '$.shared.theme' --summary --json --fail-on incoming-reference",
    "aeon-graph repo/ --references '$.shared.theme' --summary --json --fail-on external-reference",
    "aeon-graph repo/ --path '$.app.theme' --json",
    "aeon-graph repo/ --descendants '$.app' --edge-kind contains --json",
    "aeon-graph repo/ --ancestors '$.app.theme.primary' --json",
    "aeon-graph repo/ --descendants '$.app' --format dot --dot-theme agent --out app-graph.dot",
    "aeon-graph repo/ --edge-kind pointer --from-path-prefix '$.app' --format paths --from --out app-pointer-sources.txt",
    "aeon-graph repo/ --edge-kind pointer --format paths --from --out pointer-sources.txt",
    "aeon-graph repo/ --edge-kind clone --to-path-prefix '$.shared' --format paths --to --out shared-clone-targets.txt",
    "aeon-graph repo/ --edge-kind clone --format paths --to --out clone-targets.txt",
    'aeon-graph repo/ --edge-kind pointer --json',
    'aes-diff --patch before.aeon after.aeon > patch.json',
    'aeon-apply patch.json repo/ --check --json',
    '```',
    '',
    'Rules for agents:',
    '',
    '- Check incoming references before removing or replacing a path.',
    '- Treat pointer edges as higher risk than clone edges because they imply live aliasing semantics.',
    '- Use --format paths with --from or --to when another tool expects newline-delimited scope files.',
    '- Use --from-path-prefix or --to-path-prefix to narrow batch scope files before handing them to aeon-lint.',
    '- Use graph output to scope follow-up aeon-search and aeon-apply operations.',
  ].join('\n');
}

function examplesWorkflow(): string {
  return [
    '# AEON Graph Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/search-graph-lint-workflow',
    '  Combine search, graph path extraction, and focused lint checks.',
    '- examples/guard-workflow',
    '  Use graph summary and preflight artifacts before edit or apply work.',
    '- examples/guard-decide-workflow',
    '  Inspect pointer risk, then compare default and soft-passed decide behavior.',
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

async function writeOutput(file: string, output: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, output, 'utf8');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
