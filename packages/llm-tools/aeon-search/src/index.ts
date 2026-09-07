import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  compile,
  createPortableEventPathMap,
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
      const recovery = compiled.events.length > 0
        ? compiled
        : compile(source, { maxAttributeDepth: 2, ...options.compileOptions, recovery: true });
      const pathMap = createPortableEventPathMap(recovery.events);
      diagnostics.push(...compiled.errors.map((error) => searchDiagnostic(error, file, pathMap)));
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
  const valuesByPath = new Map(portable.map((event) => [event.path, event.value]));
  return portable
    .map((event) => toSearchMatch(event, options.file ?? '', valuesByPath.get(`${event.path}[0]`)))
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
    ...result.diagnostics.map((diagnostic) => `${diagnostic.file}${diagnostic.path === undefined ? '' : ` ${diagnostic.path}`} ${diagnostic.code}: ${diagnostic.message}`),
  ];
  return lines.join('\n') + '\n';
}

export function formatAeonSearchPaths(result: AeonSearchResult): string {
  return `${uniqueSorted(result.matches.map((match) => match.path)).join('\n')}${result.matches.length === 0 ? '' : '\n'}`;
}

function toSearchMatch(event: PortableAesEvent, file: string, nodeTag?: string): AeonSearchMatch {
  const datatype = typeof event.datatype === 'string' ? event.datatype : undefined;
  const preview = event.kind === 'NodeLiteral' && nodeTag !== undefined ? `<${nodeTag}>` : previewValue(event);
  return {
    file,
    path: event.path,
    kind: eventKind(event),
    ...(datatype === undefined ? {} : { datatype }),
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
  if (event.kind === 'NodeHead') {
    return 'node-head';
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
  if (event.value === undefined) {
    return undefined;
  }
  if (event.kind === 'StringLiteral') {
    return JSON.stringify(event.value);
  }
  if (event.kind === 'NodeHead') {
    return `<${event.value}>`;
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

function searchDiagnostic(
  error: unknown,
  file: string,
  pathMap: ReadonlyMap<string, string>,
): AeonSearchDiagnostic {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const sourcePath = typeof record.sourcePath === 'string'
    ? record.sourcePath
    : typeof record.path === 'string' ? record.path : undefined;
  const targetPath = typeof record.targetPath === 'string' ? record.targetPath : undefined;
  const portableSource = sourcePath === undefined ? undefined : (pathMap.get(sourcePath) ?? sourcePath);
  const portableTarget = targetPath === undefined ? undefined : (pathMap.get(targetPath) ?? targetPath);
  let message = error instanceof Error ? error.message : String(error);
  for (const [native, portable] of [[sourcePath, portableSource], [targetPath, portableTarget]] as const) {
    if (native !== undefined && portable !== undefined && native !== portable) message = message.replaceAll(native, portable);
  }
  return {
    file,
    code: errorCode(error),
    message,
    ...(portableSource === undefined ? {} : { path: portableSource }),
    ...(portableTarget === undefined ? {} : { targetPath: portableTarget }),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
