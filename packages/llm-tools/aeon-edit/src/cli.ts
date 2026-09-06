#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  diffAeon,
  formatAesDiffText,
  summarizeAesDiff,
  type AesDiffResult,
} from '../../aes-diff/dist/index.js';
import {
  appendLedgerEntry,
  hashText,
  parseLedgerJsonl,
  type LedgerKeyPair,
  type LedgerPayload,
} from '../../../provenance/signed-ledger/dist/index.js';
import {
  applyAeonEditBatch,
  appendAeonEditValue,
  compactAeonEdit,
  convertAeonEditMode,
  deleteAeonEditAttribute,
  deleteAeonEditAttributeAnnotation,
  deleteAeonEditNodeAttribute,
  deleteAeonEditNodeAttributeAnnotation,
  deleteAeonEditValue,
  exportAeonEditAes,
  exportAeonEditTelex,
  getAeonEditAttribute,
  getAeonEditAttributeAnnotation,
  getAeonEditNodeAttribute,
  getAeonEditNodeAttributeAnnotation,
  getAeonEditValue,
  inspectAeonEditPath,
  insertAeonEditValue,
  listAeonEditPaths,
  planAeonEditAttributeAnnotationSet,
  planAeonEditAttributeSet,
  planAeonEditNodeAttributeAnnotationSet,
  planAeonEditNodeAttributeSet,
  planAeonEditSet,
  prettifyAeonEdit,
  setAeonEditAttribute,
  setAeonEditAttributeAnnotation,
  setAeonEditNodeAttribute,
  setAeonEditNodeAttributeAnnotation,
  setAeonEditValue,
  type AeonEditBatchOperation,
  type AeonEditResult,
} from './index.js';
import type { CompactCommentMode } from '../../../export/compactor/dist/index.js';
import type { AeonModeConversionTarget } from '../../../export/mode-converter/dist/index.js';

interface ParsedArgs {
  readonly command: string;
  readonly examples: boolean;
  readonly file?: string;
  readonly path?: string;
  readonly value?: string;
  readonly extra?: string;
  readonly extra2?: string;
  readonly subcommand?: string;
  readonly json: boolean;
  readonly diff: boolean;
  readonly check: boolean;
  readonly out?: string;
  readonly write: boolean;
  readonly log?: string;
  readonly logFormat?: 'jsonl' | 'aeon';
  readonly id?: string;
  readonly target?: string;
  readonly limit?: number;
  readonly ledger?: string;
  readonly ledgerKey?: string;
  readonly latest: boolean;
  readonly noLog: boolean;
  readonly comments: CompactCommentMode;
  readonly includeHeaders: boolean;
}

interface AeonEditLogRecord {
  readonly format: 'aeon.edit.log';
  readonly version: 1;
  readonly id: string;
  readonly timestamp: string;
  readonly command: string;
  readonly file: string;
  readonly target: string;
  readonly beforeText: string;
  readonly afterText: string;
  readonly diffSummary: AesDiffResult['summary'];
  readonly affectedTopLevel: readonly string[];
  readonly affectedPaths: readonly string[];
}

