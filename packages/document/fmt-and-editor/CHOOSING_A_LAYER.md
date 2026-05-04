# Choosing A Layer

Use this quick guide when deciding whether to work directly with
[`@aeon-tonics/fmt-and-model`](../fmt-and-model/README.md) or step up to
[`@aeon-tonics/fmt-and-editor`](./README.md).

## Use `fmt-and-model` When

- you are building or traversing the `FmtAndDocument` tree directly
- you want exact control over node shape and ordering
- you are constructing rich documents from application data
- you need low-level path access such as `getNodeAtPath(...)` or `replaceNodeAtPath(...)`
- you want the smallest possible abstraction over the `&ND` document structure

Typical examples:

- create a document from AES or AEON
- append a table, code block, or extension block
- build mixed inline content from strings plus strong/link/code nodes
- perform custom tree walking or custom semantic transforms

## Use `fmt-and-editor` When

- you already have a `FmtAndDocument`
- your change is a common semantic edit rather than custom tree construction
- you want a shorter app-facing API for routine operations
- you would otherwise keep rewriting the same path lookup plus insert/replace/remove sequence

Typical examples:

- insert a paragraph before or after another block
- replace paragraph or heading text
- wrap a block in a blockquote or unwrap one
- set or clear an extension fallback
- remove a block or inline node by path

## Rule Of Thumb

Use `fmt-and-model` as the source of truth.
Use `fmt-and-editor` as a convenience layer on top of that source of truth.

If an operation feels like:

- "build this structure" -> `fmt-and-model`
- "edit this existing structure" -> `fmt-and-editor`

## Practical Workflow

1. Parse or import into `FmtAndDocument` with `fmt-and-model`
2. Perform routine semantic edits with `fmt-and-editor`
3. Drop back to `fmt-and-model` when you need a custom or low-level tree operation
4. Export to AES, AEON, canonical `&ND`, or HTML with `fmt-and-model`
