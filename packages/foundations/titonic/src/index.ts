import type {
  AssignmentEvent,
  AttributeEntry,
} from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type {
  Attribute,
  Binding,
  ReferencePathSegment,
  TypeAnnotation,
  Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import {
  parseAddressOrThrow,
  type SansaAddress,
  type SansaSelector,
} from '../../../../../sansa/src/index.js';
import { minimize } from '../../../export/minizer/dist/index.js';

export interface TitonicCreateOptions {
  readonly requireStrictMode?: boolean;
  readonly maxAttributeDepth?: number;
}

export interface TitonicExportAeonOptions {
  readonly trailingNewline?: boolean;
}

export type TitonicNativeScalarKind =
  | 'toggle'
  | 'hex'
  | 'radix'
  | 'encoding'
  | 'separator'
  | 'sansa'
  | 'date'
  | 'datetime'
  | 'wtc'
  | 'time';

export interface TitonicNativeScalar {
  readonly __titonicNativeScalar: true;
  readonly kind: TitonicNativeScalarKind;
  readonly value: string;
  readonly raw: string;
  toString(): string;
  toJSON(): string;
}

export interface TitonicElement {
  tag: string;
  datatype?: string;
  children: TitonicList;
}

export interface TitonicChildrenSegment {
  readonly type: 'children';
}

export type TitonicPathSegment = ReferencePathSegment | TitonicChildrenSegment;
export const TITONIC_CHILDREN: TitonicChildrenSegment = Object.freeze({ type: 'children' });

export interface TitonicAttributeCursor {
  get(key: string): AttributeEntry | undefined;
  getAll(): ReadonlyMap<string, AttributeEntry> | undefined;
  set(key: string, value: unknown, options?: { readonly datatype?: string }): void;
  delete(key: string): boolean;
  getAnnotation(key: string, annotationKey: string): AttributeEntry | undefined;
  getAnnotations(key: string): ReadonlyMap<string, AttributeEntry> | undefined;
  setAnnotation(
    key: string,
    annotationKey: string,
    value: unknown,
    options?: { readonly datatype?: string },
  ): void;
  deleteAnnotation(key: string, annotationKey: string): boolean;
}

export interface TitonicCursor {
  readonly path: readonly TitonicPathSegment[];
  get(): TitonicValue;
  set(value: unknown): void;
  delete(): boolean;
  readonly attributes: TitonicAttributeCursor;
}

export type TitonicScalar = string | number | boolean | null | TitonicNativeScalar;
export type TitonicValue = TitonicScalar | TitonicObject | TitonicList | TitonicTuple | TitonicElement;
export interface TitonicObject {
  [key: string]: TitonicValue;
}
export interface TitonicList extends Array<TitonicValue> {}
export interface TitonicTuple extends Array<TitonicValue> {}

export type TitonicResolveDiagnosticCode =
  | 'TITONIC_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT'
  | 'TITONIC_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE'
  | 'TITONIC_RESOLVE_UNSUPPORTED_LOCAL_SPACE';

export interface TitonicResolveDiagnostic {
  readonly code: TitonicResolveDiagnosticCode;
  readonly message: string;
  readonly selectorIndex?: number;
}

export interface TitonicResolveOptions {
  readonly contextPath?: readonly TitonicPathSegment[];
}

export interface TitonicResolvedBinding {
  readonly path: readonly TitonicPathSegment[];
  readonly pathText: string;
  readonly value: TitonicValue;
  readonly datatype?: string;
  readonly representationKind: string;
}

export interface TitonicResolveResult {
  readonly address: SansaAddress;
  readonly exact: boolean;
  readonly bindings: readonly TitonicResolvedBinding[];
  readonly diagnostics: readonly TitonicResolveDiagnostic[];
}

interface TitonicElementInit {
  readonly __titonicElementInit: true;
  readonly tag: string;
  readonly datatype?: string;
  readonly children: readonly unknown[];
}

type StrictDatatype =
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'nan'
  | 'infinity'
  | TitonicNativeScalarKind;

type ContainerDatatype = 'object' | 'list' | 'tuple' | 'node';

interface BaseNode {
  structuralId?: string;
  declaredDatatype?: string;
  annotations?: ReadonlyMap<string, AttributeEntry>;
  attributes?: readonly Attribute[];
}

interface NodeMetadata {
  structuralId?: string;
  declaredDatatype?: string;
  annotations?: ReadonlyMap<string, AttributeEntry>;
  attributes?: readonly Attribute[];
}

interface ScalarNode extends BaseNode {
  readonly kind: 'scalar';
  scalarType: StrictDatatype;
  value: TitonicScalar;
}

interface ObjectNode extends BaseNode {
  readonly kind: 'object';
  properties: Map<string, TitonicNode>;
}

interface ListNode extends BaseNode {
  readonly kind: 'list';
  items: TitonicNode[];
}

interface TupleNode extends BaseNode {
  readonly kind: 'tuple';
  items: TitonicNode[];
}

interface ElementNode extends BaseNode {
  readonly kind: 'element';
  tag: string;
  headStructuralId?: string;
  headDatatype?: string;
  headAnnotations?: ReadonlyMap<string, AttributeEntry>;
  headAttributes?: readonly Attribute[];
  children: ListNode;
}

interface PointerAliasNode extends BaseNode {
  readonly kind: 'pointer-alias';
  readonly targetPath: readonly ReferencePathSegment[];
}

interface CloneViewNode extends BaseNode {
  readonly kind: 'clone-view';
  readonly targetPath: readonly ReferencePathSegment[];
  realized?: TitonicNode;
  rootClone?: CloneViewNode;
  localPath?: readonly ReferencePathSegment[];
}

type TitonicNode = ScalarNode | ObjectNode | ListNode | TupleNode | ElementNode | PointerAliasNode | CloneViewNode;

type HeaderEvent = AssignmentEvent;

interface TitonicController {
  readonly root: ObjectNode;
  readonly headerEvents: readonly HeaderEvent[];
  readonly strictMode: boolean;
  proxyFor(node: TitonicNode): TitonicValue;
  exportAes(): readonly AssignmentEvent[];
  resolveNode(path: readonly ReferencePathSegment[]): TitonicNode;
}

const controllerByProxy = new WeakMap<object, TitonicController>();
const nodeByProxy = new WeakMap<object, TitonicNode>();
const proxyByNode = new WeakMap<TitonicNode, object>();
const ELEMENT_CHILDREN_SEGMENT = '__titonic_children__';

const NUMERIC_DATATYPES = new Set([
  'number',
  'int',
  'int8',
  'int16',
  'int32',
  'int64',
  'uint',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'float',
  'float32',
  'float64',
  'decimal',
]);

const BOOLEAN_DATATYPES = new Set(['boolean', 'bool']);
const STRING_DATATYPES = new Set(['string']);
const NULL_DATATYPES = new Set(['null']);
const OBJECT_DATATYPES = new Set(['object']);
const LIST_DATATYPES = new Set(['list', 'array']);
const TUPLE_DATATYPES = new Set(['tuple']);
const NODE_DATATYPES = new Set(['node']);
const NAN_DATATYPES = new Set(['nan']);
const INFINITY_DATATYPES = new Set(['infinity']);
const TOGGLE_DATATYPES = new Set(['toggle']);
const HEX_DATATYPES = new Set(['hex']);
const RADIX_DATATYPES = new Set(['radix', 'radix2', 'radix6', 'radix8', 'radix12']);
const ENCODING_DATATYPES = new Set(['encoding', 'base64', 'embed', 'inline']);
const SEPARATOR_DATATYPES = new Set(['sep', 'set']);
const SANSA_DATATYPES = new Set(['sansa']);
const DATE_DATATYPES = new Set(['date']);
const DATETIME_DATATYPES = new Set(['datetime']);
const WTC_DATATYPES = new Set(['wtc']);
const TIME_DATATYPES = new Set(['time']);

export function titonicToggle(value: 'yes' | 'no' | 'on' | 'off'): TitonicNativeScalar {
  return createNativeScalar('toggle', value);
}

export function titonicHex(raw: string): TitonicNativeScalar {
  return createNativeScalar('hex', raw);
}

export function titonicRadix(raw: string): TitonicNativeScalar {
  return createNativeScalar('radix', raw);
}

export function titonicEncoding(raw: string): TitonicNativeScalar {
  return createNativeScalar('encoding', raw);
}

export function titonicSeparator(raw: string): TitonicNativeScalar {
  return createNativeScalar('separator', raw);
}

export function titonicSansa(raw: string): TitonicNativeScalar {
  return createNativeScalar('sansa', raw);
}

export function titonicDate(raw: string): TitonicNativeScalar {
  return createNativeScalar('date', raw);
}

export function titonicDateTime(raw: string): TitonicNativeScalar {
  return createNativeScalar('datetime', raw);
}

export function titonicWtc(raw: string): TitonicNativeScalar {
  if (!raw.includes('&')) {
    throw new TypeError('Titonic WTC values must contain a temporal reference.');
  }
  return createNativeScalar('wtc', raw);
}

export function titonicTime(raw: string): TitonicNativeScalar {
  return createNativeScalar('time', raw);
}

export function titonicElement(
  tag: string,
  children: readonly unknown[] = [],
  options: { readonly datatype?: string } = {},
): TitonicElement {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new TypeError('Titonic elements require a non-empty string tag.');
  }
  return Object.freeze({
    __titonicElementInit: true,
    tag,
    children: [...children],
    ...(options.datatype ? { datatype: options.datatype } : {}),
  }) as unknown as TitonicElement;
}

export function isTitonicElement(value: unknown): value is TitonicElement {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const node = nodeByProxy.get(value as object);
  return !!node && resolveNodeKind(node) === 'element';
}

function createNativeScalar(kind: TitonicNativeScalarKind, input: string): TitonicNativeScalar {
  const raw = normalizeNativeRaw(kind, input);
  const value = nativeValueFromRaw(kind, raw);
  return Object.freeze({
    __titonicNativeScalar: true,
    kind,
    value,
    raw,
    toString() {
      return raw;
    },
    toJSON() {
      return raw;
    },
  });
}

function isTitonicNativeScalar(value: unknown): value is TitonicNativeScalar {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { readonly __titonicNativeScalar?: unknown }).__titonicNativeScalar === true
  );
}

