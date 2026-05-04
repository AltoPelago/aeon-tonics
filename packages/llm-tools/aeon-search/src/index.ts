import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  compile,
  formatPath,
  type AssignmentEvent,
  type CompileOptions,
} from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';

export interface AeonSearchQuery {
  readonly path?: string;
  readonly pathPrefix?: string;
  readonly value?: string;
  readonly datatype?: string;
  readonly kind?: string;
}

export interface SearchAeonFilesOptions {
  readonly compileOptions?: CompileOptions;
}

export interface AeonSearchResult {
  readonly format: 'aeon.search';
  readonly version: 1;
  readonly matches: readonly AeonSearchMatch[];
  readonly diagnostics: readonly AeonSearchDiagnostic[];
}

export interface AeonSearchMatch {
  readonly file: string;
  readonly path: string;
  readonly kind: string;
  readonly datatype?: string;
  readonly preview?: string;
}

export interface AeonSearchDiagnostic {
  readonly file: string;
  readonly code: string;
  readonly message: string;
}

export async function discoverAeonFiles(inputs: readonly string[]): Promise<readonly string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    await collectAeonFiles(resolve(input), files);
  }
  return [...new Set(files)].sort();
}

export async function searchAeonFiles(
  inputs: readonly string[],
  query: AeonSearchQuery,
  options: SearchAeonFilesOptions = {},
): Promise<AeonSearchResult> {
  const files = await discoverAeonFiles(inputs);
  const matches: AeonSearchMatch[] = [];
  const diagnostics: AeonSearchDiagnostic[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const compiled = compile(source, {
      maxAttributeDepth: 2,
      ...options.compileOptions,
    });
    if (compiled.errors.length > 0) {
      diagnostics.push(...compiled.errors.map((error) => ({
        file,
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      })));
      continue;
    }
    matches.push(...searchAesEvents(compiled.events, query, { file }));
  }

  return {
    format: 'aeon.search',
    version: 1,
    matches,
    diagnostics,
  };
}

export function searchAesEvents(
  events: readonly AssignmentEvent[],
  query: AeonSearchQuery,
  options: { readonly file?: string } = {},
): readonly AeonSearchMatch[] {
  return events
    .map((event) => toSearchMatch(event, options.file ?? ''))
    .filter((match) => matchesQuery(match, query));
}

export function formatAeonSearchText(result: AeonSearchResult): string {
  const lines = [
    `AEON search: ${result.matches.length} matches, ${result.diagnostics.length} diagnostics`,
    ...result.matches.map((match) => [
      match.file,
      match.path,
      match.kind,
      match.datatype ? `:${match.datatype}` : '',
      match.preview ? `= ${match.preview}` : '',
    ].join(' ').replace(/\s+/g, ' ').trim()),
    ...result.diagnostics.map((diagnostic) => `${diagnostic.file} ${diagnostic.code}: ${diagnostic.message}`),
  ];
  return lines.join('\n') + '\n';
}

export function formatAeonSearchPaths(result: AeonSearchResult): string {
  return `${uniqueSorted(result.matches.map((match) => match.path)).join('\n')}${result.matches.length === 0 ? '' : '\n'}`;
}

function toSearchMatch(event: AssignmentEvent, file: string): AeonSearchMatch {
  const value = event.value as unknown as Record<string, unknown>;
  const datatype = typeof event.datatype === 'string' ? event.datatype : undefined;
  const preview = previewValue(value);
  return {
    file,
    path: formatPath(event.path),
    kind: eventKind(event),
    ...(datatype === undefined ? {} : { datatype }),
    ...(preview === undefined ? {} : { preview }),
  };
}

function matchesQuery(match: AeonSearchMatch, query: AeonSearchQuery): boolean {
  return [
    query.path === undefined || match.path === query.path,
    query.pathPrefix === undefined || match.path === query.pathPrefix || match.path.startsWith(`${query.pathPrefix}.`),
    query.value === undefined || match.preview === query.value,
    query.datatype === undefined || match.datatype === query.datatype,
    query.kind === undefined || match.kind === query.kind,
  ].every(Boolean);
}

function eventKind(event: AssignmentEvent): string {
  const value = event.value as { readonly type?: unknown };
  if (value.type === 'NodeLiteral') {
    return 'node';
  }
  if (value.type === 'CloneReference' || value.type === 'PointerReference') {
    return 'reference';
  }
  if (typeof value.type === 'string' && value.type.endsWith('Literal')) {
    return value.type.slice(0, -'Literal'.length).replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  }
  return typeof value.type === 'string' ? value.type : 'unknown';
}

function previewValue(value: Record<string, unknown>): string | undefined {
  if (typeof value.raw === 'string') {
    return value.type === 'StringLiteral' ? JSON.stringify(value.raw) : value.raw;
  }
  if (value.type === 'NodeLiteral' && typeof value.tag === 'string') {
    return `<${value.tag}>`;
  }
  if ((value.type === 'CloneReference' || value.type === 'PointerReference') && Array.isArray(value.path)) {
    return `~${value.path.join('.')}`;
  }
  return undefined;
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

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { readonly code?: unknown }).code === 'string') {
    return (error as { readonly code: string }).code;
  }
  return 'AEON_COMPILE_ERROR';
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