interface AeonEditLogSummary {
  readonly id: string;
  readonly timestamp: string;
  readonly command: string;
  readonly file: string;
  readonly target: string;
  readonly diffSummary: AesDiffResult['summary'];
  readonly affectedTopLevel: readonly string[];
  readonly affectedPaths: readonly string[];
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (typeof parsed === 'string') {
    process.stderr.write(`${parsed}\n\n${usage()}\n`);
    return 2;
  }
  if (parsed.command === 'ai') {
    process.stdout.write(`${aiWorkflow()}\n`);
    return 0;
  }
  if (parsed.command === 'examples') {
    process.stdout.write(`${examplesWorkflow()}\n`);
    return 0;
  }
  if (parsed.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  try {
    if (parsed.command === 'undo') {
      return await runUndo(parsed);
    }
    if (parsed.command === 'log') {
      return await runLogCommand(parsed);
    }

    const source = await readFile(required(parsed.file, 'file'), 'utf8');
    const result = parsed.command === 'batch'
      ? applyAeonEditBatch(source, parseBatchOperations(await readFile(required(parsed.path, 'ops file'), 'utf8')))
      : runCommand(source, parsed);
    const reviewed = addDiffIfRequested(source, result, parsed.diff);
    const text = parsed.json ? `${JSON.stringify(reviewed, null, 2)}\n` : renderHuman(reviewed);

    if (!reviewed.ok) {
      process.stdout.write(text);
      return 2;
    }

    if (parsed.check) {
      process.stdout.write(text);
      return hasSemanticChanges(reviewed) ? 0 : 1;
    }

    if (reviewed.output?.format === 'aeon' && reviewed.output.text && (parsed.write || parsed.out)) {
      const target = parsed.out ?? required(parsed.file, 'file');
      await writeFile(target, reviewed.output.text, 'utf8');
      const logRecord = await writeEditLog(parsed, source, reviewed.output.text, target);
      await writeEditLedger(parsed, source, reviewed.output.text, target, logRecord);
      process.stdout.write(parsed.json || reviewed.diff ? text : `wrote ${parsed.out ?? parsed.file}\n`);
      return 0;
    }

    if (reviewed.output?.format === 'telex' && reviewed.output.text && parsed.out) {
      await writeFile(parsed.out, reviewed.output.text, 'utf8');
      process.stdout.write(parsed.json ? text : `wrote ${parsed.out}\n`);
      return 0;
    }

    process.stdout.write(text);
    return 0;
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

function runCommand(source: string, args: ParsedArgs) {
  switch (args.command) {
    case 'attr':
      return runAttrCommand(source, args);
    case 'attr-annotation':
      return runAttrAnnotationCommand(source, args);
    case 'node-attr':
      return runNodeAttrCommand(source, args);
    case 'node-attr-annotation':
      return runNodeAttrAnnotationCommand(source, args);
    case 'get':
      return getAeonEditValue(source, required(args.path, 'path'));
    case 'inspect':
      return inspectAeonEditPath(source, required(args.path, 'path'));
    case 'list':
      return listAeonEditPaths(source);
    case 'compact':
      return compactAeonEdit(source, args.comments);
    case 'convert-mode':
      return convertAeonEditMode(source, parseModeTarget(required(args.path, 'mode')));
    case 'prettify':
      return prettifyAeonEdit(source);
    case 'plan-set':
      return planAeonEditSet(source, required(args.path, 'path'), required(args.value, 'value'));
    case 'plan-attr-set':
      return planAeonEditAttributeSet(source, required(args.path, 'path'), required(args.value, 'key'), required(args.extra, 'value'));
    case 'plan-node-attr-set':
      return planAeonEditNodeAttributeSet(source, required(args.path, 'path'), required(args.value, 'key'), required(args.extra, 'value'));
    case 'plan-attr-annotation-set':
      return planAeonEditAttributeAnnotationSet(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
        required(args.extra2, 'value'),
      );
    case 'plan-node-attr-annotation-set':
      return planAeonEditNodeAttributeAnnotationSet(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
        required(args.extra2, 'value'),
      );
    case 'batch':
      throw new Error('Batch command must be executed through the CLI batch loader.');
    case 'set':
      return setAeonEditValue(source, required(args.path, 'path'), required(args.value, 'value'));
    case 'delete':
      return deleteAeonEditValue(source, required(args.path, 'path'));
    case 'append':
      return appendAeonEditValue(source, required(args.path, 'path'), required(args.value, 'value'));
    case 'insert':
      return insertAeonEditValue(source, required(args.path, 'path'), required(args.value, 'value'));
    case 'export-aes':
      return exportAeonEditAes(source);
    case 'export-telex':
      return exportAeonEditTelex(source, args.includeHeaders);
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

function runNodeAttrCommand(source: string, args: ParsedArgs) {
  switch (args.subcommand) {
    case 'get':
      return getAeonEditNodeAttribute(source, required(args.path, 'path'), required(args.value, 'key'));
    case 'set':
      return setAeonEditNodeAttribute(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'value'),
      );
    case 'delete':
      return deleteAeonEditNodeAttribute(source, required(args.path, 'path'), required(args.value, 'key'));
    default:
      throw new Error('Unknown node-attr command. Expected: node-attr get, node-attr set, or node-attr delete.');
  }
}

function runNodeAttrAnnotationCommand(source: string, args: ParsedArgs) {
  switch (args.subcommand) {
    case 'get':
      return getAeonEditNodeAttributeAnnotation(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
      );
    case 'set':
      return setAeonEditNodeAttributeAnnotation(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
        required(args.extra2, 'value'),
      );
    case 'delete':
      return deleteAeonEditNodeAttributeAnnotation(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
      );
    default:
      throw new Error(
        'Unknown node-attr-annotation command. Expected: node-attr-annotation get, node-attr-annotation set, or node-attr-annotation delete.',
      );
  }
}

function runAttrCommand(source: string, args: ParsedArgs) {
  switch (args.subcommand) {
    case 'get':
      return getAeonEditAttribute(source, required(args.path, 'path'), required(args.value, 'key'));
    case 'set':
      return setAeonEditAttribute(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'value'),
      );
    case 'delete':
      return deleteAeonEditAttribute(source, required(args.path, 'path'), required(args.value, 'key'));
    default:
      throw new Error('Unknown attr command. Expected: attr get, attr set, or attr delete.');
  }
}

function runAttrAnnotationCommand(source: string, args: ParsedArgs) {
  switch (args.subcommand) {
    case 'get':
      return getAeonEditAttributeAnnotation(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
      );
    case 'set':
      return setAeonEditAttributeAnnotation(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
        required(args.extra2, 'value'),
      );
    case 'delete':
      return deleteAeonEditAttributeAnnotation(
        source,
        required(args.path, 'path'),
        required(args.value, 'key'),
        required(args.extra, 'annotation-key'),
      );
    default:
      throw new Error(
        'Unknown attr-annotation command. Expected: attr-annotation get, attr-annotation set, or attr-annotation delete.',
      );
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs | string {
  if (argv.includes('--ai')) {
    return {
      command: 'ai',
      examples: false,
      json: false,
      diff: false,
      check: false,
      write: false,
      latest: false,
      noLog: true,
      comments: 'semantic',
      includeHeaders: false,
    };
  }
  const args = [...argv];
  if (args.includes('--examples')) {
    return {
      command: 'examples',
      examples: true,
      json: false,
      diff: false,
      check: false,
      write: false,
      latest: false,
      noLog: true,
      comments: 'semantic',
      includeHeaders: false,
    };
  }
  const command = args.shift() ?? 'help';
  const subcommand = ['attr', 'attr-annotation', 'node-attr', 'node-attr-annotation', 'log'].includes(command)
    ? args.shift()
    : undefined;
  let json = false;
  let diff = false;
  let check = false;
  let write = false;
  let noLog = false;
  let out: string | undefined;
  let log: string | undefined;
  let logFormat: 'jsonl' | 'aeon' | undefined;
  let id: string | undefined;
  let target: string | undefined;
  let limit: number | undefined;
  let ledger: string | undefined;
  let ledgerKey: string | undefined;
  let latest = false;
  let comments: CompactCommentMode = 'semantic';
  let includeHeaders = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    switch (arg) {
      case '--json':
        json = true;
        break;
      case '--diff':
        diff = true;
        break;
      case '--check':
        check = true;
        diff = true;
        break;
      case '--write':
        write = true;
        break;
      case '--no-log':
        noLog = true;
        break;
      case '--log': {
        const value = args[index + 1];
        if (!value) {
          return 'Missing value for --log';
        }
        log = value;
        index += 1;
        break;
      }
      case '--log-format': {
        const value = args[index + 1];
        if (value !== 'jsonl' && value !== 'aeon') {
          return 'Missing or invalid value for --log-format. Expected jsonl or aeon';
        }
        logFormat = value;
        index += 1;
        break;
      }
      case '--id': {
        const value = args[index + 1];
        if (!value) {
          return 'Missing value for --id';
        }
        id = value;
        index += 1;
        break;
      }
      case '--target': {
        const value = args[index + 1];
        if (!value) {
          return 'Missing value for --target';
        }
        target = resolve(value);
        index += 1;
        break;
      }
      case '--limit': {
        const value = Number(args[index + 1]);
        if (!Number.isInteger(value) || value < 0) {
          return 'Missing or invalid value for --limit';
        }
        limit = value;
        index += 1;
        break;
      }
      case '--ledger': {
        const value = args[index + 1];
        if (!value) {
          return 'Missing value for --ledger';
        }
        ledger = value;
        index += 1;
        break;
      }
      case '--ledger-key': {
        const value = args[index + 1];
        if (!value) {
          return 'Missing value for --ledger-key';
        }
        ledgerKey = value;
        index += 1;
        break;
      }
      case '--latest':
        latest = true;
        break;
      case '--include-headers':
        includeHeaders = true;
        break;
      case '--comments': {
        const value = args[index + 1];
        if (value !== 'semantic' && value !== 'all' && value !== 'none') {
          return 'Missing or invalid value for --comments. Expected semantic, all, or none';
        }
        comments = value;
        index += 1;
        break;
      }
      case '--out': {
        const value = args[index + 1];
        if (!value) {
          return 'Missing value for --out';
        }
        out = value;
        index += 1;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          return `Unknown option: ${arg}`;
        }
        positional.push(arg);
        break;
    }
  }

  return {
    command,
    examples: false,
    ...(subcommand === undefined ? {} : { subcommand }),
    ...(positional[0] === undefined ? {} : { file: positional[0] }),
    ...(positional[1] === undefined ? {} : { path: positional[1] }),
    ...(positional[2] === undefined ? {} : { value: positional[2] }),
    ...(positional[3] === undefined ? {} : { extra: positional[3] }),
    ...(positional[4] === undefined ? {} : { extra2: positional[4] }),
    json,
    diff,
    check,
    ...(out === undefined ? {} : { out }),
    write,
    ...(log === undefined ? {} : { log }),
    ...(logFormat === undefined ? {} : { logFormat }),
    ...(id === undefined ? {} : { id }),
    ...(target === undefined ? {} : { target }),
    ...(limit === undefined ? {} : { limit }),
    ...(ledger === undefined ? {} : { ledger }),
    ...(ledgerKey === undefined ? {} : { ledgerKey }),
    latest,
    noLog,
    comments,
    includeHeaders,
  };
}

async function writeEditLog(
  args: ParsedArgs,
  beforeText: string,
  afterText: string,
  target: string,
): Promise<AeonEditLogRecord | undefined> {
  if (args.noLog) {
    return undefined;
  }
  const logPath = resolveLogPath(args, target);
  const diff = diffAeon(beforeText, afterText, {
    compileOptions: {
      maxAttributeDepth: 2,
    },
  });
  const planning = summarizeAesDiff(diff, { maxPaths: 8 });
  const timestamp = new Date().toISOString();
  const record: AeonEditLogRecord = {
    format: 'aeon.edit.log',
    version: 1,
    id: `${timestamp}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp,
    command: args.command,
    file: resolve(required(args.file, 'file')),
    target: resolve(target),
    beforeText,
    afterText,
    diffSummary: diff.summary,
    affectedTopLevel: planning.affectedTopLevel,
    affectedPaths: planning.paths,
  };
  const logFormat = args.logFormat ?? inferLogFormat(logPath);
  if (logFormat === 'aeon') {
    await appendAeonLog(logPath, record);
    return record;
  }
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function resolveLogPath(args: ParsedArgs, target: string): string {
  if (args.log) {
    return args.log;
  }
  return resolve(dirname(target), '.aeon-edit', 'log.jsonl');
}

async function runUndo(args: ParsedArgs): Promise<number> {
  const file = required(args.file, 'file');
  const log = required(args.log, 'log');
  const current = await readFile(file, 'utf8');
  const target = resolve(file);
  const records = filterLogRecords(
    await readLogRecords(log, args.logFormat ?? inferLogFormat(log)),
    { target },
  );
  const record = args.id
    ? records.find((entry) => entry.id === args.id)
    : findLatestRecord(records);
  if (!record) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message: 'No matching edit log record found.' } }, null, 2)}\n`);
    return 2;
  }
  if (current !== record.afterText) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: {
        code: 'UNDO_STALE_TARGET',
        message: 'Current file does not match the logged afterText. Refusing stale undo.',
      },
    }, null, 2)}\n`);
    return 2;
  }
  if (args.write) {
    await writeFile(file, record.beforeText, 'utf8');
    await writeUndoLedger(args, current, record.beforeText, file, record);
    process.stdout.write(args.json
      ? `${JSON.stringify({ ok: true, command: 'undo', id: record.id, file: resolve(file), written: true }, null, 2)}\n`
      : `undid ${record.id}\n`);
    return 0;
  }
  const undoDiff = diffAeon(current, record.beforeText, {
    compileOptions: {
      maxAttributeDepth: 2,
    },
  });
  process.stdout.write(args.json
    ? `${JSON.stringify({ ok: true, command: 'undo', id: record.id, file: resolve(file), output: { format: 'aeon', text: record.beforeText } }, null, 2)}\n`
    : renderUndoPreview(file, record, undoDiff));
  return 0;
}

async function writeEditLedger(
  args: ParsedArgs,
  beforeText: string,
  afterText: string,
  target: string,
  logRecord: AeonEditLogRecord | undefined,
): Promise<void> {
  if (!args.ledger && !args.ledgerKey) {
    return;
  }
  const diff = diffAeon(beforeText, afterText, {
    compileOptions: {
      maxAttributeDepth: 2,
    },
  });
  const planning = summarizeAesDiff(diff, { maxPaths: 8 });
  await appendLedgerPayload(args, {
    kind: 'aeon.edit.applied',
    tool: 'aeon-edit',
    command: args.command,
    file: resolve(required(args.file, 'file')),
    target: resolve(target),
    beforeHash: hashText(beforeText),
    afterHash: hashText(afterText),
    diffSummary: diff.summary,
    affectedTopLevel: planning.affectedTopLevel,
    affectedPaths: planning.paths,
    ...(logRecord === undefined ? {} : { editLogRecordId: logRecord.id }),
  });
}

async function writeUndoLedger(
  args: ParsedArgs,
  beforeText: string,
  afterText: string,
  target: string,
  logRecord: AeonEditLogRecord,
): Promise<void> {
  if (!args.ledger && !args.ledgerKey) {
    return;
  }
  const diff = diffAeon(beforeText, afterText, {
    compileOptions: {
      maxAttributeDepth: 2,
    },
  });
  const planning = summarizeAesDiff(diff, { maxPaths: 8 });
  await appendLedgerPayload(args, {
    kind: 'aeon.edit.undone',
    tool: 'aeon-edit',
    command: 'undo',
    file: resolve(required(args.file, 'file')),
    target: resolve(target),
    beforeHash: hashText(beforeText),
    afterHash: hashText(afterText),
    diffSummary: diff.summary,
    affectedTopLevel: planning.affectedTopLevel,
    affectedPaths: planning.paths,
    undoneEditLogRecordId: logRecord.id,
  });
}

async function appendLedgerPayload(args: ParsedArgs, payload: LedgerPayload): Promise<void> {
  const ledgerPath = required(args.ledger, 'ledger');
  const keyPath = required(args.ledgerKey, 'ledger-key');
  const [ledgerText, keyText] = await Promise.all([
    readOptionalFile(ledgerPath),
    readFile(keyPath, 'utf8'),
  ]);
  const entries = parseLedgerJsonl(ledgerText);
  const key = JSON.parse(keyText) as LedgerKeyPair;
  const entry = appendLedgerEntry(entries, payload, { key });
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf8');
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

async function runLogCommand(args: ParsedArgs): Promise<number> {
  const log = required(args.log, 'log');
  const records = filterLogRecords(
    await readLogRecords(log, args.logFormat ?? inferLogFormat(log)),
    args,
  );
  switch (args.subcommand) {
    case 'list':
      return writeLogList(records, args);
    case 'show':
      return writeLogShow(records, args);
    default:
      throw new Error('Unknown log command. Expected: log list or log show.');
  }
}

function writeLogList(records: readonly AeonEditLogRecord[], args: ParsedArgs): number {
  const summaries = applyLimit(records, args.limit).map(summarizeLogRecord);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, command: 'log list', value: summaries }, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(summaries.map(renderLogSummary).join('\n\n') + (summaries.length > 0 ? '\n' : ''));
  return 0;
}

function writeLogShow(records: readonly AeonEditLogRecord[], args: ParsedArgs): number {
  const selector = args.file ?? args.path ?? args.value;
  const record = selector
    ? records.find((entry) => entry.id === selector)
    : args.latest || records.length > 0
      ? findLatestRecord(records)
      : undefined;
  if (!record) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { message: 'No matching edit log record found.' } }, null, 2)}\n`);
    return 2;
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, command: 'log show', value: record }, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(renderLogRecord(record));
  return 0;
}