function normalizeNativeRaw(kind: TitonicNativeScalarKind, input: string): string {
  switch (kind) {
    case 'toggle': {
      const normalized = input.toLowerCase();
      if (normalized !== 'yes' && normalized !== 'no' && normalized !== 'on' && normalized !== 'off') {
        throw new TypeError('Titonic toggle values must be one of yes, no, on, or off.');
      }
      return normalized;
    }
    case 'hex':
      return input.startsWith('#') ? input : `#${input}`;
    case 'radix':
      return input.startsWith('%') ? input : `%${input}`;
    case 'encoding':
      return input.startsWith('&') ? input : `&${input}`;
    case 'separator':
      return input.startsWith('^') ? input : `^${input}`;
    case 'sansa':
      parseAddressOrThrow(input);
      return input;
    case 'date':
    case 'datetime':
    case 'wtc':
    case 'time':
      return input;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function nativeValueFromRaw(kind: TitonicNativeScalarKind, raw: string): string {
  switch (kind) {
    case 'hex':
    case 'radix':
    case 'encoding':
    case 'separator':
      return raw.slice(1);
    case 'sansa':
      return parseAddressOrThrow(raw).canonical;
    case 'toggle':
    case 'date':
    case 'datetime':
    case 'wtc':
    case 'time':
      return raw;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function createTitonicFromAeon(
  input: string,
  options: TitonicCreateOptions = {},
): TitonicObject {
  const compileResult = compile(input, {
    datatypePolicy: 'allow_custom',
    ...(options.maxAttributeDepth === undefined ? {} : { maxAttributeDepth: options.maxAttributeDepth }),
  });

  if (compileResult.errors.length > 0) {
    throw new Error(
      `Titonic compile failed with ${compileResult.errors.length} error(s):\n${compileResult.errors
        .map((error) => `${error.code}: ${error.message ?? error.name}`)
        .join('\n')}`,
    );
  }

  const modeField = compileResult.header?.fields.get('mode');
  const strictMode = modeField?.type === 'StringLiteral' && modeField.value === 'strict';
  if ((options.requireStrictMode ?? true) && !strictMode) {
    throw new Error('Titonic currently requires an AEON document with aeon:mode = "strict".');
  }

  return createTitonicFromAes(compileResult.events, {
    ...options,
    requireStrictMode: false,
  });
}

export function createTitonicFromAes(
  aes: readonly AssignmentEvent[],
  options: TitonicCreateOptions = {},
): TitonicObject {
  const topLevel = aes.filter(isTopLevelEvent);
  const headerEvents = topLevel.filter((event) => isHeaderEvent(event));
  const strictMode = headerEvents.some(
    (event) =>
      event.key === 'aeon:mode' &&
      event.value.type === 'StringLiteral' &&
      event.value.value === 'strict',
  );

  if ((options.requireStrictMode ?? true) && !strictMode) {
    throw new Error('Titonic currently requires strict-mode AES (aeon:mode = "strict").');
  }

  const root: ObjectNode = {
    kind: 'object',
    properties: new Map(),
  };

  for (const event of topLevel) {
    if (isHeaderEvent(event)) {
      continue;
    }
    root.properties.set(event.key, nodeFromValue(event.value, event.datatype, event.annotations, undefined, event.structuralId ?? undefined));
  }

  return createController(root, headerEvents, strictMode).proxyFor(root) as TitonicObject;
}

export function isTitonic(value: unknown): value is TitonicObject {
  return !!value && typeof value === 'object' && controllerByProxy.has(value as object);
}

export function exportTitonicAes(value: TitonicObject): readonly AssignmentEvent[] {
  const controller = getController(value);
  return controller.exportAes();
}

export function exportTitonicAeon(
  value: TitonicObject,
  options: TitonicExportAeonOptions = {},
): string {
  return minimize(exportTitonicAes(value), {
    trailingNewline: options.trailingNewline ?? true,
  }).text;
}

export function resolveTitonicAddress(
  value: TitonicObject,
  addressInput: string | SansaAddress,
  options: TitonicResolveOptions = {},
): TitonicResolveResult {
  const controller = getController(value);
  const address = typeof addressInput === 'string' ? parseAddressOrThrow(addressInput) : addressInput;
  const diagnostics: TitonicResolveDiagnostic[] = [];
  let candidates: readonly TitonicResolveCandidate[];

  if (address.root.kind === 'contextual') {
    if (!options.contextPath) {
      return {
        address,
        exact: address.isExact,
        bindings: [],
        diagnostics: [{
          code: 'TITONIC_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT',
          message: 'Contextual SANSA roots require a Titonic contextPath.',
        }],
      };
    }
    const contextPath = normalizeTitonicPath(options.contextPath);
    candidates = [{
      path: contextPath,
      node: contextPath.length === 0 ? controller.root : resolvePathNodeForRead(controller, contextPath),
    }];
  } else {
    candidates = [{ path: [], node: controller.root }];
  }

  for (let index = 0; index < address.selectors.length; index += 1) {
    const selector = address.selectors[index]!;
    const step = resolveTitonicSelector(controller, candidates, selector, index);
    candidates = step.candidates;
    diagnostics.push(...step.diagnostics);
    if (diagnostics.length > 0 || candidates.length === 0) {
      break;
    }
  }

  return {
    address,
    exact: address.isExact,
    bindings: candidates.map((candidate) => bindingFromResolveCandidate(controller, candidate)),
    diagnostics,
  };
}

export function titonicAt(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
): TitonicCursor {
  const frozenPath = Object.freeze([...path]);
  return {
    path: frozenPath,
    get() {
      return getTitonicValue(value, frozenPath);
    },
    set(nextValue: unknown) {
      setTitonicValue(value, frozenPath, nextValue);
    },
    delete() {
      return deleteTitonicValue(value, frozenPath);
    },
    attributes: {
      get(key: string) {
        return getTitonicAttribute(value, frozenPath, key);
      },
      getAll() {
        return getTitonicAttributes(value, frozenPath);
      },
      set(key: string, attributeValue: unknown, options: { readonly datatype?: string } = {}) {
        setTitonicAttribute(value, frozenPath, key, attributeValue, options);
      },
      delete(key: string) {
        return deleteTitonicAttribute(value, frozenPath, key);
      },
      getAnnotation(key: string, annotationKey: string) {
        return getTitonicAttributeAnnotation(value, frozenPath, key, annotationKey);
      },
      getAnnotations(key: string) {
        return getTitonicAttributeAnnotations(value, frozenPath, key);
      },
      setAnnotation(
        key: string,
        annotationKey: string,
        annotationValue: unknown,
        options: { readonly datatype?: string } = {},
      ) {
        setTitonicAttributeAnnotation(value, frozenPath, key, annotationKey, annotationValue, options);
      },
      deleteAnnotation(key: string, annotationKey: string) {
        return deleteTitonicAttributeAnnotation(value, frozenPath, key, annotationKey);
      },
    },
  };
}

export function getTitonicValue(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
): TitonicValue {
  const controller = getController(value);
  const normalizedPath = normalizeTitonicPath(path);
  const node = normalizedPath.length === 0 ? controller.root : resolvePathNodeForRead(controller, normalizedPath);
  return controller.proxyFor(node);
}

export function setTitonicValue(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  nextValue: unknown,
): void {
  const normalizedPath = normalizeTitonicPath(path);
  if (normalizedPath.length === 0) {
    throw new Error('Titonic cannot replace the implicit root document object by path.');
  }
  const controller = getController(value);
  const parentPath = normalizedPath.slice(0, -1);
  const leaf = normalizedPath[normalizedPath.length - 1]!;
  const parent = resolvePathNodeForMutation(controller, parentPath);

  if (typeof leaf === 'object') {
    throw new Error('Titonic value path mutation does not support attribute path segments.');
  }

  if (typeof leaf === 'number') {
    if (parent.kind !== 'list' && parent.kind !== 'tuple') {
      throw new Error(`Titonic expected a list or tuple while setting ${formatReferencePathForError(normalizedPath)}.`);
    }
    if (leaf > parent.items.length) {
      throw new Error('Titonic does not support sparse list assignment by path.');
    }
    if (leaf === parent.items.length) {
      if (parent.kind === 'tuple') {
        throw new TypeError('Titonic tuples have fixed arity and do not support appending elements.');
      }
      parent.items.push(createListItemNode(nextValue, controller.strictMode));
      return;
    }
    const existing = parent.items[leaf]!;
    if (existing.kind === 'pointer-alias') {
      assignThroughPointerAlias(controller, existing, nextValue);
      return;
    }
    parent.items[leaf] = replaceListItemNode(existing, nextValue, controller);
    return;
  }

  if (parent.kind !== 'object') {
    throw new Error(`Titonic expected an object while setting ${formatReferencePathForError(normalizedPath)}.`);
  }
  const existing = parent.properties.get(leaf);
  if (existing?.kind === 'pointer-alias') {
    assignThroughPointerAlias(controller, existing, nextValue);
    return;
  }
  const nextNode = existing
    ? replaceNodeFromJsValue(existing, nextValue, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
        strictMode: controller.strictMode,
      }, controller)
    : createNodeFromJsValue(nextValue, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
        strictMode: controller.strictMode,
      });
  parent.properties.set(leaf, nextNode);
}

export function deleteTitonicValue(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
): boolean {
  const normalizedPath = normalizeTitonicPath(path);
  if (normalizedPath.length === 0) {
    throw new Error('Titonic cannot delete the implicit root document object by path.');
  }
  const controller = getController(value);
  const parentPath = normalizedPath.slice(0, -1);
  const leaf = normalizedPath[normalizedPath.length - 1]!;
  const parent = resolvePathNodeForMutation(controller, parentPath);

  if (typeof leaf === 'object') {
    throw new Error('Titonic value deletion does not support attribute path segments.');
  }

  if (typeof leaf === 'number') {
    if (parent.kind !== 'list' && parent.kind !== 'tuple') {
      throw new Error(`Titonic expected a list or tuple while deleting ${formatReferencePathForError(normalizedPath)}.`);
    }
    if (parent.kind === 'tuple') {
      throw new TypeError('Titonic tuples have fixed arity and do not support deletion.');
    }
    if (leaf < 0 || leaf >= parent.items.length) {
      return false;
    }
    parent.items.splice(leaf, 1);
    return true;
  }

  if (parent.kind !== 'object') {
    throw new Error(`Titonic expected an object while deleting ${formatReferencePathForError(normalizedPath)}.`);
  }
  return parent.properties.delete(leaf);
}

export function getTitonicAttributes(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
): ReadonlyMap<string, AttributeEntry> | undefined {
  const controller = getController(value);
  const node = resolvePathNodeForRead(controller, normalizeTitonicPath(path));
  return node.annotations;
}

export function getTitonicAttribute(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
): AttributeEntry | undefined {
  return getTitonicAttributes(value, path)?.get(key);
}

export function getTitonicAttributeAnnotations(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
): ReadonlyMap<string, AttributeEntry> | undefined {
  return getTitonicAttribute(value, path, key)?.annotations;
}

export function getTitonicAttributeAnnotation(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
  annotationKey: string,
): AttributeEntry | undefined {
  return getTitonicAttributeAnnotations(value, path, key)?.get(annotationKey);
}

export function setTitonicAttribute(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
  attributeValue: unknown,
  options: { readonly datatype?: string } = {},
): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Titonic attribute keys must be non-empty strings.');
  }
  const controller = getController(value);
  const normalizedPath = normalizeTitonicPath(path);
  const node = resolvePathNodeForMutation(controller, normalizedPath);
  const existing = node.annotations?.get(key);
  const next = createNodeFromJsValue(attributeValue, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
    strictMode: controller.strictMode,
  });
  const effective = preserveAttributeEntryMetadata(next, existing, options.datatype);
  const annotations = new Map(node.annotations ?? []);
  annotations.set(key, nodeToAttributeEntry(effective));
  node.annotations = annotations;
  delete (node as TitonicNode & { attributes?: readonly Attribute[] }).attributes;
}

export function deleteTitonicAttribute(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
): boolean {
  const controller = getController(value);
  const node = resolvePathNodeForMutation(controller, normalizeTitonicPath(path));
  if (!node.annotations?.has(key)) {
    return false;
  }
  const annotations = new Map(node.annotations);
  const deleted = annotations.delete(key);
  if (annotations.size > 0) {
    node.annotations = annotations;
  } else {
    delete (node as TitonicNode & { annotations?: ReadonlyMap<string, AttributeEntry> }).annotations;
  }
  delete (node as TitonicNode & { attributes?: readonly Attribute[] }).attributes;
  return deleted;
}

export function setTitonicAttributeAnnotation(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
  annotationKey: string,
  annotationValue: unknown,
  options: { readonly datatype?: string } = {},
): void {
  if (typeof annotationKey !== 'string' || annotationKey.length === 0) {
    throw new TypeError('Titonic attribute annotation keys must be non-empty strings.');
  }
  const controller = getController(value);
  const normalizedPath = normalizeTitonicPath(path);
  const node = resolvePathNodeForMutation(controller, normalizedPath);
  const annotations = new Map(node.annotations ?? []);
  const parent = annotations.get(key);
  if (!parent) {
    throw new Error(`Titonic attribute ${key} does not exist at ${formatReferencePathForError(normalizedPath)}.`);
  }
  const next = createNodeFromJsValue(annotationValue, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
    strictMode: controller.strictMode,
  });
  const nestedAnnotations = new Map(parent.annotations ?? []);
  const existing = nestedAnnotations.get(annotationKey);
  const effective = preserveAttributeEntryMetadata(next, existing, options.datatype);
  nestedAnnotations.set(annotationKey, nodeToAttributeEntry(effective));
  annotations.set(key, {
    ...parent,
    annotations: nestedAnnotations,
  });
  node.annotations = annotations;
  delete (node as TitonicNode & { attributes?: readonly Attribute[] }).attributes;
}

