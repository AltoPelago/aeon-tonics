import { buildAnnotations, type AssignmentEvent, type AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { formatDatatypeAnnotation } from '../../../../../aeon/implementations/typescript/packages/aes/dist/datatype.js';
import { formatReferenceTargetPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/reference-target.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type { Value } from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import { minimize, type MinimizeOptions, type MinimizeResult } from '../../../export/minizer/dist/index.js';

export interface StarterTonicBinding {
  readonly key: string;
  readonly structuralId?: string | null;
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
  readonly structuralId?: string;
  readonly datatype?: string;
  readonly annotations?: ReadonlyMap<string, AttributeEntry>;
}

interface BindingEvents {
  readonly head: AssignmentEvent;
  readonly descendants: AssignmentEvent[];
}

const start = { line: 1, column: 1, offset: 0 } as const;
const initialSpan = { start, end: start } as const;

export class StarterTonicDocument {
  readonly #headerEvents: readonly AssignmentEvent[];
  readonly #bindings: Map<string, BindingEvents>;

  constructor(
    headerEvents: readonly AssignmentEvent[] = [],
    bindingEvents: readonly AssignmentEvent[] = [],
  ) {
    this.#headerEvents = [...headerEvents];
    this.#bindings = groupBindings(bindingEvents.map((event) => withPlane(event, 'body')));
  }

  keys(): readonly string[] {
    return [...this.#bindings.keys()];
  }

  entries(): readonly StarterTonicBinding[] {
    return [...this.#bindings.values()].map(({ head }) => toBindingView(head));
  }

  has(key: string): boolean {
    return this.#bindings.has(key);
  }

  get(key: string): StarterTonicBinding | undefined {
    const head = this.#bindings.get(key)?.head;
    return head ? toBindingView(head) : undefined;
  }

  getValue(key: string): Value | undefined {
    return this.#bindings.get(key)?.head.value;
  }

  snapshot(): Readonly<Record<string, StarterSnapshotValue>> {
    const entries = [...this.#bindings].map(([key, { head }]) => [key, materializeValue(head.value)] as const);
    return Object.freeze(Object.fromEntries(entries));
  }

  set(key: string, value: unknown, options: StarterSetOptions = {}): void {
    this.setParsed(key, valueFromJs(value), options);
  }

  setParsed(key: string, value: Value, options: StarterSetOptions = {}): void {
    const next = new Map([...this.#bindings].map(([name, { head }]) => [name, head]));
    next.set(key, {
      key,
      path: { segments: [{ type: 'root' }, { type: 'member', key }] },
      sourcePlane: 'body',
      value,
      span: value.span,
      ...(options.structuralId !== undefined ? { structuralId: options.structuralId } : {}),
      ...(options.datatype !== undefined ? { datatype: options.datatype } : {}),
      ...(options.annotations !== undefined ? { annotations: options.annotations } : {}),
    });
    const source = renderDocument(this.#headerEvents, [...next.values()]).text;
    const result = compile(source, { datatypePolicy: 'allow_custom' });
    if (result.errors.length > 0) {
      throw new Error(
        `Starter tonic could not compile binding ${JSON.stringify(key)}.\n${describeErrors(result.errors)}`,
      );
    }
    const replacement = groupBindings(result.events, key).get(key);
    if (!replacement) {
      throw new Error(`Starter tonic could not compile binding ${JSON.stringify(key)}.`);
    }
    this.#bindings.set(key, replacement);
  }

  delete(key: string): boolean {
    return this.#bindings.delete(key);
  }

  exportAes(): readonly AssignmentEvent[] {
    const events = [...this.#headerEvents];
    for (const { head, descendants } of this.#bindings.values()) {
      events.push(head);
      for (const event of descendants) events.push(event);
    }
    return events;
  }
}

export function createStarterTonicFromAeon(input: string): StarterTonicDocument {
  const compileResult = compile(input, {
    datatypePolicy: 'allow_custom',
  });

  if (compileResult.errors.length > 0) {
    throw new Error(
      `Starter tonic compile failed with ${compileResult.errors.length} error(s):\n${describeErrors(compileResult.errors)}`,
    );
  }

  return createStarterTonicFromAes(compileResult.events);
}

export function createStarterTonicFromAes(aes: readonly AssignmentEvent[]): StarterTonicDocument {
  const { header, body } = partitionEvents(aes);
  return new StarterTonicDocument(header, body);
}

export function exportStarterTonicAes(document: StarterTonicDocument): readonly AssignmentEvent[] {
  return document.exportAes();
}

export function exportStarterTonicAeon(
  document: StarterTonicDocument,
  options: MinimizeOptions = {},
): MinimizeResult {
  const { header, body } = partitionEvents(document.exportAes());
  return renderDocument(header, body, options);
}

function renderDocument(
  header: readonly AssignmentEvent[],
  body: readonly AssignmentEvent[],
  options: MinimizeOptions = {},
): MinimizeResult {
  const fields = header.filter((event) => event.path.segments.length === 2);
  if (fields.every((event) =>
    /^aeon:[A-Za-z_][A-Za-z0-9_]*$/u.test(event.key) && event.key !== 'aeon:header'
    && !event.structuralId && !event.datatype && !event.annotations?.size
  )) {
    return minimize([...fields, ...body], options);
  }

  const bindings = fields.map((event): AssignmentEvent => {
    const key = event.key.replace(/^aeon:/u, '');
    return { ...event, key, sourcePlane: 'body', path: { segments: [{ type: 'root' }, { type: 'member', key }] } };
  });
  const headerText = `aeon:header={${minimize(bindings).text}}`;
  const bodyText = minimize(body).text;
  const text = bodyText ? `${headerText}\n${bodyText}` : headerText;
  return { text: options.trailingNewline ? `${text}\n` : text };
}

function toBindingView(event: AssignmentEvent): StarterTonicBinding {
  const { value } = event;
  const node = value.type === 'NodeLiteral' ? value : undefined;
  const structuralId = node?.structuralId ?? event.structuralId;
  const datatype = node?.datatype ? formatDatatypeAnnotation(node.datatype) : event.datatype;
  const annotations = event.annotations ?? (node?.attributes.length ? buildAnnotations(node.attributes) : undefined);
  return {
    key: event.key,
    value,
    ...(structuralId !== undefined ? { structuralId } : {}),
    ...(datatype ? { datatype } : {}),
    ...(annotations ? { annotations } : {}),
  };
}

function groupBindings(events: readonly AssignmentEvent[], targetKey?: string): Map<string, BindingEvents> {
  const groups = new Map<string, BindingEvents>();
  for (const event of events) {
    const [root, member] = event.path.segments;
    if (root?.type !== 'root' || member?.type !== 'member' || event.sourcePlane === 'header') continue;
    if (targetKey !== undefined && member.key !== targetKey) continue;
    if (event.path.segments.length === 2) {
      groups.set(member.key, { head: event, descendants: [] });
    } else {
      groups.get(member.key)?.descendants.push(event);
    }
  }
  return groups;
}

function partitionEvents(events: readonly AssignmentEvent[]): { header: AssignmentEvent[]; body: AssignmentEvent[] } {
  const header: AssignmentEvent[] = [];
  const body: AssignmentEvent[] = [];
  let rootKey: string | undefined;
  let rootPlane: 'header' | 'body' = 'body';
  for (const event of events) {
    const member = event.path.segments[1];
    const key = member?.type === 'member' ? member.key : undefined;
    const topLevel = event.path.segments.length === 2;
    const inferredPlane = key?.startsWith('aeon:') && (!topLevel || event.value.type !== 'NodeLiteral')
      ? 'header' : 'body';
    const plane: 'header' | 'body' = event.sourcePlane ?? (!topLevel && key === rootKey ? rootPlane : inferredPlane);
    if (topLevel) {
      rootKey = key;
      rootPlane = plane;
    }
    if (plane === 'header') {
      // Prefix-based grouping retains the original plane metadata.
      header.push(event);
    } else {
      body.push(withPlane(event, 'body'));
    }
  }
  return { header, body };
}

function withPlane(event: AssignmentEvent, sourcePlane: 'header' | 'body'): AssignmentEvent {
  return event.sourcePlane === undefined ? { ...event, sourcePlane } : event;
}

function describeErrors(errors: ReturnType<typeof compile>['errors']): string {
  return errors.map((error) => `${error.code}: ${error.message ?? error.name}`).join('\n');
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
    case 'SymbolicLiteral':
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
        path: formatReferenceTargetPath(value.path).replace(/^\$\.?/u, ''),
      });
    case 'PointerReference':
      return Object.freeze({
        kind: 'pointer',
        path: formatReferenceTargetPath(value.path).replace(/^\$\.?/u, ''),
      });
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function valueFromJs(value: unknown): Value {
  const span = initialSpan;
  if (value === null) {
    return { type: 'NullLiteral', mode: 'reserved', value: 'none', raw: '!none', span };
  }
  if (typeof value === 'string') {
    return { type: 'StringLiteral', value, raw: value, delimiter: '"', span };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Starter tonic set() only accepts finite JavaScript numbers. Use setParsed() for AEON infinity or NaN literals.');
    }
    const raw = String(value);
    return { type: 'NumberLiteral', value: raw, raw, span };
  }
  if (typeof value === 'boolean') {
    return { type: 'BooleanLiteral', value, raw: String(value), span };
  }
  if (Array.isArray(value)) {
    return { type: 'ListNode', attributes: [], elements: value.map(valueFromJs), span };
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const bindings = Object.entries(value).map(([key, entry]) => ({
      type: 'Binding' as const,
      key,
      structuralId: null,
      datatype: null,
      attributes: [],
      value: valueFromJs(entry),
      span,
    }));
    return { type: 'ObjectNode', attributes: [], bindings, span };
  }
  throw new TypeError('Starter tonic set() accepts only plain JS values. Use setParsed() for raw AEON values such as references or node literals.');
}
