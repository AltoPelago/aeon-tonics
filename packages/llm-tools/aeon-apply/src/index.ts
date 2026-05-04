import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  compile,
  type AssignmentEvent,
} from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  applyAesPatch,
  diffAeon,
  summarizeAesDiff,
  type AesDiffDiagnostic,
  type AesDiffSummary,
  type AesPatch,
} from '../../aes-diff/dist/index.js';
import { minimize } from '../../../export/minizer/dist/index.js';
import {
  appendLedgerEntry,
  hashText,
  parseLedgerJsonl,
  type LedgerKeyPair,
  type LedgerPayload,
} from '../../../provenance/signed-ledger/dist/index.js';

export interface AeonApplyOptions {
  readonly write?: boolean;
  readonly log?: string;
  readonly logFormat?: 'jsonl' | 'aeon';
  readonly ledger?: string;
  readonly ledgerKey?: string;
}

export interface AeonApplyResult {
  readonly format: 'aeon.apply';
  readonly version: 1;
  readonly ok: boolean;
  readonly write: boolean;
  readonly targets: readonly AeonApplyTargetResult[];
}

export interface AeonApplyTargetResult {
  readonly file: string;
  readonly applicable: boolean;
  readonly applied: boolean;
  readonly changed: boolean;
  readonly logRecordId?: string;
  readonly output?: string;
  readonly diffSummary?: AesDiffSummary;
  readonly diagnostics: readonly AeonApplyDiagnostic[];
}

export interface AeonApplyDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
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
  readonly diffSummary: AesDiffSummary;
  readonly affectedTopLevel: readonly string[];
  readonly affectedPaths: readonly string[];
}

export async function discoverAeonApplyTargets(inputs: readonly string[]): Promise<readonly string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    await collectAeonFiles(resolve(input), files);
  }
  return [...new Set(files)].sort();
}

export async function planAeonApply(
  patch: AesPatch,
  inputs: readonly string[],
  options: AeonApplyOptions = {},
): Promise<AeonApplyResult> {
  const files = await discoverAeonApplyTargets(inputs);
  const targets: AeonApplyTargetResult[] = [];
  for (const file of files) {
    targets.push(await applyAeonPatchToFile(file, patch, options));
  }
  return {
    format: 'aeon.apply',
    version: 1,
    ok: targets.every((target) => target.applicable && target.diagnostics.length === 0),
    write: options.write === true,
    targets,
  };
}

export async function applyAeonPatchToFile(
  file: string,
  patch: AesPatch,
  options: AeonApplyOptions = {},
): Promise<AeonApplyTargetResult> {
  const source = await readFile(file, 'utf8');
  const planned = applyAeonPatch(source, patch, file);
  if (!planned.applicable || planned.output === undefined) {
    return planned;
  }
  let logRecord: AeonEditLogRecord | undefined;
  if (options.write) {
    await writeFile(file, planned.output, 'utf8');
    logRecord = await writeApplyLog(file, source, planned.output, options);
    await writeApplyLedger(file, source, planned.output, logRecord, options);
  }
  return {
    ...planned,
    applied: options.write === true,
    ...(logRecord === undefined ? {} : { logRecordId: logRecord.id }),
  };
}

export function applyAeonPatch(source: string, patch: AesPatch, file = ''): AeonApplyTargetResult {
  const compiled = compile(source, { maxAttributeDepth: 2 });
  if (compiled.errors.length > 0) {
    return {
      file,
      applicable: false,
      applied: false,
      changed: false,
      diagnostics: compiled.errors.map((error) => ({
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      })),
    };
  }

  const patched = applyAesPatch(compiled.events, patch);
  if (!patched.ok) {
    return {
      file,
      applicable: false,
      applied: false,
      changed: false,
      diagnostics: patched.diagnostics.map(fromAesDiagnostic),
    };
  }

  const output = materializePatchedAeon(patched.events);
  const diff = diffAeon(source, output, { includeSourceSpans: false });
  return {
    file,
    applicable: diff.diagnostics.length === 0,
    applied: false,
    changed: diff.changes.length > 0,
    output,
    diffSummary: diff.summary,
    diagnostics: diff.diagnostics.map(fromAesDiagnostic),
  };
}

