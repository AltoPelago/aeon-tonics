import { formatPath, type AssignmentEvent, type AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { formatReferenceTargetPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/reference-target.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type {
  Attribute,
  AttributeValue,
  Binding,
  NodeLiteral,
  ObjectNode,
  ReferencePathSegment,
  TypeAnnotation,
  Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import { minimize } from '../../minizer/dist/index.js';

export type AeonModeConversionTarget = 'strict' | 'transport';

export interface ConvertAeonModeOptions {
  readonly target: AeonModeConversionTarget;
  readonly trailingNewline?: boolean;
  readonly preserveDatatypes?: readonly string[];
}

export interface ConvertAeonModeResult {
  readonly text: string;
}

const DEFAULT_PRESERVED_DATATYPES = new Set(['embed', 'inline', 'envelope']);
const FIXED_RADIX_DATATYPES = new Set(['radix2', 'radix6', 'radix8', 'radix12']);

interface InferenceContext {
  readonly pathToEvent: ReadonlyMap<string, AssignmentEvent>;
}

interface ReferenceResolutionContext {
  readonly value: Value;
  readonly annotations: ReadonlyMap<string, AttributeEntry> | undefined;
}

export function convertAeonMode(source: string, options: ConvertAeonModeOptions): ConvertAeonModeResult {
  const compiled = compile(source, {
    datatypePolicy: 'allow_custom',
    maxAttributeDepth: 8,
    maxGenericDepth: 8,
    maxSeparatorDepth: 8,
  });
  if (compiled.errors.length > 0) {
    const first = compiled.errors[0]!;
    throw new Error(first.message);
  }

  const preserve = new Set([
    ...DEFAULT_PRESERVED_DATATYPES,
    ...(options.preserveDatatypes ?? []),
  ].map((datatype) => datatype.toLowerCase()));
  const converted = convertEvents(compiled.events, options.target, preserve);
  return minimize(converted, options.trailingNewline === undefined ? {} : { trailingNewline: options.trailingNewline });
}

function convertEvents(
  events: readonly AssignmentEvent[],
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
): readonly AssignmentEvent[] {
  const inference = createInferenceContext(events);
  const converted = events
    .filter((event) => !isModeHeaderEvent(event))
    .map((event) => convertEvent(event, target, preserve, inference));
  return [createModeHeaderEvent(target, events[0]), ...converted];
}

function convertEvent(
  event: AssignmentEvent,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): AssignmentEvent {
  const datatype = convertDatatype(event.datatype, event.value, target, preserve, inference);
  const { datatype: _datatype, annotations: _annotations, ...base } = event;
  return {
    ...base,
    value: convertValue(event.value, target, preserve, false, inference),
    ...(datatype === undefined ? {} : { datatype }),
    ...(event.annotations ? { annotations: convertAnnotationMap(event.annotations, target, preserve, inference) } : {}),
  };
}

function convertValue(
  value: Value,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  anonymous: boolean,
  inference: InferenceContext,
): Value {
  switch (value.type) {
    case 'TypedValue': {
      const datatype = formatDatatype(value.datatype);
      const convertedInner = convertValue(value.value, target, preserve, false, inference);
      const attributes = convertAttributes(value.attributes, target, preserve, inference);
      if (target === 'transport' && !shouldPreserveDatatype(datatype, preserve)) {
        if (attributes.length === 0) {
          return convertedInner;
        }
        return { ...value, datatype: null, attributes, value: convertedInner };
      }
      const nextDatatype = target === 'strict'
        ? value.datatype ?? createTypeAnnotation(inferDatatype(convertedInner, inference), value)
        : value.datatype;
      return { ...value, datatype: nextDatatype, attributes, value: convertedInner };
    }
    case 'ObjectNode':
      return convertObjectNode(value, target, preserve, inference);
    case 'ListNode':
      return {
        ...value,
        elements: value.elements.map((element) => convertElementValue(element, target, preserve, inference)),
      };
    case 'TupleLiteral':
      return {
        ...value,
        elements: value.elements.map((element) => convertElementValue(element, target, preserve, inference)),
      };
    case 'NodeLiteral':
      return convertNodeLiteral(value, target, preserve, inference);
    case 'CloneReference':
    case 'PointerReference':
    case 'StringLiteral':
    case 'NumberLiteral':
    case 'InfinityLiteral':
    case 'NaNLiteral':
    case 'NullLiteral':
    case 'BooleanLiteral':
    case 'SwitchLiteral':
    case 'HexLiteral':
    case 'RadixLiteral':
    case 'EncodingLiteral':
    case 'SeparatorLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
      return target === 'strict' && anonymous
        ? createTypedValue(inferDatatype(value, inference), value)
        : value;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function convertElementValue(
  value: Value,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): Value {
  const converted = convertValue(value, target, preserve, true, inference);
  return target === 'strict' && converted.type !== 'TypedValue'
    ? createTypedValue(inferDatatype(converted, inference), converted)
    : converted;
}

function convertObjectNode(
  value: ObjectNode,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): ObjectNode {
  return {
    ...value,
    bindings: value.bindings.map((binding) => convertBinding(binding, target, preserve, inference)),
  };
}

function convertNodeLiteral(
  value: NodeLiteral,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): NodeLiteral {
  const currentDatatype = formatDatatype(value.datatype);
  const datatype = target === 'strict'
    ? value.datatype ?? createTypeAnnotation('node', value)
    : shouldPreserveDatatype(currentDatatype, preserve) ? value.datatype : null;
  return {
    ...value,
    datatype,
    attributes: convertAttributes(value.attributes, target, preserve, inference),
    children: value.children.map((child) => convertElementValue(child, target, preserve, inference)),
  };
}

function convertBinding(
  binding: Binding,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): Binding {
  const convertedValue = convertValue(binding.value, target, preserve, false, inference);
  const currentDatatype = formatDatatype(binding.datatype);
  const nextDatatype = convertTypeAnnotation(binding.datatype, convertedValue, target, preserve, inference);
  return {
    ...binding,
    value: convertedValue,
    attributes: convertAttributes(binding.attributes, target, preserve, inference),
    datatype: target === 'transport' && !shouldPreserveDatatype(currentDatatype, preserve)
      ? null
      : nextDatatype,
  };
}

function convertAttributes(
  attributes: readonly Attribute[],
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): readonly Attribute[] {
  return attributes.map((attribute) => ({
    ...attribute,
    entries: new Map([...attribute.entries.entries()].map(([key, entry]) => [
      key,
      convertAttributeValue(entry, target, preserve, inference),
    ])),
  }));
}

function convertAttributeValue(
  entry: AttributeValue,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): AttributeValue {
  const value = convertValue(entry.value, target, preserve, false, inference);
  const datatype = convertTypeAnnotation(entry.datatype, value, target, preserve, inference);
  return {
    ...entry,
    value,
    attributes: convertAttributes(entry.attributes, target, preserve, inference),
    datatype,
  };
}

function convertAnnotationMap(
  annotations: ReadonlyMap<string, AttributeEntry>,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): ReadonlyMap<string, AttributeEntry> {
  return new Map([...annotations.entries()].map(([key, entry]) => {
    const value = convertValue(entry.value, target, preserve, false, inference);
    const datatype = convertDatatype(entry.datatype, value, target, preserve, inference);
    const next: AttributeEntry = {
      value,
      ...(datatype === undefined ? {} : { datatype }),
      ...(entry.annotations ? { annotations: convertAnnotationMap(entry.annotations, target, preserve, inference) } : {}),
    };
    return [key, next];
  }));
}

function convertTypeAnnotation(
  datatype: TypeAnnotation | null,
  value: Value,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): TypeAnnotation | null {
  const current = formatDatatype(datatype);
  if (target === 'transport') {
    return shouldPreserveDatatype(current, preserve) ? datatype : null;
  }
  return datatype ?? createTypeAnnotation(inferDatatype(value, inference), value);
}

function convertDatatype(
  datatype: string | undefined,
  value: Value,
  target: AeonModeConversionTarget,
  preserve: ReadonlySet<string>,
  inference: InferenceContext,
): string | undefined {
  if (target === 'transport') {
    return shouldPreserveDatatype(datatype, preserve) ? datatype : undefined;
  }
  return datatype ?? inferDatatype(value, inference);
}

function inferDatatype(value: Value, inference?: InferenceContext, seenReferences: readonly string[] = []): string {
  switch (value.type) {
    case 'TypedValue':
      return value.datatype ? formatDatatype(value.datatype) : inferDatatype(value.value, inference, seenReferences);
    case 'StringLiteral':
      return value.trimticks ? 'trimtick' : 'string';
    case 'NumberLiteral':
      return 'number';
    case 'InfinityLiteral':
      return 'infinity';
    case 'NaNLiteral':
      return 'nan';
    case 'NullLiteral':
      return 'null';
    case 'BooleanLiteral':
      return 'boolean';
    case 'SwitchLiteral':
      return 'switch';
    case 'HexLiteral':
      return 'hex';
    case 'RadixLiteral':
      return 'radix';
    case 'EncodingLiteral':
      return 'encoding';
    case 'SeparatorLiteral':
      return 'sep';
    case 'DateLiteral':
      return 'date';
    case 'DateTimeLiteral':
      return 'datetime';
    case 'TimeLiteral':
      return 'time';
    case 'ObjectNode':
      return 'object';
    case 'ListNode':
      return 'list';
    case 'TupleLiteral':
      return 'tuple';
    case 'NodeLiteral':
      return 'node';
    case 'CloneReference':
    case 'PointerReference':
      return inferReferenceDatatype(value.path, inference, seenReferences) ?? 'ref';
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function inferReferenceDatatype(
  path: readonly ReferencePathSegment[],
  inference: InferenceContext | undefined,
  seenReferences: readonly string[],
): string | null {
  if (!inference) {
    return null;
  }

  const referencePath = formatReferenceTargetPath(path);
  if (seenReferences.includes(referencePath)) {
    return null;
  }

  const target = resolveReferenceValue(path, inference);
  return target ? inferDatatype(target, inference, [...seenReferences, referencePath]) : null;
}

function resolveReferenceValue(
  path: readonly ReferencePathSegment[],
  inference: InferenceContext,
): Value | null {
  for (let split = path.length; split >= 1; split--) {
    const prefix = path.slice(0, split);
    if (prefix.some(isReferenceAttrSegment)) {
      continue;
    }

    const event = inference.pathToEvent.get(formatReferenceTargetPath(prefix));
    if (!event) {
      continue;
    }

    return resolveReferenceSubpath(event.value, event.annotations, path.slice(split));
  }

  return null;
}

function resolveReferenceSubpath(
  value: Value,
  annotations: ReadonlyMap<string, AttributeEntry> | undefined,
  remainder: readonly ReferencePathSegment[],
): Value | null {
  let current: ReferenceResolutionContext | null = {
    value,
    annotations: selectAnnotations(annotations, value),
  };

  for (const segment of remainder) {
    if (!current) {
      return null;
    }

    if (isReferenceAttrSegment(segment)) {
      const annotations: ReadonlyMap<string, AttributeEntry> | undefined = current.annotations;
      const entry: AttributeEntry | undefined = annotations?.get(segment.key);
      current = entry
        ? {
            value: entry.value,
            annotations: entry.annotations ?? selectAnnotations(undefined, entry.value),
          }
        : null;
      continue;
    }

    const value = unwrapTypedValue(current.value);
    if (typeof segment === 'string') {
      if (value.type !== 'ObjectNode') {
        return null;
      }
      const binding = value.bindings.find((candidate) => candidate.key === segment);
      current = binding
        ? {
            value: binding.value,
            annotations: selectAnnotations(buildAnnotationMap(binding.attributes), binding.value),
          }
        : null;
      continue;
    }

    if (value.type !== 'ListNode' && value.type !== 'TupleLiteral') {
      return null;
    }
    const element = value.elements[segment];
    current = element
      ? {
          value: element,
          annotations: selectAnnotations(undefined, element),
        }
      : null;
  }

  return current?.value ?? null;
}

function unwrapTypedValue(value: Value): Value {
  return value.type === 'TypedValue' ? value.value : value;
}

function selectAnnotations(
  preferred: ReadonlyMap<string, AttributeEntry> | undefined,
  value: Value,
): ReadonlyMap<string, AttributeEntry> | undefined {
  if (preferred && preferred.size > 0) {
    return preferred;
  }
  if (value.type === 'TypedValue' && value.attributes.length > 0) {
    return buildAnnotationMap(value.attributes);
  }
  const unwrapped = unwrapTypedValue(value);
  if (
    unwrapped.type === 'ObjectNode'
    || unwrapped.type === 'ListNode'
    || unwrapped.type === 'TupleLiteral'
    || unwrapped.type === 'NodeLiteral'
  ) {
    return buildAnnotationMap(unwrapped.attributes);
  }
  return undefined;
}

function buildAnnotationMap(attributes: readonly Attribute[]): ReadonlyMap<string, AttributeEntry> | undefined {
  if (attributes.length === 0) {
    return undefined;
  }

  const entries = new Map<string, AttributeEntry>();
  for (const attribute of attributes) {
    for (const [key, entry] of attribute.entries) {
      const nested = buildAnnotationMap(entry.attributes);
      entries.set(key, {
        value: entry.value,
        ...(entry.datatype ? { datatype: formatDatatype(entry.datatype) } : {}),
        ...(nested ? { annotations: nested } : {}),
      });
    }
  }
  return entries;
}

function isReferenceAttrSegment(
  segment: ReferencePathSegment,
): segment is Extract<ReferencePathSegment, { readonly type: 'attr' }> {
  return typeof segment === 'object' && segment !== null && segment.type === 'attr';
}

function createInferenceContext(events: readonly AssignmentEvent[]): InferenceContext {
  return {
    pathToEvent: new Map(events.map((event) => [formatPath(event.path), event])),
  };
}

function shouldPreserveDatatype(datatype: string | undefined, preserve: ReadonlySet<string>): boolean {
  if (!datatype) {
    return false;
  }

  const base = datatypeBase(datatype).toLowerCase();
  return preserve.has(base) || FIXED_RADIX_DATATYPES.has(base) || hasDatatypeShape(datatype);
}

function datatypeBase(datatype: string): string {
  const generic = datatype.indexOf('<');
  const bracket = datatype.indexOf('[');
  const end = [generic, bracket]
    .filter((index) => index >= 0)
    .reduce((left, right) => Math.min(left, right), datatype.length);
  return datatype.slice(0, end);
}

function hasDatatypeShape(datatype: string): boolean {
  return datatype.includes('<') || datatype.includes('[');
}

function formatDatatype(datatype: TypeAnnotation | null): string {
  if (!datatype) {
    return '';
  }
  const generics = datatype.genericArgs.length > 0 ? `<${datatype.genericArgs.join(', ')}>` : '';
  const radixBase = datatype.radixBase != null ? `[${datatype.radixBase}]` : '';
  const separators = datatype.separators.map((separator) => `[${separator}]`).join('');
  return `${datatype.name}${generics}${radixBase}${separators}`;
}

function createTypeAnnotation(name: string, owner: { readonly span: TypeAnnotation['span'] }): TypeAnnotation {
  return {
    type: 'TypeAnnotation',
    name,
    genericArgs: [],
    radixBase: null,
    separators: [],
    span: owner.span,
  };
}

function createTypedValue(datatype: string, value: Value): Value {
  return {
    type: 'TypedValue',
    datatype: createTypeAnnotation(datatype, value),
    attributes: [],
    value,
    span: value.span,
  };
}

function isModeHeaderEvent(event: AssignmentEvent): boolean {
  const segment = event.path.segments[1];
  return event.path.segments.length === 2 && segment?.type === 'member' && segment.key === 'aeon:mode';
}

function createModeHeaderEvent(target: AeonModeConversionTarget, source: AssignmentEvent | undefined): AssignmentEvent {
  const span = source?.span ?? {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
  return {
    path: { segments: [{ type: 'root' }, { type: 'member', key: 'aeon:mode' }] },
    key: 'mode',
    span,
    value: {
      type: 'StringLiteral',
      value: target,
      raw: target,
      delimiter: '"',
      span,
    },
  };
}
