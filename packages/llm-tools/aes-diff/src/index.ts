import {
  compile,
  formatPath,
  type AssignmentEvent,
  type CompileOptions,
} from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';

export type AesDiffChangeKind = 'added' | 'removed' | 'changed';

export type AesDiffDeltaPart =
  | 'datatype'
  | 'value'
  | 'metadata'
  | 'reference'
  | 'header'
  | 'span';

export type AesDiffDiagnosticCode =
  | 'AEON_COMPILE_ERROR'
  | 'DUPLICATE_PATH'
  | 'PATCH_NOT_APPLICABLE'
  | 'PATCH_STALE_BASE';

export interface DiffAesOptions {
  readonly includeHeaders?: boolean;
  readonly includeMetadata?: boolean;
  readonly includeSourceSpans?: boolean;
  readonly strictUniquePaths?: boolean;
  readonly pathFilters?: readonly string[];
}

export interface DiffAeonOptions extends DiffAesOptions {
  readonly compileOptions?: CompileOptions;
}

export interface AesDiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly metadataChanged: number;
  readonly referenceChanged: number;
  readonly headerChanged: number;
}

export interface AesDiffDiagnostic {
  readonly code: AesDiffDiagnosticCode;
  readonly side?: 'before' | 'after';
  readonly path?: string;
  readonly message: string;
}

export interface EventDelta {
  readonly parts: readonly AesDiffDeltaPart[];
}

export type AesChange =
  | {
      readonly kind: 'added';
      readonly path: string;
      readonly after: AssignmentEvent;
    }
  | {
      readonly kind: 'removed';
      readonly path: string;
      readonly before: AssignmentEvent;
    }
  | {
      readonly kind: 'changed';
      readonly path: string;
      readonly before: AssignmentEvent;
      readonly after: AssignmentEvent;
      readonly delta: EventDelta;
    };

export interface AesDiffResult {
  readonly format: 'aes.diff';
  readonly version: 1;
  readonly changes: readonly AesChange[];
  readonly summary: AesDiffSummary;
  readonly diagnostics: readonly AesDiffDiagnostic[];
}

export interface FormatAesDiffTextOptions {
  readonly includeUnchanged?: boolean;
}

export interface FormatAesDiffResult {
  readonly text: string;
}

export interface SummarizeAesDiffOptions {
  readonly maxPaths?: number;
}

export interface AesDiffPlanningSummary {
  readonly headline: string;
  readonly affectedTopLevel: readonly string[];
  readonly paths: readonly string[];
  readonly highRisk: readonly AesDiffHighRiskChange[];
  readonly diagnostics: readonly AesDiffDiagnostic[];
}

export interface AesDiffHighRiskChange {
  readonly path: string;
  readonly reasons: readonly AesDiffDeltaPart[];
}

export type AesPatchOperation =
  | {
      readonly op: 'add';
      readonly path: string;
      readonly after: AssignmentEvent;
    }
  | {
      readonly op: 'remove';
      readonly path: string;
      readonly before: AssignmentEvent;
    }
  | {
      readonly op: 'replace';
      readonly path: string;
      readonly before: AssignmentEvent;
      readonly after: AssignmentEvent;
      readonly delta: EventDelta;
    };

export interface AesPatch {
  readonly format: 'aes.patch';
  readonly version: 1;
  readonly applicable: boolean;
  readonly operations: readonly AesPatchOperation[];
  readonly diagnostics: readonly AesDiffDiagnostic[];
}

export interface ApplyAesPatchOptions extends DiffAesOptions {}

export interface ApplyAesPatchResult {
  readonly ok: boolean;
  readonly events: readonly AssignmentEvent[];
  readonly diagnostics: readonly AesDiffDiagnostic[];
}

interface NormalizedEvent {
  readonly path: string;
  readonly event: AssignmentEvent;
  readonly semantic: NormalizedSemanticEvent;
}

