# fmt.and Reference

This document describes the current implemented `fmt.and` profile for
`@aeon-tonics/fmt-and-model`.

`fmt.and` represents `&ND`-shaped content as AEON-native node structure.
`&ND` text parsing remains the job of `and-core`; this package owns semantic projection to and
from AES.

For guidance on when to stay at this layer and when to step up to the higher-level editor helpers,
see [`../fmt-and-editor/CHOOSING_A_LAYER.md`](../fmt-and-editor/CHOOSING_A_LAYER.md).

## Pipeline

The current first-slice pipeline is:

1. AEON or AES projects into a restricted `FmtAndDocument`
2. `FmtAndDocument` exports to AES or minimized AEON
3. optional bridges may convert between `FmtAndDocument` and parsed `&ND` ASTs from `and-core`
4. optional bridges may parse `&ND` text into `FmtAndDocument` or emit canonical `&ND` text back out

The model owns semantic projection and AES export.
Language parsing and canonical text emission remain separate.

If you want a thinner app-facing editing layer for common semantic operations over an existing
`FmtAndDocument`, that belongs in [`@aeon-tonics/fmt-and-editor`](../fmt-and-editor/README.md),
not in this reference surface itself.

## Root

The root must be a top-level AEON `node` binding with tag `document`.

Example:

```aeon
doc:node = <document(
  <heading@{level:number=1}("Hello World")>,
  <paragraph("This is ", <strong("important")>, ".")>
)>
```

When no explicit root key is supplied, the model picks the first top-level `document` node.

## Block Nodes

### `document`

Allowed children:

- block nodes

### `paragraph`

Allowed children:

- inline nodes
- string text

AEON strings are projected as `text` inline nodes.

### `heading`

Required attributes:

- `level:number`

Allowed values:

- `1` through `6`

Allowed children:

- inline nodes
- string text

### `list`

Required or supported attributes:

- `ordered:boolean`

If `ordered` is omitted during AES projection, it defaults to `false`.

Allowed children:

- `list_item` nodes

### `list_item`

Allowed children:

- block nodes

`list_item` is only valid as a child of `list`.

### `blockquote`

Allowed children:

- block nodes

### `code_block`

Supported attributes:

- `ordered:boolean`
- `language:string`

Allowed children:

- exactly one string child

### `extension_block`

Required attributes:

- `name:string`

Allowed children:

- exactly one string payload child
- optionally one `document_fragment` fallback child after the payload

Example:

```aeon
<extension_block@{name:string="document/meta"}(
  "title = \"Hello\"",
  <document_fragment(<paragraph("Metadata unavailable.")>)>
)>
```

### `document_fragment`

Allowed children:

- block nodes

This node is currently only valid as fallback content attached to `extension_block`.

### `table`

Allowed children:

- one `table_header` node first
- zero or more `table_row` nodes after the header

### `table_header`

Allowed children:

- `table_cell` nodes

### `table_row`

Allowed children:

- `table_cell` nodes

### `table_cell`

Allowed children:

- inline nodes
- string text

### `horizontal_rule`

Allowed children:

- none

## Inline Nodes

### `text`

Text is represented in AEON as ordinary string children.

### `strong`

Allowed children:

- inline nodes
- string text

### `emphasis`

Allowed children:

- inline nodes
- string text

### `code`

Allowed children:

- exactly one string child

### `link`

Required attributes:

- `href:string`

Allowed children:

- inline nodes
- string text

## Current Package Scope

The current implementation supports:

- document import from AEON source or AES
- structural conversion from the `and-core` AST contract
- optional `and-core` text parsing bridge
- optional `and-core` canonical text emission bridge
- document export to AES
- minimized AEON export
- block nodes:
  - `paragraph`
  - `heading`
  - `list`
  - `list_item`
  - `blockquote`
  - `code_block`
  - `extension_block`
  - `table`
  - `horizontal_rule`
- inline nodes:
  - `text`
  - `strong`
  - `emphasis`
  - `code`
  - `link`

Current exclusions:

- HTML rendering
- editor recovery behavior

HTML rendering and recovery behavior belong in `and-core` or later bridge/projector packages.

## Relationship To `fmt-and-editor`

`fmt-and-model` is the lower-level tree and bridge layer.

It should remain the place for:

- typed node definitions
- import and export boundaries
- construction helpers
- path helpers
- direct structural access

`fmt-and-editor` sits above it as a convenience layer for common semantic edit operations such as:

- insert before or after
- replace paragraph or heading text
- wrap or unwrap a blockquote
- set or clear extension fallback
- remove a block or inline node by path

That keeps this reference focused on the document model itself while still giving apps a shorter
editing layer when they want one.

## Current AST Bridge

The package currently includes a structural bridge for the `and-core` AST contract:

- `createFmtAndDocumentFromNdDocument(...)`
- `toNdDocument(...)`

This bridge intentionally normalizes the small shape differences between the two layers:

- `NdText.value` <-> `FmtAnd text.text`
- `NdList.items` <-> `FmtAnd list.children`
- `NdCodeBlock.language: null` <-> omitted `language` in `FmtAnd`

That lets `fmt-and-model` interoperate with parsed `&ND` documents without importing parser
internals from `and-core`.

## Current Text Bridge

The package also includes optional async helpers that dynamically load the `and-core` root API from
its repository checkout:

- `parseFmtAndDocument(...)`
- `collectFmtAndDiagnostics(...)`
- `emitFmtAndCanonical(...)`
- `renderFmtAndHtml(...)`

These helpers are intentionally async because they rely on dynamic module loading across repo
boundaries.
They are a bridge convenience, not the core semantic responsibility of `fmt-and-model`.