export function deleteTitonicAttributeAnnotation(
  value: TitonicObject,
  path: readonly TitonicPathSegment[],
  key: string,
  annotationKey: string,
): boolean {
  const controller = getController(value);
  const node = resolvePathNodeForMutation(controller, normalizeTitonicPath(path));
  const annotations = new Map(node.annotations ?? []);
  const parent = annotations.get(key);
  if (!parent?.annotations?.has(annotationKey)) {
    return false;
  }
  const nested = new Map(parent.annotations);
  const deleted = nested.delete(annotationKey);
  const { annotations: _previousNestedAnnotations, ...parentWithoutAnnotations } = parent;
  annotations.set(key, {
    ...parentWithoutAnnotations,
    ...(nested.size > 0 ? { annotations: nested } : {}),
  });
  node.annotations = annotations;
  delete (node as TitonicNode & { attributes?: readonly Attribute[] }).attributes;
  return deleted;
}

export function getTitonicNodeAttributes(
  value: TitonicElement,
): ReadonlyMap<string, AttributeEntry> | undefined {
  const node = getElementNode(value);
  return node.headAnnotations;
}

export function getTitonicNodeAttribute(
  value: TitonicElement,
  key: string,
): AttributeEntry | undefined {
  return getTitonicNodeAttributes(value)?.get(key);
}

export function getTitonicNodeAttributeAnnotations(
  value: TitonicElement,
  key: string,
): ReadonlyMap<string, AttributeEntry> | undefined {
  return getTitonicNodeAttribute(value, key)?.annotations;
}

export function getTitonicNodeAttributeAnnotation(
  value: TitonicElement,
  key: string,
  annotationKey: string,
): AttributeEntry | undefined {
  return getTitonicNodeAttributeAnnotations(value, key)?.get(annotationKey);
}

export function setTitonicNodeAttribute(
  value: TitonicElement,
  key: string,
  attributeValue: unknown,
  options: { readonly datatype?: string } = {},
): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Titonic node attribute keys must be non-empty strings.');
  }
  const controller = getControllerFromProxy(value as object);
  const node = nodeByProxy.get(value as object);
  if (!node || !shouldUseElementHandler(controller, node)) {
    throw new Error('Value is not a Titonic element.');
  }
  const element = getMutableElementNode(controller, node as ElementNode | CloneViewNode);
  const existing = element.headAnnotations?.get(key);
  const next = createNodeFromJsValue(attributeValue, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
    strictMode: controller.strictMode,
  });
  const effective = preserveAttributeEntryMetadata(next, existing, options.datatype);
  const annotations = new Map(element.headAnnotations ?? []);
  annotations.set(key, nodeToAttributeEntry(effective));
  element.headAnnotations = annotations;
  delete (element as ElementNode & { headAttributes?: readonly Attribute[] }).headAttributes;
}

export function deleteTitonicNodeAttribute(
  value: TitonicElement,
  key: string,
): boolean {
  const controller = getControllerFromProxy(value as object);
  const node = nodeByProxy.get(value as object);
  if (!node || !shouldUseElementHandler(controller, node)) {
    throw new Error('Value is not a Titonic element.');
  }
  const element = getMutableElementNode(controller, node as ElementNode | CloneViewNode);
  if (!element.headAnnotations?.has(key)) {
    return false;
  }
  const annotations = new Map(element.headAnnotations);
  const deleted = annotations.delete(key);
  if (annotations.size > 0) {
    element.headAnnotations = annotations;
  } else {
    delete (element as ElementNode & { headAnnotations?: ReadonlyMap<string, AttributeEntry> }).headAnnotations;
  }
  delete (element as ElementNode & { headAttributes?: readonly Attribute[] }).headAttributes;
  return deleted;
}

export function setTitonicNodeAttributeAnnotation(
  value: TitonicElement,
  key: string,
  annotationKey: string,
  annotationValue: unknown,
  options: { readonly datatype?: string } = {},
): void {
  if (typeof annotationKey !== 'string' || annotationKey.length === 0) {
    throw new TypeError('Titonic node attribute annotation keys must be non-empty strings.');
  }
  const controller = getControllerFromProxy(value as object);
  const node = nodeByProxy.get(value as object);
  if (!node || !shouldUseElementHandler(controller, node)) {
    throw new Error('Value is not a Titonic element.');
  }
  const element = getMutableElementNode(controller, node as ElementNode | CloneViewNode);
  const annotations = new Map(element.headAnnotations ?? []);
  const parent = annotations.get(key);
  if (!parent) {
    throw new Error(`Titonic node attribute ${key} does not exist.`);
  }
  const next = createNodeFromJsValue(annotationValue, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
    strictMode: controller.strictMode,
  });
  const nestedAnnotations = new Map(parent.annotations ?? []);
  const existing = nestedAnnotations.get(annotationKey);
  const effective = preserveAttributeEntryMetadata(next, existing, options.datatype);
  nestedAnnotations.set(annotationKey, nodeToAttributeEntry(effective));
  annotations.set(key, {
    ...parent,
    annotations: nestedAnnotations,
  });
  element.headAnnotations = annotations;
  delete (element as ElementNode & { headAttributes?: readonly Attribute[] }).headAttributes;
}

export function deleteTitonicNodeAttributeAnnotation(
  value: TitonicElement,
  key: string,
  annotationKey: string,
): boolean {
  const controller = getControllerFromProxy(value as object);
  const node = nodeByProxy.get(value as object);
  if (!node || !shouldUseElementHandler(controller, node)) {
    throw new Error('Value is not a Titonic element.');
  }
  const element = getMutableElementNode(controller, node as ElementNode | CloneViewNode);
  const annotations = new Map(element.headAnnotations ?? []);
  const parent = annotations.get(key);
  if (!parent?.annotations?.has(annotationKey)) {
    return false;
  }
  const nested = new Map(parent.annotations);
  const deleted = nested.delete(annotationKey);
  const { annotations: _previousNestedAnnotations, ...parentWithoutAnnotations } = parent;
  annotations.set(key, {
    ...parentWithoutAnnotations,
    ...(nested.size > 0 ? { annotations: nested } : {}),
  });
  element.headAnnotations = annotations;
  delete (element as ElementNode & { headAttributes?: readonly Attribute[] }).headAttributes;
  return deleted;
}

function getController(value: TitonicObject): TitonicController {
  const controller = controllerByProxy.get(value as object);
  if (!controller) {
    throw new Error('Value is not a Titonic document.');
  }
  return controller;
}

function getElementNode(value: TitonicElement): ElementNode {
  const node = nodeByProxy.get(value as object);
  if (!node) {
    throw new Error('Value is not a Titonic element.');
  }
  const controller = getControllerFromProxy(value as object);
  if (!shouldUseElementHandler(controller, node)) {
    throw new Error('Value is not a Titonic element.');
  }
  return resolveElementNode(controller, node as ElementNode | CloneViewNode);
}

function getControllerFromProxy(value: object): TitonicController {
  const controller = controllerByProxy.get(value);
  if (!controller) {
    throw new Error('Value is not a Titonic document node.');
  }
  return controller;
}

interface TitonicResolveCandidate {
  readonly path: readonly ReferencePathSegment[];
  readonly node: TitonicNode;
}

interface TitonicResolveSelectorResult {
  readonly candidates: readonly TitonicResolveCandidate[];
  readonly diagnostics: readonly TitonicResolveDiagnostic[];
}

function resolveTitonicSelector(
  controller: TitonicController,
  candidates: readonly TitonicResolveCandidate[],
  selector: SansaSelector,
  selectorIndex: number,
): TitonicResolveSelectorResult {
  switch (selector.type) {
    case 'member':
      return { candidates: resolveMemberSelector(controller, candidates, selector.name), diagnostics: [] };
    case 'position':
      return { candidates: resolvePositionSelector(controller, candidates, selector.index), diagnostics: [] };
    case 'positionRange':
      return { candidates: resolvePositionRangeSelector(controller, candidates, selector.start, selector.end), diagnostics: [] };
    case 'parent':
      return {
        candidates: candidates
          .filter((candidate) => candidate.path.length > 0)
          .map((candidate) => {
            const path = candidate.path.slice(0, -1);
            return { path, node: path.length === 0 ? controller.root : resolvePathNodeForRead(controller, path) };
          }),
        diagnostics: [],
      };
    case 'directExpansion':
      return { candidates: candidates.flatMap((candidate) => directTitonicChildren(controller, candidate)), diagnostics: [] };
    case 'descendantExpansion':
      return { candidates: candidates.flatMap((candidate) => descendantTitonicChildren(controller, candidate)), diagnostics: [] };
    case 'namePattern':
      return { candidates: resolveNamePatternSelector(controller, candidates, selector.pattern), diagnostics: [] };
    case 'semanticTypeFilter':
      return { candidates: candidates.filter((candidate) => matchesTitonicSemanticType(controller, candidate.node, selector.name)), diagnostics: [] };
    case 'representationKindFilter':
      return { candidates: candidates.filter((candidate) => representationKindForTitonicNode(candidate.node) === selector.name), diagnostics: [] };
    case 'attributeSpace':
      return {
        candidates: [],
        diagnostics: [{
          code: 'TITONIC_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE',
          message: 'Titonic SANSA Resolve does not support attribute-space selectors yet.',
          selectorIndex,
        }],
      };
    case 'localSpace':
      return {
        candidates: [],
        diagnostics: [{
          code: 'TITONIC_RESOLVE_UNSUPPORTED_LOCAL_SPACE',
          message: 'Titonic SANSA Resolve does not support local address-space selectors yet.',
          selectorIndex,
        }],
      };
    default: {
      const exhaustive: never = selector;
      return exhaustive;
    }
  }
}

function resolveMemberSelector(
  controller: TitonicController,
  candidates: readonly TitonicResolveCandidate[],
  name: string,
): readonly TitonicResolveCandidate[] {
  const matches: TitonicResolveCandidate[] = [];
  for (const candidate of candidates) {
    const node = resolveReadableTitonicNode(controller, candidate.node);
    if (node.kind !== 'object') {
      continue;
    }
    const child = node.properties.get(name);
    if (child) {
      matches.push({ path: [...candidate.path, name], node: child });
    }
  }
  return matches;
}

function resolvePositionSelector(
  controller: TitonicController,
  candidates: readonly TitonicResolveCandidate[],
  index: number,
): readonly TitonicResolveCandidate[] {
  const matches: TitonicResolveCandidate[] = [];
  for (const candidate of candidates) {
    const node = resolveReadableTitonicNode(controller, candidate.node);
    if (node.kind !== 'list' && node.kind !== 'tuple') {
      continue;
    }
    const child = node.items[index];
    if (child) {
      matches.push({ path: [...candidate.path, index], node: child });
    }
  }
  return matches;
}

function resolvePositionRangeSelector(
  controller: TitonicController,
  candidates: readonly TitonicResolveCandidate[],
  start: number | null,
  end: number | null,
): readonly TitonicResolveCandidate[] {
  const matches: TitonicResolveCandidate[] = [];
  for (const candidate of candidates) {
    const node = resolveReadableTitonicNode(controller, candidate.node);
    if (node.kind !== 'list' && node.kind !== 'tuple') continue;
    const first = start ?? 0;
    const last = Math.min(end ?? node.items.length - 1, node.items.length - 1);
    for (let index = first; index <= last; index += 1) {
      const child = node.items[index];
      if (child) matches.push({ path: [...candidate.path, index], node: child });
    }
  }
  return matches;
}

function resolveNamePatternSelector(
  controller: TitonicController,
  candidates: readonly TitonicResolveCandidate[],
  pattern: string,
): readonly TitonicResolveCandidate[] {
  const matcher = globPatternToRegExp(pattern);
  return candidates.flatMap((candidate) =>
    directTitonicChildren(controller, candidate).filter((child) => {
      const key = child.path[child.path.length - 1];
      return typeof key === 'string' && key !== ELEMENT_CHILDREN_SEGMENT && matcher.test(key);
    }),
  );
}

function directTitonicChildren(
  controller: TitonicController,
  candidate: TitonicResolveCandidate,
): readonly TitonicResolveCandidate[] {
  const node = resolveReadableTitonicNode(controller, candidate.node);
  if (node.kind === 'object') {
    return [...node.properties.entries()].map(([key, child]) => ({
      path: [...candidate.path, key],
      node: child,
    }));
  }
  if (node.kind === 'list' || node.kind === 'tuple') {
    return node.items.map((child, index) => ({
      path: [...candidate.path, index],
      node: child,
    }));
  }
  if (node.kind === 'element') {
    return node.children.items.map((child, index) => ({
      path: [...candidate.path, ELEMENT_CHILDREN_SEGMENT, index],
      node: child,
    }));
  }
  return [];
}