interface NormalizedSemanticEvent {
  readonly path: string;
  readonly key: string;
  readonly datatype: string | null;
  readonly value: unknown;
  readonly annotations?: unknown;
  readonly span?: unknown;
}

interface IndexedEvents {
  readonly events: ReadonlyMap<string, NormalizedEvent>;
  readonly diagnostics: readonly AesDiffDiagnostic[];
}

const DEFAULT_OPTIONS: Required<DiffAesOptions> = {
  includeHeaders: true,
  includeMetadata: true,
  includeSourceSpans: false,
  strictUniquePaths: true,
  pathFilters: [],
};

export function diffAeon(
  beforeSource: string,
  afterSource: string,
  options: DiffAeonOptions = {},
): AesDiffResult {
  const compileOptions = options.compileOptions ?? {};
  const before = compile(beforeSource, compileOptions);
  const after = compile(afterSource, compileOptions);
  const diagnostics: AesDiffDiagnostic[] = [];

  diagnostics.push(...compileDiagnostics('before', before.errors));
  diagnostics.push(...compileDiagnostics('after', after.errors));

  const diff = diffAes(before.events, after.events, options);
  return {
    ...diff,
    diagnostics: [...diagnostics, ...diff.diagnostics],
  };
}

export function diffAes(
  beforeEvents: readonly AssignmentEvent[],
  afterEvents: readonly AssignmentEvent[],
  options: DiffAesOptions = {},
): AesDiffResult {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const before = indexEvents('before', beforeEvents, resolvedOptions);
  const after = indexEvents('after', afterEvents, resolvedOptions);
  const diagnostics = [...before.diagnostics, ...after.diagnostics];
  const paths = [...new Set([...before.events.keys(), ...after.events.keys()])].sort();
  const changes: AesChange[] = [];
  let unchanged = 0;

  for (const path of paths) {
    const beforeEvent = before.events.get(path);
    const afterEvent = after.events.get(path);

    if (!beforeEvent && afterEvent) {
      changes.push({ kind: 'added', path, after: afterEvent.event });
      continue;
    }

    if (beforeEvent && !afterEvent) {
      changes.push({ kind: 'removed', path, before: beforeEvent.event });
      continue;
    }

    if (!beforeEvent || !afterEvent) {
      continue;
    }

    const delta = compareEvents(beforeEvent.semantic, afterEvent.semantic);
    if (delta.parts.length === 0) {
      unchanged += 1;
      continue;
    }

    changes.push({
      kind: 'changed',
      path,
      before: beforeEvent.event,
      after: afterEvent.event,
      delta,
    });
  }

  return {
    format: 'aes.diff',
    version: 1,
    changes,
    summary: buildSummary(changes, unchanged),
    diagnostics,
  };
}

export function formatAesDiffJson(diff: AesDiffResult): FormatAesDiffResult {
  return {
    text: `${JSON.stringify(toJsonSafe(diff), null, 2)}\n`,
  };
}

export function formatAesDiffText(
  diff: AesDiffResult,
  options: FormatAesDiffTextOptions = {},
): FormatAesDiffResult {
  const lines: string[] = [
    `AES diff: ${diff.summary.added} added, ${diff.summary.removed} removed, ${diff.summary.changed} changed, ${diff.summary.unchanged} unchanged`,
  ];

  for (const diagnostic of diff.diagnostics) {
    lines.push(`! ${diagnostic.code}${diagnostic.path ? ` ${diagnostic.path}` : ''}: ${diagnostic.message}`);
  }

  for (const change of diff.changes) {
    switch (change.kind) {
      case 'added':
        lines.push(`+ ${change.path}`);
        break;
      case 'removed':
        lines.push(`- ${change.path}`);
        break;
      case 'changed':
        lines.push(`~ ${change.path} (${change.delta.parts.join(', ')})`);
        break;
      default: {
        const exhaustive: never = change;
        return exhaustive;
      }
    }
  }

  if (options.includeUnchanged && diff.summary.unchanged > 0) {
    lines.push(`= ${diff.summary.unchanged} unchanged`);
  }

  return {
    text: `${lines.join('\n')}\n`,
  };
}

