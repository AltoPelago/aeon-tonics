# Titonic Ergonomics

This note looks at Titonic from the perspective of someone trying to build with it, rather than from
the perspective of internal runtime coverage.

The question is not "can Titonic do this?" anymore.

The question is now "does Titonic feel natural to use?"

## Where Titonic Feels Good

Titonic is already strong in the places that matter most for its charter:

- direct property reads and writes feel natural for ordinary strict AEON values
- tuples, nodes, references, and native AEON scalars preserve meaning instead of collapsing into
  weak JavaScript values
- export back to AES and AEON is deterministic
- clone and pointer behavior is explicit and honest

That means the core model is doing real work, not just acting as a thin wrapper.

## Where Titonic Feels Heavy

The current API surface is powerful, but it is starting to feel fragmented.

Today there are separate helpers for:

- value CRUD by path
- binding attribute CRUD by path
- nested binding attribute annotation CRUD by path
- node-head attribute CRUD by element
- nested node-head attribute annotation CRUD by element
- native scalar construction
- node construction

None of those helpers are wrong individually.

The problem is that, as a whole, the surface starts to read like:

- many verbs
- many variants of the same concept
- many names to remember before the user can work fluently

## Main Ergonomic Tension

Titonic currently has two different usage styles:

1. direct live-object manipulation

```ts
doc.config.enabled = true
doc.view.children.push(titonicElement('br', [], { datatype: 'node' }))
```

2. explicit path and metadata helpers

```ts
setTitonicValue(doc, ['config', 'enabled'], true)
setTitonicAttribute(doc, ['config', 'enabled'], 'source', 'ui')
setTitonicNodeAttribute(view, 'id', 'hero')
```

Both styles are useful.

But the second style currently exposes the internal matrix too directly.

Instead of one coherent "cursor" or "handle" model, the user has to choose between many top-level
functions.

## Current Assessment

The current API is:

- semantically strong
- mechanically explicit
- not yet especially elegant

That is a good place to be in an early runtime.

It is much better to have a correct but slightly heavy API than a pleasant-looking API that blurs
clone semantics, datatype preservation, or export honesty.

## Recommended Direction

The next ergonomic step should not be "add even more top-level helpers."

The next step should be to introduce one or two small wrapper layers that group existing behavior
without removing the explicit low-level API.

## Best Next Step

The strongest candidate was a path cursor.

That layer now exists as `titonicAt(...)`.

Conceptually:

```ts
const count = titonicAt(doc, ['config', 'count'])

count.get()
count.set(8)
count.delete()
count.attributes.get('unit')
count.attributes.set('unit', 'ms')
count.attributes.annotations.set('unit', 'source', 'ui')
```

Why this helps:

- one entry point for path-oriented work
- fewer top-level verbs to remember
- clearer grouping of value vs attribute operations
- easier discoverability in editors
- keeps the current explicit semantics

## Immediate Ergonomic Result

Titonic now has two clearer usage tiers:

1. direct proxy-based document editing for the simplest and most natural cases
2. `titonicAt(...)` for explicit path-oriented work

That is a much cleaner split than exposing only a large flat list of helper functions.

The lower-level helpers are still valuable, but they no longer need to carry the whole ergonomic
story on their own.

## Secondary Ergonomic Opportunity

Node-specific metadata could also benefit from a wrapper:

```ts
const view = titonicNode(doc.view)
view.attributes.get('id')
view.attributes.set('id', 'hero')
```

This is less urgent than the path cursor, because ordinary property interaction already makes nodes
reasonably usable.

## What Should Stay As-Is

These current choices are good and should remain:

- direct proxy-backed object usage for ordinary document edits
- explicit constructor helpers like `titonicHex(...)` and `titonicElement(...)`
- explicit `TITONIC_CHILDREN` path segment instead of overloading `"children"`
- explicit clone vs pointer behavior

Those choices protect meaning and reduce ambiguity.

## Practical Conclusion

Titonic is already credible as a document runtime.

Its biggest ergonomic issue is still not capability coverage.
Its biggest ergonomic issue is surface organization and documentation of the intended "happy path."

The next phase should focus on:

1. documenting `titonicAt(...)` as the default path-oriented API
2. preserving the current explicit low-level functions underneath
3. deciding whether node-specific cursors are actually needed, or whether `titonicAt(...)` plus live
   element proxies is already enough