function summarizeLogRecord(record: AeonEditLogRecord): AeonEditLogSummary {
  return {
    id: record.id,
    timestamp: record.timestamp,
    command: record.command,
    file: record.file,
    target: record.target,
    diffSummary: record.diffSummary,
    affectedTopLevel: record.affectedTopLevel,
    affectedPaths: record.affectedPaths,
  };
}

function renderUndoPreview(file: string, record: AeonEditLogRecord, diff: AesDiffResult): string {
  const summary = summarizeAesDiff(diff, { maxPaths: 8 });
  const affectedPaths = record.affectedPaths.length > 0
    ? record.affectedPaths.join(', ')
    : summary.paths.length > 0
      ? summary.paths.join(', ')
      : '(none)';
  return [
    `undo preview ${record.id}`,
    `file: ${resolve(file)}`,
    `target: ${record.target}`,
    `command: ${record.command}`,
    `affected: ${affectedPaths}`,
    '',
    formatAesDiffText(diff).text.trimEnd(),
    '',
    '--- restored aeon ---',
    record.beforeText.trimEnd(),
    '',
  ].join('\n');
}

function renderLogSummary(record: AeonEditLogSummary): string {
  return [
    `${record.id} ${record.command}`,
    `time: ${record.timestamp}`,
    `target: ${record.target}`,
    `summary: ${formatDiffSummary(record.diffSummary)}`,
    `affected: ${formatAffectedPaths(record.affectedPaths)}`,
  ].join('\n');
}

