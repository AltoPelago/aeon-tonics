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
- it preserves AES as the export boundary

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
title = "Hello"
count:number = 2
`);

doc.set('published', true);
doc.set('tags', ['guide', 'starter']);
doc.delete('count');

const text = exportStarterTonicAeon(doc).text;
```

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
