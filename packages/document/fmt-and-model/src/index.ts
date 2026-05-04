import type { AssignmentEvent } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type {
  Attribute,
  AttributeValue,
  Value,
} from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import { minimize, type MinimizeOptions, type MinimizeResult } from '../../../export/minizer/dist/index.js';

export interface FmtAndCreateOptions {
  readonly rootKey?: string;
}

export interface FmtAndAndCoreBridgeOptions {
  readonly andCoreModuleUrl?: string;
}

export interface NdParseBudgetOptions {
  readonly maxDocumentSize?: number;
  readonly maxLineLength?: number;
  readonly maxNestingDepth?: number;
  readonly maxInlineDepth?: number;
  readonly maxTableColumns?: number;
  readonly maxBlockSize?: number;
  readonly maxBlockCount?: number;
  readonly maxListItemCount?: number;
  readonly maxLinkTargetLength?: number;
}

export interface NdParseOptionsLike {
  readonly mode?: 'strict' | 'recovery' | 'forward_compat';
  readonly budgets?: NdParseBudgetOptions;
  readonly includeSpans?: boolean;
  readonly sourceName?: string;
}

export interface FmtAndParseTextOptions extends FmtAndCreateOptions, FmtAndAndCoreBridgeOptions {
  readonly parseOptions?: NdParseOptionsLike;
}

export interface FmtAndCanonicalOptions extends FmtAndAndCoreBridgeOptions {
  readonly profile: 'standalone' | 'embedded';
}

export interface FmtAndHtmlRenderOptions extends FmtAndAndCoreBridgeOptions {
  readonly fragment?: boolean;
}

export interface FmtAndDiagnosticEntry {
  readonly severity: number;
  readonly code: string;
  readonly source: string;
  readonly message: string;
  readonly range: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  };
  readonly data?: unknown;
}

export type FmtAndDiagnosticsResult =
  | { readonly ok: true; readonly diagnostics: readonly FmtAndDiagnosticEntry[] }
  | { readonly ok: false; readonly diagnostics: readonly FmtAndDiagnosticEntry[] };

export type FmtAndParseResult =
  | { readonly ok: true; readonly document: FmtAndDocument }
  | { readonly ok: false; readonly errorCode: string; readonly diagnostic?: unknown };

export interface AndDocumentNode {
  readonly type: 'document';
  children: AndBlockNode[];
}

export interface AndDocumentFragmentNode {
  readonly type: 'document_fragment';
  children: AndBlockNode[];
}

export interface AndParagraphNode {
  readonly type: 'paragraph';
  children: AndInlineNode[];
}

export interface AndHeadingNode {
  readonly type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: AndInlineNode[];
}

export interface AndListNode {
  readonly type: 'list';
  ordered: boolean;
  children: AndListItemNode[];
}

export interface AndListItemNode {
  readonly type: 'list_item';
  children: AndBlockNode[];
}

export interface AndBlockquoteNode {
  readonly type: 'blockquote';
  children: AndBlockNode[];
}

export interface AndCodeBlockNode {
  readonly type: 'code_block';
  ordered: boolean;
  language?: string;
  text: string;
}

export interface AndExtensionBlockNode {
  readonly type: 'extension_block';
  name: string;
  text: string;
  fallback?: AndDocumentFragmentNode;
}

export interface AndTableNode {
  readonly type: 'table';
  header: AndTableCellNode[];
  rows: AndTableCellNode[][];
}

export interface AndTableCellNode {
  readonly children: AndInlineNode[];
}

export interface AndHorizontalRuleNode {
  readonly type: 'horizontal_rule';
}

export interface AndTextNode {
  readonly type: 'text';
  text: string;
}

export interface AndStrongNode {
  readonly type: 'strong';
  children: AndInlineNode[];
}

export interface AndEmphasisNode {
  readonly type: 'emphasis';
  children: AndInlineNode[];
}

export interface AndCodeNode {
  readonly type: 'code';
  text: string;
}

export interface AndLinkNode {
  readonly type: 'link';
  href: string;
  children: AndInlineNode[];
}

export type AndBlockNode =
  | AndParagraphNode
  | AndHeadingNode
  | AndListNode
  | AndBlockquoteNode
  | AndCodeBlockNode
  | AndExtensionBlockNode
  | AndTableNode
  | AndHorizontalRuleNode;

export type AndInlineNode =
  | AndTextNode
  | AndStrongNode
  | AndEmphasisNode
  | AndCodeNode
  | AndLinkNode;

export type AndBlockContainerNode =
  | AndDocumentNode
  | AndDocumentFragmentNode
  | AndListItemNode
  | AndBlockquoteNode;

export type AndInlineContainerNode =
  | AndParagraphNode
  | AndHeadingNode
  | AndStrongNode
  | AndEmphasisNode
  | AndLinkNode
  | AndTableCellNode;

export type AndInlineInput = string | AndInlineNode;
export type FmtAndPathSegment = number | 'children' | 'header' | 'rows' | 'fallback';
export type FmtAndPath = readonly FmtAndPathSegment[];

export interface NdDocument {
  readonly type: 'document';
  readonly children: NdBlockNode[];
}

export interface NdDocumentFragment {
  readonly type: 'document_fragment';
  readonly children: NdBlockNode[];
}

export interface NdParagraph {
  readonly type: 'paragraph';
  readonly children: NdInlineNode[];
}

export interface NdHeading {
  readonly type: 'heading';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: NdInlineNode[];
}

export interface NdList {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly items: NdListItem[];
}

export interface NdListItem {
  readonly type: 'list_item';
  readonly children: NdBlockNode[];
}

export interface NdBlockquote {
  readonly type: 'blockquote';
  readonly children: NdBlockNode[];
}

export interface NdCodeBlock {
  readonly type: 'code_block';
  readonly language: string | null;
  readonly ordered: boolean;
  readonly text: string;
}

export interface NdExtensionBlock {
  readonly type: 'extension_block';
  readonly name: string;
  readonly text: string;
  readonly fallback?: NdDocumentFragment;
}

export interface NdTable {
  readonly type: 'table';
  readonly header: NdTableCell[];
  readonly rows: NdTableCell[][];
}

export interface NdTableCell {
  readonly children: NdInlineNode[];
}

export interface NdHorizontalRule {
  readonly type: 'horizontal_rule';
}

export interface NdText {
  readonly type: 'text';
  readonly value: string;
}

export interface NdStrong {
  readonly type: 'strong';
  readonly children: NdInlineNode[];
}