function renderLogRecord(record: AeonEditLogRecord): string {
  return [
    `edit log ${record.id}`,
    `time: ${record.timestamp}`,
    `command: ${record.command}`,
    `file: ${record.file}`,
    `target: ${record.target}`,
    `summary: ${formatDiffSummary(record.diffSummary)}`,
    `affected top-level: ${formatAffectedPaths(record.affectedTopLevel)}`,
    `affected: ${formatAffectedPaths(record.affectedPaths)}`,
    '',
    '--- before aeon ---',
    record.beforeText.trimEnd(),
    '',
    '--- after aeon ---',
    record.afterText.trimEnd(),
    '',
  ].join('\n');
}

function formatDiffSummary(summary: AesDiffResult['summary']): string {
  return `${summary.added} added, ${summary.removed} removed, ${summary.changed} changed, ${summary.unchanged} unchanged`;
}

function formatAffectedPaths(paths: readonly string[]): string {
  return paths.length > 0 ? paths.join(', ') : '(none)';
}

async function readLogRecords(log: string, format: 'jsonl' | 'aeon'): Promise<readonly AeonEditLogRecord[]> {
  const text = await readFile(log, 'utf8');
  return format === 'aeon'
    ? readAeonLogRecords(text)
    : text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AeonEditLogRecord);
}

