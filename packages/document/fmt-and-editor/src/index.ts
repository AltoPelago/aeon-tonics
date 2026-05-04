import {
  createBlockquoteNode,
  createDocumentFragmentNode,
  createHeadingNode,
  createParagraphNode,
  type AndBlockNode,
  type AndDocumentFragmentNode,
  type AndInlineInput,
  type AndParagraphNode,
  type AndExtensionBlockNode,
  type FmtAndPath,
  type FmtAndDocument,
  getNodeAtPath,
  insertBlockAtPath,
  removeNodeAtPath,
  replaceInlineChildren,
  replaceNodeAtPath,
} from '../../fmt-and-model/dist/index.js';

export function insertParagraphAfter(
  document: FmtAndDocument,
  path: FmtAndPath,
  content: string | readonly AndInlineInput[] = [],
): AndParagraphNode {
  const paragraph = createParagraphNode(content);
  insertBlockAtPath(document, path, paragraph, { position: 'after' });
  return paragraph;
}

export function insertParagraphBefore(
  document: FmtAndDocument,
  path: FmtAndPath,
  content: string | readonly AndInlineInput[] = [],
): AndParagraphNode {
  const paragraph = createParagraphNode(content);
  insertBlockAtPath(document, path, paragraph, { position: 'before' });
  return paragraph;
}

export function insertHeadingAfter(
  document: FmtAndDocument,
  path: FmtAndPath,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: string | readonly AndInlineInput[] = [],
) {
  const heading = createHeadingNode(level, content);
  insertBlockAtPath(document, path, heading, { position: 'after' });
  return heading;
}

export function insertHeadingBefore(
  document: FmtAndDocument,
  path: FmtAndPath,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: string | readonly AndInlineInput[] = [],
) {
  const heading = createHeadingNode(level, content);
  insertBlockAtPath(document, path, heading, { position: 'before' });
  return heading;
}

export function replaceParagraphText(
  document: FmtAndDocument,
  path: FmtAndPath,
  content: string | readonly AndInlineInput[],
): AndParagraphNode {
  const node = getNodeAtPath(document, path);
  if (!isParagraphNode(node)) {
    throw new Error(`fmt.and editor expected paragraph at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  replaceInlineChildren(node, content);
  return node;
}

export function replaceHeadingText(
  document: FmtAndDocument,
  path: FmtAndPath,
  content: string | readonly AndInlineInput[],
) {
  const node = getNodeAtPath(document, path);
  if (!isHeadingNode(node)) {
    throw new Error(`fmt.and editor expected heading at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  replaceInlineChildren(node, content);
  return node;
}

export function wrapBlockInBlockquote(
  document: FmtAndDocument,
  path: FmtAndPath,
) {
  const node = getNodeAtPath(document, path);
  if (!isBlockNode(node)) {
    throw new Error(`fmt.and editor expected block node at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  const blockquote = createBlockquoteNode([node]);
  replaceNodeAtPath(document, path, blockquote);
  return blockquote;
}

export function unwrapBlockquote(
  document: FmtAndDocument,
  path: FmtAndPath,
) {
  const node = getNodeAtPath(document, path);
  if (!isBlockquoteNode(node)) {
    throw new Error(`fmt.and editor expected blockquote at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  if (node.children.length === 0) {
    throw new Error(`fmt.and editor cannot unwrap empty blockquote at ${formatEditorPath(path)}.`);
  }

  const [first, ...rest] = node.children;
  if (first === undefined) {
    throw new Error(`fmt.and editor cannot unwrap empty blockquote at ${formatEditorPath(path)}.`);
  }
  replaceNodeAtPath(document, path, first);
  for (let index = 0; index < rest.length; index += 1) {
    insertBlockAtPath(document, [...path.slice(0, -1), (path[path.length - 1] as number) + index], rest[index]!, {
      position: 'after',
    });
  }
  return first;
}

export function setExtensionFallback(
  document: FmtAndDocument,
  path: FmtAndPath,
  fallback: AndDocumentFragmentNode | string | readonly AndBlockNode[],
): AndExtensionBlockNode {
  const node = getNodeAtPath(document, path);
  if (!isExtensionBlockNode(node)) {
    throw new Error(`fmt.and editor expected extension_block at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  if (typeof fallback === 'string') {
    node.fallback = createDocumentFragmentNode(fallback);
  } else if ('type' in fallback) {
    node.fallback = fallback;
  } else {
    node.fallback = createDocumentFragmentNode(fallback);
  }
  return node;
}

export function clearExtensionFallback(
  document: FmtAndDocument,
  path: FmtAndPath,
): AndExtensionBlockNode {
  const node = getNodeAtPath(document, path);
  if (!isExtensionBlockNode(node)) {
    throw new Error(`fmt.and editor expected extension_block at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  if (node.fallback !== undefined) {
    removeNodeAtPath(document, [...path, 'fallback']);
  }
  return node;
}

export function removeBlockAtPath(
  document: FmtAndDocument,
  path: FmtAndPath,
): AndBlockNode {
  const node = getNodeAtPath(document, path);
  if (!isBlockNode(node)) {
    throw new Error(`fmt.and editor expected block node at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  return removeNodeAtPath(document, path) as AndBlockNode;
}

export function removeInlineAtPath(
  document: FmtAndDocument,
  path: FmtAndPath,
) {
  const node = getNodeAtPath(document, path);
  if (!isInlineNode(node)) {
    throw new Error(`fmt.and editor expected inline node at ${formatEditorPath(path)}, got ${describeNode(node)}.`);
  }
  return removeNodeAtPath(document, path);
}

type EditorNode = ReturnType<typeof getNodeAtPath>;

function hasTag(node: EditorNode): node is Exclude<EditorNode, { children: unknown[] }> | AndBlockNode | AndParagraphNode | AndExtensionBlockNode {
  return 'type' in node;
}

function isParagraphNode(node: EditorNode): node is AndParagraphNode {
  return hasTag(node) && node.type === 'paragraph';
}

function isExtensionBlockNode(node: EditorNode): node is AndExtensionBlockNode {
  return hasTag(node) && node.type === 'extension_block';
}

function isHeadingNode(node: EditorNode): node is ReturnType<typeof createHeadingNode> {
  return hasTag(node) && node.type === 'heading';
}

function isBlockquoteNode(node: EditorNode): node is ReturnType<typeof createBlockquoteNode> {
  return hasTag(node) && node.type === 'blockquote';
}

function isBlockNode(node: EditorNode): node is AndBlockNode {
  return 'type' in node
    && node.type !== 'document'
    && node.type !== 'document_fragment'
    && node.type !== 'list_item'
    && node.type !== 'text'
    && node.type !== 'strong'
    && node.type !== 'emphasis'
    && node.type !== 'code'
    && node.type !== 'link';
}

function isInlineNode(node: EditorNode) {
  return 'type' in node
    && (node.type === 'text'
      || node.type === 'strong'
      || node.type === 'emphasis'
      || node.type === 'code'
      || node.type === 'link');
}

function describeNode(node: EditorNode): string {
  return 'type' in node ? node.type : 'table_cell';
}

function formatEditorPath(path: FmtAndPath): string {
  return path.length === 0
    ? '$'
    : `$${path.map((segment) => typeof segment === 'number' ? `[${segment}]` : `.${segment}`).join('')}`;
}