function descendantTitonicChildren(
  controller: TitonicController,
  candidate: TitonicResolveCandidate,
): readonly TitonicResolveCandidate[] {
  const children = directTitonicChildren(controller, candidate);
  return children.flatMap((child) => [child, ...descendantTitonicChildren(controller, child)]);
}

function matchesTitonicSemanticType(
  controller: TitonicController,
  node: TitonicNode,
  expected: string,
): boolean {
  const readable = resolveReadableTitonicNode(controller, node);
  const datatype = node.declaredDatatype ?? (readable.kind === 'element' ? readable.headDatatype : undefined);
  return datatype === expected || (datatype !== undefined && datatypeBaseName(datatype) === expected);
}

function resolveReadableTitonicNode(controller: TitonicController, node: TitonicNode): TitonicNode {
  if (node.kind === 'pointer-alias' || node.kind === 'clone-view') {
    return resolveAliasTarget(controller, node);
  }
  return node;
}

function bindingFromResolveCandidate(
  controller: TitonicController,
  candidate: TitonicResolveCandidate,
): TitonicResolvedBinding {
  return {
    path: publicTitonicPath(candidate.path),
    pathText: formatTitonicResolvePath(candidate.path),
    value: controller.proxyFor(resolveReadableTitonicNode(controller, candidate.node)),
    ...(candidate.node.declaredDatatype ? { datatype: candidate.node.declaredDatatype } : {}),
    representationKind: representationKindForTitonicNode(candidate.node),
  };
}

function publicTitonicPath(path: readonly ReferencePathSegment[]): readonly TitonicPathSegment[] {
  return Object.freeze(path.map((segment) => segment === ELEMENT_CHILDREN_SEGMENT ? TITONIC_CHILDREN : segment));
}

function representationKindForTitonicNode(node: TitonicNode): string {
  const type = nodeToAstValue(node).type;
  return `${type.charAt(0).toLowerCase()}${type.slice(1)}`;
}

function globPatternToRegExp(pattern: string): RegExp {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') {
      source += '.*';
    } else if (char === '?') {
      source += '.';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function formatTitonicResolvePath(path: readonly ReferencePathSegment[]): string {
  return formatReferencePathForError(path);
}

function createController(
  root: ObjectNode,
  headerEvents: readonly HeaderEvent[],
  strictMode: boolean,
): TitonicController {
  const controller: TitonicController = {
    root,
    headerEvents,
    strictMode,
    proxyFor(node: TitonicNode): TitonicValue {
      if (node.kind === 'scalar') {
        return node.value;
      }
      if (node.kind === 'pointer-alias') {
        return controller.proxyFor(controller.resolveNode(node.targetPath));
      }

      const existing = proxyByNode.get(node);
      if (existing) {
        return existing as TitonicValue;
      }

      const target = resolveProxyTarget(controller, node);
      const proxy = shouldUseListHandler(controller, node)
        ? new Proxy(target as unknown[], createListHandler(controller, node as ListNode | TupleNode | CloneViewNode))
        : shouldUseElementHandler(controller, node)
          ? new Proxy(target, createElementHandler(controller, node as ElementNode | CloneViewNode))
        : new Proxy(target, createObjectHandler(controller, node as ObjectNode | CloneViewNode));
      proxyByNode.set(node, proxy);
      controllerByProxy.set(proxy, controller);
      nodeByProxy.set(proxy, node);
      return proxy as TitonicValue;
    },
    exportAes(): readonly AssignmentEvent[] {
      const events = [...headerEvents];
      for (const [key, node] of root.properties) {
        emitNodeEvents(node, [{ type: 'root' }, { type: 'member', key }], key, events);
      }
      return events;
    },
    resolveNode(path: readonly ReferencePathSegment[]): TitonicNode {
      return resolveReferenceTarget(root, path);
    },
  };

  activeAliasController = controller;
  return controller;
}

function createObjectHandler(controller: TitonicController, node: ObjectNode | CloneViewNode): ProxyHandler<object> {
  return {
    get(_target, prop) {
      if (prop === 'toJSON') {
        return () => materializePlain(node);
      }
      if (prop === Symbol.toStringTag) {
        return 'TitonicObject';
      }
      if (typeof prop !== 'string') {
        return undefined;
      }
      if (prop === 'hasOwnProperty') {
        return (key: string) => getObjectProperties(controller, node).has(key);
      }
      const child = getObjectProperties(controller, node).get(prop);
      if (!child) {
        return undefined;
      }
      if (node.kind === 'clone-view' && !node.realized && isContainerNode(child)) {
        return controller.proxyFor(createDerivedCloneView(node, prop));
      }
      return controller.proxyFor(child);
    },
    set(_target, prop, value) {
      if (typeof prop !== 'string') {
        return false;
      }
      const properties = getMutableObjectProperties(controller, node);
      const existing = properties.get(prop);
      if (existing?.kind === 'pointer-alias') {
        assignThroughPointerAlias(controller, existing, value);
        return true;
      }
      const nextNode = existing
        ? replaceNodeFromJsValue(existing, value, {
            inferDatatypeForNewObjectMembers: true,
            inferDatatypeForListItems: false,
            strictMode: controller.strictMode,
          }, controller)
        : createNodeFromJsValue(value, {
            inferDatatypeForNewObjectMembers: true,
            inferDatatypeForListItems: false,
            strictMode: controller.strictMode,
          });
      properties.set(prop, nextNode);
      return true;
    },
    deleteProperty(_target, prop) {
      if (typeof prop !== 'string') {
        return false;
      }
      return getMutableObjectProperties(controller, node).delete(prop);
    },
    ownKeys() {
      return [...getObjectProperties(controller, node).keys()];
    },
    has(_target, prop) {
      return typeof prop === 'string' && getObjectProperties(controller, node).has(prop);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const properties = getObjectProperties(controller, node);
      if (typeof prop !== 'string' || !properties.has(prop)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: controller.proxyFor(properties.get(prop)!),
      };
    },
  };
}

function createElementHandler(controller: TitonicController, node: ElementNode | CloneViewNode): ProxyHandler<object> {
  return {
    get(_target, prop) {
      if (prop === 'toJSON') {
        return () => materializePlain(node);
      }
      if (prop === Symbol.toStringTag) {
        return 'TitonicElement';
      }
      const element = resolveElementNode(controller, node);
      if (prop === 'tag') {
        return element.tag;
      }
      if (prop === 'datatype') {
        return element.headDatatype;
      }
      if (prop === 'children') {
        if (node.kind === 'clone-view' && !node.realized) {
          return controller.proxyFor(createDerivedCloneView(node, ELEMENT_CHILDREN_SEGMENT)) as TitonicList;
        }
        return controller.proxyFor(resolveElementNode(controller, node).children);
      }
      if (prop === 'hasOwnProperty') {
        return (key: string) => key === 'tag' || key === 'datatype' || key === 'children';
      }
      return undefined;
    },
    set(_target, prop, value) {
      const element = getMutableElementNode(controller, node);
      if (prop === 'tag') {
        if (typeof value !== 'string' || value.length === 0) {
          throw new TypeError('Titonic element tags must be non-empty strings.');
        }
        element.tag = value;
        return true;
      }
      if (prop === 'datatype') {
        if (value !== undefined && value !== null && typeof value !== 'string') {
          throw new TypeError('Titonic element datatypes must be strings or undefined.');
        }
        if (value !== undefined && value !== null) {
          validateNodeHeadDatatype(value, controller.strictMode);
        }
        element.headDatatype = value == null ? undefined : value;
        return true;
      }
      if (prop === 'children') {
        if (!Array.isArray(value) && !isTitonicListValue(value) && !isTitonicTupleValue(value)) {
          throw new TypeError('Titonic element children must be assigned from an array-like Titonic sequence.');
        }
        element.children.items = Array.from(value as readonly unknown[]).map((entry) => createListItemNode(entry, controller.strictMode));
        return true;
      }
      return false;
    },
    ownKeys() {
      return ['tag', 'datatype', 'children'];
    },
    has(_target, prop) {
      return prop === 'tag' || prop === 'datatype' || prop === 'children';
    },
    getOwnPropertyDescriptor(_target, prop) {
      const element = resolveElementNode(controller, node);
      if (prop === 'tag') {
        return { configurable: true, enumerable: true, writable: true, value: element.tag };
      }
      if (prop === 'datatype') {
        return { configurable: true, enumerable: true, writable: true, value: element.headDatatype };
      }
      if (prop === 'children') {
        return { configurable: true, enumerable: true, writable: true, value: controller.proxyFor(element.children) };
      }
      return undefined;
    },
  };
}

function createListHandler(controller: TitonicController, node: ListNode | TupleNode | CloneViewNode): ProxyHandler<unknown[]> {
  return {
    get(_target, prop) {
      const items = getSequenceItems(controller, node);
      const isTuple = isTupleContainer(controller, node);
      if (prop === 'length') {
        return items.length;
      }
      if (prop === Symbol.toStringTag) {
        return isTuple ? 'TitonicTuple' : 'TitonicList';
      }
      if (prop === Symbol.iterator) {
        return function* iterator() {
          for (const item of items) {
            yield controller.proxyFor(item);
          }
        };
      }
      if (prop === 'toJSON') {
        return () => materializePlain(node);
      }
      if (prop === 'push') {
        return (...values: unknown[]) => {
          if (isTuple) {
            throw new TypeError('Titonic tuples have fixed arity and do not support push().');
          }
          const mutableItems = getMutableSequenceItems(controller, node);
          for (const value of values) {
            mutableItems.push(createListItemNode(value, controller.strictMode));
          }
          return mutableItems.length;
        };
      }
      if (prop === 'pop') {
        return () => {
          if (isTuple) {
            throw new TypeError('Titonic tuples have fixed arity and do not support pop().');
          }
          const removed = getMutableSequenceItems(controller, node).pop();
          return removed ? controller.proxyFor(removed) : undefined;
        };
      }
      if (prop === 'splice') {
        return (start: number, deleteCount?: number, ...values: unknown[]) => {
          if (isTuple) {
            throw new TypeError('Titonic tuples have fixed arity and do not support splice().');
          }
          const mutableItems = getMutableSequenceItems(controller, node);
          const normalizedStart = normalizeArrayIndex(start, mutableItems.length, true);
          const actualDeleteCount = deleteCount === undefined
            ? mutableItems.length - normalizedStart
            : Math.max(0, deleteCount);
          const inserted = values.map((value) => createListItemNode(value, controller.strictMode));
          const removed = mutableItems.splice(normalizedStart, actualDeleteCount, ...inserted);
          return removed.map((item) => controller.proxyFor(item));
        };
      }
      if (prop === 'at') {
        return (index: number) => {
          const normalized = index < 0 ? items.length + index : index;
          const item = items[normalized];
          return item ? controller.proxyFor(item) : undefined;
        };
      }
      if (prop === 'map') {
        return <T>(fn: (value: TitonicValue, index: number) => T) =>
          items.map((item, index) => fn(controller.proxyFor(item), index));
      }
      if (prop === 'forEach') {
        return (fn: (value: TitonicValue, index: number) => void) =>
          items.forEach((item, index) => fn(controller.proxyFor(item), index));
      }
      if (typeof prop === 'string' && isArrayIndex(prop)) {
        const index = Number(prop);
        const item = items[index];
        if (!item) {
          return undefined;
        }
        if (node.kind === 'clone-view' && !node.realized && isContainerNode(item)) {
          return controller.proxyFor(createDerivedCloneView(node, index));
        }
        return controller.proxyFor(item);
      }
      return undefined;
    },
    set(_target, prop, value) {
      const items = getMutableSequenceItems(controller, node);
      const isTuple = isTupleContainer(controller, node);
      if (prop === 'length') {
        if (isTuple) {
          throw new TypeError('Titonic tuples have fixed arity and do not support length changes.');
        }
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          throw new TypeError('Titonic list length must be set to a non-negative integer.');
        }
        if (value > items.length) {
          throw new TypeError('Titonic does not support creating sparse list holes by extending length.');
        }
        items.length = value;
        return true;
      }
      if (typeof prop !== 'string' || !isArrayIndex(prop)) {
        return false;
      }
      const index = Number(prop);
      if (index > items.length) {
        throw new TypeError('Titonic does not support sparse list assignment.');
      }
      if (index === items.length) {
        if (isTuple) {
          throw new TypeError('Titonic tuples have fixed arity and do not support appending elements.');
        }
        items.push(createListItemNode(value, controller.strictMode));
        return true;
      }
      const existing = items[index]!;
      if (existing.kind === 'pointer-alias') {
        assignThroughPointerAlias(controller, existing, value);
        return true;
      }
      items[index] = replaceListItemNode(existing, value, controller);
      return true;
    },
    deleteProperty(_target, prop) {
      if (typeof prop !== 'string' || !isArrayIndex(prop)) {
        return false;
      }
      if (isTupleContainer(controller, node)) {
        throw new TypeError('Titonic tuples have fixed arity and do not support deletion.');
      }
      getMutableSequenceItems(controller, node).splice(Number(prop), 1);
      return true;
    },
    ownKeys() {
      return [...getSequenceItems(controller, node).keys()].map(String).concat('length');
    },
    has(_target, prop) {
      if (prop === 'length') {
        return true;
      }
      return typeof prop === 'string' && isArrayIndex(prop) && Number(prop) < getSequenceItems(controller, node).length;
    },
    getOwnPropertyDescriptor(_target, prop) {
      const items = getSequenceItems(controller, node);
      if (prop === 'length') {
        return {
          configurable: false,
          enumerable: false,
          writable: true,
          value: items.length,
        };
      }
      if (typeof prop !== 'string' || !isArrayIndex(prop)) {
        return undefined;
      }
      const item = items[Number(prop)];
      if (!item) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: controller.proxyFor(item),
      };
    },
  };
}