function filterLogRecords(
  records: readonly AeonEditLogRecord[],
  options: { readonly target?: string },
): readonly AeonEditLogRecord[] {
  return options.target
    ? records.filter((record) => record.target === options.target)
    : records;
}

function applyLimit<T>(values: readonly T[], limit: number | undefined): readonly T[] {
  return limit === undefined ? values : values.slice(0, limit);
}

function findLatestRecord(
  records: readonly AeonEditLogRecord[],
): AeonEditLogRecord | undefined {
  return records
    .slice()
    .reverse()
    .find((record) => record.format === 'aeon.edit.log');
}

function inferLogFormat(log: string): 'jsonl' | 'aeon' {
  return log.endsWith('.aeon') ? 'aeon' : 'jsonl';
}

async function appendAeonLog(log: string, record: AeonEditLogRecord): Promise<void> {
  await mkdir(dirname(log), { recursive: true });
  const entry = formatAeonLogEntry(record);
  let existing = '';
  try {
    existing = await readFile(log, 'utf8');
  } catch (error) {
    if (!(error && typeof error === 'object' && (error as { readonly code?: unknown }).code === 'ENOENT')) {
      throw error;
    }
  }
  if (existing.trim().length === 0) {
    await writeFile(log, [
      'aeon:mode = "strict"',
      'aeon:profile = "aeon.edit.log.v1"',
      'entries:list = [',
      `  ${entry}`,
      ']',
      '',
    ].join('\n'), 'utf8');
    return;
  }
  const index = existing.lastIndexOf(']');
  if (index === -1) {
    throw new Error(`Invalid AEON edit log: ${log}`);
  }
  const prefix = existing.slice(0, index).trimEnd();
  const suffix = existing.slice(index);
  const separator = prefix.endsWith('[') ? '' : ',';
  await writeFile(log, `${prefix}${separator}\n  ${entry}\n${suffix.trimStart()}`, 'utf8');
}

function formatAeonLogEntry(record: AeonEditLogRecord): string {
  return [
    `<edit@{id:string=${aeonString(record.id)},timestamp:string=${aeonString(record.timestamp)},command:string=${aeonString(record.command)},target:string=${aeonString(record.target)}}:node(`,
    `    <before:node(${aeonString(record.beforeText)})>,`,
    `    <after:node(${aeonString(record.afterText)})>,`,
    `    <record:node(${aeonString(JSON.stringify(record))})>`,
    '  )>',
  ].join('\n');
}

