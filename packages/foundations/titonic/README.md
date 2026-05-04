# Titonic

`@aeon-tonics/titonic` is a type-integrated tonic for AEON.

Its purpose is to materialize strict AEON data as a live TypeScript document model that can be
read, updated, and exported without losing alignment with the AES ecosystem.

## Intent

Titonic is for cases where AEON is not just an input blob to deserialize once, but a document that
should remain safe while it is being manipulated in memory.

The motivating idea is:

```aeon
a:number = 2
```

```ts
titononic.a = 2
```

and that assignment should continue to respect the declared AEON intent.
For example, a `number` field should not silently accept `NaN` or `Infinity` unless the field is
explicitly declared to support those values.

## Charter

Titonic exists to provide:

- a live TypeScript document model for strict AEON data
- runtime mutation safety for in-memory edits
- deterministic import from AEON source or AES
- deterministic export back to AES
- interoperability with the wider AEON toolchain without re-owning schema validation

Titonic does not exist to replace the rest of the stack.

## Core Principles

- Titonic owns runtime mutation safety, not schema validation.
- Titonic should import from AEON source or AES and export back to AES deterministically.
- Titonic should preserve declared datatype intent during in-memory mutation.
- Titonic should play cleanly with AEOS by exporting AES rather than embedding schema logic.
- Titonic is one materialization strategy, not the default or only way to use AEON in TypeScript.
- Titonic should prioritize document integrity and round-trip safety over maximal convenience.

## Relationship To The AEON Stack

Titonic sits alongside the rest of the AEON phases rather than replacing them.

Typical flow:

1. compile AEON source into AES, or receive AES directly
2. load the data into Titonic
3. perform reads, updates, creates, and deletes through the live object model
4. export AES from Titonic
5. pass exported AES to AEOS if schema validation is needed
6. emit AEON again if desired

In that flow:

- `@aeon/core` owns parsing and AES emission
- `@aeos/core` owns schema validation
- Titonic owns live in-memory document behavior

## Why This Exists

Plain finalized JSON is often enough when an application only needs read access.

Titonic becomes useful when the application keeps a document resident in memory and mutates it over
time.

Examples:

- configuration editors
- internal file-format tooling
- applications with file-backed state
- migration tools that update documents programmatically
- UIs that need to edit AEON-backed data safely

The main value is that the in-memory representation itself carries mutation constraints, instead of
depending on a later "serialize and hope" step.

## Scope Of The Current First Slice

The current implementation is intentionally narrow.

Today Titonic focuses on:

- strict-mode source or AES import
- live getters and setters through a proxy-backed object model
- basic CRUD over objects and lists
- fixed-arity tuple materialization and indexed tuple updates
- node literal materialization as live element objects
- typed runtime handling for:
  - `number`
  - `string`
  - `boolean`
  - `null`
  - `object`
  - `list`
  - `tuple`
  - `node`
  - explicit `nan`
  - explicit `infinity`
  - native AEON scalar wrappers for `switch`, `hex`, `radix`, `encoding`, `separator`, `date`, `datetime`, and `time`
- AES export
- AEON export through the sibling minizer tonic
- binding attribute preservation and explicit attribute lookup

Native AEON scalar wrappers are used when a literal has meaning that should not be flattened into a
plain JavaScript string. For example, `color:hex = #ff00ff` is exposed as a `TitonicNativeScalar`
with `kind: "hex"` and `raw: "#ff00ff"`. Updating that field requires a matching helper such as
`titonicHex("#00ff00")`, which keeps the document from accidentally replacing a hex literal with an
ordinary string.

The current helper set is:

- `titonicSwitch("yes" | "no" | "on" | "off")`
- `titonicHex(...)`
- `titonicRadix(...)`
- `titonicEncoding(...)`
- `titonicSeparator(...)`
- `titonicDate(...)`
- `titonicDateTime(...)`
- `titonicTime(...)`

Tuple values are exposed as array-like `TitonicTuple` proxies. They support read access, iteration,
and indexed replacement, but they intentionally reject shape-changing operations such as `push`,
`pop`, `splice`, element deletion, or `length` changes so the tuple arity remains faithful to AEON.

Node literals are exposed as `TitonicElement` objects with:

- `tag`
- optional head `datatype`
- live `children`

Use `titonicElement(...)` to create new node values. Imported node head attributes are preserved and
can be inspected with `getTitonicNodeAttributes(...)` or `getTitonicNodeAttribute(...)`.

Node head attributes can be mutated explicitly with:

- `setTitonicNodeAttribute(...)`
- `deleteTitonicNodeAttribute(...)`

Nested annotations on node-head attributes can be inspected and mutated with:

- `getTitonicNodeAttributeAnnotations(...)`
- `getTitonicNodeAttributeAnnotation(...)`
- `setTitonicNodeAttributeAnnotation(...)`
- `deleteTitonicNodeAttributeAnnotation(...)`