function materializePlain(node: TitonicNode): TitonicValue {
  switch (node.kind) {
    case 'scalar':
      return node.value;
    case 'object': {
      const object: TitonicObject = {};
      for (const [key, child] of node.properties) {
        object[key] = materializePlain(child);
      }
      return object;
    }
    case 'list':
      return node.items.map((item) => materializePlain(item));
    case 'tuple':
      return node.items.map((item) => materializePlain(item)) as TitonicTuple;
    case 'element':
      return {
        tag: node.tag,
        ...(node.headDatatype ? { datatype: node.headDatatype } : {}),
        children: node.children.items.map((item) => materializePlain(item)),
      };
    case 'pointer-alias':
    case 'clone-view':
      return materializePlain(resolveAliasTarget(getAliasController(), node));
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

let activeAliasController: TitonicController | null = null;

function getAliasController(): TitonicController {
  if (!activeAliasController) {
    throw new Error('Titonic alias controller context was not set.');
  }
  return activeAliasController;
}

function nodeFromValue(
  value: Value,
  declaredDatatype: string | undefined,
  annotations?: ReadonlyMap<string, AttributeEntry>,
  attributes?: readonly Attribute[],
  structuralId?: string,
): TitonicNode {
  const metadata = nodeMetadata(declaredDatatype, annotations, attributes, structuralId);
  switch (value.type) {
    case 'TypedValue':
      return nodeFromValue(
        value.value,
        value.datatype ? formatDatatypeAnnotation(value.datatype) : declaredDatatype,
        buildAnnotationMap(value.attributes) ?? annotations,
        value.attributes.length > 0 ? value.attributes : attributes,
        value.structuralId ?? structuralId,
      );
    case 'StringLiteral':
      return createScalarNode('string', value.value, metadata);
    case 'NumberLiteral':
      return createScalarNode('number', Number(value.value), metadata);
    case 'BooleanLiteral':
      return createScalarNode('boolean', value.value, metadata);
    case 'NullLiteral':
      return createScalarNode('null', null, metadata);
    case 'InfinityLiteral':
      return createScalarNode('infinity', value.value === '-Infinity' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY, nodeMetadata(declaredDatatype ?? 'infinity', annotations, attributes));
    case 'NaNLiteral':
      return createScalarNode('nan', Number.NaN, nodeMetadata(declaredDatatype ?? 'nan', annotations, attributes));
    case 'ToggleLiteral':
      return createScalarNode('toggle', createNativeScalar('toggle', value.raw), metadata);
    case 'HexLiteral':
      return createScalarNode('hex', createNativeScalar('hex', value.raw), metadata);
    case 'RadixLiteral':
      return createScalarNode('radix', createNativeScalar('radix', value.raw), metadata);
    case 'EncodingLiteral':
      return createScalarNode('encoding', createNativeScalar('encoding', value.raw), metadata);
    case 'SeparatorLiteral':
      return createScalarNode('separator', createNativeScalar('separator', value.raw), metadata);
    case 'SansaAddressLiteral':
      return createScalarNode('sansa', createNativeScalar('sansa', value.raw), metadata);
    case 'DateLiteral':
      return createScalarNode('date', createNativeScalar('date', value.raw), metadata);
    case 'DateTimeLiteral':
      return value.raw.includes('&') || datatypeBaseName(declaredDatatype ?? '') === 'wtc'
        ? createScalarNode('wtc', createNativeScalar('wtc', value.raw), metadata)
        : createScalarNode('datetime', createNativeScalar('datetime', value.raw), metadata);
    case 'TimeLiteral':
      return createScalarNode('time', createNativeScalar('time', value.raw), metadata);
    case 'ObjectNode': {
      const properties = new Map<string, TitonicNode>();
      for (const binding of value.bindings) {
        properties.set(binding.key, nodeFromBinding(binding));
      }
      return {
        kind: 'object',
        properties,
        ...metadata,
      };
    }
    case 'ListNode':
      return {
        kind: 'list',
        items: value.elements.map((element) => nodeFromValue(element, undefined)),
        ...metadata,
      };
    case 'TupleLiteral':
      return {
        kind: 'tuple',
        items: value.elements.map((element) => nodeFromValue(element, undefined)),
        ...metadata,
      };
    case 'NodeLiteral':
      const headAnnotations = buildAnnotationMap(value.attributes);
      return {
        kind: 'element',
        tag: value.tag,
        ...(value.structuralId ? { headStructuralId: value.structuralId } : {}),
        ...(value.datatype ? { headDatatype: formatDatatypeAnnotation(value.datatype) } : {}),
        ...(headAnnotations
          ? {
              headAnnotations,
              headAttributes: value.attributes,
            }
          : {}),
        children: {
          kind: 'list',
          items: value.children.map((child) => nodeFromValue(child, undefined)),
        },
        ...metadata,
      };
    case 'CloneReference':
      return {
        kind: 'clone-view',
        targetPath: value.path,
        ...metadata,
      };
    case 'PointerReference':
      return {
        kind: 'pointer-alias',
        targetPath: value.path,
        ...metadata,
      };
    default:
      {
        const exhaustive: never = value;
        return exhaustive;
      }
  }
}

function nodeFromBinding(binding: Binding): TitonicNode {
  return nodeFromValue(
    binding.value,
    binding.datatype ? formatDatatypeAnnotation(binding.datatype) : undefined,
    buildAnnotationMap(binding.attributes),
    binding.attributes,
    binding.structuralId ?? undefined,
  );
}

function createNodeFromJsValue(
  value: unknown,
  options: {
    readonly inferDatatypeForNewObjectMembers: boolean;
    readonly inferDatatypeForListItems: boolean;
    readonly strictMode?: boolean;
  },
): TitonicNode {
  if (value === null) {
    return createScalarNode('null', null, nodeMetadata(options.inferDatatypeForNewObjectMembers || options.inferDatatypeForListItems ? inferDeclaredDatatype('null', options) : undefined));
  }
  if (typeof value === 'string') {
    return createScalarNode('string', value, nodeMetadata(inferDeclaredDatatype('string', options)));
  }
  if (typeof value === 'boolean') {
    return createScalarNode('boolean', value, nodeMetadata(inferDeclaredDatatype('boolean', options)));
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new TypeError('Titonic cannot infer NaN for a new value without an explicit nan datatype.');
    }
    if (!Number.isFinite(value)) {
      throw new TypeError('Titonic cannot infer Infinity for a new value without an explicit infinity datatype.');
    }
    return createScalarNode('number', value, nodeMetadata(inferDeclaredDatatype('number', options)));
  }
  if (isTitonicNativeScalar(value)) {
    return createScalarNode(value.kind, value, nodeMetadata(inferDeclaredDatatype(value.kind, options)));
  }
  if (isTitonicElementInit(value)) {
    if (value.datatype) {
      validateNodeHeadDatatype(value.datatype, options.strictMode ?? false);
    }
    return {
      kind: 'element',
      tag: value.tag,
      ...(value.datatype ? { headDatatype: value.datatype } : {}),
      children: {
        kind: 'list',
        items: value.children.map((item) => createListItemNode(item)),
      },
      ...(withDeclaredDatatype(options.inferDatatypeForNewObjectMembers ? 'node' : undefined)),
    };
  }
  if (Array.isArray(value)) {
    return {
      kind: 'list',
      items: value.map((item) => createNodeFromJsValue(item, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
        ...(options.strictMode !== undefined ? { strictMode: options.strictMode } : {}),
      })),
      ...(withDeclaredDatatype(inferDeclaredDatatype('list', options))),
    };
  }
  if (isTitonic(value)) {
    const sourceNode = nodeByProxy.get(value as object);
    if (!sourceNode) {
      throw new Error('Titonic proxy is missing internal node metadata.');
    }
    return cloneNode(sourceNode, options);
  }
  if (isPlainObject(value)) {
    const properties = new Map<string, TitonicNode>();
    for (const [key, entry] of Object.entries(value)) {
      properties.set(key, createNodeFromJsValue(entry, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
        ...(options.strictMode !== undefined ? { strictMode: options.strictMode } : {}),
      }));
    }
    return {
      kind: 'object',
      properties,
      ...(withDeclaredDatatype(inferDeclaredDatatype('object', options))),
    };
  }
  throw new TypeError(`Unsupported Titonic value: ${String(value)}`);
}

function replaceNodeFromJsValue(
  existing: TitonicNode,
  value: unknown,
  options: {
    readonly inferDatatypeForNewObjectMembers: boolean;
    readonly inferDatatypeForListItems: boolean;
    readonly strictMode?: boolean;
  },
  controller?: TitonicController,
): TitonicNode {
  if (existing.kind === 'clone-view') {
    const realized = realizeCloneNode(existing, controller);
    return replaceNodeFromJsValue(realized, value, options, controller);
  }
  if (existing.kind === 'pointer-alias') {
    if (!controller) {
      throw new Error('Titonic pointer assignment requires a controller.');
    }
    assignThroughPointerAlias(controller, existing, value);
    return existing;
  }
  validateJsValueAgainstNode(existing, value);
  if (existing.kind === 'tuple') {
    const created = createTupleNodeFromJsValue(value as readonly unknown[], options.strictMode);
    return preserveDeclaredDatatype(existing, created);
  }
  if (existing.kind === 'element') {
    const created = createNodeFromJsValue(value, options);
    if (created.kind !== 'element') {
      throw new TypeError('Titonic node fields can only be replaced with Titonic elements.');
    }
    return preserveDeclaredDatatype(existing, created);
  }
  const created = createNodeFromJsValue(value, options);
  return preserveDeclaredDatatype(existing, created);
}

function createListItemNode(value: unknown, strictMode?: boolean): TitonicNode {
  return stripDeclaredDatatype(createNodeFromJsValue(value, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
    ...(strictMode !== undefined ? { strictMode } : {}),
  }));
}

function createTupleNodeFromJsValue(values: readonly unknown[], strictMode?: boolean): TupleNode {
  return {
    kind: 'tuple',
    items: values.map((item) => createListItemNode(item, strictMode)),
  };
}

function replaceListItemNode(existing: TitonicNode, value: unknown, controller: TitonicController): TitonicNode {
  if (existing.kind === 'clone-view') {
    const realized = realizeCloneNode(existing, controller);
    return replaceListItemNode(realized, value, controller);
  }
  if (existing.kind === 'pointer-alias') {
    assignThroughPointerAlias(controller, existing, value);
    return existing;
  }
  validateJsValueAgainstNode(existing, value);
  const created = createListItemNode(value, controller.strictMode);
  return preserveDeclaredDatatype(existing, created);
}