function readAeonLogRecords(text: string): readonly AeonEditLogRecord[] {
  const records: AeonEditLogRecord[] = [];
  const pattern = /<record:node\(("(?:[^"\\]|\\.)*")\)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    records.push(JSON.parse(JSON.parse(match[1]!)) as AeonEditLogRecord);
  }
  return records;
}

function aeonString(value: string): string {
  return JSON.stringify(value);
}

function addDiffIfRequested(source: string, result: AeonEditResult, enabled: boolean): AeonEditResult {
  if (!enabled || result.output?.format !== 'aeon' || !result.output.text) {
    return result;
  }
  return {
    ...result,
    diff: diffAeon(source, result.output.text, {
      compileOptions: {
        maxAttributeDepth: 2,
      },
    }),
  };
}

function hasSemanticChanges(result: AeonEditResult): boolean {
  const diff = result.diff as AesDiffResult | undefined;
  if (diff) {
    return diff.changes.length > 0;
  }
  return result.changed === true;
}

function renderHuman(result: ReturnType<typeof runCommand> | AeonEditResult): string {
  if (result.command === 'get') {
    return `${formatValue(result.value)}\n`;
  }
  if (result.diff) {
    return formatAesDiffText(result.diff as AesDiffResult).text;
  }
  if (result.command === 'inspect') {
    return renderInspection(result.value);
  }
  if (result.command === 'list') {
    return renderList(result.value);
  }
  if (result.command.startsWith('plan-')) {
    return `${JSON.stringify(result.value, null, 2)}\n`;
  }
  if (result.command === 'batch' && result.output?.text) {
    return result.output.text;
  }
  if (result.command === 'batch' && result.preflight) {
    return renderPreflight(result.preflight);
  }
  if (result.output?.format === 'aes') {
    return `${JSON.stringify({ events: result.output.events }, null, 2)}\n`;
  }
  if (result.output?.text) {
    return result.output.text;
  }
  return `${JSON.stringify(result, null, 2)}\n`;
}

function renderPreflight(preflight: NonNullable<AeonEditResult['preflight']>): string {
  if (preflight.diagnostics.length === 0) {
    return 'preflight: ok\n';
  }
  return preflight.diagnostics
    .map((diagnostic) => {
      const key = diagnostic.key ? ` ${diagnostic.key}` : '';
      const annotationKey = diagnostic.annotationKey ? ` ${diagnostic.annotationKey}` : '';
      return `${diagnostic.severity} ${diagnostic.code} op ${diagnostic.index} ${diagnostic.path}${key}${annotationKey}: ${diagnostic.message}`;
    })
    .join('\n') + '\n';
}

function renderInspection(value: unknown): string {
  const inspection = value as {
    readonly path: string;
    readonly kind: string;
    readonly datatype?: string;
    readonly attributes?: readonly { readonly key: string }[];
    readonly nodeAttributes?: readonly { readonly key: string }[];
    readonly children?: readonly string[];
  };
  return [
    `${inspection.path} ${inspection.kind}${inspection.datatype ? `:${inspection.datatype}` : ''}`,
    `attributes: ${formatKeys(inspection.attributes)}`,
    ...(inspection.nodeAttributes ? [`nodeAttributes: ${formatKeys(inspection.nodeAttributes)}`] : []),
    `children: ${inspection.children && inspection.children.length > 0 ? inspection.children.join(', ') : '(none)'}`,
  ].join('\n') + '\n';
}

function renderList(value: unknown): string {
  const entries = value as readonly {
    readonly path: string;
    readonly kind: string;
    readonly datatype?: string;
    readonly attributes?: readonly string[];
    readonly nodeAttributes?: readonly string[];
  }[];
  return entries
    .map((entry) => {
      const metadata = [
        entry.attributes && entry.attributes.length > 0 ? `attrs:${entry.attributes.join(',')}` : '',
        entry.nodeAttributes && entry.nodeAttributes.length > 0 ? `nodeAttrs:${entry.nodeAttributes.join(',')}` : '',
      ].filter(Boolean);
      return `${entry.path} ${entry.kind}${entry.datatype ? `:${entry.datatype}` : ''}${metadata.length > 0 ? ` ${metadata.join(' ')}` : ''}`;
    })
    .join('\n') + '\n';
}

