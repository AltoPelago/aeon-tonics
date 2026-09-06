# Building AEON Tonics

This guide explains what a tonic is, when you would use one, and how to choose between the
existing options in the AES ecosystem.

## What A Tonic Is

A tonic is an opinionated AES consumer.

It takes AES as its stable boundary and materializes that AES into some runtime form that is useful
for a particular job.

That runtime form might be:

- plain finalized data
- minimized AEON text
- a live TypeScript document model
- a domain-specific application object model

The important point is that a tonic does not replace AEON core.
It sits after core, works with AES, and adds meaning or behavior for a specific use case.

Within one TypeScript process, a tonic may use core's native
`AssignmentEvent[]` representation. Across a process, implementation, or
persistence boundary, use portable AES encoded as Telex. JSON serialization of
`AssignmentEvent[]` is a compatibility representation, not the portable AES
contract.

## The Usual Pipeline

The broad AEON flow looks like this:

1. `@aeon/core` parses AEON and emits AES
2. one or more downstream tools consume that AES
3. those tools may validate it, materialize it, transform it, or emit AEON again

So if you are building an app, the question is usually not "do I need core or a tonic?"
It is "which AES consumer should sit after core for my use case?"

## When To Use What

### `@aeon/core` only

Use this when you just need AES as an intermediate representation and your own code will take it
from there.

Good fit:

- compiler-style tooling
- transforms over AES events
- infrastructure code that already wants to reason at the AES level

### `@aeon/core` + `@aeos/core`

Use this when schema validation matters.

Good fit:

- loading user-authored documents that must satisfy a schema
- validating data before further processing
- workflows where schema ownership should remain outside the materializer

### `@aeon/core` + `@aeon/finalize`

Use this when you want generic deterministic materialization into plain runtime data and do not
need a live document model.

Good fit:

- read-mostly apps
- one-shot imports
- pipelines that only need ordinary JS/TS values after parsing

### `@aeon/core` + `@aeon-tonics/minizer`

Use this when the goal is to emit compact AEON text from AES.

Good fit:

- formatting pipelines
- canonical compact output
- export paths where you want a minimized AEON string

### `@aeon/core` + `@aeon-tonics/titonic`

Use this when the document will stay alive in memory and be edited over time.

Good fit:

- config editors
- file-backed UI state
- migration tools
- internal document models that should preserve AEON datatype intent during mutation

Titonic is the right choice when you want a general-purpose, AEON-aware, live TypeScript document
model.

## When You Should Build A Custom Tonic

Build a custom tonic when none of the existing materializers matches the runtime meaning you want.

Good signs that you want your own tonic:

- your application has domain objects that mean more than generic objects/lists/nodes
- you want custom constructors, helpers, or invariants that are specific to your problem space
- you want a different editing model than Titonic's document-oriented proxy model
- you want a materializer that is optimized for one narrow workflow rather than broad reuse

Examples:

- a game-content tonic that turns AES into entity/component objects
- a workflow tonic that exposes tasks, states, and transitions as higher-level objects
- a UI tonic that materializes specific node patterns into typed widget models

## Titonic As A Starting Point

Titonic is a good starting point when your custom tonic wants to be:

- TypeScript-native
- live and mutable
- strict about preserving AEON datatype intent
- able to round-trip back through AES cleanly

Titonic is especially useful as a conceptual starting point for:

- proxy-backed CRUD
- preserving clone and pointer semantics
- explicit metadata handling
- import from AEON or AES and export back to AES

That does not mean every custom tonic should extend Titonic directly.
In many cases the better move is to study its design boundary and then build a smaller tonic around
your own runtime model.

If you want a concrete package skeleton in this workspace, see
[`packages/foundations/starter-tonic`](./packages/foundations/starter-tonic/README.md).

## Three Common Strategies

### Strategy 1: Stay At AES

Choose this when your logic is already comfortable operating on AES.

This is the simplest option and keeps you closest to the shared ecosystem boundary.

### Strategy 2: Use Titonic As The App-Facing Model

Choose this when you want a general live document model in TypeScript and do not need much
domain-specific meaning beyond AEON itself.

This is the best default if your app is editing AEON-shaped data directly.

### Strategy 3: Build A Domain Tonic

Choose this when your app should work with domain concepts rather than generic document concepts.

In this model:

1. core still emits AES
2. your tonic materializes AES into your own model
3. your tonic exports AES again when it needs to rejoin the wider ecosystem

## A Practical Rule Of Thumb

- If you need validation, add `@aeos/core`.
- If you need plain runtime data, use `@aeon/finalize`.
- If you need compact AEON text, use the minizer.
- If you need a live AEON-aware document model in TypeScript, use Titonic.
- If you need stronger domain meaning than Titonic provides, build your own tonic.

## Designing A Custom Tonic Well

If you build one, keep these boundaries clear:

- let `@aeon/core` own parsing and AES production
- let `@aeos/core` own schema validation
- let your tonic own runtime meaning and ergonomics
- keep AES import/export explicit so your tonic stays interoperable
- keep structural identity in event metadata rather than adding it to path identity
- translate node paths explicitly: a node binding is `$.a`, its head is
  `$.a[0]`, its first child is `$.a[0][0]`, and node-head attributes live below
  `$.a[0].@`

That keeps the ecosystem composable instead of collapsing all responsibilities into one package.
