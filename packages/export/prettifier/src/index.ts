import type { AssignmentEvent, AttributeEntry } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type {
  Attribute,
  ReferencePathSegment,
  TypeAnnotation,
  Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';

export interface PrettifyOptions {
  readonly indent?: string;
  readonly trailingNewline?: boolean;
}

export interface PrettifyResult {
  readonly text: string;
}

interface RootMemberSegment {
  readonly type: 'member';
  readonly key: string;
}

interface RenderContext {
  readonly indent: string;
}

export function prettify(
  aes: readonly AssignmentEvent[],
  options: PrettifyOptions = {},
): PrettifyResult {
  const context = { indent: options.indent ?? '  ' };
  const topLevel = aes.filter(isTopLevelBinding);
  const text = topLevel
    .map((event) => renderTopLevelBinding(event, context))
    .join('\n');

  return {
    text: options.trailingNewline && text.length > 0 ? `${text}\n` : text,
  };
}

export function prettifyAeon(source: string, options: PrettifyOptions = {}): PrettifyResult {
  const compiled = compile(source);
  if (compiled.errors.length > 0) {
    const first = compiled.errors[0]!;
    throw new Error(first.message);
  }
  return prettify(compiled.events, options);
}

function isTopLevelBinding(event: AssignmentEvent): boolean {
  const segments = event.path.segments;
  const head = segments[0];
  const tail = segments[1];
  return segments.length === 2 && head?.type === 'root' && tail?.type === 'member';
}

function renderTopLevelBinding(event: AssignmentEvent, context: RenderContext): string {
  const segment = event.path.segments[1] as RootMemberSegment;
  const aeonShortcutHeader = segment.key.startsWith('aeon:');
  const key = aeonShortcutHeader ? segment.key : formatBindingKey(segment.key);
  const datatype = aeonShortcutHeader ? '' : renderEventDatatype(event.datatype);
  return `${key}${renderAnnotations(event.annotations, context, 0)}${datatype} = ${renderValue(event.value, context, 0)}`;
}

function renderValue(value: Value, context: RenderContext, depth: number): string {
  switch (value.type) {
    case 'TypedValue':
      return `${renderAttributes(value.attributes, context, depth)}${formatDatatype(value.datatype)} = ${renderValue(value.value, context, depth)}`;
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
      return renderObject(value, context, depth);
    case 'ListNode':
      return renderList(value, context, depth);
    case 'TupleLiteral':
      return `(${value.elements.map((element) => renderValue(element, context, depth)).join(', ')})`;
    case 'NodeLiteral':
      return renderNode(value, context, depth);
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

function renderObject(value: Extract<Value, { type: 'ObjectNode' }>, context: RenderContext, depth: number): string {
  if (value.bindings.length === 0) {
    return '{}';
  }
  const body = value.bindings
    .map((binding) => `${indent(context, depth + 1)}${renderBinding(binding.key, binding.value, binding.datatype, binding.attributes, context, depth + 1)}`)
    .join('\n');
  return `{\n${body}\n${indent(context, depth)}}`;
}

function renderList(value: Extract<Value, { type: 'ListNode' }>, context: RenderContext, depth: number): string {
  if (value.elements.length === 0) {
    return '[]';
  }
  if (value.elements.every(isInlineValue)) {
    return `[${value.elements.map((element) => renderValue(element, context, depth)).join(', ')}]`;
  }
  const body = value.elements
    .map((element) => `${indent(context, depth + 1)}${renderValue(element, context, depth + 1)}`)
    .join(',\n');
  return `[\n${body}\n${indent(context, depth)}]`;
}

function isInlineValue(value: Value): boolean {
  return value.type !== 'ObjectNode' && value.type !== 'ListNode' && value.type !== 'NodeLiteral';
}

function renderBinding(
  key: string,
  value: Value,
  datatype: TypeAnnotation | null,
  attributes: readonly Attribute[],
  context: RenderContext,
  depth: number,
): string {
  return `${formatBindingKey(key)}${renderAttributes(attributes, context, depth)}${formatDatatype(datatype)} = ${renderValue(value, context, depth)}`;
}

function renderNode(value: Extract<Value, { type: 'NodeLiteral' }>, context: RenderContext, depth: number): string {
  const attrs = renderAttributes(value.attributes, context, depth);
  const datatype = formatDatatype(value.datatype);
  if (value.children.length === 0) {
    return `<${formatBindingKey(value.tag)}${attrs}${datatype}>`;
  }
  if (value.children.every(isInlineValue)) {
    return `<${formatBindingKey(value.tag)}${attrs}${datatype}(${value.children.map((child) => renderValue(child, context, depth)).join(', ')})>`;
  }
  const children = value.children
    .map((child) => `${indent(context, depth + 1)}${renderValue(child, context, depth + 1)}`)
    .join(',\n');
  return `<${formatBindingKey(value.tag)}${attrs}${datatype}(\n${children}\n${indent(context, depth)})>`;
}

function renderAnnotations(
  annotations: ReadonlyMap<string, AttributeEntry> | undefined,
  context: RenderContext,
  depth: number,
): string {
  if (!annotations || annotations.size === 0) {
    return '';
  }

  const entries = [...annotations.entries()]
    .map(([key, entry]) => renderAttributeEntry(key, entry, context, depth))
    .join(', ');
  return `@{${entries}}`;
}

function renderAttributes(
  attributes: readonly Attribute[],
  context: RenderContext,
  depth: number,
): string {
  if (attributes.length === 0) {
    return '';
  }
  return attributes
    .map((attribute) => {
      const entries = [...attribute.entries.entries()]
        .map(([key, entry]) => {
          const nested = renderAttributes(entry.attributes, context, depth);
          return `${formatBindingKey(key)}${nested}${formatDatatype(entry.datatype)} = ${renderValue(entry.value, context, depth)}`;
        })
        .join(', ');
      return `@{${entries}}`;
    })
    .join('');
}

function renderAttributeEntry(key: string, entry: AttributeEntry, context: RenderContext, depth: number): string {
  return `${formatBindingKey(key)}${renderAnnotations(entry.annotations, context, depth)}${renderEventDatatype(entry.datatype)} = ${renderValue(entry.value, context, depth)}`;
}

function renderEventDatatype(datatype: string | undefined): string {
  return datatype ? `:${datatype}` : '';
}

function formatDatatype(
  datatype: TypeAnnotation | null,
): string {
  if (!datatype) {
    return '';
  }
  const generics = datatype.genericArgs.length > 0 ? `<${datatype.genericArgs.join(', ')}>` : '';
  const radixBase = datatype.radixBase != null ? `[${datatype.radixBase}]` : '';
  const separators = datatype.separators.length > 0
    ? datatype.separators.map((separator) => `[${separator}]`).join('')
    : '';
  return `:${datatype.name}${generics}${radixBase}${separators}`;
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
        ? `@${segment.key}`
        : `@["${escapeQuotedPathSegment(segment.key)}"]`;
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

function indent(context: RenderContext, depth: number): string {
  return context.indent.repeat(depth);
}
