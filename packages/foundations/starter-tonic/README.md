# Starter Tonic

`@aeon-tonics/starter-tonic` is a deliberately small example tonic for authors who want to build
their own AES consumer.

It is not meant to be the final tonic most applications ship.
It is meant to show the basic pattern clearly:

1. import from AEON or AES
2. materialize into an opinionated runtime API
3. mutate through that API
4. export back to AES

## What It Demonstrates

This starter package keeps the runtime model intentionally simple:

- it treats the document as a collection of top-level bindings
- it exposes binding-centric CRUD methods instead of a proxy document model
- it allows easy creation from plain JS values
- it exports native AES with the payload and header descendants still attached to their original paths

That makes it a good template for custom tonics that want to own a small domain API without taking
on all of Titonic's live structural behavior.

## Public Surface

- `createStarterTonicFromAeon(...)`
- `createStarterTonicFromAes(...)`
- `exportStarterTonicAes(...)`
- `exportStarterTonicAeon(...)`
- `StarterTonicDocument`

## Example

```ts
import {
  createStarterTonicFromAeon,
  exportStarterTonicAeon,
} from '@aeon-tonics/starter-tonic';

const doc = createStarterTonicFromAeon(`
aeon:mode = "strict"
title:string = "Hello"
<panel("guide")>
count:number = 2
`);

doc.set('published', true, { datatype: 'boolean' });
doc.set('tags', ['guide', 'starter'], { datatype: 'list' });
doc.delete('count');

const text = exportStarterTonicAeon(doc).text;
```

An intrinsic node uses its tag as the binding key. Use
`doc.getValue('panel')` to obtain the parsed value, or `doc.get('panel')`
to inspect its structural identity, datatype, and attributes. To insert or
replace a parsed node, pass its tag and value to `doc.setParsed()`.
A replacement stays in the same document position so later references can
continue to address its children.

## Why This Exists Beside Titonic

Titonic is a rich live document model.
This package is intentionally smaller and more didactic.

Use this starter when you want to learn or prototype the custom-tonic shape:

- storing only the events you care about
- choosing your own runtime API
- deciding how much materialization you want
- keeping AES import/export explicit

From here, you can either:

- grow this package into a real domain tonic
- copy the structure into a new package of your own
- move to Titonic if you want a general live TS document model instead