function formatKeys(values: readonly { readonly key: string }[] | undefined): string {
  if (!values || values.length === 0) {
    return '(none)';
  }
  return values.map((value) => value.key).join(', ');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function parseBatchOperations(input: string): readonly AeonEditBatchOperation[] {
  const parsed = JSON.parse(input) as unknown;
  const operations = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'operations' in parsed
      ? (parsed as { readonly operations?: unknown }).operations
      : undefined;
  if (!Array.isArray(operations)) {
    throw new Error('Batch ops file must be a JSON array or an object with an operations array.');
  }
  return operations.map((operation, index) => parseBatchOperation(operation, index));
}

function parseBatchOperation(input: unknown, index: number): AeonEditBatchOperation {
  if (!input || typeof input !== 'object') {
    throw new Error(`Batch operation ${index} must be an object.`);
  }
  const operation = input as Record<string, unknown>;
  const command = requiredString(operation.command, `operation ${index} command`);
  const path = requiredString(operation.path, `operation ${index} path`);
  const guards = parseBatchOperationGuards(operation, index);

  switch (command) {
    case 'set':
    case 'append':
    case 'insert':
      return { command, path, value: requiredString(operation.value, `operation ${index} value`), ...(guards.expect === undefined ? {} : { expect: guards.expect }) };
    case 'delete':
      return { command, path, ...(guards.expect === undefined ? {} : { expect: guards.expect }) };
    case 'attr.set':
    case 'node-attr.set':
      return {
        command,
        path,
        key: requiredString(operation.key, `operation ${index} key`),
        value: requiredString(operation.value, `operation ${index} value`),
        ...attributeGuardFields(guards),
      };
    case 'attr.delete':
    case 'node-attr.delete':
      return {
        command,
        path,
        key: requiredString(operation.key, `operation ${index} key`),
        ...attributeGuardFields(guards),
      };
    case 'attr-annotation.set':
    case 'node-attr-annotation.set':
      return {
        command,
        path,
        key: requiredString(operation.key, `operation ${index} key`),
        annotationKey: requiredString(operation.annotationKey, `operation ${index} annotationKey`),
        value: requiredString(operation.value, `operation ${index} value`),
        ...annotationGuardFields(guards),
      };
    case 'attr-annotation.delete':
    case 'node-attr-annotation.delete':
      return {
        command,
        path,
        key: requiredString(operation.key, `operation ${index} key`),
        annotationKey: requiredString(operation.annotationKey, `operation ${index} annotationKey`),
        ...annotationGuardFields(guards),
      };
    default:
      throw new Error(`Unknown batch operation ${index} command: ${command}`);
  }
}

function parseBatchOperationGuards(
  operation: Record<string, unknown>,
  index: number,
): { readonly expect?: string; readonly expectAttribute?: string; readonly expectAnnotation?: string } {
  return {
    ...optionalStringField(operation.expect, `operation ${index} expect`, 'expect'),
    ...optionalStringField(operation.expectAttribute, `operation ${index} expectAttribute`, 'expectAttribute'),
    ...optionalStringField(operation.expectAnnotation, `operation ${index} expectAnnotation`, 'expectAnnotation'),
  };
}

function attributeGuardFields(
  guards: { readonly expect?: string; readonly expectAttribute?: string },
): { readonly expect?: string; readonly expectAttribute?: string } {
  return {
    ...(guards.expect === undefined ? {} : { expect: guards.expect }),
    ...(guards.expectAttribute === undefined ? {} : { expectAttribute: guards.expectAttribute }),
  };
}

function annotationGuardFields(
  guards: { readonly expect?: string; readonly expectAttribute?: string; readonly expectAnnotation?: string },
): { readonly expect?: string; readonly expectAttribute?: string; readonly expectAnnotation?: string } {
  return {
    ...(guards.expect === undefined ? {} : { expect: guards.expect }),
    ...(guards.expectAttribute === undefined ? {} : { expectAttribute: guards.expectAttribute }),
    ...(guards.expectAnnotation === undefined ? {} : { expectAnnotation: guards.expectAnnotation }),
  };
}

function optionalStringField<Key extends string>(
  value: unknown,
  label: string,
  key: Key,
): { readonly [Property in Key]?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return { [key]: value } as { readonly [Property in Key]?: string };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required ${label}`);
  }
  return value;
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required ${label}`);
  }
  return value;
}

function parseModeTarget(value: string): AeonModeConversionTarget {
  if (value === 'strict' || value === 'transport' || value === 'custom') {
    return value;
  }
  throw new Error(`Invalid mode target: ${value}. Expected strict, transport, or custom.`);
}