export interface NdEmphasis {
  readonly type: 'emphasis';
  readonly children: NdInlineNode[];
}

export interface NdCode {
  readonly type: 'code';
  readonly text: string;
}

export interface NdLink {
  readonly type: 'link';
  readonly href: string;
  readonly children: NdInlineNode[];
}

export type NdBlockNode =
  | NdParagraph
  | NdHeading
  | NdList
  | NdBlockquote
  | NdCodeBlock
  | NdExtensionBlock
  | NdTable
  | NdHorizontalRule;

export type NdInlineNode =
  | NdText
  | NdStrong
  | NdEmphasis
  | NdCode
  | NdLink;

export class FmtAndDocument {
  readonly bindingKey: string;
  readonly root: AndDocumentNode;

  constructor(root: AndDocumentNode, options: { readonly bindingKey?: string } = {}) {
    this.root = root;
    this.bindingKey = options.bindingKey ?? 'doc';
  }

  exportAes(): readonly AssignmentEvent[] {
    const source = `${formatBindingKey(this.bindingKey)}:node = ${renderDocument(this.root)}`;
    const compiled = compile(source, {
      datatypePolicy: 'allow_custom',
    });

    if (compiled.errors.length > 0) {
      throw new Error(
        `fmt.and export failed with ${compiled.errors.length} error(s):\n${compiled.errors
          .map((error) => `${error.code}: ${error.message ?? error.name}`)
          .join('\n')}`,
      );
    }

    return compiled.events;
  }
}

export function createTextNode(text: string): AndTextNode {
  return {
    type: 'text',
    text,
  };
}

export function createParagraphNode(
  content: string | readonly AndInlineInput[] = [],
): AndParagraphNode {
  return {
    type: 'paragraph',
    children: normalizeInlineChildren(content),
  };
}

export function createHeadingNode(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: string | readonly AndInlineInput[] = [],
): AndHeadingNode {
  return {
    type: 'heading',
    level,
    children: normalizeInlineChildren(content),
  };
}

export function createStrongNode(
  content: string | readonly AndInlineInput[] = [],
): AndStrongNode {
  return {
    type: 'strong',
    children: normalizeInlineChildren(content),
  };
}

export function createEmphasisNode(
  content: string | readonly AndInlineInput[] = [],
): AndEmphasisNode {
  return {
    type: 'emphasis',
    children: normalizeInlineChildren(content),
  };
}

export function createCodeNode(text: string): AndCodeNode {
  return {
    type: 'code',
    text,
  };
}

export function createLinkNode(
  href: string,
  content: string | readonly AndInlineInput[] = [],
): AndLinkNode {
  return {
    type: 'link',
    href,
    children: normalizeInlineChildren(content),
  };
}

export function createListNode(options: { readonly ordered?: boolean } = {}): AndListNode {
  return {
    type: 'list',
    ordered: options.ordered ?? false,
    children: [],
  };
}

export function createListItemNode(
  content: string | readonly AndBlockNode[] = [],
): AndListItemNode {
  return {
    type: 'list_item',
    children: normalizeListItemBlocks(content),
  };
}

export function createBlockquoteNode(
  content: string | readonly AndBlockNode[] = [],
): AndBlockquoteNode {
  return {
    type: 'blockquote',
    children: normalizeListItemBlocks(content),
  };
}

export function createCodeBlockNode(
  text: string,
  options: { readonly ordered?: boolean; readonly language?: string } = {},
): AndCodeBlockNode {
  return options.language === undefined
    ? {
        type: 'code_block',
        text,
        ordered: options.ordered ?? false,
      }
    : {
        type: 'code_block',
        text,
        ordered: options.ordered ?? false,
        language: options.language,
      };
}

export function createDocumentFragmentNode(
  content: string | readonly AndBlockNode[] = [],
): AndDocumentFragmentNode {
  return {
    type: 'document_fragment',
    children: normalizeListItemBlocks(content),
  };
}

export function createExtensionBlockNode(
  name: string,
  text: string,
  options: { readonly fallback?: AndDocumentFragmentNode | string | readonly AndBlockNode[] } = {},
): AndExtensionBlockNode {
  const fallback = options.fallback;
  return fallback === undefined
    ? {
        type: 'extension_block',
        name,
        text,
      }
    : {
        type: 'extension_block',
        name,
        text,
        fallback: normalizeDocumentFragment(fallback),
      };
}

export function createTableCellNode(
  content: string | readonly AndInlineInput[] = [],
): AndTableCellNode {
  return {
    children: normalizeInlineChildren(content),
  };
}

export function createTableNode(
  header: readonly (string | readonly AndInlineInput[])[],
  rows: readonly (readonly (string | readonly AndInlineInput[])[])[] = [],
): AndTableNode {
  return {
    type: 'table',
    header: header.map((cell) => createTableCellNode(cell)),
    rows: rows.map((row) => row.map((cell) => createTableCellNode(cell))),
  };
}

export function createHorizontalRuleNode(): AndHorizontalRuleNode {
  return {
    type: 'horizontal_rule',
  };
}

export function appendBlock(
  target: FmtAndDocument | AndBlockContainerNode,
  block: AndBlockNode,
): AndBlockNode {
  resolveBlockChildren(target).push(block);
  return block;
}

export function appendParagraph(
  target: FmtAndDocument | AndBlockContainerNode,
  content: string | readonly AndInlineInput[] = [],
): AndParagraphNode {
  const paragraph = createParagraphNode(content);
  resolveBlockChildren(target).push(paragraph);
  return paragraph;
}

export function appendHeading(
  target: FmtAndDocument | AndBlockContainerNode,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: string | readonly AndInlineInput[] = [],
): AndHeadingNode {
  const heading = createHeadingNode(level, content);
  resolveBlockChildren(target).push(heading);
  return heading;
}

export function appendCodeBlock(
  target: FmtAndDocument | AndBlockContainerNode,
  text: string,
  options: { readonly ordered?: boolean; readonly language?: string } = {},
): AndCodeBlockNode {
  const block = createCodeBlockNode(text, options);
  resolveBlockChildren(target).push(block);
  return block;
}

export function appendList(
  target: FmtAndDocument | AndBlockContainerNode,
  options: { readonly ordered?: boolean } = {},
): AndListNode {
  const list = createListNode(options);
  resolveBlockChildren(target).push(list);
  return list;
}

export function appendListItem(
  target: AndListNode,
  content: string | readonly AndBlockNode[] = [],
): AndListItemNode {
  const item = createListItemNode(content);
  target.children.push(item);
  return item;
}

