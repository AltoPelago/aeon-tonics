import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  compile,
  projectPortableEvents,
  type AssignmentEvent,
  type CompileOptions,
  type PortableAesEvent,
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
  readonly tag?: string;
  readonly preview?: string;
}

export interface AeonSearchDiagnostic {
  readonly file: string;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly targetPath?: string;
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
      diagnostics.push(...compiled.errors.map((error) => searchDiagnostic(error, file)));
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
  const portable = projectPortableEvents(events);
  return portable
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
    ].filter(Boolean).join(' ')),
    ...result.diagnostics.map((diagnostic) => `${diagnostic.file}${diagnostic.path === undefined ? '' : ` ${diagnostic.path}`} ${diagnostic.code}: ${diagnostic.message}`),
  ];
  return lines.join('\n') + '\n';
}

export function formatAeonSearchPaths(result: AeonSearchResult): string {
  return `${uniqueSorted(result.matches.map((match) => match.path)).join('\n')}${result.matches.length === 0 ? '' : '\n'}`;
}

function toSearchMatch(event: PortableAesEvent, file: string): AeonSearchMatch {
  const datatype = event.datatype;
  const tag = event.tag;
  const preview = previewValue(event);
  return {
    file,
    path: event.path,
    kind: eventKind(event),
    ...(datatype === undefined ? {} : { datatype }),
    ...(tag === undefined ? {} : { tag }),
    ...(preview === undefined ? {} : { preview }),
  };
}

function matchesQuery(match: AeonSearchMatch, query: AeonSearchQuery): boolean {
  return [
    query.path === undefined || match.path === query.path,
    query.pathPrefix === undefined || pathWithinPrefix(match.path, query.pathPrefix),
    query.value === undefined || match.preview === query.value,
    query.datatype === undefined || match.datatype === query.datatype,
    query.kind === undefined || match.kind === query.kind,
  ].every(Boolean);
}

function pathWithinPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}

function eventKind(event: PortableAesEvent): string {
  if (event.kind === 'NodeLiteral') {
    return 'node';
  }
  if (event.kind === 'CloneReference' || event.kind === 'PointerReference') {
    return 'reference';
  }
  if (event.kind.endsWith('Literal')) {
    return event.kind.slice(0, -'Literal'.length).replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  }
  return event.kind;
}

function previewValue(event: PortableAesEvent): string | undefined {
  if (event.kind === 'NodeLiteral' && event.tag !== undefined) {
    const tag = /^[A-Za-z_][A-Za-z0-9_]*$/u.test(event.tag) ? event.tag : JSON.stringify(event.tag);
    return `<${tag}>`;
  }
  if (event.value === undefined) {
    return undefined;
  }
  if (event.kind === 'StringLiteral') {
    return JSON.stringify(event.value);
  }
  if (event.kind === 'CloneReference') return `~${event.value}`;
  if (event.kind === 'PointerReference') return `~>${event.value}`;
  return event.value;
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

function searchDiagnostic(error: unknown, file: string): AeonSearchDiagnostic {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const path = typeof record.sourcePath === 'string'
    ? record.sourcePath
    : typeof record.path === 'string' ? record.path : undefined;
  const targetPath = typeof record.targetPath === 'string' ? record.targetPath : undefined;
  return {
    file,
    code: errorCode(error),
    message: error instanceof Error ? error.message : String(error),
    ...(path === undefined ? {} : { path }),
    ...(targetPath === undefined ? {} : { targetPath }),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
