import { formatPath, type AssignmentEvent } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { compile, type AnnotationRecord } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { tokenize, TokenType, type Token } from '../../../../../aeon/implementations/typescript/packages/lexer/dist/index.js';
import { minimize } from '../../minizer/dist/index.js';

export type CompactCommentMode = 'semantic' | 'all' | 'none';

export interface CompactOptions {
  readonly comments?: CompactCommentMode;
  readonly trailingNewline?: boolean;
}

export interface CompactResult {
  readonly text: string;
}

interface PreservedComment {
  readonly raw: string;
  readonly offset: number;
  readonly form: 'line' | 'block';
  readonly targetPath?: string;
  readonly placement?: {
    readonly after?: CompactPlacementPart;
    readonly before?: CompactPlacementPart;
  };
}

type CompactPlacementPart = 'key' | 'attributes' | 'datatype-colon' | 'datatype' | 'equals' | 'value';

interface RenderedLandmark {
  readonly part: CompactPlacementPart;
  readonly start: number;
  readonly end: number;
}

export function compactAeon(source: string, options: CompactOptions = {}): CompactResult {
  const compiled = compile(source);
  if (compiled.errors.length > 0) {
    const first = compiled.errors[0]!;
    throw new Error(first.message);
  }
  return compactWithAnnotations(compiled.events, source, compiled.annotations ?? [], options);
}

export function compact(
  aes: readonly AssignmentEvent[],
  source: string,
  options: CompactOptions = {},
): CompactResult {
  const compiled = options.comments === 'none' ? undefined : compile(source);
  const annotations = compiled && compiled.errors.length === 0 ? compiled.annotations ?? [] : [];
  return compactWithAnnotations(aes, source, annotations, options);
}