export function summarizeAesDiff(
  diff: AesDiffResult,
  options: SummarizeAesDiffOptions = {},
): AesDiffPlanningSummary {
  const maxPaths = options.maxPaths ?? 20;
  const paths = diff.changes.map((change) => change.path);
  const visiblePaths = maxPaths < 0 ? paths : paths.slice(0, maxPaths);
  const affectedTopLevel = [...new Set(paths.map(topLevelPath))].sort();
  const highRisk = diff.changes.flatMap((change): AesDiffHighRiskChange[] => {
    if (change.kind !== 'changed') {
      return [];
    }
    const reasons = change.delta.parts.filter((part) => (
      part === 'datatype' ||
      part === 'reference' ||
      part === 'header'
    ));
    return reasons.length > 0 ? [{ path: change.path, reasons }] : [];
  });

  return {
    headline: buildHeadline(diff),
    affectedTopLevel,
    paths: visiblePaths,
    highRisk,
    diagnostics: diff.diagnostics,
  };
}

export function createAesPatch(diff: AesDiffResult): AesPatch {
  return {
    format: 'aes.patch',
    version: 1,
    applicable: diff.diagnostics.length === 0,
    operations: diff.changes.map((change): AesPatchOperation => {
      switch (change.kind) {
        case 'added':
          return {
            op: 'add',
            path: change.path,
            after: change.after,
          };
        case 'removed':
          return {
            op: 'remove',
            path: change.path,
            before: change.before,
          };
        case 'changed':
          return {
            op: 'replace',
            path: change.path,
            before: change.before,
            after: change.after,
            delta: change.delta,
          };
        default: {
          const exhaustive: never = change;
          return exhaustive;
        }
      }
    }),
    diagnostics: diff.diagnostics,
  };
}

export function applyAesPatch(
  baseEvents: readonly AssignmentEvent[],
  patch: AesPatch,
  options: ApplyAesPatchOptions = {},
): ApplyAesPatchResult {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  if (!patch.applicable || patch.diagnostics.length > 0) {
    return {
      ok: false,
      events: baseEvents,
      diagnostics: [{
        code: 'PATCH_NOT_APPLICABLE',
        message: 'Patch is marked non-applicable or contains diagnostics',
      }, ...patch.diagnostics],
    };
  }

  const indexed = indexEvents('before', baseEvents, resolvedOptions);
  const diagnostics: AesDiffDiagnostic[] = [...indexed.diagnostics];
  const next = new Map([...indexed.events.entries()].map(([path, entry]) => [path, entry.event]));

  for (const operation of patch.operations) {
    switch (operation.op) {
      case 'add':
        if (next.has(operation.path)) {
          diagnostics.push({
            code: 'PATCH_STALE_BASE',
            path: operation.path,
            message: `Cannot add ${operation.path}; path already exists in base AES stream`,
          });
          continue;
        }
        next.set(operation.path, operation.after);
        break;
      case 'remove': {
        const existing = next.get(operation.path);
        if (!existing || !eventsMatch(existing, operation.before, operation.path, resolvedOptions)) {
          diagnostics.push({
            code: 'PATCH_STALE_BASE',
            path: operation.path,
            message: `Cannot remove ${operation.path}; base event does not match patch precondition`,
          });
          continue;
        }
        next.delete(operation.path);
        break;
      }
      case 'replace': {
        const existing = next.get(operation.path);
        if (!existing || !eventsMatch(existing, operation.before, operation.path, resolvedOptions)) {
          diagnostics.push({
            code: 'PATCH_STALE_BASE',
            path: operation.path,
            message: `Cannot replace ${operation.path}; base event does not match patch precondition`,
          });
          continue;
        }
        next.set(operation.path, operation.after);
        break;
      }
      default: {
        const exhaustive: never = operation;
        return exhaustive;
      }
    }
  }

  if (diagnostics.length > 0) {
    return {
      ok: false,
      events: baseEvents,
      diagnostics,
    };
  }

  return {
    ok: true,
    events: [...next.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, event]) => event),
    diagnostics: [],
  };
}

