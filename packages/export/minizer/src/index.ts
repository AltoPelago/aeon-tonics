import { buildAnnotations, type AssignmentEvent, type AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import {
  formatClarifierValue,
  type Attribute,
  type ReferencePathSegment,
  type TypeAnnotation,
  type Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';

interface NodeHead {
  readonly structuralId?: string | null | undefined;
  readonly datatype?: string | undefined;
  readonly annotations?: ReadonlyMap<string, AttributeEntry> | undefined;
}

export interface MinimizeOptions {
  readonly trailingNewline?: boolean;
}

export interface MinimizeResult {
  readonly text: string;
}

interface RootMemberSegment {
  readonly type: 'member';
  readonly key: string;
}

export function minimize(
  aes: readonly AssignmentEvent[],
  options: MinimizeOptions = {},
): MinimizeResult {
  const topLevel = aes.filter(isTopLevelBinding);
  const text = topLevel
    .map((event) => renderTopLevelBinding(event))
    .join('\n');

  return {
    text: options.trailingNewline && text.length > 0 ? `${text}\n` : text,
  };
}

function isTopLevelBinding(event: AssignmentEvent): boolean {
  const segments = event.path.segments;
  const head = segments[0];
  const tail = segments[1];
  return segments.length === 2 && head?.type === 'root' && tail?.type === 'member';
}

function renderTopLevelBinding(event: AssignmentEvent): string {
  const segment = event.path.segments[1] as RootMemberSegment;
  if (event.value.type === 'NodeLiteral') return renderNode(event.value, segment.key, {
    structuralId: event.structuralId,
    datatype: renderDatatype(event.datatype),
    annotations: event.annotations,
  });
  const aeonShortcutHeader = event.sourcePlane === undefined
    ? segment.key.startsWith('aeon:') : event.sourcePlane === 'header';
  const structuralId = aeonShortcutHeader ? '' : renderStructuralIdentity(event.structuralId);
  const datatype = aeonShortcutHeader ? '' : renderDatatype(event.datatype);
  const key = aeonShortcutHeader ? segment.key : formatBindingKey(segment.key, datatype);
  return `${key}${structuralId}${renderAnnotations(event.annotations)}${datatype}=${renderValue(event.value)}`;
}

function renderValue(value: Value): string {
  switch (value.type) {
    case 'TypedValue':
      if (value.value.type === 'NodeLiteral') {
        const head = parserNodeHead(value.structuralId, value.datatype, value.attributes);
        return renderNode(value.value, value.value.tag, head);
      }
      return `${renderStructuralIdentity(value.structuralId)}${renderAttributes(value.attributes)}${formatDatatype(value.datatype)}=${renderValue(value.value)}`;
    case 'StringLiteral':
      return value.trimticks ? '>' + formatString(value.trimticks.rawValue, '`') : formatString(value.value);
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
    case 'SansaAddressLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
    case 'SymbolicLiteral':
      return value.raw;
    case 'ObjectNode':
      return `{${value.bindings.map((binding) => renderBinding(binding.key, binding.value, binding.datatype, binding.attributes, binding.structuralId)).join(',')}}`;
    case 'ListNode':
      return `[${value.elements.map((element) => renderValue(element)).join(',')}]`;
    case 'TupleLiteral':
      return `(${value.elements.map((element) => renderValue(element)).join(',')})`;
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
  structuralId: string | null,
): string {
  if (value.type === 'NodeLiteral') return renderNode(value, key, parserNodeHead(structuralId, datatype, attributes));
  const type = formatDatatype(datatype);
  return `${formatBindingKey(key, type)}${renderStructuralIdentity(structuralId)}${renderAttributes(attributes)}${type}=${renderValue(value)}`;
}

function renderNode(value: Extract<Value, { type: 'NodeLiteral' }>, key = value.tag, head?: NodeHead): string {
  if (key !== value.tag) {
    throw new Error(`Node tag ${JSON.stringify(value.tag)} must match its key ${JSON.stringify(key)}.`);
  }
  const nodeDatatype = formatDatatype(value.datatype);
  if (value.structuralId != null && head?.structuralId != null && value.structuralId !== head.structuralId) {
    throw new Error('Conflicting structural identities on an intrinsic node.');
  }
  if (nodeDatatype && head?.datatype && nodeDatatype !== head.datatype) {
    throw new Error('Conflicting datatypes on an intrinsic node.');
  }
  const structuralId = renderStructuralIdentity(value.structuralId ?? head?.structuralId);
  const datatype = nodeDatatype || head?.datatype || '';
  const attrs = renderNodeAttributes(value.attributes, head?.annotations);
  const children = value.children.length > 0
    ? `(${value.children.map((child) => renderValue(child)).join(',')})`
    : '';
  return `<${formatBindingKey(value.tag, datatype)}${structuralId}${attrs}${datatype}${children}>`;
}

function parserNodeHead(
  structuralId: string | null,
  datatype: TypeAnnotation | null,
  attributes: readonly Attribute[],
): NodeHead | undefined {
  if (!structuralId && !datatype && attributes.length === 0) return undefined;
  return { structuralId, datatype: formatDatatype(datatype), annotations: buildAnnotations(attributes) };
}

function renderNodeAttributes(
  attributes: readonly Attribute[],
  annotations: ReadonlyMap<string, AttributeEntry> | undefined,
): string {
  if (!annotations?.size) return renderAttributes(attributes);
  if (attributes.length === 0) return renderAnnotations(annotations);

  // Native event maps can repeat intrinsic attributes or supply binding attributes.
  const intrinsic = buildAnnotations(attributes);
  const additional = new Map<string, AttributeEntry>();
  for (const [key, entry] of annotations) {
    const existing = intrinsic.get(key);
    if (!existing) {
      additional.set(key, entry);
    } else if (!sameAnnotation(existing, entry)) {
      throw new Error(`Conflicting attribute ${JSON.stringify(key)} on an intrinsic node.`);
    }
  }
  if (additional.size === 0) return renderAttributes(attributes);
  for (const [key, entry] of intrinsic) additional.set(key, entry);
  return renderAnnotations(additional);
}

function sameAnnotation(left: AttributeEntry, right: AttributeEntry): boolean {
  if (left.value !== right.value && renderValue(left.value) !== renderValue(right.value)) return false;
  if ((left.structuralId ?? null) !== (right.structuralId ?? null)
    || left.datatype !== right.datatype || (left.annotations?.size ?? 0) !== (right.annotations?.size ?? 0)) return false;
  for (const [key, child] of left.annotations ?? []) {
    const counterpart = right.annotations?.get(key);
    if (!counterpart || !sameAnnotation(child, counterpart)) return false;
  }
  return true;
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

function renderAttributes(
  attributes: readonly Attribute[],
): string {
  if (attributes.length === 0) {
    return '';
  }
  return attributes
    .map((attribute) => {
      const entries = [...attribute.entries.entries()]
        .map(([key, entry]) => {
          if (entry.value.type === 'NodeLiteral') return renderNode(entry.value, key, parserNodeHead(entry.structuralId, entry.datatype, entry.attributes));
          const datatype = formatDatatype(entry.datatype);
          const nested = renderAttributes(entry.attributes);
          return `${formatBindingKey(key, datatype)}${renderStructuralIdentity(entry.structuralId)}${nested}${datatype}=${renderValue(entry.value)}`;
        })
        .join(',');
      return `@{${entries}}`;
    })
    .join('');
}

function renderAttributeEntry(key: string, entry: AttributeEntry): string {
  if (entry.value.type === 'NodeLiteral') return renderNode(entry.value, key, {
    structuralId: entry.structuralId,
    datatype: renderDatatype(entry.datatype),
    annotations: entry.annotations,
  });
  const datatype = renderDatatype(entry.datatype);
  return `${formatBindingKey(key, datatype)}${renderStructuralIdentity(entry.structuralId)}${renderAnnotations(entry.annotations)}${datatype}=${renderValue(entry.value)}`;
}

function renderDatatype(datatype: string | undefined): string {
  return datatype ? `:${datatype}` : '';
}

function formatDatatype(
  datatype: TypeAnnotation | null,
): string {
  if (!datatype) {
    return '';
  }
  const generics = datatype.genericArgs.length > 0 ? `<${datatype.genericArgs.join(', ')}>` : '';
  const clarifiers = datatype.clarifiers.length > 0
    ? `[${datatype.clarifiers.map(formatClarifierValue).join(', ')}]`
    : '';
  return `:${datatype.name}${generics}${clarifiers}`;
}

function renderStructuralIdentity(structuralId: string | null | undefined): string {
  return structuralId ? `\\${structuralId}\\` : '';
}

function formatBindingKey(key: string, datatype: string): string {
  // An adjacent aeon: is lexed as a header namespace.
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && (key !== 'aeon' || datatype === '') ? key : formatString(key);
}

function formatString(value: string, delimiter: '"' | '`' = '"'): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    switch (ch) {
      case '"':
      case '`':
        out += ch === delimiter ? '\\' + ch : ch;
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
  return delimiter + out + delimiter;
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
        : `.@.[${formatString(segment.key)}]`;
      continue;
    }

    if (i > 0) {
      result += '.';
    }
    const member = segment as string;
    result += /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(member)
      ? member
      : `[${formatString(member)}]`;
  }
  return result;
}
