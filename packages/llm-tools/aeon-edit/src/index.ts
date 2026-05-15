import {
  createTitonicFromAeon,
  exportTitonicAeon,
  exportTitonicAes,
  getTitonicAttribute,
  getTitonicAttributeAnnotation,
  getTitonicAttributes,
  getTitonicNodeAttribute,
  getTitonicNodeAttributeAnnotation,
  getTitonicNodeAttributes,
  getTitonicValue,
  isTitonicElement,
  setTitonicAttribute,
  setTitonicAttributeAnnotation,
  setTitonicNodeAttribute,
  setTitonicNodeAttributeAnnotation,
  setTitonicValue,
  deleteTitonicAttribute,
  deleteTitonicAttributeAnnotation,
  deleteTitonicNodeAttribute,
  deleteTitonicNodeAttributeAnnotation,
  deleteTitonicValue,
  TITONIC_CHILDREN,
  type TitonicElement,
  type TitonicObject,
  type TitonicPathSegment,
  type TitonicValue,
} from '../../../foundations/titonic/dist/index.js';
import { compactAeon, type CompactCommentMode } from '../../../export/compactor/dist/index.js';
import { convertAeonMode, type AeonModeConversionTarget } from '../../../export/mode-converter/dist/index.js';
import { prettifyAeon } from '../../../export/prettifier/dist/index.js';
import type { AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';

export interface AeonEditOptions {
  readonly maxAttributeDepth?: number;
}

export interface AeonEditResult {
  readonly ok: boolean;
  readonly command: string;
  readonly path?: string;
  readonly key?: string;
  readonly annotationKey?: string;
  readonly changed?: boolean;
  readonly value?: unknown;
  readonly output?: {
    readonly format: 'aeon' | 'aes';
    readonly text?: string;
    readonly events?: unknown;
  };
  readonly diff?: unknown;
  readonly preflight?: AeonEditBatchPreflight;
}

export interface AeonEditAttributeSummary {
  readonly key: string;
  readonly datatype?: string;
  readonly annotations: readonly AeonEditAttributeSummary[];
}

export interface AeonEditInspection {
  readonly path: string;
  readonly kind: string;
  readonly datatype?: string;
  readonly attributes: readonly AeonEditAttributeSummary[];
  readonly nodeAttributes?: readonly AeonEditAttributeSummary[];
  readonly children: readonly string[];
}

export interface AeonEditListEntry {
  readonly path: string;
  readonly kind: string;
  readonly datatype?: string;
  readonly attributes: readonly string[];
  readonly nodeAttributes?: readonly string[];
}

export type AeonEditBatchOperation =
  | ({ readonly command: 'set'; readonly path: string; readonly value: string } & AeonEditBatchValueGuard)
  | ({ readonly command: 'delete'; readonly path: string } & AeonEditBatchValueGuard)
  | ({ readonly command: 'append'; readonly path: string; readonly value: string } & AeonEditBatchValueGuard)
  | ({ readonly command: 'insert'; readonly path: string; readonly value: string } & AeonEditBatchValueGuard)
  | ({ readonly command: 'attr.set'; readonly path: string; readonly key: string; readonly value: string } & AeonEditBatchAttributeGuard)
  | ({ readonly command: 'attr.delete'; readonly path: string; readonly key: string } & AeonEditBatchAttributeGuard)
  | ({ readonly command: 'attr-annotation.set'; readonly path: string; readonly key: string; readonly annotationKey: string; readonly value: string } & AeonEditBatchAnnotationGuard)
  | ({ readonly command: 'attr-annotation.delete'; readonly path: string; readonly key: string; readonly annotationKey: string } & AeonEditBatchAnnotationGuard)
  | ({ readonly command: 'node-attr.set'; readonly path: string; readonly key: string; readonly value: string } & AeonEditBatchAttributeGuard)
  | ({ readonly command: 'node-attr.delete'; readonly path: string; readonly key: string } & AeonEditBatchAttributeGuard)
  | ({ readonly command: 'node-attr-annotation.set'; readonly path: string; readonly key: string; readonly annotationKey: string; readonly value: string } & AeonEditBatchAnnotationGuard)
  | ({ readonly command: 'node-attr-annotation.delete'; readonly path: string; readonly key: string; readonly annotationKey: string } & AeonEditBatchAnnotationGuard);

export interface AeonEditBatchValueGuard {
  readonly expect?: string;
}

export interface AeonEditBatchAttributeGuard extends AeonEditBatchValueGuard {
  readonly expectAttribute?: string;
}

export interface AeonEditBatchAnnotationGuard extends AeonEditBatchAttributeGuard {
  readonly expectAnnotation?: string;
}

export interface AeonEditBatchOperationResult {
  readonly index: number;
  readonly command: AeonEditBatchOperation['command'];
  readonly path: string;
  readonly key?: string;
  readonly annotationKey?: string;
  readonly changed: boolean;
}

export type AeonEditBatchDiagnosticSeverity = 'error' | 'warning';

export interface AeonEditBatchDiagnostic {
  readonly severity: AeonEditBatchDiagnosticSeverity;
  readonly code:
    | 'PATH_NOT_FOUND'
    | 'TARGET_NOT_LIST'
    | 'INSERT_PATH_NOT_INDEX'
    | 'DELETE_NOOP'
    | 'ATTRIBUTE_NOT_FOUND'
    | 'ATTRIBUTE_ANNOTATION_NOT_FOUND'
    | 'TARGET_NOT_NODE'
    | 'NODE_ATTRIBUTE_NOT_FOUND'
    | 'NODE_ATTRIBUTE_ANNOTATION_NOT_FOUND'
    | 'EXPECTATION_MISMATCH';
  readonly index: number;
  readonly command: AeonEditBatchOperation['command'];
  readonly path: string;
  readonly key?: string;
  readonly annotationKey?: string;
  readonly message: string;
}

export interface AeonEditBatchPreflight {
  readonly ok: boolean;
  readonly diagnostics: readonly AeonEditBatchDiagnostic[];
}

export interface AeonEditBatchPlan {
  readonly operations: readonly AeonEditBatchOperation[];
}

export function parseAeonEditPath(input: string): readonly TitonicPathSegment[] {
  if (!input.startsWith('$')) {
    throw new Error(`Path must start with "$": ${input}`);
  }

  const segments: TitonicPathSegment[] = [];
  let index = 1;
  while (index < input.length) {
    const char = input[index];
    if (char === '.') {
      const parsed = parseMember(input, index + 1);
      segments.push(parsed.value === 'children' ? TITONIC_CHILDREN : parsed.value);
      index = parsed.next;
      continue;
    }
    if (char === '[') {
      const parsed = parseBracket(input, index);
      segments.push(parsed.value);
      index = parsed.next;
      continue;
    }
    throw new Error(`Unexpected path token at offset ${index}: ${input}`);
  }

  return segments;
}

export function loadAeonDocument(source: string, options: AeonEditOptions = {}): TitonicObject {
  return createTitonicFromAeon(source, {
    maxAttributeDepth: options.maxAttributeDepth ?? 2,
  });
}

export function getAeonEditValue(source: string, path: string): AeonEditResult {
  const document = loadAeonDocument(source);
  return {
    ok: true,
    command: 'get',
    path,
    value: getTitonicValue(document, parseAeonEditPath(path)),
  };
}

export function setAeonEditValue(source: string, path: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  setTitonicValue(document, parseAeonEditPath(path), parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'set',
    path,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function deleteAeonEditValue(source: string, path: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const changed = deleteTitonicValue(document, parseAeonEditPath(path));
  return {
    ok: true,
    command: 'delete',
    path,
    changed,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function appendAeonEditValue(source: string, path: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const list = getTitonicValue(document, parseAeonEditPath(path));
  if (!Array.isArray(list)) {
    throw new Error(`Append target must be a list: ${path}`);
  }
  list.push(parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'append',
    path,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function insertAeonEditValue(source: string, path: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const parsedPath = parseAeonEditPath(path);
  const leaf = parsedPath[parsedPath.length - 1];
  if (typeof leaf !== 'number') {
    throw new Error(`Insert path must end with a list index: ${path}`);
  }
  const parent = getTitonicValue(document, parsedPath.slice(0, -1));
  if (!Array.isArray(parent)) {
    throw new Error(`Insert parent must be a list: ${path}`);
  }
  parent.splice(leaf, 0, parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'insert',
    path,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function exportAeonEditAes(source: string): AeonEditResult {
  const document = loadAeonDocument(source);
  return {
    ok: true,
    command: 'export-aes',
    output: {
      format: 'aes',
      events: exportTitonicAes(document),
    },
  };
}

export function prettifyAeonEdit(source: string): AeonEditResult {
  return {
    ok: true,
    command: 'prettify',
    changed: true,
    output: {
      format: 'aeon',
      text: prettifyAeon(source, { trailingNewline: true }).text,
    },
  };
}

export function compactAeonEdit(source: string, comments: CompactCommentMode = 'semantic'): AeonEditResult {
  return {
    ok: true,
    command: 'compact',
    changed: true,
    output: {
      format: 'aeon',
      text: compactAeon(source, { comments, trailingNewline: true }).text,
    },
  };
}

export function convertAeonEditMode(source: string, target: AeonModeConversionTarget): AeonEditResult {
  return {
    ok: true,
    command: 'convert-mode',
    changed: true,
    output: {
      format: 'aeon',
      text: convertAeonMode(source, { target, trailingNewline: true }).text,
    },
  };
}

export function inspectAeonEditPath(source: string, path: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const parsedPath = parseAeonEditPath(path);
  const value = getTitonicValue(document, parsedPath);
  const event = exportTitonicAes(document).find((candidate) => formatAesPath(candidate.path.segments) === path);
  const attributes = summarizeAttributes(getTitonicAttributes(document, parsedPath));
  const inspection: AeonEditInspection = {
    path,
    kind: kindOfTitonicValue(value),
    ...(event?.datatype === undefined ? {} : { datatype: event.datatype }),
    attributes,
    ...(isTitonicElement(value) ? { nodeAttributes: summarizeAttributes(getTitonicNodeAttributes(value)) } : {}),
    children: childPathsForValue(value, path),
  };
  return {
    ok: true,
    command: 'inspect',
    path,
    value: inspection,
  };
}

export function listAeonEditPaths(source: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const datatypes = new Map(exportTitonicAes(document).map((event) => [formatAesPath(event.path.segments), event.datatype]));
  const entries: AeonEditListEntry[] = [];
  walkTitonicValue(document, '$', entries, datatypes, document);
  return {
    ok: true,
    command: 'list',
    value: entries,
  };
}

export function applyAeonEditBatch(source: string, operations: readonly AeonEditBatchOperation[]): AeonEditResult {
  const document = loadAeonDocument(source);
  const preflight = preflightAeonEditBatchDocument(document, operations);
  if (!preflight.ok) {
    return {
      ok: false,
      command: 'batch',
      value: [],
      changed: false,
      preflight,
    };
  }
  const results = operations.map((operation, index) => applyAeonEditBatchOperation(document, operation, index));
  return {
    ok: true,
    command: 'batch',
    value: results,
    changed: results.some((result) => result.changed),
    preflight,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function preflightAeonEditBatch(source: string, operations: readonly AeonEditBatchOperation[]): AeonEditBatchPreflight {
  return preflightAeonEditBatchDocument(loadAeonDocument(source), operations);
}

export function planAeonEditSet(source: string, path: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const current = getTitonicValue(document, parseAeonEditPath(path));
  return {
    ok: true,
    command: 'plan-set',
    path,
    value: {
      operations: [
        {
          command: 'set',
          path,
          expect: renderTitonicValueSnippet(current),
          value: valueSnippet,
        },
      ],
    } satisfies AeonEditBatchPlan,
  };
}

export function planAeonEditAttributeSet(source: string, path: string, key: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const attribute = getTitonicAttribute(document, parseAeonEditPath(path), key);
  if (!attribute) {
    throw new Error(`Binding attribute does not exist: ${key}`);
  }
  return {
    ok: true,
    command: 'plan-attr-set',
    path,
    key,
    value: {
      operations: [
        {
          command: 'attr.set',
          path,
          key,
          expectAttribute: renderAttributeEntryValueSnippet(attribute),
          value: valueSnippet,
        },
      ],
    } satisfies AeonEditBatchPlan,
  };
}

export function planAeonEditNodeAttributeSet(source: string, path: string, key: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  const attribute = getTitonicNodeAttribute(element, key);
  if (!attribute) {
    throw new Error(`Node attribute does not exist: ${key}`);
  }
  return {
    ok: true,
    command: 'plan-node-attr-set',
    path,
    key,
    value: {
      operations: [
        {
          command: 'node-attr.set',
          path,
          key,
          expectAttribute: renderAttributeEntryValueSnippet(attribute),
          value: valueSnippet,
        },
      ],
    } satisfies AeonEditBatchPlan,
  };
}

export function planAeonEditAttributeAnnotationSet(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
  valueSnippet: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  const attribute = getTitonicAttribute(document, parseAeonEditPath(path), key);
  if (!attribute) {
    throw new Error(`Binding attribute does not exist: ${key}`);
  }
  const annotation = attribute.annotations?.get(annotationKey);
  if (!annotation) {
    throw new Error(`Binding attribute annotation does not exist: ${annotationKey}`);
  }
  return {
    ok: true,
    command: 'plan-attr-annotation-set',
    path,
    key,
    annotationKey,
    value: {
      operations: [
        {
          command: 'attr-annotation.set',
          path,
          key,
          annotationKey,
          expectAttribute: renderAttributeEntryValueSnippet(attribute),
          expectAnnotation: renderAttributeEntryValueSnippet(annotation),
          value: valueSnippet,
        },
      ],
    } satisfies AeonEditBatchPlan,
  };
}

export function planAeonEditNodeAttributeAnnotationSet(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
  valueSnippet: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  const attribute = getTitonicNodeAttribute(element, key);
  if (!attribute) {
    throw new Error(`Node attribute does not exist: ${key}`);
  }
  const annotation = attribute.annotations?.get(annotationKey);
  if (!annotation) {
    throw new Error(`Node attribute annotation does not exist: ${annotationKey}`);
  }
  return {
    ok: true,
    command: 'plan-node-attr-annotation-set',
    path,
    key,
    annotationKey,
    value: {
      operations: [
        {
          command: 'node-attr-annotation.set',
          path,
          key,
          annotationKey,
          expectAttribute: renderAttributeEntryValueSnippet(attribute),
          expectAnnotation: renderAttributeEntryValueSnippet(annotation),
          value: valueSnippet,
        },
      ],
    } satisfies AeonEditBatchPlan,
  };
}

export function getAeonEditAttribute(source: string, path: string, key: string): AeonEditResult {
  const document = loadAeonDocument(source);
  return {
    ok: true,
    command: 'attr get',
    path,
    key,
    value: getTitonicAttribute(document, parseAeonEditPath(path), key),
  };
}

export function setAeonEditAttribute(source: string, path: string, key: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  setTitonicAttribute(document, parseAeonEditPath(path), key, parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'attr set',
    path,
    key,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function deleteAeonEditAttribute(source: string, path: string, key: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const changed = deleteTitonicAttribute(document, parseAeonEditPath(path), key);
  return {
    ok: true,
    command: 'attr delete',
    path,
    key,
    changed,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function getAeonEditAttributeAnnotation(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  return {
    ok: true,
    command: 'attr-annotation get',
    path,
    key,
    annotationKey,
    value: getTitonicAttributeAnnotation(document, parseAeonEditPath(path), key, annotationKey),
  };
}

export function setAeonEditAttributeAnnotation(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
  valueSnippet: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  setTitonicAttributeAnnotation(document, parseAeonEditPath(path), key, annotationKey, parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'attr-annotation set',
    path,
    key,
    annotationKey,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function deleteAeonEditAttributeAnnotation(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  const changed = deleteTitonicAttributeAnnotation(document, parseAeonEditPath(path), key, annotationKey);
  return {
    ok: true,
    command: 'attr-annotation delete',
    path,
    key,
    annotationKey,
    changed,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function getAeonEditNodeAttribute(source: string, path: string, key: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  return {
    ok: true,
    command: 'node-attr get',
    path,
    key,
    value: getTitonicNodeAttribute(element, key),
  };
}

export function setAeonEditNodeAttribute(source: string, path: string, key: string, valueSnippet: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  setTitonicNodeAttribute(element, key, parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'node-attr set',
    path,
    key,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function deleteAeonEditNodeAttribute(source: string, path: string, key: string): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  const changed = deleteTitonicNodeAttribute(element, key);
  return {
    ok: true,
    command: 'node-attr delete',
    path,
    key,
    changed,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function getAeonEditNodeAttributeAnnotation(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  return {
    ok: true,
    command: 'node-attr-annotation get',
    path,
    key,
    annotationKey,
    value: getTitonicNodeAttributeAnnotation(element, key, annotationKey),
  };
}

export function setAeonEditNodeAttributeAnnotation(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
  valueSnippet: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  setTitonicNodeAttributeAnnotation(element, key, annotationKey, parseAeonValueSnippet(valueSnippet));
  return {
    ok: true,
    command: 'node-attr-annotation set',
    path,
    key,
    annotationKey,
    changed: true,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

export function deleteAeonEditNodeAttributeAnnotation(
  source: string,
  path: string,
  key: string,
  annotationKey: string,
): AeonEditResult {
  const document = loadAeonDocument(source);
  const element = getAeonEditElementAtPath(document, path);
  const changed = deleteTitonicNodeAttributeAnnotation(element, key, annotationKey);
  return {
    ok: true,
    command: 'node-attr-annotation delete',
    path,
    key,
    annotationKey,
    changed,
    output: {
      format: 'aeon',
      text: exportTitonicAeon(document),
    },
  };
}

function getAeonEditElementAtPath(document: TitonicObject, path: string): TitonicElement {
  const value = getTitonicValue(document, parseAeonEditPath(path));
  if (!isTitonicElement(value)) {
    throw new Error(`Path must resolve to a node element: ${path}`);
  }
  return value;
}

function preflightAeonEditBatchDocument(
  document: TitonicObject,
  operations: readonly AeonEditBatchOperation[],
): AeonEditBatchPreflight {
  const diagnostics = operations.flatMap((operation, index) => preflightAeonEditBatchOperation(document, operation, index));
  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  };
}

function preflightAeonEditBatchOperation(
  document: TitonicObject,
  operation: AeonEditBatchOperation,
  index: number,
): readonly AeonEditBatchDiagnostic[] {
  const guardDiagnostics = preflightValueExpectation(document, operation, index);
  if (guardDiagnostics.length > 0) {
    return guardDiagnostics;
  }
  switch (operation.command) {
    case 'set':
      return pathExists(document, operation.path) ? [] : [batchDiagnostic('error', 'PATH_NOT_FOUND', index, operation, `Path does not exist: ${operation.path}`)];
    case 'delete':
      return pathExists(document, operation.path) ? [] : [batchDiagnostic('warning', 'DELETE_NOOP', index, operation, `Delete target does not exist: ${operation.path}`)];
    case 'append': {
      const value = readPathValue(document, operation.path);
      if (!value.exists) {
        return [batchDiagnostic('error', 'PATH_NOT_FOUND', index, operation, `Append target does not exist: ${operation.path}`)];
      }
      return Array.isArray(value.value) ? [] : [batchDiagnostic('error', 'TARGET_NOT_LIST', index, operation, `Append target is not a list: ${operation.path}`)];
    }
    case 'insert': {
      const parsedPath = parseAeonEditPath(operation.path);
      if (typeof parsedPath[parsedPath.length - 1] !== 'number') {
        return [batchDiagnostic('error', 'INSERT_PATH_NOT_INDEX', index, operation, `Insert path must end with a list index: ${operation.path}`)];
      }
      const value = readParsedPathValue(document, parsedPath.slice(0, -1));
      if (!value.exists) {
        return [batchDiagnostic('error', 'PATH_NOT_FOUND', index, operation, `Insert parent does not exist: ${operation.path}`)];
      }
      return Array.isArray(value.value) ? [] : [batchDiagnostic('error', 'TARGET_NOT_LIST', index, operation, `Insert parent is not a list: ${operation.path}`)];
    }
    case 'attr.set':
    case 'attr.delete':
    case 'attr-annotation.set':
    case 'attr-annotation.delete':
      return preflightBindingAttributeOperation(document, operation, index);
    case 'node-attr.set':
    case 'node-attr.delete':
    case 'node-attr-annotation.set':
    case 'node-attr-annotation.delete':
      return preflightNodeAttributeOperation(document, operation, index);
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function preflightBindingAttributeOperation(
  document: TitonicObject,
  operation: Extract<AeonEditBatchOperation, { readonly command: 'attr.set' | 'attr.delete' | 'attr-annotation.set' | 'attr-annotation.delete' }>,
  index: number,
): readonly AeonEditBatchDiagnostic[] {
  if (!pathExists(document, operation.path)) {
    return [batchDiagnostic('error', 'PATH_NOT_FOUND', index, operation, `Path does not exist: ${operation.path}`)];
  }
  const attributes = getTitonicAttributes(document, parseAeonEditPath(operation.path));
  const attribute = attributes?.get(operation.key);
  const attributeGuardDiagnostics = preflightAttributeExpectation(attribute, operation, index);
  if (attributeGuardDiagnostics.length > 0) {
    return attributeGuardDiagnostics;
  }
  if (operation.command === 'attr.set') {
    return [];
  }
  if (operation.command === 'attr.delete') {
    return attribute ? [] : [batchDiagnostic('warning', 'DELETE_NOOP', index, operation, `Binding attribute does not exist: ${operation.key}`)];
  }
  if (!attribute) {
    return [batchDiagnostic('error', 'ATTRIBUTE_NOT_FOUND', index, operation, `Binding attribute does not exist: ${operation.key}`)];
  }
  const annotationGuardDiagnostics = preflightAnnotationExpectation(attribute.annotations?.get(operation.annotationKey), operation, index);
  if (annotationGuardDiagnostics.length > 0) {
    return annotationGuardDiagnostics;
  }
  if (operation.command === 'attr-annotation.set') {
    return [];
  }
  if (operation.command === 'attr-annotation.delete') {
    return attribute.annotations?.has(operation.annotationKey)
      ? []
      : [batchDiagnostic('warning', 'ATTRIBUTE_ANNOTATION_NOT_FOUND', index, operation, `Binding attribute annotation does not exist: ${operation.annotationKey}`)];
  }
  const exhaustive: never = operation;
  return exhaustive;
}

function preflightNodeAttributeOperation(
  document: TitonicObject,
  operation: Extract<AeonEditBatchOperation, { readonly command: 'node-attr.set' | 'node-attr.delete' | 'node-attr-annotation.set' | 'node-attr-annotation.delete' }>,
  index: number,
): readonly AeonEditBatchDiagnostic[] {
  const value = readPathValue(document, operation.path);
  if (!value.exists) {
    return [batchDiagnostic('error', 'PATH_NOT_FOUND', index, operation, `Path does not exist: ${operation.path}`)];
  }
  if (!isTitonicElement(value.value)) {
    return [batchDiagnostic('error', 'TARGET_NOT_NODE', index, operation, `Path does not resolve to a node element: ${operation.path}`)];
  }
  const attribute = getTitonicNodeAttribute(value.value, operation.key);
  const attributeGuardDiagnostics = preflightAttributeExpectation(attribute, operation, index);
  if (attributeGuardDiagnostics.length > 0) {
    return attributeGuardDiagnostics;
  }
  if (operation.command === 'node-attr.set') {
    return [];
  }
  if (operation.command === 'node-attr.delete') {
    return attribute ? [] : [batchDiagnostic('warning', 'DELETE_NOOP', index, operation, `Node attribute does not exist: ${operation.key}`)];
  }
  if (!attribute) {
    return [batchDiagnostic('error', 'NODE_ATTRIBUTE_NOT_FOUND', index, operation, `Node attribute does not exist: ${operation.key}`)];
  }
  const annotationGuardDiagnostics = preflightAnnotationExpectation(attribute.annotations?.get(operation.annotationKey), operation, index);
  if (annotationGuardDiagnostics.length > 0) {
    return annotationGuardDiagnostics;
  }
  if (operation.command === 'node-attr-annotation.set') {
    return [];
  }
  if (operation.command === 'node-attr-annotation.delete') {
    return attribute.annotations?.has(operation.annotationKey)
      ? []
      : [batchDiagnostic('warning', 'NODE_ATTRIBUTE_ANNOTATION_NOT_FOUND', index, operation, `Node attribute annotation does not exist: ${operation.annotationKey}`)];
  }
  const exhaustive: never = operation;
  return exhaustive;
}

function preflightValueExpectation(
  document: TitonicObject,
  operation: AeonEditBatchOperation,
  index: number,
): readonly AeonEditBatchDiagnostic[] {
  if (!operation.expect) {
    return [];
  }
  const current = readPathValue(document, operation.path);
  if (!current.exists) {
    return [];
  }
  return titonicValuesEqual(current.value, parseAeonValueSnippet(operation.expect))
    ? []
    : [batchDiagnostic('error', 'EXPECTATION_MISMATCH', index, operation, `Expected path value did not match: ${operation.path}`)];
}

function preflightAttributeExpectation(
  attribute: AttributeEntry | undefined,
  operation: Extract<AeonEditBatchOperation, { readonly key: string }>,
  index: number,
): readonly AeonEditBatchDiagnostic[] {
  if (!('expectAttribute' in operation) || !operation.expectAttribute || !attribute) {
    return [];
  }
  return attributeEntriesEqual(attribute, parseAeonAttributeEntrySnippet(operation.expectAttribute))
    ? []
    : [batchDiagnostic('error', 'EXPECTATION_MISMATCH', index, operation, `Expected attribute value did not match: ${operation.key}`)];
}

function preflightAnnotationExpectation(
  annotation: AttributeEntry | undefined,
  operation: Extract<AeonEditBatchOperation, { readonly annotationKey: string }>,
  index: number,
): readonly AeonEditBatchDiagnostic[] {
  if (!('expectAnnotation' in operation) || !operation.expectAnnotation || !annotation) {
    return [];
  }
  return attributeEntriesEqual(annotation, parseAeonAttributeEntrySnippet(operation.expectAnnotation))
    ? []
    : [batchDiagnostic('error', 'EXPECTATION_MISMATCH', index, operation, `Expected annotation value did not match: ${operation.annotationKey}`)];
}

function batchDiagnostic(
  severity: AeonEditBatchDiagnosticSeverity,
  code: AeonEditBatchDiagnostic['code'],
  index: number,
  operation: AeonEditBatchOperation,
  message: string,
): AeonEditBatchDiagnostic {
  return {
    severity,
    code,
    index,
    command: operation.command,
    path: operation.path,
    ...('key' in operation ? { key: operation.key } : {}),
    ...('annotationKey' in operation ? { annotationKey: operation.annotationKey } : {}),
    message,
  };
}

function pathExists(document: TitonicObject, path: string): boolean {
  return readPathValue(document, path).exists;
}

function readPathValue(document: TitonicObject, path: string): { readonly exists: true; readonly value: TitonicValue } | { readonly exists: false } {
  return readParsedPathValue(document, parseAeonEditPath(path));
}

function readParsedPathValue(
  document: TitonicObject,
  path: readonly TitonicPathSegment[],
): { readonly exists: true; readonly value: TitonicValue } | { readonly exists: false } {
  try {
    return {
      exists: true,
      value: getTitonicValue(document, path),
    };
  } catch {
    return { exists: false };
  }
}

function applyAeonEditBatchOperation(
  document: TitonicObject,
  operation: AeonEditBatchOperation,
  index: number,
): AeonEditBatchOperationResult {
  switch (operation.command) {
    case 'set':
      setTitonicValue(document, parseAeonEditPath(operation.path), parseAeonValueSnippet(operation.value));
      return batchOperationResult(index, operation, true);
    case 'delete':
      if (!pathExists(document, operation.path)) {
        return batchOperationResult(index, operation, false);
      }
      return batchOperationResult(index, operation, deleteTitonicValue(document, parseAeonEditPath(operation.path)));
    case 'append': {
      const list = getTitonicValue(document, parseAeonEditPath(operation.path));
      if (!Array.isArray(list)) {
        throw new Error(`Batch operation ${index} append target must be a list: ${operation.path}`);
      }
      list.push(parseAeonValueSnippet(operation.value));
      return batchOperationResult(index, operation, true);
    }
    case 'insert': {
      const parsedPath = parseAeonEditPath(operation.path);
      const leaf = parsedPath[parsedPath.length - 1];
      if (typeof leaf !== 'number') {
        throw new Error(`Batch operation ${index} insert path must end with a list index: ${operation.path}`);
      }
      const parent = getTitonicValue(document, parsedPath.slice(0, -1));
      if (!Array.isArray(parent)) {
        throw new Error(`Batch operation ${index} insert parent must be a list: ${operation.path}`);
      }
      parent.splice(leaf, 0, parseAeonValueSnippet(operation.value));
      return batchOperationResult(index, operation, true);
    }
    case 'attr.set':
      setTitonicAttribute(document, parseAeonEditPath(operation.path), operation.key, parseAeonValueSnippet(operation.value));
      return batchOperationResult(index, operation, true);
    case 'attr.delete':
      if (!getTitonicAttributes(document, parseAeonEditPath(operation.path))?.has(operation.key)) {
        return batchOperationResult(index, operation, false);
      }
      return batchOperationResult(index, operation, deleteTitonicAttribute(document, parseAeonEditPath(operation.path), operation.key));
    case 'attr-annotation.set':
      setTitonicAttributeAnnotation(
        document,
        parseAeonEditPath(operation.path),
        operation.key,
        operation.annotationKey,
        parseAeonValueSnippet(operation.value),
      );
      return batchOperationResult(index, operation, true);
    case 'attr-annotation.delete':
      if (!getTitonicAttributeAnnotation(document, parseAeonEditPath(operation.path), operation.key, operation.annotationKey)) {
        return batchOperationResult(index, operation, false);
      }
      return batchOperationResult(
        index,
        operation,
        deleteTitonicAttributeAnnotation(document, parseAeonEditPath(operation.path), operation.key, operation.annotationKey),
      );
    case 'node-attr.set':
      setTitonicNodeAttribute(getAeonEditElementAtPath(document, operation.path), operation.key, parseAeonValueSnippet(operation.value));
      return batchOperationResult(index, operation, true);
    case 'node-attr.delete':
      if (!getTitonicNodeAttribute(getAeonEditElementAtPath(document, operation.path), operation.key)) {
        return batchOperationResult(index, operation, false);
      }
      return batchOperationResult(index, operation, deleteTitonicNodeAttribute(getAeonEditElementAtPath(document, operation.path), operation.key));
    case 'node-attr-annotation.set':
      setTitonicNodeAttributeAnnotation(
        getAeonEditElementAtPath(document, operation.path),
        operation.key,
        operation.annotationKey,
        parseAeonValueSnippet(operation.value),
      );
      return batchOperationResult(index, operation, true);
    case 'node-attr-annotation.delete':
      if (!getTitonicNodeAttributeAnnotation(getAeonEditElementAtPath(document, operation.path), operation.key, operation.annotationKey)) {
        return batchOperationResult(index, operation, false);
      }
      return batchOperationResult(
        index,
        operation,
        deleteTitonicNodeAttributeAnnotation(getAeonEditElementAtPath(document, operation.path), operation.key, operation.annotationKey),
      );
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function batchOperationResult(
  index: number,
  operation: AeonEditBatchOperation,
  changed: boolean,
): AeonEditBatchOperationResult {
  return {
    index,
    command: operation.command,
    path: operation.path,
    ...('key' in operation ? { key: operation.key } : {}),
    ...('annotationKey' in operation ? { annotationKey: operation.annotationKey } : {}),
    changed,
  };
}

function walkTitonicValue(
  value: TitonicValue,
  path: string,
  entries: AeonEditListEntry[],
  datatypes: ReadonlyMap<string, string | undefined>,
  document: TitonicObject,
  seen: WeakSet<object> = new WeakSet(),
): void {
  const attributes = path === '$' ? [] : summarizeAttributes(getTitonicAttributes(document, parseAeonEditPath(path))).map((item) => item.key);
  const kind = kindOfTitonicValue(value);
  const datatype = datatypes.get(path);
  entries.push({
    path,
    kind,
    ...(datatype === undefined ? {} : { datatype }),
    attributes,
    ...(isTitonicElement(value) ? { nodeAttributes: summarizeAttributes(getTitonicNodeAttributes(value)).map((item) => item.key) } : {}),
  });

  if (!value || typeof value !== 'object') {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (isTitonicElement(value)) {
    value.children.forEach((child, index) => {
      walkTitonicValue(child, `${path}.children[${index}]`, entries, datatypes, document, seen);
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      walkTitonicValue(child, `${path}[${index}]`, entries, datatypes, document, seen);
    });
    return;
  }

  if (isTitonicNativeScalar(value)) {
    return;
  }

  const objectValue = value as TitonicObject;
  for (const key of Object.keys(objectValue)) {
    walkTitonicValue(objectValue[key]!, appendPathMember(path, key), entries, datatypes, document, seen);
  }
}

function childPathsForValue(value: TitonicValue, path: string): readonly string[] {
  if (isTitonicElement(value)) {
    return value.children.map((_child, index) => `${path}.children[${index}]`);
  }
  if (Array.isArray(value)) {
    return value.map((_child, index) => `${path}[${index}]`);
  }
  if (value && typeof value === 'object' && !isTitonicNativeScalar(value)) {
    return Object.keys(value).map((key) => appendPathMember(path, key));
  }
  return [];
}

function kindOfTitonicValue(value: TitonicValue): string {
  if (isTitonicElement(value)) {
    return 'node';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    if (isTitonicNativeScalar(value)) {
      return value.kind;
    }
    return 'object';
  }
  return typeof value;
}

function isTitonicNativeScalar(value: TitonicValue): value is Extract<TitonicValue, { readonly __titonicNativeScalar: true }> {
  return !!value && typeof value === 'object' && '__titonicNativeScalar' in value && value.__titonicNativeScalar === true;
}

function summarizeAttributes(attributes: ReadonlyMap<string, AttributeEntry> | undefined): readonly AeonEditAttributeSummary[] {
  if (!attributes) {
    return [];
  }
  return [...attributes.entries()].map(([key, entry]) => ({
    key,
    ...(entry.datatype === undefined ? {} : { datatype: entry.datatype }),
    annotations: summarizeAttributes(entry.annotations),
  }));
}

function appendPathMember(path: string, key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return `${path}.${key}`;
  }
  return `${path}[${JSON.stringify(key)}]`;
}

function formatAesPath(segments: readonly ({ readonly type: string; readonly key?: string; readonly index?: number })[]): string {
  let path = '$';
  for (const segment of segments) {
    if (segment.type === 'root') {
      continue;
    }
    if (segment.type === 'member' && segment.key !== undefined) {
      path = appendPathMember(path, segment.key);
      continue;
    }
    if (segment.type === 'index' && segment.index !== undefined) {
      path = `${path}[${segment.index}]`;
    }
  }
  return path;
}

function parseAeonValueSnippet(snippet: string): TitonicValue {
  const trimmed = snippet.trim();
  const datatype = inferSnippetDatatype(trimmed);
  const document = createTitonicFromAeon(`aeon:mode = "strict"\n__value__:${datatype} = ${trimmed}`);
  return getTitonicValue(document, ['__value__']);
}

function parseAeonAttributeEntrySnippet(snippet: string): AttributeEntry {
  const trimmed = snippet.trim();
  const datatype = inferSnippetDatatype(trimmed);
  const document = createTitonicFromAeon(`aeon:mode = "strict"\n__value__@{__guard__:${datatype} = ${trimmed}}:string = ""`);
  const entry = getTitonicAttribute(document, ['__value__'], '__guard__');
  if (!entry) {
    throw new Error('Could not parse AEON attribute guard snippet.');
  }
  return entry;
}

function renderTitonicValueSnippet(value: TitonicValue): string {
  if (isTitonicElement(value)) {
    const datatype = value.datatype ? `:${value.datatype}` : '';
    const children = value.children.length > 0
      ? `(${value.children.map((child) => renderTitonicValueSnippet(child)).join(',')})`
      : '';
    return `<${formatBindingKey(value.tag)}${datatype}${children}>`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => renderTitonicValueSnippet(entry)).join(',')}]`;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return formatString(value);
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'NaN';
    }
    if (value === Infinity) {
      return 'Infinity';
    }
    if (value === -Infinity) {
      return '-Infinity';
    }
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (isTitonicNativeScalar(value)) {
    return value.raw;
  }
  return `{${Object.keys(value).sort().map((key) => {
    const child = (value as TitonicObject)[key]!;
    return `${formatBindingKey(key)}:${inferDatatypeForTitonicValue(child)}=${renderTitonicValueSnippet(child)}`;
  }).join(',')}}`;
}

function renderAttributeEntryValueSnippet(entry: AttributeEntry): string {
  return renderAstValueSnippet(entry.value);
}

function renderAstValueSnippet(value: AttributeEntry['value']): string {
  switch (value.type) {
    case 'TypedValue':
      return renderAstValueSnippet(value.value);
    case 'StringLiteral':
      return formatString(value.value);
    case 'NumberLiteral':
    case 'InfinityLiteral':
    case 'NaNLiteral':
    case 'NullLiteral':
    case 'BooleanLiteral':
    case 'ToggleLiteral':
    case 'HexLiteral':
    case 'RadixLiteral':
    case 'EncodingLiteral':
    case 'SeparatorLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
      return value.raw;
    case 'ObjectNode':
      return `{${value.bindings.map((binding) => `${formatBindingKey(binding.key)}${binding.datatype ? `:${binding.datatype.name}` : ''}=${renderAstValueSnippet(binding.value)}`).join(',')}}`;
    case 'ListNode':
      return `[${value.elements.map((element) => renderAstValueSnippet(element)).join(',')}]`;
    case 'TupleLiteral':
      return `(${value.elements.map((element) => renderAstValueSnippet(element)).join(',')})`;
    case 'NodeLiteral': {
      const datatype = value.datatype ? `:${value.datatype.name}` : '';
      const children = value.children.length > 0
        ? `(${value.children.map((child) => renderAstValueSnippet(child)).join(',')})`
        : '';
      return `<${formatBindingKey(value.tag)}${datatype}${children}>`;
    }
    case 'CloneReference':
      return `~${value.path.join('.')}`;
    case 'PointerReference':
      return `~>${value.path.join('.')}`;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function inferDatatypeForTitonicValue(value: TitonicValue): string {
  if (isTitonicElement(value)) {
    return 'node';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    return isTitonicNativeScalar(value) ? value.kind : 'object';
  }
  return typeof value;
}

function formatBindingKey(key: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : formatString(key);
}

function formatString(value: string): string {
  return JSON.stringify(value);
}

function titonicValuesEqual(left: TitonicValue, right: TitonicValue): boolean {
  return stableStringify(toComparableTitonicValue(left)) === stableStringify(toComparableTitonicValue(right));
}

function attributeEntriesEqual(left: AttributeEntry, right: AttributeEntry): boolean {
  return stableStringify(toComparableAttributeValue(left)) === stableStringify(toComparableAttributeValue(right));
}

function toComparableTitonicValue(value: TitonicValue, seen: WeakSet<object> = new WeakSet()): unknown {
  if (isTitonicElement(value)) {
    return {
      kind: 'node',
      tag: value.tag,
      datatype: value.datatype ?? null,
      children: value.children.map((child) => toComparableTitonicValue(child, seen)),
    };
  }
  if (Array.isArray(value)) {
    return value.map((child) => toComparableTitonicValue(child, seen));
  }
  if (value && typeof value === 'object') {
    if (isTitonicNativeScalar(value)) {
      return {
        kind: value.kind,
        value: value.value,
        raw: value.raw,
      };
    }
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, toComparableTitonicValue((value as TitonicObject)[key]!, seen)]));
  }
  return value;
}

function toComparableAttributeValue(entry: AttributeEntry): unknown {
  return {
    datatype: entry.datatype ?? null,
    value: stripSourceSpans(entry.value),
  };
}

function stripSourceSpans(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => [key, stripSourceSpans(entry)]));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripSourceSpans(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'span')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stripSourceSpans(entry)]));
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function inferSnippetDatatype(snippet: string): string {
  if (snippet.startsWith('"') || snippet.startsWith("'") || snippet.startsWith('`')) {
    return 'string';
  }
  if (snippet === 'true' || snippet === 'false') {
    return 'boolean';
  }
  if (snippet === 'null') {
    return 'null';
  }
  if (snippet.startsWith('{')) {
    return 'object';
  }
  if (snippet.startsWith('[')) {
    return 'list';
  }
  if (snippet.startsWith('(')) {
    return 'tuple';
  }
  if (snippet.startsWith('<')) {
    return 'node';
  }
  return 'number';
}

function parseMember(input: string, start: number): { readonly value: string; readonly next: number } {
  if (input[start] === '"') {
    return parseQuotedMember(input, start);
  }
  const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(start));
  if (!match) {
    throw new Error(`Expected member name at offset ${start}: ${input}`);
  }
  return {
    value: match[0],
    next: start + match[0].length,
  };
}

function parseBracket(input: string, start: number): { readonly value: string | number; readonly next: number } {
  const close = input.indexOf(']', start);
  if (close === -1) {
    throw new Error(`Unclosed bracket path segment: ${input}`);
  }
  const body = input.slice(start + 1, close);
  if (/^-?\d+$/.test(body)) {
    return {
      value: Number(body),
      next: close + 1,
    };
  }
  if (body.startsWith('"')) {
    const parsed = parseQuotedMember(body, 0);
    if (parsed.next !== body.length) {
      throw new Error(`Unexpected bracket member suffix: ${input}`);
    }
    return {
      value: parsed.value,
      next: close + 1,
    };
  }
  throw new Error(`Unsupported bracket path segment: ${input}`);
}

function parseQuotedMember(input: string, start: number): { readonly value: string; readonly next: number } {
  let value = '';
  let index = start + 1;
  while (index < input.length) {
    const char = input[index]!;
    if (char === '"') {
      return {
        value,
        next: index + 1,
      };
    }
    if (char === '\\') {
      const next = input[index + 1];
      if (!next) {
        throw new Error(`Invalid quoted path escape: ${input}`);
      }
      value += next;
      index += 2;
      continue;
    }
    value += char;
    index += 1;
  }
  throw new Error(`Unclosed quoted path segment: ${input}`);
}