export function parseAesPatchJson(text: string): AesPatch {
  const parsed = JSON.parse(text) as Partial<AesPatch>;
  if (parsed.format !== 'aes.patch' || parsed.version !== 1 || !Array.isArray(parsed.operations)) {
    throw new Error('Expected aes.patch version 1 JSON.');
  }
  return parsed as AesPatch;
}

export function formatAeonApplyText(result: AeonApplyResult): string {
  const lines = [
    `AEON apply: ${result.ok ? 'ok' : 'blocked'}; ${result.targets.length} targets; ${result.write ? 'write' : 'dry-run'}`,
  ];
  for (const target of result.targets) {
    const status = target.applied ? 'applied' : target.applicable ? 'applicable' : 'blocked';
    const summary = target.diffSummary
      ? ` (${target.diffSummary.added} added, ${target.diffSummary.removed} removed, ${target.diffSummary.changed} changed)`
      : '';
    lines.push(`${status} ${target.file}${summary}`);
    for (const diagnostic of target.diagnostics) {
      lines.push(`  ${diagnostic.code}${diagnostic.path ? ` ${diagnostic.path}` : ''}: ${diagnostic.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function materializePatchedAeon(events: readonly AssignmentEvent[]): string {
  return minimize(events, { trailingNewline: true }).text;
}

async function writeApplyLog(
  file: string,
  beforeText: string,
  afterText: string,
  options: AeonApplyOptions,
): Promise<AeonEditLogRecord | undefined> {
  if (!options.log) {
    return undefined;
  }
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
    command: 'apply',
    file: resolve(file),
    target: resolve(file),
    beforeText,
    afterText,
    diffSummary: diff.summary,
    affectedTopLevel: planning.affectedTopLevel,
    affectedPaths: planning.paths,
  };
  const logFormat = options.logFormat ?? inferLogFormat(options.log);
  if (logFormat === 'aeon') {
    await appendAeonLog(options.log, record);
    return record;
  }
  await mkdir(dirname(options.log), { recursive: true });
  await appendFile(options.log, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

async function writeApplyLedger(
  file: string,
  beforeText: string,
  afterText: string,
  logRecord: AeonEditLogRecord | undefined,
  options: AeonApplyOptions,
): Promise<void> {
  if (!options.ledger && !options.ledgerKey) {
    return;
  }
  if (!options.ledger || !options.ledgerKey) {
    throw new Error('Both ledger and ledgerKey are required for signed ledger output.');
  }
  const diff = diffAeon(beforeText, afterText, {
    compileOptions: {
      maxAttributeDepth: 2,
    },
  });
  const planning = summarizeAesDiff(diff, { maxPaths: 8 });
  const [existingText, keyText] = await Promise.all([
    readOptionalFile(options.ledger),
    readFile(options.ledgerKey, 'utf8'),
  ]);
  const entries = parseLedgerJsonl(existingText);
  const key = JSON.parse(keyText) as LedgerKeyPair;
  const payload: LedgerPayload = {
    kind: 'aeon.apply.applied',
    tool: 'aeon-apply',
    command: 'apply',
    file: resolve(file),
    target: resolve(file),
    beforeHash: hashText(beforeText),
    afterHash: hashText(afterText),
    diffSummary: diff.summary,
    affectedTopLevel: planning.affectedTopLevel,
    affectedPaths: planning.paths,
    ...(logRecord === undefined ? {} : { editLogRecordId: logRecord.id }),
  };
  const entry = appendLedgerEntry(entries, payload, { key });
  await mkdir(dirname(options.ledger), { recursive: true });
  await appendFile(options.ledger, `${JSON.stringify(entry)}\n`, 'utf8');
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

function aeonString(value: string): string {
  return JSON.stringify(value);
}

async function collectAeonFiles(path: string, files: string[]): Promise<void> {
  const info = await stat(path);
  if (info.isFile()) {
    if (path.endsWith('.aeon')) {
      files.push(path);
    }
    return;
  }
  if (!info.isDirectory()) {
    return;
  }
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
      continue;
    }
    await collectAeonFiles(join(path, entry.name), files);
  }
}

function fromAesDiagnostic(diagnostic: AesDiffDiagnostic): AeonApplyDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { readonly code?: unknown }).code === 'string') {
    return (error as { readonly code: string }).code;
  }
  return 'AEON_COMPILE_ERROR';
}