export function appendBlockquote(
  target: FmtAndDocument | AndBlockContainerNode,
  content: string | readonly AndBlockNode[] = [],
): AndBlockquoteNode {
  const blockquote = createBlockquoteNode(content);
  resolveBlockChildren(target).push(blockquote);
  return blockquote;
}

export function appendTable(
  target: FmtAndDocument | AndBlockContainerNode,
  header: readonly (string | readonly AndInlineInput[])[],
  rows: readonly (readonly (string | readonly AndInlineInput[])[])[] = [],
): AndTableNode {
  const table = createTableNode(header, rows);
  resolveBlockChildren(target).push(table);
  return table;
}

export function appendExtensionBlock(
  target: FmtAndDocument | AndBlockContainerNode,
  name: string,
  text: string,
  options: { readonly fallback?: AndDocumentFragmentNode | string | readonly AndBlockNode[] } = {},
): AndExtensionBlockNode {
  const block = createExtensionBlockNode(name, text, options);
  resolveBlockChildren(target).push(block);
  return block;
}

export function appendHorizontalRule(
  target: FmtAndDocument | AndBlockContainerNode,
): AndHorizontalRuleNode {
  const block = createHorizontalRuleNode();
  resolveBlockChildren(target).push(block);
  return block;
}

export function appendText(
  target: AndInlineContainerNode,
  text: string,
): AndTextNode {
  const node = createTextNode(text);
  target.children.push(node);
  return node;
}

export function replaceInlineChildren(
  target: AndInlineContainerNode,
  content: string | readonly AndInlineInput[],
): AndInlineContainerNode {
  target.children.splice(0, target.children.length, ...normalizeInlineChildren(content));
  return target;
}

export function appendInline(
  target: AndInlineContainerNode,
  inline: AndInlineInput,
): AndInlineNode {
  const node = normalizeInlineNode(inline);
  target.children.push(node);
  return node;
}

