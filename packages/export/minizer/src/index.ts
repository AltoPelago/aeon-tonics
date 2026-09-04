import type { AssignmentEvent, AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import type {
  Attribute,
  ReferencePathSegment,
  TypeAnnotation,
  Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';

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
  const aeonShortcutHeader = segment.key.startsWith('aeon:');
  const key = aeonShortcutHeader ? segment.key : formatBindingKey(segment.key);
  const structuralId = aeonShortcutHeader ? '' : renderStructuralIdentity(event.structuralId);
  const datatype = aeonShortcutHeader ? '' : renderDatatype(event.datatype);
  return `${key}${structuralId}${renderAnnotations(event.annotations)}${datatype}=${renderValue(event.value)}`;
}

function renderValue(value: Value): string {
  switch (value.type) {
    case 'TypedValue':
      return `${renderStructuralIdentity(value.structuralId)}${renderAttributes(value.attributes)}${formatDatatype(value.datatype)}=${renderValue(value.value)}`;
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
    case 'SansaAddressLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
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
  return `${formatBindingKey(key)}${renderStructuralIdentity(structuralId)}${renderAttributes(attributes)}${formatDatatype(datatype)}=${renderValue(value)}`;
}

function renderNode(value: Extract<Value, { type: 'NodeLiteral' }>): string {
  const attrs = renderAttributes(value.attributes);
  const datatype = formatDatatype(value.datatype);
  const children = value.children.length > 0
    ? `(${value.children.map((child) => renderValue(child)).join(',')})`
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
          const nested = renderAttributes(entry.attributes);
          return `${formatBindingKey(key)}${nested}${formatDatatype(entry.datatype)}=${renderValue(entry.value)}`;
        })
        .join(',');
      return `@{${entries}}`;
    })
    .join('');
}

function renderAttributeEntry(key: string, entry: AttributeEntry): string {
  return `${formatBindingKey(key)}${renderAnnotations(entry.annotations)}${renderDatatype(entry.datatype)}=${renderValue(entry.value)}`;
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
    ? `[${datatype.clarifiers.map((value) => typeof value === 'string' ? JSON.stringify(value) : String(value)).join(', ')}]`
    : '';
  return `:${datatype.name}${generics}${clarifiers}`;
}

function renderStructuralIdentity(structuralId: string | null | undefined): string {
  return structuralId ? `\\${structuralId}\\` : '';
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