If a source document uses nested attribute heads, pass `maxAttributeDepth` to
`createTitonicFromAeon(...)` or set the upstream compile option before Titonic sees the AES.

The same explicit metadata pattern is also available for ordinary binding attributes through document
paths:

- `getTitonicAttribute(...)`
- `getTitonicAttributes(...)`
- `setTitonicAttribute(...)`
- `deleteTitonicAttribute(...)`
- `getTitonicAttributeAnnotations(...)`
- `getTitonicAttributeAnnotation(...)`
- `setTitonicAttributeAnnotation(...)`
- `deleteTitonicAttributeAnnotation(...)`

Ordinary values can now also be read and mutated by document path with:

- `getTitonicValue(...)`
- `setTitonicValue(...)`
- `deleteTitonicValue(...)`

These path-based value operations respect Titonic’s clone and pointer semantics in the same way as
proxy-based edits.

Node children can be addressed in those path APIs with the explicit `TITONIC_CHILDREN` segment, for
example `['view', TITONIC_CHILDREN, 0]`. This keeps child traversal unambiguous instead of
overloading a plain string key like `"children"`.

For a more ergonomic path-oriented workflow, use `titonicAt(...)`:

```ts
const count = titonicAt(doc, ['config', 'count'])

count.get()
count.set(8)
count.attributes.get('unit')
count.attributes.set('unit', 'ms')
count.attributes.setAnnotation('unit', 'source', 'ui')
```

`titonicAt(...)` is a thin cursor over the same explicit low-level path APIs.

Node references follow the same core Titonic reference rules:

- `~>view` remains a live alias to the node
- `~view` remains a lazy clone

For node clones, read-only traversal through `tag` and `children` stays symbolic. The clone only
detaches once a real mutation occurs, including nested child-node edits.

This is the "basic types first" foundation, not the full end-state.

## Non-Goals

Titonic is not:

- a replacement for `@aeos/core`
- a replacement for plain `finalizeJson()` when plain data is enough
- a full schema engine
- a full reimplementation of all AEON runtime phases inside one package
- the only or default AEON materialization strategy in TypeScript

## Design Boundary

Titonic should remain an integrated document model that plays nicely with the AES ecosystem.

That means:

- keep import and export centered on AES
- keep schema logic outside Titonic
- avoid baking application-specific domain semantics into the shared package too early
- expand support incrementally without blurring phase ownership

## Public API Overview

Titonic now has three main usage layers:

1. direct proxy edits for ordinary document work
2. `titonicAt(...)` for path-oriented workflows
3. explicit low-level helpers for metadata and advanced cases

The main public surface includes:

- creation and export:
  - `createTitonicFromAeon(...)`
  - `createTitonicFromAes(...)`
  - `exportTitonicAes(...)`
  - `exportTitonicAeon(...)`
- ergonomic path cursor:
  - `titonicAt(...)`
- path-based value helpers:
  - `getTitonicValue(...)`
  - `setTitonicValue(...)`
  - `deleteTitonicValue(...)`
- binding attribute helpers:
  - `getTitonicAttributes(...)`
  - `getTitonicAttribute(...)`
  - `setTitonicAttribute(...)`
  - `deleteTitonicAttribute(...)`
  - `getTitonicAttributeAnnotations(...)`
  - `getTitonicAttributeAnnotation(...)`
  - `setTitonicAttributeAnnotation(...)`
  - `deleteTitonicAttributeAnnotation(...)`
- node helpers:
  - `titonicElement(...)`
  - `isTitonicElement(...)`
  - `getTitonicNodeAttributes(...)`
  - `getTitonicNodeAttribute(...)`
  - `setTitonicNodeAttribute(...)`
  - `deleteTitonicNodeAttribute(...)`
  - `getTitonicNodeAttributeAnnotations(...)`
  - `getTitonicNodeAttributeAnnotation(...)`
  - `setTitonicNodeAttributeAnnotation(...)`
  - `deleteTitonicNodeAttributeAnnotation(...)`
- native scalar constructors:
  - `titonicSwitch(...)`
  - `titonicHex(...)`
  - `titonicRadix(...)`
  - `titonicEncoding(...)`
  - `titonicSeparator(...)`
  - `titonicDate(...)`
  - `titonicDateTime(...)`
  - `titonicTime(...)`

For the compact reference, see [`API_REFERENCE.md`](./API_REFERENCE.md).

Reference design note:

- intended day-to-day workflow is documented in [`USING_TITONIC.md`](./USING_TITONIC.md)
- compact API reference is documented in [`API_REFERENCE.md`](./API_REFERENCE.md)
- scenario-based examples are documented in [`EXAMPLES.md`](./EXAMPLES.md)
- planned clone and pointer semantics are documented in [`REFERENCE_MODEL.md`](./REFERENCE_MODEL.md)
- current API-shape and usability notes are documented in [`ERGONOMICS.md`](./ERGONOMICS.md)
