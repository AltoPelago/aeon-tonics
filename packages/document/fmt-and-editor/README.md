# Fmt AND Editor

`@aeon-tonics/fmt-and-editor` is a thin convenience layer over
[`@aeon-tonics/fmt-and-model`](../fmt-and-model/README.md).

It is for app-style operations where you know what you want to do semantically, but do not want to
manually combine path lookups, node constructors, and replacement calls each time.

See [`CHOOSING_A_LAYER.md`](./CHOOSING_A_LAYER.md) for a quick decision guide between
`fmt-and-model` and `fmt-and-editor`.

Current first slice:

- `insertParagraphBefore(...)`
- `insertParagraphAfter(...)`
- `insertHeadingBefore(...)`
- `insertHeadingAfter(...)`
- `replaceParagraphText(...)`
- `replaceHeadingText(...)`
- `wrapBlockInBlockquote(...)`
- `unwrapBlockquote(...)`
- `setExtensionFallback(...)`
- `clearExtensionFallback(...)`
- `removeBlockAtPath(...)`
- `removeInlineAtPath(...)`

The package intentionally stays small.
It should make common edits shorter without hiding that the underlying source of truth is still the
explicit `FmtAndDocument` tree from `fmt-and-model`.