export function getNodeAtPath(
  document: FmtAndDocument | AndDocumentNode,
  path: FmtAndPath,
): FmtAndTreeNode {
  const resolved = resolvePathValue(resolveDocumentRoot(document), path);
  if (Array.isArray(resolved)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} resolves to a collection, not a node.`);
  }
  return resolved;
}

export function replaceNodeAtPath(
  document: FmtAndDocument | AndDocumentNode,
  path: FmtAndPath,
  replacement: FmtAndTreeNode,
): FmtAndTreeNode {
  if (path.length === 0) {
    throw new Error('fmt.and cannot replace the document root with replaceNodeAtPath; mutate root children instead.');
  }

  const parent = resolvePathValue(resolveDocumentRoot(document), path.slice(0, -1));
  const tail = lastPathSegment(path);

  if (tail === 'fallback') {
    if (!isExtensionBlockNode(parent)) {
      throw new Error(`fmt.and path ${formatFmtAndPath(path)} can only use fallback on extension_block nodes.`);
    }
    if (!isDocumentFragmentNode(replacement)) {
      throw new Error(`fmt.and path ${formatFmtAndPath(path)} fallback replacements must be document_fragment nodes.`);
    }
    parent.fallback = replacement;
    return replacement;
  }

  const { array, index } = resolveArrayMutationTarget(parent, tail, path);
  validateReplacementForArray(path, array, replacement);
  array[index] = replacement;
  return replacement;
}

export function removeNodeAtPath(
  document: FmtAndDocument | AndDocumentNode,
  path: FmtAndPath,
): FmtAndTreeNode {
  if (path.length === 0) {
    throw new Error('fmt.and cannot remove the document root.');
  }

  const parent = resolvePathValue(resolveDocumentRoot(document), path.slice(0, -1));
  const tail = lastPathSegment(path);

  if (tail === 'fallback') {
    if (!isExtensionBlockNode(parent)) {
      throw new Error(`fmt.and path ${formatFmtAndPath(path)} can only use fallback on extension_block nodes.`);
    }
    if (parent.fallback === undefined) {
      throw new Error(`fmt.and path ${formatFmtAndPath(path)} does not exist.`);
    }
    const removed = parent.fallback;
    delete parent.fallback;
    return removed;
  }

  const { array, index } = resolveArrayMutationTarget(parent, tail, path);
  const [removed] = array.splice(index, 1);
  if (removed === undefined) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} does not exist.`);
  }
  if (Array.isArray(removed)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} resolves to a row collection, not a node.`);
  }
  return removed as FmtAndTreeNode;
}

export function insertBlockAtPath(
  document: FmtAndDocument | AndDocumentNode,
  path: FmtAndPath,
  block: AndBlockNode,
  options: { readonly position?: 'before' | 'after' | 'prepend' | 'append' } = {},
): AndBlockNode {
  const position = options.position ?? 'after';
  const root = resolveDocumentRoot(document);

  if (path.length === 0) {
    if (position !== 'append' && position !== 'prepend') {
      throw new Error('fmt.and root block insertion only supports prepend or append.');
    }
    mutateArray(root.children, position === 'prepend' ? 0 : root.children.length, block);
    return block;
  }

  const target = getNodeAtPath(root, path);
  if ((position === 'append' || position === 'prepend') && isBlockContainerNode(target)) {
    const children = resolveBlockChildren(target);
    mutateArray(children, position === 'prepend' ? 0 : children.length, block);
    return block;
  }

  if (position !== 'before' && position !== 'after') {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} does not resolve to a block container for ${position}.`);
  }

  if (!isBlockNode(target)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} does not resolve to a block node for ${position}.`);
  }

  const parent = resolvePathValue(root, path.slice(0, -1));
  const tail = lastPathSegment(path);
  const { array, index } = resolveArrayMutationTarget(parent, tail, path);
  validateReplacementForArray(path, array, block);
  mutateArray(array, position === 'before' ? index : index + 1, block);
  return block;
}

export function insertInlineAtPath(
  document: FmtAndDocument | AndDocumentNode,
  path: FmtAndPath,
  inline: AndInlineInput,
  options: { readonly position?: 'before' | 'after' | 'prepend' | 'append' } = {},
): AndInlineNode {
  const position = options.position ?? 'after';
  const node = normalizeInlineNode(inline);
  const root = resolveDocumentRoot(document);
  const target = getNodeAtPath(root, path);

  if ((position === 'append' || position === 'prepend') && isInlineContainerNode(target)) {
    const children = target.children;
    mutateArray(children, position === 'prepend' ? 0 : children.length, node);
    return node;
  }

  if (position !== 'before' && position !== 'after') {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} does not resolve to an inline container for ${position}.`);
  }

  if (!isInlineNode(target)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} does not resolve to an inline node for ${position}.`);
  }

  const parent = resolvePathValue(root, path.slice(0, -1));
  const tail = lastPathSegment(path);
  const { array, index } = resolveArrayMutationTarget(parent, tail, path);
  validateReplacementForArray(path, array, node);
  mutateArray(array, position === 'before' ? index : index + 1, node);
  return node;
}

export function createFmtAndDocumentFromAeon(
  input: string,
  options: FmtAndCreateOptions = {},
): FmtAndDocument {
  const compiled = compile(input, {
    datatypePolicy: 'allow_custom',
  });

  if (compiled.errors.length > 0) {
    throw new Error(
      `fmt.and compile failed with ${compiled.errors.length} error(s):\n${compiled.errors
        .map((error) => `${error.code}: ${error.message ?? error.name}`)
        .join('\n')}`,
    );
  }

  return createFmtAndDocumentFromAes(compiled.events, options);
}

export function createFmtAndDocumentFromAes(
  aes: readonly AssignmentEvent[],
  options: FmtAndCreateOptions = {},
): FmtAndDocument {
  const rootEvent = findRootDocumentEvent(aes, options.rootKey);
  if (!rootEvent) {
    throw new Error(options.rootKey
      ? `fmt.and expected a top-level document node at ${JSON.stringify(options.rootKey)}.`
      : 'fmt.and expected one top-level document node.');
  }

  if (rootEvent.value.type !== 'NodeLiteral' || rootEvent.value.tag !== 'document') {
    throw new Error(`fmt.and root ${JSON.stringify(rootEvent.key)} must be a document node.`);
  }

  return new FmtAndDocument(projectDocument(rootEvent.value), {
    bindingKey: rootEvent.key,
  });
}

export function exportFmtAndAes(document: FmtAndDocument): readonly AssignmentEvent[] {
  return document.exportAes();
}

export function exportFmtAndAeon(
  document: FmtAndDocument,
  options: MinimizeOptions = {},
): MinimizeResult {
  return minimize(document.exportAes(), options);
}

export async function parseFmtAndDocument(
  source: string,
  options: FmtAndParseTextOptions = {},
): Promise<FmtAndParseResult> {
  const andCore = await loadAndCoreModule(options.andCoreModuleUrl);
  const parsed = andCore.parseAnd(source, options.parseOptions ?? {});
  if (!parsed.ok) {
    return {
      ok: false,
      errorCode: parsed.errorCode,
      ...(parsed.diagnostic === undefined ? {} : { diagnostic: parsed.diagnostic }),
    };
  }
  return {
    ok: true,
    document: options.rootKey === undefined
      ? createFmtAndDocumentFromNdDocument(parsed.document)
      : createFmtAndDocumentFromNdDocument(parsed.document, {
          rootKey: options.rootKey,
        }),
  };
}

export async function emitFmtAndCanonical(
  document: FmtAndDocument | AndDocumentNode,
  options: FmtAndCanonicalOptions,
): Promise<string> {
  const andCore = await loadAndCoreModule(options.andCoreModuleUrl);
  return andCore.emitCanonical(
    toNdDocument(document instanceof FmtAndDocument ? document : new FmtAndDocument(document)),
    { profile: options.profile },
  );
}

export async function renderFmtAndHtml(
  document: FmtAndDocument | AndDocumentNode,
  options: FmtAndHtmlRenderOptions = {},
): Promise<string> {
  const andCore = await loadAndCoreModule(options.andCoreModuleUrl);
  const ndDocument = toNdDocument(document instanceof FmtAndDocument ? document : new FmtAndDocument(document));
  return options.fragment === undefined
    ? andCore.renderHtml(ndDocument)
    : andCore.renderHtml(ndDocument, { fragment: options.fragment });
}

export async function collectFmtAndDiagnostics(
  source: string,
  options: FmtAndParseTextOptions = {},
): Promise<FmtAndDiagnosticsResult> {
  const andCore = await loadAndCoreModule(options.andCoreModuleUrl);
  return andCore.collectDiagnostics(source, options.parseOptions ?? {}) as FmtAndDiagnosticsResult;
}

export function createFmtAndDocumentFromNdDocument(
  document: NdDocument,
  options: FmtAndCreateOptions = {},
): FmtAndDocument {
  return options.rootKey === undefined
    ? new FmtAndDocument(projectFromNdDocument(document))
    : new FmtAndDocument(projectFromNdDocument(document), {
        bindingKey: options.rootKey,
      });
}

export function toNdDocument(document: FmtAndDocument | AndDocumentNode): NdDocument {
  const root = document instanceof FmtAndDocument ? document.root : document;
  return projectToNdDocument(root);
}

type FmtAndTreeNode =
  | AndDocumentNode
  | AndDocumentFragmentNode
  | AndListItemNode
  | AndTableCellNode
  | AndBlockNode
  | AndInlineNode;

type FmtAndPathArray =
  | AndBlockNode[]
  | AndInlineNode[]
  | AndListItemNode[]
  | AndTableCellNode[]
  | AndTableCellNode[][];

type FmtAndPathValue = FmtAndTreeNode | FmtAndPathArray;

function resolveDocumentRoot(document: FmtAndDocument | AndDocumentNode): AndDocumentNode {
  return document instanceof FmtAndDocument ? document.root : document;
}

function resolveBlockChildren(target: FmtAndDocument | AndBlockContainerNode): AndBlockNode[] {
  return target instanceof FmtAndDocument ? target.root.children : target.children;
}

function normalizeInlineChildren(content: string | readonly AndInlineInput[]): AndInlineNode[] {
  return typeof content === 'string' ? [createTextNode(content)] : content.map((child) => normalizeInlineNode(child));
}

function normalizeInlineNode(content: AndInlineInput): AndInlineNode {
  return typeof content === 'string' ? createTextNode(content) : content;
}

function normalizeListItemBlocks(content: string | readonly AndBlockNode[]): AndBlockNode[] {
  return typeof content === 'string' ? [createParagraphNode(content)] : [...content];
}

function normalizeDocumentFragment(
  fallback: AndDocumentFragmentNode | string | readonly AndBlockNode[],
): AndDocumentFragmentNode {
  if (typeof fallback === 'string') {
    return createDocumentFragmentNode(fallback);
  }
  if ('type' in fallback) {
    return fallback;
  }
  return createDocumentFragmentNode(fallback);
}

function lastPathSegment(path: FmtAndPath): FmtAndPathSegment {
  const tail = path[path.length - 1];
  if (tail === undefined) {
    throw new Error('fmt.and path is empty.');
  }
  return tail;
}

function resolvePathValue(root: AndDocumentNode, path: FmtAndPath): FmtAndPathValue {
  let current: FmtAndPathValue = root;
  for (const segment of path) {
    current = stepPathValue(current, segment, path);
  }
  return current;
}

function stepPathValue(
  current: FmtAndPathValue,
  segment: FmtAndPathSegment,
  fullPath: FmtAndPath,
): FmtAndPathValue {
  if (typeof segment === 'number') {
    if (Array.isArray(current)) {
      const next = current[segment];
      if (next === undefined) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} is out of range at index ${segment}.`);
      }
      return next;
    }
    if (hasImplicitIndexedChildren(current)) {
      const next = current.children[segment];
      if (next === undefined) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} is out of range at index ${segment}.`);
      }
      return next;
    }
    throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} cannot index into ${current.type}.`);
  }

  if (Array.isArray(current)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} must use a numeric index before ${segment}.`);
  }

  switch (segment) {
    case 'children':
      if (!hasImplicitIndexedChildren(current)) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} cannot access children on ${current.type}.`);
      }
      return current.children;
    case 'header':
      if (!isTableNode(current)) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} can only use header on table nodes.`);
      }
      return current.header;
    case 'rows':
      if (!isTableNode(current)) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} can only use rows on table nodes.`);
      }
      return current.rows;
    case 'fallback':
      if (!isExtensionBlockNode(current)) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} can only use fallback on extension_block nodes.`);
      }
      if (current.fallback === undefined) {
        throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} does not have a fallback node.`);
      }
      return current.fallback;
    default: {
      const exhaustive: never = segment;
      return exhaustive;
    }
  }
}