function preserveDeclaredDatatype(existing: TitonicNode, created: TitonicNode): TitonicNode {
  if (!existing.declaredDatatype && !existing.annotations && !existing.attributes && !existing.structuralId) {
    return created;
  }
  return {
    ...created,
    ...nodeMetadata(existing.declaredDatatype, existing.annotations, existing.attributes, existing.structuralId),
  } as TitonicNode;
}

function stripDeclaredDatatype(node: TitonicNode): TitonicNode {
  if (!node.declaredDatatype) {
    return node;
  }
  const clone = { ...node } as TitonicNode & { declaredDatatype?: string };
  delete clone.declaredDatatype;
  return clone;
}

function validateJsValueAgainstNode(node: TitonicNode, value: unknown): void {
  switch (node.kind) {
    case 'scalar':
      validateScalarAssignment(node, value);
      return;
    case 'object':
      if (!isPlainObject(value) && !isTitonicObjectValue(value)) {
        throw new TypeError(`Titonic expected an object value for ${describeDatatype(node.declaredDatatype, 'object')}.`);
      }
      return;
    case 'list':
      if (!Array.isArray(value) && !isTitonicListValue(value)) {
        throw new TypeError(`Titonic expected a list value for ${describeDatatype(node.declaredDatatype, 'list')}.`);
      }
      return;
    case 'tuple':
      if (!Array.isArray(value) && !isTitonicTupleValue(value)) {
        throw new TypeError(`Titonic expected a tuple value for ${describeDatatype(node.declaredDatatype, 'tuple')}.`);
      }
      if ((value as readonly unknown[]).length !== node.items.length) {
        throw new TypeError(`Titonic tuples have fixed arity of ${node.items.length}.`);
      }
      return;
    case 'element':
      if (!isTitonicElement(value) && !isTitonicElementInit(value)) {
        throw new TypeError(`Titonic expected an element value for ${describeDatatype(node.declaredDatatype, 'node')}.`);
      }
      return;
    case 'pointer-alias':
    case 'clone-view':
      throw new TypeError('Reference nodes must be resolved before validation.');
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function validateScalarAssignment(node: ScalarNode, value: unknown): void {
  const expected = classifyDatatype(node.declaredDatatype) ?? node.scalarType;
  switch (expected) {
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
        throw new TypeError('Titonic number fields only accept finite numbers.');
      }
      return;
    case 'nan':
      if (!(typeof value === 'number' && Number.isNaN(value))) {
        throw new TypeError('Titonic nan fields only accept NaN.');
      }
      return;
    case 'infinity':
      if (typeof value !== 'number' || Number.isFinite(value) || Number.isNaN(value)) {
        throw new TypeError('Titonic infinity fields only accept Infinity or -Infinity.');
      }
      return;
    case 'string':
      if (typeof value !== 'string') {
        throw new TypeError('Titonic string fields only accept strings.');
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new TypeError('Titonic boolean fields only accept booleans.');
      }
      return;
    case 'null':
      if (value !== null) {
        throw new TypeError('Titonic null fields only accept null.');
      }
      return;
    case 'toggle':
    case 'hex':
    case 'radix':
    case 'encoding':
    case 'separator':
    case 'sansa':
    case 'date':
    case 'datetime':
    case 'wtc':
    case 'time':
      if (!isTitonicNativeScalar(value) || value.kind !== expected) {
        throw new TypeError(`Titonic ${expected} fields only accept titonic${capitalizeKind(expected)}() values.`);
      }
      return;
    default:
      throw new TypeError(`Titonic does not yet support assigning datatype ${expected}.`);
  }
}

function createScalarNode(
  scalarType: StrictDatatype,
  value: TitonicScalar,
  metadata: NodeMetadata,
): ScalarNode {
  return {
    kind: 'scalar',
    scalarType,
    value,
    ...metadata,
  };
}

function requireNativeScalar(node: ScalarNode, kind: TitonicNativeScalarKind): TitonicNativeScalar {
  if (!isTitonicNativeScalar(node.value) || node.value.kind !== kind) {
    throw new Error(`Titonic scalar node expected native ${kind} value.`);
  }
  return node.value;
}

function capitalizeKind(kind: TitonicNativeScalarKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function emitNodeEvents(
  node: TitonicNode,
  path: readonly ({ readonly type: 'root' } | { readonly type: 'member'; readonly key: string } | { readonly type: 'index'; readonly index: number })[],
  key: string,
  out: AssignmentEvent[],
): void {
  const value = nodeToAstValue(node);
  out.push({
    path: { segments: [...path] },
    key,
    ...(node.structuralId ? { structuralId: node.structuralId } : {}),
    value,
    span: zeroSpan(),
    ...(node.declaredDatatype ? { datatype: node.declaredDatatype } : {}),
    ...(node.annotations && node.annotations.size > 0 ? { annotations: node.annotations } : {}),
  });

  if (node.kind === 'object') {
    for (const [childKey, child] of node.properties) {
      emitNodeEvents(child, [...path, { type: 'member', key: childKey }], childKey, out);
    }
  } else if (node.kind === 'list' || node.kind === 'tuple') {
    node.items.forEach((child, index) => {
      emitNodeEvents(child, [...path, { type: 'index', index }], String(index), out);
    });
  } else if (node.kind === 'element') {
    return;
  } else if (node.kind === 'pointer-alias' || (node.kind === 'clone-view' && !node.realized)) {
    return;
  } else if (node.kind === 'clone-view' && node.realized) {
    if (node.realized.kind === 'object') {
      for (const [childKey, child] of node.realized.properties) {
        emitNodeEvents(child, [...path, { type: 'member', key: childKey }], childKey, out);
      }
    } else if (node.realized.kind === 'list' || node.realized.kind === 'tuple') {
      node.realized.items.forEach((child, index) => {
        emitNodeEvents(child, [...path, { type: 'index', index }], String(index), out);
      });
    } else if (node.realized.kind === 'element') {
      return;
    }
  }
}

function nodeToAstValue(node: TitonicNode): Value {
  switch (node.kind) {
    case 'scalar':
      return scalarNodeToValue(node);
    case 'object':
      return {
        type: 'ObjectNode',
        bindings: [...node.properties.entries()].map(([key, child]) => ({
          type: 'Binding',
          key,
          structuralId: child.structuralId ?? null,
          value: nodeToAstValue(child),
          datatype: child.declaredDatatype ? datatypeFromName(child.declaredDatatype) : null,
          attributes: child.attributes ?? attributesFromAnnotationMap(child.annotations),
          span: zeroSpan(),
        })),
        attributes: [],
        span: zeroSpan(),
      };
    case 'list':
      return {
        type: 'ListNode',
        elements: node.items.map(nodeToAstHeadedValue),
        attributes: [],
        span: zeroSpan(),
      };
    case 'tuple':
      return {
        type: 'TupleLiteral',
        elements: node.items.map(nodeToAstHeadedValue),
        attributes: [],
        raw: `(${node.items.map(() => '').join(',')})`,
        span: zeroSpan(),
      };
    case 'element':
      return {
        type: 'NodeLiteral',
        tag: node.tag,
        structuralId: node.headStructuralId ?? null,
        attributes: node.headAttributes ?? attributesFromAnnotationMap(node.headAnnotations),
        datatype: node.headDatatype ? datatypeFromName(node.headDatatype) : null,
        children: node.children.items.map(nodeToAstHeadedValue),
        span: zeroSpan(),
      };
    case 'pointer-alias':
      return {
        type: 'PointerReference',
        path: node.targetPath,
        span: zeroSpan(),
      };
    case 'clone-view':
      if (node.realized) {
        return nodeToAstValue(node.realized);
      }
      return {
        type: 'CloneReference',
        path: node.targetPath,
        span: zeroSpan(),
      };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function nodeToAstHeadedValue(node: TitonicNode): Value {
  const value = nodeToAstValue(node);
  const attributes = node.attributes ?? attributesFromAnnotationMap(node.annotations);
  if (!node.structuralId && !node.declaredDatatype && attributes.length === 0) {
    return value;
  }
  return {
    type: 'TypedValue',
    structuralId: node.structuralId ?? null,
    datatype: node.declaredDatatype ? datatypeFromName(node.declaredDatatype) : null,
    attributes,
    value,
    span: zeroSpan(),
  };
}

function scalarNodeToValue(node: ScalarNode): Value {
  switch (node.scalarType) {
    case 'string':
      return {
        type: 'StringLiteral',
        value: node.value as string,
        raw: node.value as string,
        delimiter: '"',
        span: zeroSpan(),
      };
    case 'number':
      return {
        type: 'NumberLiteral',
        value: String(node.value),
        raw: String(node.value),
        span: zeroSpan(),
      };
    case 'boolean':
      return {
        type: 'BooleanLiteral',
        value: node.value as boolean,
        raw: String(node.value),
        span: zeroSpan(),
      };
    case 'null':
      return {
        type: 'NullLiteral',
        mode: 'reserved',
        value: 'none',
        raw: 'none',
        span: zeroSpan(),
      };
    case 'nan':
      return {
        type: 'NaNLiteral',
        value: Number.isNaN(node.value) ? 'NaN' : '-NaN',
        raw: Number.isNaN(node.value) ? 'NaN' : '-NaN',
        span: zeroSpan(),
      };
    case 'infinity':
      return {
        type: 'InfinityLiteral',
        value: (node.value as number) < 0 ? '-Infinity' : 'Infinity',
        raw: (node.value as number) < 0 ? '-Infinity' : 'Infinity',
        span: zeroSpan(),
      };
    case 'toggle': {
      const native = requireNativeScalar(node, 'toggle');
      return {
        type: 'ToggleLiteral',
        value: native.value as 'yes' | 'no' | 'on' | 'off',
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'hex': {
      const native = requireNativeScalar(node, 'hex');
      return {
        type: 'HexLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'radix': {
      const native = requireNativeScalar(node, 'radix');
      return {
        type: 'RadixLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'encoding': {
      const native = requireNativeScalar(node, 'encoding');
      return {
        type: 'EncodingLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'separator': {
      const native = requireNativeScalar(node, 'separator');
      return {
        type: 'SeparatorLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'sansa': {
      const native = requireNativeScalar(node, 'sansa');
      const address = parseAddressOrThrow(native.raw);
      return {
        type: 'SansaAddressLiteral',
        address,
        value: address.canonical,
        raw: native.raw,
        canonical: address.canonical,
        span: zeroSpan(),
      };
    }
    case 'date': {
      const native = requireNativeScalar(node, 'date');
      return {
        type: 'DateLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'datetime': {
      const native = requireNativeScalar(node, 'datetime');
      return {
        type: 'DateTimeLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'wtc': {
      const native = requireNativeScalar(node, 'wtc');
      return {
        type: 'DateTimeLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    case 'time': {
      const native = requireNativeScalar(node, 'time');
      return {
        type: 'TimeLiteral',
        value: native.value,
        raw: native.raw,
        span: zeroSpan(),
      };
    }
    default: {
      const exhaustive: never = node.scalarType;
      return exhaustive;
    }
  }
}

function nodeToAttributeEntry(node: TitonicNode): AttributeEntry {
  return {
    value: nodeToAstValue(node),
    ...(node.declaredDatatype ? { datatype: node.declaredDatatype } : {}),
    ...(node.annotations && node.annotations.size > 0 ? { annotations: node.annotations } : {}),
  };
}

function preserveAttributeEntryMetadata(
  node: TitonicNode,
  existing: AttributeEntry | undefined,
  nextDatatype: string | undefined,
): TitonicNode {
  const datatype = nextDatatype ?? existing?.datatype ?? node.declaredDatatype;
  const annotations = existing?.annotations ?? node.annotations;
  return {
    ...node,
    ...nodeMetadata(datatype, annotations, node.attributes, node.structuralId),
  } as TitonicNode;
}

function inferDeclaredDatatype(
  datatype: StrictDatatype | ContainerDatatype,
  options: { readonly inferDatatypeForNewObjectMembers: boolean; readonly inferDatatypeForListItems: boolean },
): string | undefined {
  if (options.inferDatatypeForListItems) {
    return datatype;
  }
  if (options.inferDatatypeForNewObjectMembers) {
    return datatype === 'infinity' || datatype === 'nan' ? undefined : datatype;
  }
  return undefined;
}

function classifyDatatype(datatype: string | undefined): StrictDatatype | ContainerDatatype | undefined {
  if (!datatype) {
    return undefined;
  }
  const datatypeBase = datatypeBaseName(datatype);
  if (NUMERIC_DATATYPES.has(datatype)) return 'number';
  if (STRING_DATATYPES.has(datatype)) return 'string';
  if (BOOLEAN_DATATYPES.has(datatype)) return 'boolean';
  if (NULL_DATATYPES.has(datatype)) return 'null';
  if (OBJECT_DATATYPES.has(datatype)) return 'object';
  if (LIST_DATATYPES.has(datatype)) return 'list';
  if (NODE_DATATYPES.has(datatypeBase)) return 'node';
  if (NAN_DATATYPES.has(datatype)) return 'nan';
  if (INFINITY_DATATYPES.has(datatype)) return 'infinity';
  if (TOGGLE_DATATYPES.has(datatype)) return 'toggle';
  if (HEX_DATATYPES.has(datatype)) return 'hex';
  if (RADIX_DATATYPES.has(datatypeBase)) return 'radix';
  if (ENCODING_DATATYPES.has(datatypeBase)) return 'encoding';
  if (SEPARATOR_DATATYPES.has(datatypeBase)) return 'separator';
  if (SANSA_DATATYPES.has(datatypeBase)) return 'sansa';
  if (DATE_DATATYPES.has(datatypeBase)) return 'date';
  if (DATETIME_DATATYPES.has(datatypeBase)) return 'datetime';
  if (WTC_DATATYPES.has(datatypeBase)) return 'wtc';
  if (TIME_DATATYPES.has(datatypeBase)) return 'time';
  if (TUPLE_DATATYPES.has(datatypeBase)) return 'tuple';
  return undefined;
}

function datatypeBaseName(datatype: string): string {
  const genericCut = datatype.indexOf('<');
  const separatorCut = datatype.indexOf('[');
  const cut = [genericCut, separatorCut].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return (cut === undefined ? datatype : datatype.slice(0, cut)).trim();
}

function validateNodeHeadDatatype(datatype: string, strictMode: boolean): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(datatype)) {
    throw new TypeError('Titonic node head datatypes must be simple labels.');
  }
  if (strictMode && datatype.toLowerCase() !== 'node') {
    throw new TypeError('Titonic strict-mode node heads only accept datatype "node".');
  }
}

function cloneNode(
  node: TitonicNode,
  options: { readonly inferDatatypeForNewObjectMembers: boolean; readonly inferDatatypeForListItems: boolean },
): TitonicNode {
  if (node.kind === 'scalar') {
    return {
      kind: 'scalar',
      scalarType: node.scalarType,
      value: node.value,
      ...nodeMetadata(node.declaredDatatype, node.annotations, node.attributes, node.structuralId),
    };
  }
  if (node.kind === 'object') {
    return {
      kind: 'object',
      properties: new Map(
        [...node.properties.entries()].map(([key, child]) => [key, cloneNode(child, {
          inferDatatypeForNewObjectMembers: true,
          inferDatatypeForListItems: false,
        })]),
      ),
      ...nodeMetadata(node.declaredDatatype, node.annotations, node.attributes, node.structuralId),
    };
  }
  if (node.kind === 'list') {
    return {
      kind: 'list',
      items: node.items.map((item) => cloneNode(item, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
      })),
      ...nodeMetadata(node.declaredDatatype, node.annotations, node.attributes, node.structuralId),
    };
  }
  if (node.kind === 'tuple') {
    return {
      kind: 'tuple',
      items: node.items.map((item) => cloneNode(item, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
      })),
      ...nodeMetadata(node.declaredDatatype, node.annotations, node.attributes, node.structuralId),
    };
  }
  if (node.kind === 'element') {
    return {
      kind: 'element',
      tag: node.tag,
      ...(node.headStructuralId ? { headStructuralId: node.headStructuralId } : {}),
      ...(node.headDatatype ? { headDatatype: node.headDatatype } : {}),
      ...(node.headAnnotations ? { headAnnotations: node.headAnnotations } : {}),
      ...(node.headAttributes ? { headAttributes: node.headAttributes } : {}),
      children: cloneNode(node.children, {
        inferDatatypeForNewObjectMembers: true,
        inferDatatypeForListItems: false,
      }) as ListNode,
      ...nodeMetadata(node.declaredDatatype, node.annotations, node.attributes, node.structuralId),
    };
  }
  return createNodeFromJsValue(materializePlain(node), options);
}

function datatypeFromName(name: string): TypeAnnotation {
  return {
    type: 'TypeAnnotation',
    name,
    genericArgs: [],
    clarifiers: [],
    span: zeroSpan(),
  };
}

function withDeclaredDatatype(declaredDatatype: string | undefined): { declaredDatatype?: string } {
  return declaredDatatype ? { declaredDatatype } : {};
}

function nodeMetadata(
  declaredDatatype: string | undefined,
  annotations?: ReadonlyMap<string, AttributeEntry>,
  attributes?: readonly Attribute[],
  structuralId?: string,
): NodeMetadata {
  return {
    ...(structuralId ? { structuralId } : {}),
    ...(declaredDatatype ? { declaredDatatype } : {}),
    ...(annotations && annotations.size > 0 ? { annotations } : {}),
    ...(attributes && attributes.length > 0 ? { attributes } : {}),
  };
}

function buildAnnotationMap(attributes: readonly Attribute[]): ReadonlyMap<string, AttributeEntry> | undefined {
  if (attributes.length === 0) {
    return undefined;
  }
  const result = new Map<string, AttributeEntry>();
  for (const attribute of attributes) {
    for (const [key, entry] of attribute.entries) {
      const nested = buildAnnotationMap(entry.attributes);
      const annotation: AttributeEntry = {
        ...(entry.structuralId ? { structuralId: entry.structuralId } : {}),
        value: entry.value,
        ...(entry.datatype ? { datatype: formatDatatypeAnnotation(entry.datatype) } : {}),
        ...(nested ? { annotations: nested } : {}),
      };
      result.set(key, annotation);
    }
  }
  return result.size > 0 ? result : undefined;
}

function attributesFromAnnotationMap(annotations: ReadonlyMap<string, AttributeEntry> | undefined): readonly Attribute[] {
  if (!annotations || annotations.size === 0) {
    return [];
  }
  return [{
    type: 'Attribute',
    entries: new Map([...annotations.entries()].map(([key, entry]) => [
      key,
      {
        structuralId: entry.structuralId ?? null,
        value: entry.value,
        datatype: entry.datatype ? datatypeFromName(entry.datatype) : null,
        attributes: attributesFromAnnotationMap(entry.annotations),
      },
    ])),
    span: zeroSpan(),
  }];
}

function formatDatatypeAnnotation(datatype: TypeAnnotation): string {
  const generics = datatype.genericArgs.length > 0 ? `<${datatype.genericArgs.join(', ')}>` : '';
  const clarifiers = datatype.clarifiers.length > 0
    ? `[${datatype.clarifiers.map((value) => typeof value === 'string' ? JSON.stringify(value) : String(value)).join(', ')}]`
    : '';
  return `${datatype.name}${generics}${clarifiers}`;
}

function isTopLevelEvent(event: AssignmentEvent): boolean {
  const head = event.path.segments[0];
  return head?.type === 'root' && event.path.segments.length === 2;
}

function isHeaderEvent(event: AssignmentEvent): boolean {
  return event.key.startsWith('aeon:');
}

function zeroSpan() {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isTitonicObjectValue(value: unknown): value is TitonicObject {
  return isTitonic(value);
}

function isTitonicListValue(value: unknown): value is TitonicList {
  return Array.isArray(value) && isTitonic(value);
}

function isTitonicTupleValue(value: unknown): value is TitonicTuple {
  return Array.isArray(value) && isTitonic(value);
}

function isTitonicElementInit(value: unknown): value is TitonicElementInit {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { readonly __titonicElementInit?: unknown }).__titonicElementInit === true
  );
}

function resolveProxyTarget(controller: TitonicController, node: TitonicNode): object {
  if (node.kind === 'list' || node.kind === 'tuple') {
    return [];
  }
  if (node.kind === 'element') {
    return {};
  }
  if (node.kind === 'clone-view') {
    const target = resolveAliasTarget(controller, node);
    return target.kind === 'list' || target.kind === 'tuple' ? [] : {};
  }
  return {};
}

function shouldUseListHandler(controller: TitonicController, node: TitonicNode): boolean {
  if (node.kind === 'list' || node.kind === 'tuple') {
    return true;
  }
  if (node.kind === 'clone-view') {
    const target = resolveAliasTarget(controller, node);
    return target.kind === 'list' || target.kind === 'tuple';
  }
  return false;
}

function shouldUseElementHandler(controller: TitonicController, node: TitonicNode): boolean {
  if (node.kind === 'element') {
    return true;
  }
  if (node.kind === 'clone-view') {
    const target = resolveAliasTarget(controller, node);
    return target.kind === 'element';
  }
  return false;
}

function getObjectProperties(controller: TitonicController, node: ObjectNode | CloneViewNode): Map<string, TitonicNode> {
  if (node.kind === 'object') {
    return node.properties;
  }
  const target = ensureCloneObjectTarget(controller, node);
  if (target.kind !== 'object') {
    throw new TypeError('Clone view target is not an object.');
  }
  return target.properties;
}

function getMutableObjectProperties(controller: TitonicController, node: ObjectNode | CloneViewNode): Map<string, TitonicNode> {
  if (node.kind === 'object') {
    return node.properties;
  }
  const realized = realizeCloneNode(node, controller);
  if (realized.kind !== 'object') {
    throw new TypeError('Clone view target is not an object.');
  }
  return realized.properties;
}

function getSequenceItems(controller: TitonicController, node: ListNode | TupleNode | CloneViewNode): TitonicNode[] {
  if (node.kind === 'list' || node.kind === 'tuple') {
    return node.items;
  }
  const target = ensureCloneSequenceTarget(controller, node);
  if (target.kind !== 'list' && target.kind !== 'tuple') {
    throw new TypeError('Clone view target is not a list or tuple.');
  }
  return target.items;
}

function getMutableSequenceItems(controller: TitonicController, node: ListNode | TupleNode | CloneViewNode): TitonicNode[] {
  if (node.kind === 'list' || node.kind === 'tuple') {
    return node.items;
  }
  const realized = realizeCloneNode(node, controller);
  if (realized.kind !== 'list' && realized.kind !== 'tuple') {
    throw new TypeError('Clone view target is not a list or tuple.');
  }
  return realized.items;
}

function resolveAliasTarget(controller: TitonicController, node: PointerAliasNode | CloneViewNode): TitonicNode {
  if (node.kind === 'clone-view' && node.realized) {
    return node.realized;
  }
  if (node.kind === 'clone-view' && node.rootClone && node.localPath) {
    if (node.rootClone.realized) {
      return resolveWithinNode(node.rootClone.realized, node.localPath);
    }
    return resolveWithinNode(controller.resolveNode(node.rootClone.targetPath), node.localPath);
  }
  return controller.resolveNode(node.targetPath);
}

function ensureCloneObjectTarget(controller: TitonicController, node: CloneViewNode): TitonicNode {
  const target = resolveAliasTarget(controller, node);
  if (target.kind === 'object') {
    return target;
  }
  if (target.kind === 'clone-view' || target.kind === 'pointer-alias') {
    return resolveAliasTarget(controller, target);
  }
  return target;
}

function ensureCloneSequenceTarget(controller: TitonicController, node: CloneViewNode): TitonicNode {
  const target = resolveAliasTarget(controller, node);
  if (target.kind === 'list' || target.kind === 'tuple') {
    return target;
  }
  if (target.kind === 'clone-view' || target.kind === 'pointer-alias') {
    return resolveAliasTarget(controller, target);
  }
  return target;
}

function isTupleContainer(controller: TitonicController, node: ListNode | TupleNode | CloneViewNode): boolean {
  if (node.kind === 'tuple') {
    return true;
  }
  if (node.kind === 'list') {
    return false;
  }
  const target = resolveAliasTarget(controller, node);
  return target.kind === 'tuple';
}

function resolveNodeKind(node: TitonicNode): TitonicNode['kind'] {
  return node.kind === 'clone-view' && node.realized ? node.realized.kind : node.kind;
}

function resolveElementNode(controller: TitonicController, node: ElementNode | CloneViewNode): ElementNode {
  if (node.kind === 'element') {
    return node;
  }
  const target = resolveAliasTarget(controller, node);
  if (target.kind !== 'element') {
    throw new TypeError('Titonic expected an element node.');
  }
  return target;
}

function getMutableElementNode(controller: TitonicController, node: ElementNode | CloneViewNode): ElementNode {
  if (node.kind === 'element') {
    return node;
  }
  const realized = realizeCloneNode(node, controller);
  if (realized.kind !== 'element') {
    throw new TypeError('Titonic expected an element node.');
  }
  return realized;
}

function realizeCloneNode(node: CloneViewNode, controller?: TitonicController): TitonicNode {
  if (node.realized) {
    return node.realized;
  }
  if (!controller) {
    throw new Error('Titonic clone realization requires a controller.');
  }
  if (node.rootClone && node.localPath) {
    const realizedRoot = realizeCloneNode(node.rootClone, controller);
    return resolveWithinNode(realizedRoot, node.localPath);
  }
  const target = controller.resolveNode(node.targetPath);
  const realized = stripDeclaredDatatype(cloneNode(target, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
  }));
  node.realized = preserveDeclaredDatatype(node, realized);
  return node.realized;
}

function createDerivedCloneView(parent: CloneViewNode, segment: ReferencePathSegment): CloneViewNode {
  return {
    kind: 'clone-view',
    targetPath: [...parent.targetPath, segment],
    rootClone: parent.rootClone ?? parent,
    localPath: [...(parent.localPath ?? []), segment],
  };
}

function resolvePathNodeForMutation(
  controller: TitonicController,
  path: readonly ReferencePathSegment[],
): TitonicNode & BaseNode {
  let current: TitonicNode = controller.root;
  for (const segment of path) {
    if (typeof segment === 'object') {
      throw new Error('Titonic reference attributes are not yet supported in path mutation.');
    }
    if (current.kind === 'pointer-alias') {
      current = controller.resolveNode(current.targetPath);
    } else if (current.kind === 'clone-view') {
      current = realizeCloneNode(current, controller);
    }
    if (segment === ELEMENT_CHILDREN_SEGMENT) {
      if (current.kind !== 'element') {
        throw new Error(`Titonic expected an element while resolving mutation path ${formatReferencePathForError(path)}.`);
      }
      current = current.children;
      continue;
    }
    if (typeof segment === 'number') {
      if (current.kind !== 'list' && current.kind !== 'tuple') {
        throw new Error(`Titonic expected a list or tuple while resolving mutation path ${formatReferencePathForError(path)}.`);
      }
      const next: TitonicNode | undefined = current.items[segment];
      if (!next) {
        throw new Error(`Titonic could not resolve mutation path ${formatReferencePathForError(path)}.`);
      }
      current = next;
      continue;
    }
    if (current.kind !== 'object') {
      throw new Error(`Titonic expected an object while resolving mutation path ${formatReferencePathForError(path)}.`);
    }
    const next = current.properties.get(segment);
    if (!next) {
      throw new Error(`Titonic could not resolve mutation path ${formatReferencePathForError(path)}.`);
    }
    current = next;
  }
  if (current.kind === 'pointer-alias') {
    current = controller.resolveNode(current.targetPath);
  } else if (current.kind === 'clone-view') {
    current = realizeCloneNode(current, controller);
  }
  return current as TitonicNode & BaseNode;
}

function normalizeTitonicPath(path: readonly TitonicPathSegment[]): readonly ReferencePathSegment[] {
  return path.map((segment) => isTitonicChildrenSegment(segment) ? ELEMENT_CHILDREN_SEGMENT : segment);
}

function resolvePathNodeForRead(
  controller: TitonicController,
  path: readonly ReferencePathSegment[],
): TitonicNode & BaseNode {
  let current: TitonicNode = controller.root;
  for (const segment of path) {
    if (typeof segment === 'object') {
      throw new Error('Titonic reference attributes are not yet supported in path reads.');
    }
    if (current.kind === 'pointer-alias' || current.kind === 'clone-view') {
      current = resolveAliasTarget(controller, current);
    }
    if (segment === ELEMENT_CHILDREN_SEGMENT) {
      if (current.kind !== 'element') {
        throw new Error(`Titonic expected an element while resolving read path ${formatReferencePathForError(path)}.`);
      }
      current = current.children;
      continue;
    }
    if (typeof segment === 'number') {
      if (current.kind !== 'list' && current.kind !== 'tuple') {
        throw new Error(`Titonic expected a list or tuple while resolving read path ${formatReferencePathForError(path)}.`);
      }
      const next: TitonicNode | undefined = current.items[segment];
      if (!next) {
        throw new Error(`Titonic could not resolve read path ${formatReferencePathForError(path)}.`);
      }
      current = next;
      continue;
    }
    if (current.kind !== 'object') {
      throw new Error(`Titonic expected an object while resolving read path ${formatReferencePathForError(path)}.`);
    }
    const next: TitonicNode | undefined = current.properties.get(segment);
    if (!next) {
      throw new Error(`Titonic could not resolve read path ${formatReferencePathForError(path)}.`);
    }
    current = next;
  }
  if (current.kind === 'pointer-alias' || current.kind === 'clone-view') {
    current = resolveAliasTarget(controller, current);
  }
  return current as TitonicNode & BaseNode;
}

function isTitonicChildrenSegment(segment: TitonicPathSegment): segment is TitonicChildrenSegment {
  return typeof segment === 'object' && segment !== null && 'type' in segment && segment.type === 'children';
}

function formatReferencePathForError(path: readonly ReferencePathSegment[]): string {
  if (path.length === 0) {
    return '$';
  }
  let result = '$';
  for (const segment of path) {
    if (segment === ELEMENT_CHILDREN_SEGMENT) {
      result += '.children';
      continue;
    }
    if (typeof segment === 'number') {
      result += `[${segment}]`;
      continue;
    }
    if (typeof segment === 'object') {
      result += /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.key)
        ? `.@.${segment.key}`
        : `.@.[${JSON.stringify(segment.key)}]`;
      continue;
    }
    result += /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)
      ? `.${segment}`
      : `.[${JSON.stringify(segment)}]`;
  }
  return result;
}

function isContainerNode(node: TitonicNode): node is ObjectNode | ListNode | TupleNode | ElementNode {
  return node.kind === 'object' || node.kind === 'list' || node.kind === 'tuple' || node.kind === 'element';
}

function resolveWithinNode(node: TitonicNode, path: readonly ReferencePathSegment[]): TitonicNode {
  let current = node;
  for (const segment of path) {
    if (typeof segment === 'object') {
      throw new Error('Titonic reference attributes are not yet supported.');
    }
    if (current.kind === 'pointer-alias' || current.kind === 'clone-view') {
      current = current.kind === 'clone-view' && current.realized
        ? current.realized
        : current;
    }
    if (segment === ELEMENT_CHILDREN_SEGMENT) {
      if (current.kind !== 'element') {
        throw new Error('Titonic expected an element while resolving a realized clone child-list path.');
      }
      current = current.children;
      continue;
    }
    if (typeof segment === 'number') {
      if (current.kind !== 'list' && current.kind !== 'tuple') {
        throw new Error('Titonic expected a list or tuple while resolving a realized clone path.');
      }
      const next = current.items[segment];
      if (!next) {
        throw new Error('Titonic could not resolve a realized clone list path.');
      }
      current = next;
      continue;
    }
    if (current.kind !== 'object') {
      throw new Error('Titonic expected an object while resolving a realized clone path.');
    }
    const next = current.properties.get(segment);
    if (!next) {
      throw new Error('Titonic could not resolve a realized clone member path.');
    }
    current = next;
  }
  return current;
}

function assignThroughPointerAlias(controller: TitonicController, alias: PointerAliasNode, value: unknown): void {
  const target = controller.resolveNode(alias.targetPath);
  if (target.kind === 'pointer-alias') {
    assignThroughPointerAlias(controller, target, value);
    return;
  }
  const replaced = replaceNodeFromJsValue(target, value, {
    inferDatatypeForNewObjectMembers: true,
    inferDatatypeForListItems: false,
    strictMode: controller.strictMode,
  }, controller);
  if (replaced !== target) {
    overwriteResolvedNode(controller.root, alias.targetPath, replaced);
  }
}

function resolveReferenceTarget(root: ObjectNode, path: readonly ReferencePathSegment[]): TitonicNode {
  let current: TitonicNode = root;
  for (const segment of path) {
    if (typeof segment === 'object') {
      throw new Error('Titonic reference attributes are not yet supported.');
    }
    if (current.kind === 'pointer-alias' || current.kind === 'clone-view') {
      current = resolveReferenceTarget(root, current.targetPath);
    }
    if (typeof segment === 'number') {
      if (current.kind !== 'list' && current.kind !== 'tuple') {
        throw new Error(`Titonic expected a list or tuple while resolving reference segment [${segment}].`);
      }
      const next: TitonicNode | undefined = current.items[segment];
      if (!next) {
        throw new Error(`Titonic could not resolve list index [${segment}] in reference.`);
      }
      current = next;
      continue;
    }
    if (current.kind !== 'object') {
      throw new Error(`Titonic expected an object while resolving reference segment ${segment}.`);
    }
      const next: TitonicNode | undefined = current.properties.get(segment);
    if (!next) {
      throw new Error(`Titonic could not resolve reference segment ${segment}.`);
    }
    current = next;
  }
  return current;
}

function overwriteResolvedNode(root: ObjectNode, path: readonly ReferencePathSegment[], nextNode: TitonicNode): void {
  if (path.length === 0) {
    throw new Error('Titonic cannot overwrite the implicit root document node.');
  }
  let current: TitonicNode = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    if (typeof segment === 'object') {
      throw new Error('Titonic reference attributes are not yet supported.');
    }
    if (current.kind === 'pointer-alias' || current.kind === 'clone-view') {
      current = resolveReferenceTarget(root, current.targetPath);
    }
    if (typeof segment === 'number') {
      if (current.kind !== 'list' && current.kind !== 'tuple') {
        throw new Error('Titonic expected a list or tuple while traversing a reference overwrite path.');
      }
      const next: TitonicNode | undefined = current.items[segment];
      if (!next) {
        throw new Error('Titonic could not traverse a reference overwrite path.');
      }
      current = next;
      continue;
    }
    if (current.kind !== 'object') {
      throw new Error('Titonic expected an object while traversing a reference overwrite path.');
    }
    const next: TitonicNode | undefined = current.properties.get(segment);
    if (!next) {
      throw new Error('Titonic could not traverse a reference overwrite path.');
    }
    current = next;
  }

  const leaf = path[path.length - 1]!;
  if (typeof leaf === 'object') {
    throw new Error('Titonic reference attributes are not yet supported.');
  }
  if (current.kind === 'pointer-alias' || current.kind === 'clone-view') {
    current = resolveReferenceTarget(root, current.targetPath);
  }
  if (typeof leaf === 'number') {
    if (current.kind !== 'list' && current.kind !== 'tuple') {
      throw new Error('Titonic expected a list or tuple while overwriting a reference target.');
    }
    current.items[leaf] = nextNode;
    return;
  }
  if (current.kind !== 'object') {
    throw new Error('Titonic expected an object while overwriting a reference target.');
  }
  current.properties.set(leaf, nextNode);
}

function isArrayIndex(prop: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(prop);
}

function normalizeArrayIndex(index: number, length: number, allowEnd: boolean): number {
  const normalized = index < 0 ? Math.max(length + index, 0) : index;
  return allowEnd ? Math.min(normalized, length) : Math.min(normalized, Math.max(length - 1, 0));
}

function describeDatatype(datatype: string | undefined, fallback: string): string {
  return datatype ? `datatype ${datatype}` : fallback;
}

export type { AssignmentEvent, ReferencePathSegment };
