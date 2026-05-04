# Titonic API Reference

This document is the compact reference for Titonic's public surface.

For day-to-day usage order, start with [`USING_TITONIC.md`](./USING_TITONIC.md).
For scenario-driven examples, see [`EXAMPLES.md`](./EXAMPLES.md).

## Recommended Usage Order

Use Titonic in this order:

1. direct proxy edits for ordinary document work
2. `titonicAt(...)` for path-oriented workflows
3. explicit low-level helpers when you need metadata or advanced control

## Creation And Export

- `createTitonicFromAeon(source, options?)`
  Creates a live Titonic document from AEON source.
  Options: `requireStrictMode?: boolean`, `maxAttributeDepth?: number`.
- `createTitonicFromAes(events, options?)`
  Creates a live Titonic document from AES.
- `exportTitonicAes(document)`
  Exports the current document state as AES.
- `exportTitonicAeon(document, options?)`
  Exports the current document state as minimized AEON.

## Direct Document Model

Imported documents are exposed as live proxies:

- objects behave like mutable JavaScript objects
- lists behave like mutable arrays
- tuples behave like fixed-arity arrays
- node literals behave like `TitonicElement`

Core public types:

- `TitonicValue`
- `TitonicObject`
- `TitonicList`
- `TitonicTuple`
- `TitonicElement`
- `TitonicNativeScalar`

## Native AEON Scalar Constructors

Use these when a value should remain an AEON-native scalar instead of becoming a plain string:

- `titonicSwitch(...)`
- `titonicHex(...)`
- `titonicRadix(...)`
- `titonicEncoding(...)`
- `titonicSeparator(...)`
- `titonicDate(...)`
- `titonicDateTime(...)`
- `titonicTime(...)`

## Node Construction And Inspection

- `titonicElement(tag, children?, options?)`
  Creates a new node value.
- `isTitonicElement(value)`
  Checks whether a value is a live Titonic element.
- `getTitonicNodeAttributes(element)`
  Reads all node-head attributes.
- `getTitonicNodeAttribute(element, key)`
  Reads one node-head attribute.

## Node-Head Attribute CRUD

- `setTitonicNodeAttribute(element, key, value, options?)`
- `deleteTitonicNodeAttribute(element, key)`
- `getTitonicNodeAttributeAnnotations(element, key)`
- `getTitonicNodeAttributeAnnotation(element, key, annotationKey)`
- `setTitonicNodeAttributeAnnotation(element, key, annotationKey, value, options?)`
- `deleteTitonicNodeAttributeAnnotation(element, key, annotationKey)`

## Path-Oriented Value CRUD

Use these when the code is working with paths instead of direct property access:

- `getTitonicValue(document, path)`
- `setTitonicValue(document, path, value)`
- `deleteTitonicValue(document, path)`

`TitonicPathSegment` supports ordinary reference-path segments plus the explicit child marker
`TITONIC_CHILDREN`.

Example:

```ts
getTitonicValue(doc, ['view', TITONIC_CHILDREN, 0]);
```

## Path-Oriented Binding Attribute CRUD

- `getTitonicAttributes(document, path)`
- `getTitonicAttribute(document, path, key)`
- `setTitonicAttribute(document, path, key, value, options?)`
- `deleteTitonicAttribute(document, path, key)`
- `getTitonicAttributeAnnotations(document, path, key)`
- `getTitonicAttributeAnnotation(document, path, key, annotationKey)`
- `setTitonicAttributeAnnotation(document, path, key, annotationKey, value, options?)`
- `deleteTitonicAttributeAnnotation(document, path, key, annotationKey)`

## Cursor API

`titonicAt(document, path)` is the ergonomic wrapper over the path APIs.

It returns a `TitonicCursor` with:

- `get()`
- `set(value)`
- `delete()`
- `attributes.get(key)`
- `attributes.getAll()`
- `attributes.set(key, value, options?)`
- `attributes.delete(key)`
- `attributes.getAnnotation(key, annotationKey)`
- `attributes.getAnnotations(key)`
- `attributes.setAnnotation(key, annotationKey, value, options?)`
- `attributes.deleteAnnotation(key, annotationKey)`

## Reference Semantics

Titonic preserves AEON reference meaning:

- `~>path` is a live alias
- `~path` is a lazy clone

That rule applies consistently across:

- direct proxy edits
- path-based value edits
- cursor edits
- node-child traversal
- attribute mutation

## Choosing The Right API

- Use direct proxy edits when the code already has the object in hand.
- Use `titonicAt(...)` when the code is built around paths, selections, or editor tooling.
- Use low-level attribute helpers when metadata is the primary concern.
- Use native scalar constructors when a value must preserve AEON literal meaning.
