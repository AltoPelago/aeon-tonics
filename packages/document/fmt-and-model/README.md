# Fmt AND Model

`@aeon-tonics/fmt-and-model` is the AES-native document model package for `&ND`.

It is intended to play the same ecosystem role for `&ND` that `@aeon-tonics/fmt-md-model` plays
for `fmt.md`:

1. import AES or AEON-shaped input
2. materialize a typed runtime document model
3. mutate that model explicitly
4. export back to AES

This package is now in its first implementation slice.
It currently supports AES and AEON import/export for a strict `&ND`-shaped node vocabulary, while
keeping `&ND` text parsing itself in `and-core`.

## Relationship To `and-core`

`and-core` remains the format engine.

It owns:

- `&ND` text parsing
- canonical `&ND` emission
- diagnostics
- HTML projection

`fmt-and-model` owns:

- `AES -> typed &ND document model`
- typed `&ND` document model -> `AES`
- optional helpers that use `and-core` for `&ND text -> model` and `model -> canonical &ND`

That keeps the boundaries clean:

- language truth in `and-core`
- AES-facing semantic materialization in `fmt-and-model`

See [`FMT_AND_REFERENCE.md`](./FMT_AND_REFERENCE.md) for the currently implemented node vocabulary
and AEON mapping.
See [`FMT_AND_MIGRATION.md`](./FMT_AND_MIGRATION.md) for the replacement path away from
`fmt-md-*`.
See [`../fmt-and-editor/CHOOSING_A_LAYER.md`](../fmt-and-editor/CHOOSING_A_LAYER.md) for guidance
on when to stay at the model layer and when to use the editor layer.

## Public Surface

- `FmtAndDocument`
- `createTextNode(...)`
- `createParagraphNode(...)`
- `createHeadingNode(...)`
- `createStrongNode(...)`
- `createEmphasisNode(...)`
- `createCodeNode(...)`
- `createLinkNode(...)`
- `createListNode(...)`
- `createListItemNode(...)`
- `createBlockquoteNode(...)`
- `createCodeBlockNode(...)`
- `createDocumentFragmentNode(...)`
- `createExtensionBlockNode(...)`
- `createTableCellNode(...)`
- `createTableNode(...)`
- `createHorizontalRuleNode(...)`
- `appendBlock(...)`
- `appendParagraph(...)`
- `appendHeading(...)`
- `appendCodeBlock(...)`
- `appendList(...)`
- `appendListItem(...)`
- `appendBlockquote(...)`
- `appendTable(...)`
- `appendExtensionBlock(...)`
- `appendHorizontalRule(...)`
- `appendText(...)`
- `appendInline(...)`
- `replaceInlineChildren(...)`
- `getNodeAtPath(...)`
- `replaceNodeAtPath(...)`
- `removeNodeAtPath(...)`
- `insertBlockAtPath(...)`
- `insertInlineAtPath(...)`
- `createFmtAndDocumentFromAeon(...)`
- `createFmtAndDocumentFromAes(...)`
- `createFmtAndDocumentFromNdDocument(...)`
- `parseFmtAndDocument(...)`
- `collectFmtAndDiagnostics(...)`
- `exportFmtAndAes(...)`
- `exportFmtAndAeon(...)`
- `emitFmtAndCanonical(...)`
- `renderFmtAndHtml(...)`
- `toNdDocument(...)`

## Intended Vocabulary

The first slice should stay close to the `and-core` AST contract and the `fmt.and` reference:

- `document`
- `paragraph`
- `heading`
- `list`
- `list_item`
- `blockquote`
- `code_block`
- `extension_block`
- `table`
- `horizontal_rule`
- `text`
- `strong`
- `emphasis`
- `code`
- `link`

Fallback content should remain attached to `extension_block` as a local child property, not as a
free-standing node.

## Current First Slice

The current implemented slice includes:

1. typed document interfaces close to the `and-core` AST contract
2. `createFmtAndDocumentFromAeon(...)`
3. `createFmtAndDocumentFromAes(...)`
4. structural bridging from the `and-core` AST contract with:
   - `createFmtAndDocumentFromNdDocument(...)`
   - `toNdDocument(...)`
5. optional text bridging through the `and-core` root API with:
   - `parseFmtAndDocument(...)`
   - `collectFmtAndDiagnostics(...)`
   - `emitFmtAndCanonical(...)`
   - `renderFmtAndHtml(...)`
6. `exportFmtAndAes(...)`
7. AEON export through the sibling minizer
8. round-trip coverage for headings, paragraphs, lists, blockquotes, code blocks, extension blocks
   with fallback, and tables

The `and-core` bridge is intentionally dynamic and optional.
It keeps `fmt-and-model` from depending on parser internals while still allowing end-to-end text
workflows when an `and-core` checkout is present.

## Editing Model

`FmtAndDocument` is intended to be edited as a normal explicit object tree.
There is no hidden proxy layer or special mutation API in this first slice.

Typical flow:

1. parse or import into `FmtAndDocument`
2. use the small editing helpers for routine changes, or modify arrays directly when needed
3. export to AES, AEON, canonical `&ND`, HTML, or `NdDocument`

Example:

```ts
const parsed = await parseFmtAndDocument(`&ND v1

# Guide

This is [* deterministic].
`);

if (!parsed.ok) {
  throw new Error(parsed.errorCode);
}

const intro = parsed.document.root.children[1];
if (intro?.type === 'paragraph') {
  appendText(intro, ' It now includes a second sentence.');
}

appendParagraph(parsed.document, 'This paragraph was appended through the live model.');
appendHeading(parsed.document, 2, 'Notes');
appendBlockquote(parsed.document, 'Quoted guidance');
appendExtensionBlock(parsed.document, 'document/meta', 'title = "Guide"', {
  fallback: 'Metadata unavailable.',
});
appendCodeBlock(parsed.document, 'title = "Guide"', { language: 'aeon', ordered: true });
appendTable(parsed.document, ['Name', 'Value'], [[
  'Guide',
  [createCodeNode('1')],
]]);
appendHorizontalRule(parsed.document);
insertInlineAtPath(parsed.document, [1, 0], 'Updated: ', { position: 'before' });
appendParagraph(parsed.document, [
  'See ',
  createLinkNode('https://example.test', [
    'the ',
    createCodeNode('guide'),
  ]),
  ' and read ',
  createStrongNode('carefully'),
  '.',
]);

const canonical = await emitFmtAndCanonical(parsed.document, { profile: 'standalone' });
```

For a runnable version of that flow, see
[`examples/fmt-and-model-workflow`](../../examples/fmt-and-model-workflow).

The helpers are intentionally small and explicit.
They are there to reduce array boilerplate for common edits, not to hide the underlying tree shape.
The current emphasis is on common prose-building operations rather than deep schema automation.
Mixed inline content can now be composed from plain strings and inline node helpers in the same
array, which keeps paragraph construction concise without hiding the final tree.
The block-level helper set now also covers code blocks, simple tables, and horizontal rules.
For structural edits where you only know the position and not the object reference up front, the
path helpers provide a small typed mutation layer over the same tree.
If your code starts to look like repeated path lookup plus routine semantic edit steps, that is the
point where [`@aeon-tonics/fmt-and-editor`](../fmt-and-editor/README.md) is usually the better fit.

## Source Of Truth

See:

- `../and-core/docs/spec/v1/fmt-and-reference.md` in a sibling `and-core` checkout
- `../and-core/docs/spec/v1/and-public-api.md` in a sibling `and-core` checkout

Those documents define the current intended boundary more precisely than this package README.
