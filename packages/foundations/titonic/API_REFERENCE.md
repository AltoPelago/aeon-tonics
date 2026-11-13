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

These low-level mutation paths are distinct from public portable occurrence
paths. `resolveTitonicAddress(doc, '$.view[0][0]')` resolves the same first
child through the portable `NodeLiteral -> NodeHead -> content` hierarchy. Its
binding returns `portablePath` and `pathText`; `titonicPath` is available when a
caller must pass the result to a low-level Titonic mutation helper.

## SANSA Address Resolution

### Read-only child identity resolution (candidate)

`resolveTitonicAddress(document, '$.items.\\item1\\', options?)` selects the
exposed direct child with that authored structural identity. Chaining follows
parent-child relationships. Results keep `exact: false`, canonical `pathText`,
`portablePath` and existing internal `titonicPath`; identity expressions do not
become canonical paths. Quoted marker-shaped keys remain ordinary member keys.

`TitonicResolveOptions.maxIdentityInspections` is a nonnegative safe integer,
default 10,000. One call shares this logical budget across every parent and
chained/repeated identity step, including missing IDs and misses. All siblings
are inspected to detect ambiguity. Ambiguity, malformed metadata or budget
exhaustion return diagnostics and no bindings. Scan diagnostics retain SANSA
codes and optional `identity`, `limit`, `observed` and `selectorIndex` context.
Actual enumeration/allocation cost is separate from logical inspections.

Value occurrences use binding IDs; `NodeLiteral -> NodeHead` traversal exposes
the head ID independently. A binding's ID does not select its head, or vice
versa. Alias bindings use their own IDs, not target IDs; navigation beneath
aliases keeps current portable paths. Identity-selected container values use
the existing live proxy view, including pointer sharing and clone copy-on-write.
Reading does not detach a clone or rewrite its structural reference target.

Results describe the synchronous call's observed state. Proxies remain live;
stored paths may become stale after edits. Re-resolve after reordering rather
than treating an identity or saved result as durable occurrence/authorisation
proof. This adds no identity-aware mutation planner or SO support.

Contextual roots still require `contextPath`; the scope root is not one of its
own children. Attribute/local spaces remain explicitly unsupported. Qualified
identity addresses are rejected because this dispatcher has no qualifier
evaluator. Caller identity ASTs are normalized and exactness is recomputed.
New recursive/root-search syntax, global lookup and identity reference targets
are outside this capability. Titonic still rejects SymbolicLiteral values
explicitly; parser acceptance alone does not extend its value model.

Titonic imports its declared `@altopelago/sansa` package. The private npm workspace
installs the reviewed development archive; see the root candidate setup. No
sibling SANSA source checkout is required. Other AEON imports still use the
documented sibling workspace, so standalone registry packaging remains unqualified.
Official releases, final registry pins and platform qualification remain separate.

Read-only address resolution uses that SANSA package's capabilities. Exporting a
`titonicSansa(...)` scalar instead uses the active AEON compiler's literal AST.
An address accepted by the resolver may exceed an older compiler's literal
capabilities; export then throws `TypeError` rather than constructing an unsupported
AST. The coordinated candidate compiler supports child-identity literals; older
compiler installations retain their existing literal boundary. Reference targets
and identity admission to mutation/SO are unchanged.

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