function resolveArrayMutationTarget(
  parent: FmtAndPathValue,
  tail: FmtAndPathSegment,
  fullPath: FmtAndPath,
): { array: unknown[]; index: number } {
  if (typeof tail !== 'number') {
    throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} does not point to an indexed node.`);
  }

  if (Array.isArray(parent)) {
    return { array: parent as unknown[], index: tail };
  }

  if (hasImplicitIndexedChildren(parent)) {
    return { array: parent.children as unknown[], index: tail };
  }

  throw new Error(`fmt.and path ${formatFmtAndPath(fullPath)} cannot index into ${parent.type}.`);
}

function validateReplacementForArray(
  path: FmtAndPath,
  array: unknown[],
  replacement: FmtAndTreeNode,
): void {
  const first = array[0];
  if (first === undefined) {
    return;
  }
  if (Array.isArray(first)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} resolves to a row collection, not a node slot.`);
  }
  const sample = first as FmtAndTreeNode;

  if (isBlockNode(sample) && !isBlockNode(replacement)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} expects a block node replacement.`);
  }
  if (isInlineNode(sample) && !isInlineNode(replacement)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} expects an inline node replacement.`);
  }
  if (isListItemNode(sample) && !isListItemNode(replacement)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} expects a list_item replacement.`);
  }
  if (isTableCellNode(sample) && !isTableCellNode(replacement)) {
    throw new Error(`fmt.and path ${formatFmtAndPath(path)} expects a table cell replacement.`);
  }
}

function mutateArray(array: unknown[], index: number, value: unknown): void {
  array.splice(index, 0, value);
}

function hasTypedTag(node: FmtAndTreeNode): node is Exclude<FmtAndTreeNode, AndTableCellNode> {
  return 'type' in node;
}

function hasImplicitIndexedChildren(node: FmtAndTreeNode): node is
  | AndDocumentNode
  | AndDocumentFragmentNode
  | AndParagraphNode
  | AndHeadingNode
  | AndListNode
  | AndListItemNode
  | AndBlockquoteNode
  | AndStrongNode
  | AndEmphasisNode
  | AndLinkNode
  | AndTableCellNode {
  return 'children' in node;
}

function isDocumentFragmentNode(node: FmtAndTreeNode): node is AndDocumentFragmentNode {
  return hasTypedTag(node) && node.type === 'document_fragment';
}

function isListItemNode(node: FmtAndTreeNode): node is AndListItemNode {
  return hasTypedTag(node) && node.type === 'list_item';
}

function isTableCellNode(node: FmtAndTreeNode): node is AndTableCellNode {
  return !('type' in node);
}

function isBlockNode(node: FmtAndTreeNode): node is AndBlockNode {
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

function isInlineNode(node: FmtAndTreeNode): node is AndInlineNode {
  return 'type' in node
    && (node.type === 'text'
      || node.type === 'strong'
      || node.type === 'emphasis'
      || node.type === 'code'
      || node.type === 'link');
}

function isBlockContainerNode(node: FmtAndTreeNode): node is AndDocumentNode | AndDocumentFragmentNode | AndListItemNode | AndBlockquoteNode {
  return 'type' in node
    && (node.type === 'document'
      || node.type === 'document_fragment'
      || node.type === 'list_item'
      || node.type === 'blockquote');
}

function isInlineContainerNode(node: FmtAndTreeNode): node is AndInlineContainerNode {
  return hasImplicitIndexedChildren(node)
    && !isBlockContainerNode(node)
    && !isListNode(node);
}

function isListNode(node: FmtAndTreeNode): node is AndListNode {
  return 'type' in node && node.type === 'list';
}

function isExtensionBlockNode(node: FmtAndPathValue): node is AndExtensionBlockNode {
  return !Array.isArray(node) && 'type' in node && node.type === 'extension_block';
}

function isTableNode(node: FmtAndPathValue): node is AndTableNode {
  return !Array.isArray(node) && 'type' in node && node.type === 'table';
}

function formatFmtAndPath(path: FmtAndPath): string {
  if (path.length === 0) {
    return '$';
  }
  return `$${path.map((segment) => typeof segment === 'number' ? `[${segment}]` : `.${segment}`).join('')}`;
}

function findRootDocumentEvent(
  aes: readonly AssignmentEvent[],
  rootKey: string | undefined,
): AssignmentEvent | undefined {
  const topLevel = aes.filter(isTopLevelBindingEvent).filter((event) => !event.key.startsWith('aeon:'));
  if (rootKey) {
    return topLevel.find((event) => event.key === rootKey);
  }
  return topLevel.find((event) => event.value.type === 'NodeLiteral' && event.value.tag === 'document');
}

function isTopLevelBindingEvent(event: AssignmentEvent): boolean {
  const segments = event.path.segments;
  const head = segments[0];
  const tail = segments[1];
  return segments.length === 2 && head?.type === 'root' && tail?.type === 'member';
}

function projectDocument(value: Extract<Value, { type: 'NodeLiteral' }>): AndDocumentNode {
  return {
    type: 'document',
    children: value.children.map((child) => projectBlock(child, 'document')),
  };
}

function projectFromNdDocument(document: NdDocument): AndDocumentNode {
  if (document.type !== 'document') {
    throw new Error(`fmt.and expected nd root to be document, got ${JSON.stringify(document.type)}.`);
  }
  return {
    type: 'document',
    children: document.children.map((child) => projectFromNdBlock(child, 'document')),
  };
}

function projectFromNdDocumentFragment(fragment: NdDocumentFragment, parent: string): AndDocumentFragmentNode {
  if (fragment.type !== 'document_fragment') {
    throw new Error(`fmt.and expected ${parent} fallback to be document_fragment, got ${JSON.stringify(fragment.type)}.`);
  }
  return {
    type: 'document_fragment',
    children: fragment.children.map((child) => projectFromNdBlock(child, 'document_fragment')),
  };
}

function projectFromNdBlock(node: NdBlockNode, parent: string): AndBlockNode {
  switch (node.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        children: node.children.map((child) => projectFromNdInline(child, 'paragraph')),
      };
    case 'heading':
      return {
        type: 'heading',
        level: node.level,
        children: node.children.map((child) => projectFromNdInline(child, 'heading')),
      };
    case 'list':
      return {
        type: 'list',
        ordered: node.ordered,
        children: node.items.map((child) => projectFromNdListItem(child, 'list')),
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        children: node.children.map((child) => projectFromNdBlock(child, 'blockquote')),
      };
    case 'code_block':
      return node.language === null
        ? { type: 'code_block', ordered: node.ordered, text: node.text }
        : { type: 'code_block', ordered: node.ordered, language: node.language, text: node.text };
    case 'extension_block':
      return node.fallback === undefined
        ? { type: 'extension_block', name: node.name, text: node.text }
        : {
            type: 'extension_block',
            name: node.name,
            text: node.text,
            fallback: projectFromNdDocumentFragment(node.fallback, 'extension_block'),
          };
    case 'table':
      return {
        type: 'table',
        header: node.header.map((cell) => projectFromNdTableCell(cell, 'table_header')),
        rows: node.rows.map((row) => row.map((cell) => projectFromNdTableCell(cell, 'table_row'))),
      };
    case 'horizontal_rule':
      return { type: 'horizontal_rule' };
    default: {
      const exhaustive: never = node;
      throw new Error(`fmt.and unsupported nd block ${(exhaustive as { type: string }).type} under ${parent}.`);
    }
  }
}

function projectFromNdListItem(node: NdListItem, parent: string): AndListItemNode {
  if (node.type !== 'list_item') {
    throw new Error(`fmt.and ${parent} children must be list_item nodes, got ${JSON.stringify(node.type)}.`);
  }
  return {
    type: 'list_item',
    children: node.children.map((child) => projectFromNdBlock(child, 'list_item')),
  };
}

function projectFromNdTableCell(node: NdTableCell, parent: string): AndTableCellNode {
  return {
    children: node.children.map((child) => projectFromNdInline(child, parent)),
  };
}

function projectFromNdInline(node: NdInlineNode, parent: string): AndInlineNode {
  switch (node.type) {
    case 'text':
      return {
        type: 'text',
        text: node.value,
      };
    case 'strong':
      return {
        type: 'strong',
        children: node.children.map((child) => projectFromNdInline(child, 'strong')),
      };
    case 'emphasis':
      return {
        type: 'emphasis',
        children: node.children.map((child) => projectFromNdInline(child, 'emphasis')),
      };
    case 'code':
      return {
        type: 'code',
        text: node.text,
      };
    case 'link':
      return {
        type: 'link',
        href: node.href,
        children: node.children.map((child) => projectFromNdInline(child, 'link')),
      };
    default: {
      const exhaustive: never = node;
      throw new Error(`fmt.and unsupported nd inline ${(exhaustive as { type: string }).type} under ${parent}.`);
    }
  }
}

function projectToNdDocument(root: AndDocumentNode): NdDocument {
  return {
    type: 'document',
    children: root.children.map((child) => projectToNdBlock(child)),
  };
}

function projectToNdDocumentFragment(fragment: AndDocumentFragmentNode): NdDocumentFragment {
  return {
    type: 'document_fragment',
    children: fragment.children.map((child) => projectToNdBlock(child)),
  };
}

function projectToNdBlock(node: AndBlockNode): NdBlockNode {
  switch (node.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        children: node.children.map((child) => projectToNdInline(child)),
      };
    case 'heading':
      return {
        type: 'heading',
        level: node.level,
        children: node.children.map((child) => projectToNdInline(child)),
      };
    case 'list':
      return {
        type: 'list',
        ordered: node.ordered,
        items: node.children.map((child) => ({
          type: 'list_item',
          children: child.children.map((grandChild) => projectToNdBlock(grandChild)),
        })),
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        children: node.children.map((child) => projectToNdBlock(child)),
      };
    case 'code_block':
      return {
        type: 'code_block',
        language: node.language ?? null,
        ordered: node.ordered,
        text: node.text,
      };
    case 'extension_block':
      return node.fallback === undefined
        ? { type: 'extension_block', name: node.name, text: node.text }
        : {
            type: 'extension_block',
            name: node.name,
            text: node.text,
            fallback: projectToNdDocumentFragment(node.fallback),
          };
    case 'table':
      return {
        type: 'table',
        header: node.header.map((cell) => ({
          children: cell.children.map((child) => projectToNdInline(child)),
        })),
        rows: node.rows.map((row) => row.map((cell) => ({
          children: cell.children.map((child) => projectToNdInline(child)),
        }))),
      };
    case 'horizontal_rule':
      return { type: 'horizontal_rule' };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function projectToNdInline(node: AndInlineNode): NdInlineNode {
  switch (node.type) {
    case 'text':
      return {
        type: 'text',
        value: node.text,
      };
    case 'strong':
      return {
        type: 'strong',
        children: node.children.map((child) => projectToNdInline(child)),
      };
    case 'emphasis':
      return {
        type: 'emphasis',
        children: node.children.map((child) => projectToNdInline(child)),
      };
    case 'code':
      return {
        type: 'code',
        text: node.text,
      };
    case 'link':
      return {
        type: 'link',
        href: node.href,
        children: node.children.map((child) => projectToNdInline(child)),
      };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

interface AndCoreParseFailure {
  readonly ok: false;
  readonly errorCode: string;
  readonly diagnostic?: unknown;
}

interface AndCoreParseSuccess {
  readonly ok: true;
  readonly document: NdDocument;
}

interface AndCoreModule {
  readonly parseAnd: (source: string, options?: NdParseOptionsLike) => AndCoreParseSuccess | AndCoreParseFailure;
  readonly emitCanonical: (document: NdDocument, options: { readonly profile: 'standalone' | 'embedded' }) => string;
  readonly renderHtml: (document: NdDocument, options?: { readonly fragment?: boolean }) => string;
  readonly collectDiagnostics: (
    source: string,
    options?: NdParseOptionsLike,
  ) => FmtAndDiagnosticsResult;
}

async function loadAndCoreModule(moduleUrl: string | undefined): Promise<AndCoreModule> {
  const resolved = moduleUrl ?? new URL('../../../../../../altopelago/and-core/index.mjs', import.meta.url).href;
  const mod = await import(resolved);
  return mod as AndCoreModule;
}

function projectDocumentFragment(value: Value, parent: string): AndDocumentFragmentNode {
  const node = expectNode(value, `${parent} child`);
  if (node.tag !== 'document_fragment') {
    throw new Error(`fmt.and expected document_fragment under ${parent}, got ${JSON.stringify(node.tag)}.`);
  }
  return {
    type: 'document_fragment',
    children: node.children.map((child) => projectBlock(child, 'document_fragment')),
  };
}

function projectBlock(value: Value, parent: string): AndBlockNode {
  const node = expectNode(value, `${parent} child`);

  switch (node.tag) {
    case 'paragraph':
      return {
        type: 'paragraph',
        children: node.children.map((child) => projectInline(child, 'paragraph')),
      };
    case 'heading':
      return {
        type: 'heading',
        level: readHeadingLevel(node.attributes),
        children: node.children.map((child) => projectInline(child, 'heading')),
      };
    case 'list':
      return {
        type: 'list',
        ordered: readBooleanAttribute(node.attributes, 'ordered') ?? false,
        children: node.children.map((child) => projectListItem(child, 'list')),
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        children: node.children.map((child) => projectBlock(child, 'blockquote')),
      };
    case 'code_block':
      return projectCodeBlock(node);
    case 'extension_block':
      return projectExtensionBlock(node);
    case 'table':
      return projectTable(node);
    case 'horizontal_rule':
      assertNoChildren(node, 'horizontal_rule');
      return { type: 'horizontal_rule' };
    default:
      throw new Error(`fmt.and unsupported block node ${JSON.stringify(node.tag)} under ${parent}.`);
  }
}

function projectListItem(value: Value, parent: string): AndListItemNode {
  const node = expectNode(value, `${parent} child`);
  if (node.tag !== 'list_item') {
    throw new Error(`fmt.and list children must be list_item nodes, got ${JSON.stringify(node.tag)}.`);
  }
  return {
    type: 'list_item',
    children: node.children.map((child) => projectBlock(child, 'list_item')),
  };
}

function projectInline(value: Value, parent: string): AndInlineNode {
  if (value.type === 'StringLiteral') {
    return {
      type: 'text',
      text: value.value,
    };
  }

  const node = expectNode(value, `${parent} child`);
  switch (node.tag) {
    case 'strong':
      return {
        type: 'strong',
        children: node.children.map((child) => projectInline(child, 'strong')),
      };
    case 'emphasis':
      return {
        type: 'emphasis',
        children: node.children.map((child) => projectInline(child, 'emphasis')),
      };
    case 'code':
      return {
        type: 'code',
        text: readTextChildren(node.children, 'code'),
      };
    case 'link':
      return {
        type: 'link',
        href: readRequiredStringAttribute(node.attributes, 'href', 'link'),
        children: node.children.map((child) => projectInline(child, 'link')),
      };
    default:
      throw new Error(`fmt.and unsupported inline node ${JSON.stringify(node.tag)} under ${parent}.`);
  }
}

function projectCodeBlock(node: Extract<Value, { type: 'NodeLiteral' }>): AndCodeBlockNode {
  const language = readStringAttribute(node.attributes, 'language');
  const ordered = readBooleanAttribute(node.attributes, 'ordered') ?? false;
  const text = readTextChildren(node.children, 'code_block');
  return language === undefined
    ? { type: 'code_block', text, ordered }
    : { type: 'code_block', text, ordered, language };
}

function projectExtensionBlock(node: Extract<Value, { type: 'NodeLiteral' }>): AndExtensionBlockNode {
  const name = readRequiredStringAttribute(node.attributes, 'name', 'extension_block');
  if (node.children.length === 0 || node.children.length > 2) {
    throw new Error('fmt.and extension_block expects one string child and an optional document_fragment fallback.');
  }
  const [payload, fallback] = node.children;
  if (!payload || payload.type !== 'StringLiteral') {
    throw new Error('fmt.and extension_block requires its first child to be a string payload.');
  }
  return fallback === undefined
    ? { type: 'extension_block', name, text: payload.value }
    : { type: 'extension_block', name, text: payload.value, fallback: projectDocumentFragment(fallback, 'extension_block') };
}

function projectTable(node: Extract<Value, { type: 'NodeLiteral' }>): AndTableNode {
  if (node.children.length < 1) {
    throw new Error('fmt.and table requires a table_header child.');
  }
  const [headerValue, ...rowValues] = node.children;
  const headerNode = expectNode(headerValue!, 'table child');
  if (headerNode.tag !== 'table_header') {
    throw new Error(`fmt.and table expects first child to be table_header, got ${JSON.stringify(headerNode.tag)}.`);
  }
  return {
    type: 'table',
    header: headerNode.children.map((child) => projectTableCell(child, 'table_header')),
    rows: rowValues.map((child) => projectTableRow(child, 'table')),
  };
}

function projectTableRow(value: Value, parent: string): AndTableCellNode[] {
  const node = expectNode(value, `${parent} child`);
  if (node.tag !== 'table_row') {
    throw new Error(`fmt.and table children after header must be table_row nodes, got ${JSON.stringify(node.tag)}.`);
  }
  return node.children.map((child) => projectTableCell(child, 'table_row'));
}

function projectTableCell(value: Value, parent: string): AndTableCellNode {
  const node = expectNode(value, `${parent} child`);
  if (node.tag !== 'table_cell') {
    throw new Error(`fmt.and ${parent} children must be table_cell nodes, got ${JSON.stringify(node.tag)}.`);
  }
  return {
    children: node.children.map((child) => projectInline(child, 'table_cell')),
  };
}

function expectNode(value: Value, label: string): Extract<Value, { type: 'NodeLiteral' }> {
  if (value.type !== 'NodeLiteral') {
    throw new Error(`fmt.and expected ${label} to be a node or text, got ${value.type}.`);
  }
  return value;
}

function assertNoChildren(node: Extract<Value, { type: 'NodeLiteral' }>, name: string): void {
  if (node.children.length > 0) {
    throw new Error(`fmt.and ${name} does not accept children.`);
  }
}

function readTextChildren(children: readonly Value[], nodeName: string): string {
  if (children.length !== 1 || children[0]?.type !== 'StringLiteral') {
    throw new Error(`fmt.and ${nodeName} expects exactly one string child.`);
  }
  return children[0].value;
}

function readHeadingLevel(attributes: readonly Attribute[]): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = readNumberAttribute(attributes, 'level');
  if (level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6) {
    return level;
  }
  throw new Error('fmt.and heading requires level:number from 1 to 6.');
}

function readRequiredStringAttribute(
  attributes: readonly Attribute[],
  key: string,
  nodeName: string,
): string {
  const value = readStringAttribute(attributes, key);
  if (value === undefined) {
    throw new Error(`fmt.and ${nodeName} requires ${key}:string.`);
  }
  return value;
}

function readNumberAttribute(attributes: readonly Attribute[], key: string): number | undefined {
  const entry = findAttributeEntry(attributes, key);
  if (!entry) {
    return undefined;
  }
  if (entry.value.type !== 'NumberLiteral') {
    throw new Error(`fmt.and attribute ${key} must be a number.`);
  }
  return Number(entry.value.value);
}

function readStringAttribute(attributes: readonly Attribute[], key: string): string | undefined {
  const entry = findAttributeEntry(attributes, key);
  if (!entry) {
    return undefined;
  }
  if (entry.value.type !== 'StringLiteral') {
    throw new Error(`fmt.and attribute ${key} must be a string.`);
  }
  return entry.value.value;
}

function readBooleanAttribute(attributes: readonly Attribute[], key: string): boolean | undefined {
  const entry = findAttributeEntry(attributes, key);
  if (!entry) {
    return undefined;
  }
  if (entry.value.type !== 'BooleanLiteral') {
    throw new Error(`fmt.and attribute ${key} must be a boolean.`);
  }
  return entry.value.value;
}

function findAttributeEntry(
  attributes: readonly Attribute[],
  key: string,
): AttributeValue | undefined {
  for (const attribute of attributes) {
    const entry = attribute.entries.get(key);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function renderDocument(node: AndDocumentNode): string {
  return `<document(${node.children.map((child) => renderBlock(child)).join(',')})>`;
}

function renderDocumentFragment(node: AndDocumentFragmentNode): string {
  return `<document_fragment(${node.children.map((child) => renderBlock(child)).join(',')})>`;
}

function renderBlock(node: AndBlockNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<paragraph(${node.children.map((child) => renderInline(child)).join(',')})>`;
    case 'heading':
      return `<heading@{level:number=${node.level}}(${node.children.map((child) => renderInline(child)).join(',')})>`;
    case 'list':
      return `<list@{ordered:boolean=${node.ordered ? 'true' : 'false'}}(${node.children.map((child) => renderListItem(child)).join(',')})>`;
    case 'blockquote':
      return `<blockquote(${node.children.map((child) => renderBlock(child)).join(',')})>`;
    case 'code_block':
      return `<code_block${renderAttributes([
        ['ordered', 'boolean', node.ordered],
        node.language === undefined ? undefined : ['language', 'string', node.language],
      ])}(${formatString(node.text)})>`;
    case 'extension_block':
      return `<extension_block${renderAttributes([
        ['name', 'string', node.name],
      ])}(${[
        formatString(node.text),
        node.fallback === undefined ? undefined : renderDocumentFragment(node.fallback),
      ].filter((value): value is string => value !== undefined).join(',')})>`;
    case 'table':
      return `<table(${[
        `<table_header(${node.header.map((cell) => renderTableCell(cell)).join(',')})>`,
        ...node.rows.map((row) => `<table_row(${row.map((cell) => renderTableCell(cell)).join(',')})>`),
      ].join(',')})>`;
    case 'horizontal_rule':
      return '<horizontal_rule>';
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function renderListItem(node: AndListItemNode): string {
  return `<list_item(${node.children.map((child) => renderBlock(child)).join(',')})>`;
}