function usage(): string {
  return [
    'Usage:',
    '  aeon-edit get <file.aeon> <path> [--json]',
    '  aeon-edit inspect <file.aeon> <path> [--json]',
    '  aeon-edit list <file.aeon> [--json]',
    '  aeon-edit compact <file.aeon> [--comments semantic|all|none] [--out file | --write] [--json]',
    '  aeon-edit convert-mode <file.aeon> strict|transport|custom [--out file | --write] [--json]',
    '  aeon-edit prettify <file.aeon> [--out file | --write] [--json]',
    '  aeon-edit plan-set <file.aeon> <path> <aeon-value> [--json]',
    '  aeon-edit plan-attr-set <file.aeon> <path> <key> <aeon-value> [--json]',
    '  aeon-edit plan-node-attr-set <file.aeon> <node-path> <key> <aeon-value> [--json]',
    '  aeon-edit plan-attr-annotation-set <file.aeon> <path> <key> <annotation-key> <aeon-value> [--json]',
    '  aeon-edit plan-node-attr-annotation-set <file.aeon> <node-path> <key> <annotation-key> <aeon-value> [--json]',
    '  aeon-edit set <file.aeon> <path> <aeon-value> [--out file | --write] [--ledger ledger.jsonl --ledger-key key.json] [--json]',
    '  aeon-edit delete <file.aeon> <path> [--out file | --write] [--ledger ledger.jsonl --ledger-key key.json] [--json]',
    '  aeon-edit append <file.aeon> <list-path> <aeon-value> [--out file | --write] [--ledger ledger.jsonl --ledger-key key.json] [--json]',
    '  aeon-edit insert <file.aeon> <list-index-path> <aeon-value> [--out file | --write] [--ledger ledger.jsonl --ledger-key key.json] [--json]',
    '  aeon-edit batch <file.aeon> <ops.json> [--out file | --write] [--diff | --check] [--ledger ledger.jsonl --ledger-key key.json] [--json]',
    '  aeon-edit undo <file.aeon> --log <log.jsonl|log.aeon> [--id id] [--write] [--ledger ledger.jsonl --ledger-key key.json] [--json]',
    '  aeon-edit log list --log <log.jsonl|log.aeon> [--target file] [--limit n] [--json]',
    '  aeon-edit log show [id] --log <log.jsonl|log.aeon> [--target file] [--latest] [--json]',
    '  aeon-edit attr get <file.aeon> <path> <key> [--json]',
    '  aeon-edit attr set <file.aeon> <path> <key> <aeon-value> [--out file | --write] [--json]',
    '  aeon-edit attr delete <file.aeon> <path> <key> [--out file | --write] [--json]',
    '  aeon-edit attr-annotation get <file.aeon> <path> <key> <annotation-key> [--json]',
    '  aeon-edit attr-annotation set <file.aeon> <path> <key> <annotation-key> <aeon-value> [--out file | --write] [--json]',
    '  aeon-edit attr-annotation delete <file.aeon> <path> <key> <annotation-key> [--out file | --write] [--json]',
    '  aeon-edit node-attr get <file.aeon> <node-path> <key> [--json]',
    '  aeon-edit node-attr set <file.aeon> <node-path> <key> <aeon-value> [--out file | --write] [--json]',
    '  aeon-edit node-attr delete <file.aeon> <node-path> <key> [--out file | --write] [--json]',
    '  aeon-edit node-attr-annotation get <file.aeon> <node-path> <key> <annotation-key> [--json]',
    '  aeon-edit node-attr-annotation set <file.aeon> <node-path> <key> <annotation-key> <aeon-value> [--out file | --write] [--json]',
    '  aeon-edit node-attr-annotation delete <file.aeon> <node-path> <key> <annotation-key> [--out file | --write] [--json]',
    '  aeon-edit export-aes <file.aeon> [--json]',
    '  aeon-edit export-telex <file.aeon> [--include-headers] [--out file.telex.aes] [--json]',
    '',
    'Logging:',
    '  --log <file>                 Override the default write log location',
    '  --log-format jsonl|aeon      Override log format; defaults from extension',
    '  --id <id>                    Select a specific edit log record for undo',
    '  --target <file>              Filter log records to a specific target file',
    '  --limit <n>                  Limit log list output to the first n matching records',
    '  --latest                     Select the latest matching log record for log show',
    '  --no-log                     Disable the default write log for this command',
    '  --ledger <file>              Append signed provenance events to a ledger',
    '  --ledger-key <file>          Signing key created by aeon-ledger keygen',
    '',
    'Agent workflow:',
    '  aeon-edit --ai',
    '  aeon-edit --examples',
  ].join('\n');
}

function aiWorkflow(): string {
  return [
    'AEON Edit agent workflow',
    '',
    'Safe loop:',
    '  1. Discover paths:',
    '     aeon-edit list file.aeon --json',
    '     aeon-edit inspect file.aeon $.path --json',
    '',
    '  2. Generate a guarded plan:',
    '     aeon-edit plan-set file.aeon $.app.count 2 > ops.json',
    '     aeon-edit plan-attr-set file.aeon $.app owner \'"tools"\' > ops.json',
    '     aeon-edit plan-node-attr-set file.aeon $.view id \'"main"\' > ops.json',
    '     aeon-edit plan-attr-annotation-set file.aeon $.app owner source \'"ui"\' > ops.json',
    '     aeon-edit plan-node-attr-annotation-set file.aeon $.view id source \'"ui"\' > ops.json',
    '',
    '  3. Dry-run with semantic review:',
    '     aeon-edit batch file.aeon ops.json --check',
    '',
    '  4. Apply only after review:',
    '     aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.jsonl',
    '     aeon-edit batch file.aeon ops.json --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json',
    '     aeon-edit batch file.aeon ops.json --out updated.aeon',
    '',
    '  5. Undo a logged write when the file still matches the logged afterText:',
    '     aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write',
    '     aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json',
    '',
    'Exit codes:',
    '  0: check found semantic changes, or command succeeded',
    '  1: check was a semantic no-op',
    '  2: parse, preflight, guard, or mutation failure',
    '',
    'Rules for agents:',
    '  - Prefer plan-* commands over hand-written guarded ops.',
    '  - Always run --check before --write.',
    '  - Treat EXPECTATION_MISMATCH as a stale-read signal: re-run list/inspect before editing.',
    '  - Prefer --json when another program will consume the result.',
  ].join('\n');
}

function examplesWorkflow(): string {
  return [
    '# AEON Edit Examples',
    '',
    'Runnable workflow fixtures in this workspace:',
    '',
    '- examples/diff-edit-workflow',
    '  Review semantic changes, generate guarded edit plans, dry-run, write, and undo.',
    '- examples/guard-workflow',
    '  Use aeon-guard before edit or apply work and inspect persisted artifacts.',
    '',
    'Run them from the workspace root:',
    '',
    '```sh',
    'sh examples/diff-edit-workflow/run.sh',
    'sh examples/guard-workflow/run.sh',
    '```',
  ].join('\n');
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