function compileDiagnostics(side: 'before' | 'after', errors: readonly Error[]): readonly AesDiffDiagnostic[] {
  return errors.map((error) => ({
    code: 'AEON_COMPILE_ERROR',
    side,
    message: error.message,
  }));
}

function buildHeadline(diff: AesDiffResult): string {
  const total = diff.summary.added + diff.summary.removed + diff.summary.changed;
  if (total === 0 && diff.diagnostics.length === 0) {
    return 'No semantic AES changes.';
  }

  const parts = [
    `${total} semantic AES change${total === 1 ? '' : 's'}`,
    `${diff.summary.added} added`,
    `${diff.summary.removed} removed`,
    `${diff.summary.changed} changed`,
  ];

  if (diff.diagnostics.length > 0) {
    parts.push(`${diff.diagnostics.length} diagnostic${diff.diagnostics.length === 1 ? '' : 's'}`);
  }

  return `${parts.join('; ')}.`;
}

function topLevelPath(path: string): string {
  if (!path.startsWith('$.')) {
    return path;
  }

  const body = path.slice(2);
  if (body.startsWith('["')) {
    const end = findQuotedSegmentEnd(body);
    return end === -1 ? path : `$.${body.slice(0, end + 1)}`;
  }

  const dot = body.indexOf('.');
  const bracket = body.indexOf('[');
  const candidates = [dot, bracket].filter((index) => index >= 0);
  const end = candidates.length === 0 ? body.length : Math.min(...candidates);
  return `$.${body.slice(0, end)}`;
}

function findQuotedSegmentEnd(value: string): number {
  let escaped = false;
  for (let index = 2; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"' && value[index + 1] === ']') {
      return index + 1;
    }
  }
  return -1;
}

function eventsMatch(
  left: AssignmentEvent,
  right: AssignmentEvent,
  path: string,
  options: Required<DiffAesOptions>,
): boolean {
  return stableStringify(normalizeEvent(path, left, options)) === stableStringify(normalizeEvent(path, right, options));
}

function indexEvents(
  side: 'before' | 'after',
  events: readonly AssignmentEvent[],
  options: Required<DiffAesOptions>,
): IndexedEvents {
  const indexed = new Map<string, NormalizedEvent>();
  const diagnostics: AesDiffDiagnostic[] = [];

  for (const event of events) {
    const path = formatPath(event.path);
    if (!options.includeHeaders && isHeaderPath(path)) {
      continue;
    }
    if (!matchesPathFilters(path, options.pathFilters)) {
      continue;
    }
    if (indexed.has(path)) {
      diagnostics.push({
        code: 'DUPLICATE_PATH',
        side,
        path,
        message: `Duplicate canonical path in ${side} AES stream: ${path}`,
      });
      if (options.strictUniquePaths) {
        continue;
      }
    }

    indexed.set(path, {
      path,
      event,
      semantic: normalizeEvent(path, event, options),
    });
  }

  return {
    events: indexed,
    diagnostics,
  };
}

function normalizeEvent(
  path: string,
  event: AssignmentEvent,
  options: Required<DiffAesOptions>,
): NormalizedSemanticEvent {
  const normalized: NormalizedSemanticEvent = {
    path,
    key: event.key,
    datatype: event.datatype ?? null,
    value: normalizeUnknown(event.value, options),
  };

  if (options.includeMetadata) {
    (normalized as { annotations?: unknown }).annotations = normalizeAnnotations(event.annotations, options);
  }

  if (options.includeSourceSpans) {
    (normalized as { span?: unknown }).span = normalizeUnknown(event.span, options);
  }

  return normalized;
}