function compactWithAnnotations(
  aes: readonly AssignmentEvent[],
  source: string,
  annotations: readonly AnnotationRecord[],
  options: CompactOptions = {},
): CompactResult {
  const topLevel = aes.filter(isTopLevelBinding);
  const comments = collectComments(source, annotations, options.comments ?? 'semantic');
  const lines: string[] = [];
  let commentIndex = 0;
  const used = new Set<number>();

  for (const event of topLevel) {
    const eventPath = formatPath(event.path);
    while (commentIndex < comments.length && comments[commentIndex]!.offset < event.span.start.offset) {
      if (used.has(commentIndex) || comments[commentIndex]!.targetPath === eventPath) {
        commentIndex += 1;
        continue;
      }
      lines.push(renderComment(comments[commentIndex]!.raw));
      commentIndex += 1;
    }

    const attached = comments
      .map((comment, index) => ({ comment, index }))
      .filter(({ comment }) => comment.targetPath === eventPath && comment.placement);
    const leading = attached.filter(({ comment }) => comment.placement?.before === 'key' && !comment.placement.after);
    for (const { comment, index } of leading) {
      lines.push(renderComment(comment.raw));
      used.add(index);
    }

    const rendered = minimize([event]).text;
    if (rendered.length > 0) {
      const placeable = attached.filter(({ index }) => !used.has(index));
      for (const { index } of placeable) {
        used.add(index);
      }
      lines.push(renderBindingWithComments(rendered, placeable.map(({ comment }) => comment)));
    }
  }

  while (commentIndex < comments.length) {
    if (used.has(commentIndex)) {
      commentIndex += 1;
      continue;
    }
    lines.push(renderComment(comments[commentIndex]!.raw));
    commentIndex += 1;
  }

  const text = lines.join('\n');
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

function collectComments(
  source: string,
  annotations: readonly AnnotationRecord[],
  mode: CompactCommentMode,
): readonly PreservedComment[] {
  if (mode === 'none') {
    return [];
  }

  const semantic = annotations
    .filter((annotation) => annotation.target.kind === 'path')
    .map((annotation) => {
      const comment: PreservedComment = {
        raw: annotation.raw,
        offset: annotation.span.start.offset,
        form: annotation.form,
        targetPath: annotation.target.kind === 'path' ? annotation.target.path : '',
        ...(annotation.placement ? { placement: annotation.placement } : {}),
      };
      return comment;
    });

  const lexed = tokenize(source, { includeComments: true });
  if (lexed.errors.length > 0) {
    return semantic;
  }

  const plain = mode === 'all'
    ? lexed.tokens
    .filter(isCommentToken)
      .filter((token) => token.comment?.channel === 'plain' || token.comment?.channel === 'host')
    .map((token) => ({
      raw: token.value,
      offset: token.span.start.offset,
        form: token.comment?.form ?? (token.type === TokenType.LineComment ? 'line' : 'block'),
      } satisfies PreservedComment))
    : [];

  return [...semantic, ...plain]
    .sort((left, right) => left.offset - right.offset);
}

function isCommentToken(token: Token): boolean {
  return token.type === TokenType.LineComment || token.type === TokenType.BlockComment;
}

function renderComment(raw: string): string {
  return raw.trim();
}

function renderBindingWithComments(rendered: string, comments: readonly PreservedComment[]): string {
  if (comments.length === 0) {
    return rendered;
  }

  const landmarks = renderedLandmarks(rendered);
  const insertions = comments
    .map((comment, order) => {
      const offset = insertionOffset(comment, landmarks);
      return offset == null ? null : { comment, offset, order };
    })
    .filter((insertion): insertion is { readonly comment: PreservedComment; readonly offset: number; readonly order: number } => insertion !== null)
    .sort((left, right) => right.offset - left.offset || right.order - left.order);

  let out = rendered;
  for (const insertion of insertions) {
    out = insertComment(out, insertion.offset, insertion.comment);
  }
  return out;
}

function insertionOffset(comment: PreservedComment, landmarks: readonly RenderedLandmark[]): number | null {
  const placement = comment.placement;
  if (!placement) {
    return null;
  }
  if (placement.after) {
    return landmarks.find((landmark) => landmark.part === placement.after)?.end ?? null;
  }
  if (placement.before) {
    return landmarks.find((landmark) => landmark.part === placement.before)?.start ?? null;
  }
  return null;
}

function insertComment(rendered: string, offset: number, comment: PreservedComment): string {
  const raw = renderComment(comment.raw);
  const before = rendered.slice(0, offset);
  const after = rendered.slice(offset);
  if (offset === 0) {
    return `${raw}\n${rendered}`;
  }
  if (comment.form === 'line') {
    if (after.length === 0) {
      return `${before} ${raw}`;
    }
    return `${before} ${raw}\n${after}`;
  }
  const leftSpace = before.endsWith(' ') || before.length === 0 ? '' : ' ';
  const rightSpace = after.startsWith(' ') || after.length === 0 ? '' : ' ';
  return `${before}${leftSpace}${raw}${rightSpace}${after}`;
}

function renderedLandmarks(rendered: string): readonly RenderedLandmark[] {
  const lexed = tokenize(rendered, { includeComments: false });
  if (lexed.errors.length > 0) {
    return [];
  }
  const tokens = lexed.tokens.filter((token) => token.type !== TokenType.EOF);
  const topLevel = topLevelTokens(tokens);
  const equals = topLevel.find((token) => token.type === TokenType.Equals);
  if (!equals) {
    return [];
  }
  const key = keyLandmark(rendered, topLevel, equals.span.start.offset);
  const attributes = findAttributesLandmark(tokens, topLevel, key.end, equals.span.start.offset);
  const datatypeColon = rendered.startsWith('aeon:')
    ? undefined
    : topLevel.find((token) =>
      token.type === TokenType.Colon
      && token.span.start.offset >= (attributes?.end ?? key.end)
      && token.span.end.offset <= equals.span.start.offset
    );
  const datatype = datatypeColon ? findDatatypeLandmark(tokens, datatypeColon.span.end.offset, equals.span.start.offset) : undefined;
  const valueStart = tokens.find((token) => token.span.start.offset > equals.span.end.offset)?.span.start.offset ?? equals.span.end.offset;
  return [
    key,
    ...(attributes ? [attributes] : []),
    ...(datatypeColon ? [{ part: 'datatype-colon' as const, start: datatypeColon.span.start.offset, end: datatypeColon.span.end.offset }] : []),
    ...(datatype ? [datatype] : []),
    { part: 'equals' as const, start: equals.span.start.offset, end: equals.span.end.offset },
    { part: 'value' as const, start: valueStart, end: rendered.length },
  ];
}

function keyLandmark(rendered: string, tokens: readonly Token[], equalsOffset: number): RenderedLandmark {
  if (rendered.startsWith('aeon:')) {
    const at = rendered.indexOf('@');
    const end = at !== -1 && at < equalsOffset ? at : equalsOffset;
    return { part: 'key', start: 0, end };
  }
  const first = tokens[0];
  return {
    part: 'key',
    start: first?.span.start.offset ?? 0,
    end: first?.span.end.offset ?? 0,
  };
}

function findAttributesLandmark(
  tokens: readonly Token[],
  topLevel: readonly Token[],
  afterOffset: number,
  beforeOffset: number,
): RenderedLandmark | undefined {
  const at = topLevel.find((token) =>
    token.type === TokenType.At
    && token.span.start.offset >= afterOffset
    && token.span.end.offset <= beforeOffset
  );
  if (!at) {
    return undefined;
  }
  const nextHeadPart = topLevel.find((token) =>
    token.span.start.offset > at.span.start.offset
    && token.span.start.offset <= beforeOffset
    && (token.type === TokenType.Colon || token.type === TokenType.Equals)
  );
  const end = nextHeadPart
    ? tokens.filter((token) => token.span.end.offset <= nextHeadPart.span.start.offset).at(-1)?.span.end.offset ?? at.span.end.offset
    : at.span.end.offset;
  return { part: 'attributes', start: at.span.start.offset, end };
}

function findDatatypeLandmark(
  tokens: readonly Token[],
  afterOffset: number,
  beforeOffset: number,
): RenderedLandmark | undefined {
  const datatypeTokens = tokens.filter((token) =>
    token.span.start.offset >= afterOffset
    && token.span.end.offset <= beforeOffset
    && token.type !== TokenType.Equals
  );
  const first = datatypeTokens[0];
  const last = datatypeTokens.at(-1);
  if (!first || !last) {
    return undefined;
  }
  return { part: 'datatype', start: first.span.start.offset, end: last.span.end.offset };
}

function topLevelTokens(tokens: readonly Token[]): readonly Token[] {
  const result: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (depth === 0) {
      result.push(token);
    }
    depth += depthDelta(token);
    if (depth < 0) {
      depth = 0;
    }
  }
  return result;
}

function depthDelta(token: Token): number {
  switch (token.type) {
    case TokenType.LeftBrace:
    case TokenType.LeftBracket:
    case TokenType.LeftParen:
    case TokenType.LeftAngle:
      return 1;
    case TokenType.RightBrace:
    case TokenType.RightBracket:
    case TokenType.RightParen:
    case TokenType.RightAngle:
      return -1;
    default:
      return 0;
  }
}
