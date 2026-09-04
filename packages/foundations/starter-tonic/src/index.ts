import type { AssignmentEvent, AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type {
  Attribute,
  ReferencePathSegment,
  TypeAnnotation,
  Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import { minimize, type MinimizeOptions, type MinimizeResult } from '../../../export/minizer/dist/index.js';

export interface StarterTonicBinding {
  readonly key: string;
  readonly datatype?: string;
  readonly annotations?: ReadonlyMap<string, AttributeEntry>;
  readonly value: Value;
}

export interface StarterReferenceValue {
  readonly kind: 'clone' | 'pointer';
  readonly path: string;
}

export interface StarterNodeValue {
  readonly kind: 'node';
  readonly tag: string;
  readonly datatype?: string;
  readonly children: readonly StarterSnapshotValue[];
}

export type StarterSnapshotValue =
  | string
  | number
  | boolean
  | null
  | StarterReferenceValue
  | StarterNodeValue
  | { readonly [key: string]: StarterSnapshotValue }
  | readonly StarterSnapshotValue[];

export interface StarterSetOptions {
  readonly datatype?: string;
  readonly annotations?: ReadonlyMap<string, AttributeEntry>;
}

export class StarterTonicDocument {
  readonly #headerEvents: readonly AssignmentEvent[];
  readonly #bindings = new Map<string, AssignmentEvent>();

  constructor(
    headerEvents: readonly AssignmentEvent[] = [],
    bindingEvents: readonly AssignmentEvent[] = [],
  ) {
    this.#headerEvents = [...headerEvents];
    for (const event of bindingEvents) {
      this.#bindings.set(event.key, event);
    }
  }

  keys(): readonly string[] {
    return [...this.#bindings.keys()];
  }

  entries(): readonly StarterTonicBinding[] {
    return [...this.#bindings.values()].map(toBindingView);
  }

  has(key: string): boolean {
    return this.#bindings.has(key);
  }

  get(key: string): StarterTonicBinding | undefined {
    const event = this.#bindings.get(key);
    return event ? toBindingView(event) : undefined;
  }

  getValue(key: string): Value | undefined {
    return this.#bindings.get(key)?.value;
  }

  snapshot(): Readonly<Record<string, StarterSnapshotValue>> {
    const entries = [...this.#bindings.values()].map((event) => [event.key, materializeValue(event.value)] as const);
    return Object.freeze(Object.fromEntries(entries));
  }

  set(key: string, value: unknown, options: StarterSetOptions = {}): void {
    const rendered = renderUnknownValue(value);
    this.#bindings.set(key, compileBindingSource(this.exportAes(), key, rendered, options));
  }

  setParsed(key: string, value: Value, options: StarterSetOptions = {}): void {
    this.#bindings.set(
      key,
      compileBindingSource(this.exportAes(), key, renderParsedValue(value), options),
    );
  }

  delete(key: string): boolean {
    return this.#bindings.delete(key);
  }

  exportAes(): readonly AssignmentEvent[] {
    return [...this.#headerEvents, ...this.#bindings.values()];
  }
}

export function createStarterTonicFromAeon(input: string): StarterTonicDocument {
  const compileResult = compile(input, {
    datatypePolicy: 'allow_custom',
  });

  if (compileResult.errors.length > 0) {
    throw new Error(
      `Starter tonic compile failed with ${compileResult.errors.length} error(s):\n${compileResult.errors
        .map((error) => `${error.code}: ${error.message ?? error.name}`)
        .join('\n')}`,
    );
  }

  return createStarterTonicFromAes(compileResult.events);
}

export function createStarterTonicFromAes(aes: readonly AssignmentEvent[]): StarterTonicDocument {
  const topLevel = aes.filter(isTopLevelBindingEvent);
  return new StarterTonicDocument(
    topLevel.filter(isHeaderEvent),
    topLevel.filter((event) => !isHeaderEvent(event)),
  );
}

export function exportStarterTonicAes(document: StarterTonicDocument): readonly AssignmentEvent[] {
  return document.exportAes();
}

export function exportStarterTonicAeon(
  document: StarterTonicDocument,
  options: MinimizeOptions = {},
): MinimizeResult {
  return minimize(document.exportAes(), options);
}

function toBindingView(event: AssignmentEvent): StarterTonicBinding {
  return {
    key: event.key,
    value: event.value,
    ...(event.datatype ? { datatype: event.datatype } : {}),
    ...(event.annotations ? { annotations: event.annotations } : {}),
  };
}

function isTopLevelBindingEvent(event: AssignmentEvent): boolean {
  const segments = event.path.segments;
  const head = segments[0];
  const tail = segments[1];
  return segments.length === 2 && head?.type === 'root' && tail?.type === 'member';
}

function isHeaderEvent(event: AssignmentEvent): boolean {
  return event.key.startsWith('aeon:');
}

function compileBindingSource(
  existingEvents: readonly AssignmentEvent[],
  key: string,
  renderedValue: string,
  options: StarterSetOptions,
): AssignmentEvent {
  const source = `${formatBindingKey(key)}${renderAnnotations(options.annotations)}${renderDatatype(options.datatype)}=${renderedValue}`;
  const existing = minimize(existingEvents).text;
  const compileInput = existing.length > 0 ? `${existing}\n${source}` : source;
  const compileResult = compile(compileInput, {
    datatypePolicy: 'allow_custom',
  });

  const topLevel = compileResult.events.filter(isTopLevelBindingEvent);
  const candidate = [...topLevel]
    .reverse()
    .find((event) => !isHeaderEvent(event) && event.key === key);

  if (compileResult.errors.length > 0 || !candidate) {
    throw new Error(
      `Starter tonic could not compile binding ${JSON.stringify(key)}.\n${compileResult.errors
        .map((error) => `${error.code}: ${error.message ?? error.name}`)
        .join('\n')}`,
    );
  }

  return candidate;
}

function materializeValue(value: Value): StarterSnapshotValue {
  switch (value.type) {
    case 'TypedValue':
      return materializeValue(value.value);
    case 'StringLiteral':
      return value.value;
    case 'NumberLiteral':
      return Number(value.value);
    case 'BooleanLiteral':
      return value.value;
    case 'NullLiteral':
      return null;
    case 'InfinityLiteral':
    case 'NaNLiteral':
    case 'ToggleLiteral':
    case 'HexLiteral':
    case 'RadixLiteral':
    case 'EncodingLiteral':
    case 'SeparatorLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
    case 'SansaAddressLiteral':
      return value.raw;
    case 'ObjectNode':
      return Object.freeze(
        Object.fromEntries(
          value.bindings.map((binding) => [binding.key, materializeValue(binding.value)] as const),
        ),
      );
    case 'ListNode':
      return Object.freeze(value.elements.map((element) => materializeValue(element)));
    case 'TupleLiteral':
      return Object.freeze(value.elements.map((element) => materializeValue(element)));
    case 'NodeLiteral':
      return Object.freeze({
        kind: 'node',
        tag: value.tag,
        ...(value.datatype ? { datatype: value.datatype.name } : {}),
        children: Object.freeze(value.children.map((child) => materializeValue(child))),
      });
    case 'CloneReference':
      return Object.freeze({
        kind: 'clone',
        path: formatReferencePath(value.path),
      });
    case 'PointerReference':
      return Object.freeze({
        kind: 'pointer',
        path: formatReferencePath(value.path),
      });
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function renderUnknownValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return formatString(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Starter tonic set() only accepts finite JavaScript numbers. Use setParsed() for AEON infinity or NaN literals.');
    }
    return `${value}`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => renderUnknownValue(entry)).join(', ')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.entries(value).map(([key, entry]) => `${formatBindingKey(key)}=${renderUnknownValue(entry)}`).join(', ')}}`;
  }
  throw new TypeError('Starter tonic set() accepts only plain JS values. Use setParsed() for raw AEON values such as references or node literals.');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function renderParsedValue(value: Value): string {
  switch (value.type) {
    case 'TypedValue':
      return `${renderAttributes(value.attributes)}${formatTypeAnnotation(value.datatype)}=${renderParsedValue(value.value)}`;
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
    case 'SansaAddressLiteral':
      return value.raw;
    case 'ObjectNode':
      return `{${value.bindings.map((binding) => renderBinding(binding.key, binding.value, binding.datatype, binding.attributes)).join(',')}}`;
    case 'ListNode':
      return `[${value.elements.map((element) => renderParsedValue(element)).join(',')}]`;
    case 'TupleLiteral':
      return `(${value.elements.map((element) => renderParsedValue(element)).join(',')})`;
    case 'NodeLiteral':
      return renderNode(value);
    case 'CloneReference':
      return `~${formatReferencePath(value.path)}`;
    case 'PointerReference':
      return `~>${formatReferencePath(value.path)}`;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function renderBinding(
  key: string,
  value: Value,
  datatype: TypeAnnotation | null,
  attributes: readonly Attribute[],
): string {
  return `${formatBindingKey(key)}${renderAttributes(attributes)}${formatTypeAnnotation(datatype)}=${renderParsedValue(value)}`;
}

function renderNode(value: Extract<Value, { type: 'NodeLiteral' }>): string {
  const attrs = renderAttributes(value.attributes);
  const datatype = formatTypeAnnotation(value.datatype);
  const children = value.children.length > 0
    ? `(${value.children.map((child) => renderParsedValue(child)).join(',')})`
    : '';
  return `<${formatBindingKey(value.tag)}${attrs}${datatype}${children}>`;
}

function renderAnnotations(annotations: ReadonlyMap<string, AttributeEntry> | undefined): string {
  if (!annotations || annotations.size === 0) {
    return '';
  }

  const entries = [...annotations.entries()]
    .map(([key, entry]) => renderAttributeEntry(key, entry))
    .join(',');
  return `@{${entries}}`;
}

function renderAttributes(attributes: readonly Attribute[]): string {
  if (attributes.length === 0) {
    return '';
  }
  return attributes
    .map((attribute) => {
      const entries = [...attribute.entries.entries()]
        .map(([key, entry]) => {
          const nested = renderAttributes(entry.attributes);
          return `${formatBindingKey(key)}${nested}${formatTypeAnnotation(entry.datatype)}=${renderParsedValue(entry.value)}`;
        })
        .join(',');
      return `@{${entries}}`;
    })
    .join('');
}

function renderAttributeEntry(key: string, entry: AttributeEntry): string {
  return `${formatBindingKey(key)}${renderAnnotations(entry.annotations)}${renderDatatype(entry.datatype)}=${renderParsedValue(entry.value)}`;
}

function renderDatatype(datatype: string | undefined): string {
  return datatype ? `:${datatype}` : '';
}

function formatTypeAnnotation(datatype: TypeAnnotation | null): string {
  if (!datatype) {
    return '';
  }
  const generics = datatype.genericArgs.length > 0 ? `<${datatype.genericArgs.join(', ')}>` : '';
  const clarifiers = datatype.clarifiers.length > 0
    ? `[${datatype.clarifiers.map((value) => typeof value === 'string' ? JSON.stringify(value) : String(value)).join(', ')}]`
    : '';
  return `:${datatype.name}${generics}${clarifiers}`;
}

function formatBindingKey(key: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : formatString(key);
}

function formatString(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case '\\':
        out += '\\\\';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\t':
        out += '\\t';
        break;
      default: {
        const code = ch.charCodeAt(0);
        out += code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
        break;
      }
    }
  }
  return `"${out}"`;
}

function formatReferencePath(path: readonly ReferencePathSegment[]): string {
  if (path.length === 0) {
    return '';
  }

  let result = '';
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!;
    if (typeof segment === 'number') {
      result += `[${segment}]`;
      continue;
    }
    if (typeof segment === 'object' && segment.type === 'attr') {
      result += /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(segment.key)
        ? `.@.${segment.key}`
        : `.@.["${escapeQuotedPathSegment(segment.key)}"]`;
      continue;
    }

    if (i > 0) {
      result += '.';
    }
    const member = segment as string;
    result += /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(member)
      ? member
      : `["${escapeQuotedPathSegment(member)}"]`;
  }
  return result;
}

function escapeQuotedPathSegment(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
