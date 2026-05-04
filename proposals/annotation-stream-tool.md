# Proposal: Annotation Stream Tool

## Summary

Create a tool that reads AEON-style annotation comments such as:

```text
/# note = "hello" #/
```

and converts them into AES-native annotation events rather than converting them into HTML-oriented
comment structures.

This would treat comment-like markup as semantic annotation input for the AES ecosystem.

## Why This Matters

If the goal is to enrich AEON documents with machine-meaningful commentary, provenance, editorial
notes, or processing hints, then HTML is the wrong target boundary.

HTML conversion is useful for presentation.
AES conversion is useful for semantics.

An annotation stream tool would let comment content participate in the same downstream workflows as
the rest of the document:

- diffing
- validation
- materialization
- tooling
- audit trails
- editor support

## Core Idea

Instead of thinking of comment blocks as something to render, think of them as a source of
structured sideband data.

In that model:

- AEON remains the primary document
- comment annotations become an auxiliary semantic stream
- the output is AES-shaped data that can join the wider ecosystem

## Proposed Package Shape

Suggested package name:

- `@aeon-tonics/annotation-stream`

Possible public surface:

- `extractAnnotationStream(source, options?)`
- `extractAnnotationAes(source, options?)`
- `mergeAnnotationStream(baseAes, annotationAes, options?)`

## Design Questions To Settle Early

The biggest open question is what the comments attach to.

There are at least three plausible models.

### Model 1: Free-Standing Annotation Events

Comments become their own top-level AES events under a reserved namespace.

Example direction:

```aeon
aeon:annotations = [
  { path = "config.port", note = "deprecated" }
]
```

Pros:

- simplest extraction model
- no mutation of the original AES required
- easy to store, diff, and inspect

Cons:

- attachment is indirect
- downstream consumers must resolve linkage themselves

### Model 2: Attach Comments As Event Annotations

Comments become `annotations` on the nearest AES binding.

Pros:

- aligns naturally with existing AES annotation structure
- downstream tools already understand annotation-like metadata
- strongest fit if comments are truly metadata about bindings

Cons:

- needs a clear attachment rule
- can become ambiguous for comments that refer to larger regions

### Model 3: Dual Output

The extractor emits both:

- a free-standing annotation stream
- and an optional merged AES representation

Pros:

- preserves raw extracted meaning
- gives tools a convenient merged view

Cons:

- more API surface
- greater risk of confusion if the two views diverge

My recommendation for a first slice:

- make the raw extractor primary
- make merge optional

## Recommended First Output Shape

Start with an explicit annotation-event model.

Example:

```ts
interface AnnotationStreamEntry {
  readonly kind: 'line' | 'block';
  readonly target?: string;
  readonly value: Value;
  readonly datatype?: string;
  readonly annotations?: ReadonlyMap<string, AttributeEntry>;
  readonly sourceSpan: Span;
}
```

Then provide a helper that converts those entries into AES under a reserved root such as:

- `aeon:annotations`
- or `aeon:commentary`

This keeps extraction honest before attachment rules harden.

## What The Syntax Could Mean

If the input is:

```text
/# note = "hello" #/
```

the tool could interpret that as:

- a binding-shaped annotation payload
- not a raw markdown string

That means comment bodies should probably be parsed using AEON binding/value rules where possible.

Possible examples:

```text
/# note = "hello" #/
/# severity = "warning" #/
/# review@{author = "editor"} = "rewrite this" #/
```

This is much more powerful than markdown-to-HTML because it preserves structure at the semantic
boundary.

## Markdown In The Proposal

Your wording suggests "md comments", but the key point is really not markdown formatting.
It is semantic comments.

So I would separate two cases:

- markdown-ish comment syntax as a transport surface
- AEON-shaped content inside that syntax as the actual meaning

If the body is just arbitrary markdown prose, the extractor can still preserve it as string data.
But if the body contains AEON-shaped bindings, the tool should prefer structured extraction.

## First Slice Scope

Phase 1:

- parse comment blocks in a constrained syntax such as `/# ... #/`
- extract AEON-shaped binding payloads from those blocks
- emit a structured annotation stream
- optionally export that stream as AES under a reserved namespace

Phase 1 should not try to solve:

- rich markdown rendering
- full prose-to-structure interpretation
- ambiguous attachment heuristics
- inline comment editing UX

## Attachment Strategy

If attachment is introduced later, it should be explicit.

Good options:

- comment explicitly names a target path
- comment is attached to the following binding
- comment is attached to the preceding binding

I would avoid implicit "nearest node" behavior in the first version because it will create edge
cases quickly.

A better early rule is something like:

```text
/# target = "config.port", note = "deprecated" #/
```

That keeps extraction deterministic.

## Relationship To The Rest Of The Stack

This tool should sit before or beside ordinary AES consumption.

Possible flow:

1. parse source document
2. extract ordinary AES
3. extract annotation stream AES
4. optionally merge or process both together

That keeps the annotation tool composable rather than forcing one universal interpretation.

## Why This Is Interesting

This proposal has real value because it opens a path for:

- editorial metadata
- provenance
- machine-readable review comments
- semantic notes that survive beyond rendering

It also pairs naturally with the proposed AES diff tool:

- diff the document
- diff the annotation stream
- or diff the merged semantic view

## Recommendation

This is worth exploring, but it needs one firm design choice first:

- is the primary product an extracted annotation stream, or merged document annotations?

I would strongly make the extracted stream primary.

That keeps the tool:

- simpler
- more explicit
- easier to test
- less likely to overcommit to one attachment model too early

## Follow-On Direction

For historical context, the earlier Markdown-oriented direction was to formalize the content as an
AEON-native formatting profile rather than treating Markdown as text that later becomes HTML.

That line of work has now been superseded by the `fmt.and-*` / `and-core` direction. The archived
proposal remains at [`fmt-md-aes-aeon.md`](./fmt-md-aes-aeon.md).