function compareEvents(before: NormalizedSemanticEvent, after: NormalizedSemanticEvent): EventDelta {
  const parts: AesDiffDeltaPart[] = [];

  if (isHeaderPath(before.path) || isHeaderPath(after.path)) {
    if (stableStringify(before) !== stableStringify(after)) {
      parts.push('header');
    }
    return { parts };
  }

  if (before.datatype !== after.datatype) {
    parts.push('datatype');
  }

  const beforeValue = stableStringify(before.value);
  const afterValue = stableStringify(after.value);
  if (beforeValue !== afterValue) {
    parts.push(hasReferenceChange(before.value, after.value) ? 'reference' : 'value');
  }

  if (stableStringify(before.annotations ?? null) !== stableStringify(after.annotations ?? null)) {
    parts.push('metadata');
  }

  if (stableStringify(before.span ?? null) !== stableStringify(after.span ?? null)) {
    parts.push('span');
  }

  return { parts };
}

function buildSummary(changes: readonly AesChange[], unchanged: number): AesDiffSummary {
  let added = 0;
  let removed = 0;
  let changed = 0;
  let metadataChanged = 0;
  let referenceChanged = 0;
  let headerChanged = 0;

  for (const change of changes) {
    switch (change.kind) {
      case 'added':
        added += 1;
        break;
      case 'removed':
        removed += 1;
        break;
      case 'changed':
        changed += 1;
        if (change.delta.parts.includes('metadata')) {
          metadataChanged += 1;
        }
        if (change.delta.parts.includes('reference')) {
          referenceChanged += 1;
        }
        if (change.delta.parts.includes('header')) {
          headerChanged += 1;
        }
        break;
      default: {
        const exhaustive: never = change;
        return exhaustive;
      }
    }
  }

  return {
    added,
    removed,
    changed,
    unchanged,
    metadataChanged,
    referenceChanged,
    headerChanged,
  };
}

function normalizeAnnotations(
  annotations: ReadonlyMap<string, unknown> | undefined,
  options: Required<DiffAesOptions>,
): unknown {
  if (!annotations || annotations.size === 0) {
    return null;
  }

  return [...annotations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, normalizeUnknown(value, options)]);
}

function normalizeUnknown(value: unknown, options: Required<DiffAesOptions>): unknown {
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entry]) => [key, normalizeUnknown(entry, options)]);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeUnknown(entry, options));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value)
      .filter(([key]) => key !== 'span')
      .sort(([left], [right]) => left.localeCompare(right));
    for (const [key, entry] of entries) {
      result[key] = normalizeUnknown(entry, options);
    }
    return result;
  }

  return value;
}

function isHeaderPath(path: string): boolean {
  return path.startsWith('$.["aeon:');
}

function matchesPathFilters(path: string, filters: readonly string[]): boolean {
  if (filters.length === 0) {
    return true;
  }
  return filters.some((filter) => path === filter || path.startsWith(`${filter}.`) || path.startsWith(`${filter}[`));
}

function hasReferenceChange(before: unknown, after: unknown): boolean {
  const beforeRefs = collectReferenceMarkers(before);
  const afterRefs = collectReferenceMarkers(after);
  return beforeRefs.length > 0 || afterRefs.length > 0;
}

function collectReferenceMarkers(value: unknown): readonly string[] {
  const markers: string[] = [];
  collectReferences(value, markers);
  return markers;
}

function collectReferences(value: unknown, markers: string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferences(entry, markers);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.type === 'CloneReference' || record.type === 'PointerReference') {
    markers.push(String(record.type));
  }

  for (const entry of Object.values(record)) {
    collectReferences(entry, markers);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function toJsonSafe(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, entry]) => [key, toJsonSafe(entry)]));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonSafe(entry));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonSafe(entry);
    }
    return result;
  }

  return value;
}
