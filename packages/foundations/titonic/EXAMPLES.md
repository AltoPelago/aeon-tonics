# Titonic Examples

These examples show how Titonic is meant to be used in real workflows.

They are organized by use case rather than by API name.

## 1. Config Editor

Use direct proxy edits when you already know the shape of the document.

```ts
import {
  createTitonicFromAeon,
  exportTitonicAeon,
} from './src/index.js'

const doc = createTitonicFromAeon(`
aeon:mode = "strict"
config:object = {
  retries:number = 2,
  enabled:boolean = true
}
`)

doc.config.retries = 3
doc.config.enabled = false

const nextAeon = exportTitonicAeon(doc, { trailingNewline: false })
```

This is the most natural way to work when Titonic is acting like a live in-memory settings object.

## 2. Migration Script

Use `titonicAt(...)` when the paths are dynamic or when you want one handle for value and metadata
operations together.

```ts
import {
  createTitonicFromAeon,
  exportTitonicAeon,
  titonicAt,
} from './src/index.js'

const doc = createTitonicFromAeon(`
aeon:mode = "strict"
config:object = {
  timeout:number = 500
}
`)

const timeout = titonicAt(doc, ['config', 'timeout'])
timeout.set(750)
timeout.attributes.set('unit', 'ms')
timeout.attributes.setAnnotation('unit', 'source', 'migration')

const nextAeon = exportTitonicAeon(doc, { trailingNewline: false })
```

This is a good fit for:

- migrations
- normalization passes
- codemods
- editor tooling

## 3. File-Backed UI State

Use AEON-native constructor helpers when the stored value has meaning that should not collapse into
plain JavaScript strings.

```ts
import {
  createTitonicFromAeon,
  titonicDateTime,
  titonicHex,
} from './src/index.js'

const doc = createTitonicFromAeon(`
aeon:mode = "strict"
theme:hex = #336699
updatedAt:datetime = 2026-04-24T10:30:00Z
`)

doc.theme = titonicHex('#224466')
doc.updatedAt = titonicDateTime('2026-04-25T09:00:00Z')
```

This is useful when your application keeps an AEON-backed file in memory and you do not want
serialization steps to accidentally weaken the data.

## 4. Node-Heavy Content Model

Use `TitonicElement`, `titonicElement(...)`, and `TITONIC_CHILDREN` when your document contains
structured node content.

```ts
import {
  TITONIC_CHILDREN,
  createTitonicFromAeon,
  titonicAt,
  titonicElement,
} from './src/index.js'

const doc = createTitonicFromAeon(`
aeon:mode = "strict"
view:node = <panel:node("hello", <br:node>)>
`)

const secondChild = titonicAt(doc, ['view', TITONIC_CHILDREN, 1])
secondChild.set(titonicElement('hr', [], { datatype: 'node' }))
```

This keeps node children path-addressable without pretending they are ordinary object keys.

## 5. Clone And Pointer Workflows

Titonic preserves the difference between `~>` and `~`.

```ts
import {
  createTitonicFromAeon,
  titonicAt,
} from './src/index.js'

const doc = createTitonicFromAeon(`
aeon:mode = "strict"
base:object = { count:number = 1 }
mirror:object = ~>base
copy:object = ~base
`)

titonicAt(doc, ['mirror', 'count']).set(8)
titonicAt(doc, ['copy', 'count']).set(9)
```

Result:

- `mirror.count` updates `base.count`
- `copy.count` detaches from `base` and becomes concrete on export

## Choosing A Style

Use this rule of thumb:

1. If the code already knows the shape, use direct proxy edits.
2. If the code needs to work by path, use `titonicAt(...)`.
3. If the code needs AEON-specific construction or metadata control, use the explicit helpers.
