# Using Titonic

This guide shows the intended way to work with Titonic.

The goal is not to list every API first.

The goal is to show the shortest path to being productive, and then show when to drop down into the
more explicit APIs.

## Mental Model

Titonic is a live document model for strict AEON.

That means:

- ordinary values should feel natural to read and write in TypeScript
- AEON-specific values should keep their meaning instead of collapsing into plain JS values
- exports back to AES and AEON should stay honest
- clone and pointer references should keep their real semantics

In practice, there are three tiers of interaction:

1. direct proxy-based document edits
2. path-based cursor edits with `titonicAt(...)`
3. low-level explicit helpers for advanced metadata and construction work

## Start Here: Direct Document Edits

For the simplest cases, just use the document like a live object.

```ts
import {
  createTitonicFromAeon,
  exportTitonicAeon,
} from './src/index.js'

const doc = createTitonicFromAeon(`
aeon:mode = "strict"
config:object = { retries:number = 2, enabled:boolean = true }
`)

doc.config.retries = 3
doc.config.enabled = false

const aeon = exportTitonicAeon(doc, { trailingNewline: false })
```

This is the preferred path when:

- you already know the shape you want to edit
- you are working with ordinary object and list values
- you want the most natural TypeScript feel

## Use `titonicAt(...)` For Path-Oriented Work

When you need to work by path instead of by direct property access, use `titonicAt(...)`.

```ts
import {
  TITONIC_CHILDREN,
  titonicAt,
} from './src/index.js'

const count = titonicAt(doc, ['config', 'retries'])

count.get()
count.set(5)
count.delete()

count.attributes.get('unit')
count.attributes.set('unit', 'ms')
count.attributes.setAnnotation('unit', 'source', 'ui')

const firstChild = titonicAt(doc, ['view', TITONIC_CHILDREN, 0])
firstChild.get()
```

This is the preferred path when:

- the path is dynamic
- you are building tooling, editors, migrations, or transforms
- you want one handle that groups value and metadata operations together
- you need to address node children explicitly

## Use Constructor Helpers When Meaning Matters

When a value should stay AEON-native, construct it explicitly.

```ts
import {
  titonicDate,
  titonicElement,
  titonicHex,
} from './src/index.js'

doc.color = titonicHex('#FF00AA')
doc.created = titonicDate('2026-04-24')
doc.view = titonicElement('panel', ['hello'], { datatype: 'node' })
```

Use constructor helpers when:

- a plain JS string would lose AEON meaning
- you are creating node values directly
- you want mutation safety to stay aligned with declared AEON intent

## Use Low-Level Metadata Helpers Only When Needed

Most users should not start here.

These helpers exist for precise control:

- binding attributes by path
- nested binding attribute annotations by path
- node-head attributes by element
- nested node-head attribute annotations by element

Examples:

```ts
import {
  getTitonicNodeAttribute,
  setTitonicNodeAttribute,
  setTitonicAttribute,
} from './src/index.js'

setTitonicAttribute(doc, ['config', 'retries'], 'unit', 'ms')
setTitonicNodeAttribute(doc.view, 'id', 'hero')
getTitonicNodeAttribute(doc.view, 'id')
```

Reach for these when:

- you are editing AEON metadata itself, not just values
- you are writing specialized tooling
- the cursor API is still not specific enough for what you need

## References: What To Expect

Titonic preserves the difference between pointer and clone references.

Pointer:

```aeon
mirror = ~>base
```

- edits through `mirror` update `base`

Clone:

```aeon
copy = ~base
```

- read-only access stays symbolic where possible
- mutation detaches the clone
- once detached, export becomes concrete

This behavior applies across:

- direct proxy edits
- `titonicAt(...)`
- metadata helpers
- node-child addressing

## Practical Rule Of Thumb

Use this order:

1. direct property edits for the most natural code
2. `titonicAt(...)` when you need path-oriented work
3. explicit helpers when you are dealing with metadata, AEON-native constructors, or edge cases

If you follow that order, Titonic feels much smaller than the full API surface might suggest.