function renderTableCell(node: AndTableCellNode): string {
  return `<table_cell(${node.children.map((child) => renderInline(child)).join(',')})>`;
}

function renderInline(node: AndInlineNode): string {
  switch (node.type) {
    case 'text':
      return formatString(node.text);
    case 'strong':
      return `<strong(${node.children.map((child) => renderInline(child)).join(',')})>`;
    case 'emphasis':
      return `<emphasis(${node.children.map((child) => renderInline(child)).join(',')})>`;
    case 'code':
      return `<code(${formatString(node.text)})>`;
    case 'link':
      return `<link@{href:string=${formatString(node.href)}}(${node.children.map((child) => renderInline(child)).join(',')})>`;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

type RenderableAttribute =
  | readonly [string, 'string', string]
  | readonly [string, 'boolean', boolean]
  | readonly [string, 'number', number];

function renderAttributes(entries: readonly (RenderableAttribute | undefined)[]): string {
  const present = entries.filter((entry): entry is RenderableAttribute => entry !== undefined);
  if (present.length === 0) {
    return '';
  }
  return `@{${present.map(([key, datatype, value]) => `${formatBindingKey(key)}:${datatype}=${formatAttributeValue(datatype, value)}`).join(',')}}`;
}

function formatAttributeValue(datatype: 'string' | 'boolean' | 'number', value: string | boolean | number): string {
  switch (datatype) {
    case 'string':
      return formatString(String(value));
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return String(value);
    default: {
      const exhaustive: never = datatype;
      return exhaustive;
    }
  }
}

function formatBindingKey(key: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : formatString(key);
}

function formatString(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
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
