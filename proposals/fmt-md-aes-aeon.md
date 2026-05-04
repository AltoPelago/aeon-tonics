# Proposal: `fmt.md.aes` And `fmt.md.aeon`

Archived historical proposal.

This document describes the earlier Markdown-oriented direction that has now been superseded by the
`fmt.and-*` / `and-core` path. It is retained for historical context only and should not be treated
as an active roadmap.

## Summary

Formalize GitHub-flavored Markdown as an AEON-native formatting profile rather than treating it as
an HTML-first language.

The key idea is:

- `fmt.md.aeon` is the AEON surface representation for Markdown-shaped content
- `fmt.md.aes` is the AES representation of that same content
- the semantic payload is expressed as AEON-native node structure
- HTML becomes one possible renderer, not the canonical meaning
- a restricted Markdown document model can materialize that subset for editing and transformation

## Why This Matters

If Markdown content is going to live inside the AES ecosystem, it should be modeled in AEON terms.

That means:

- structure should be represented as AEON values
- document formatting should be represented as AEON nodes
- downstream tools should be able to consume it without first converting to HTML

This is especially important for:

- annotation streams
- editorial tooling
- docs pipelines
- diffing and review
- cross-renderer workflows

## Core Position

GitHub-flavored Markdown should be treated as an authoring format, not the canonical semantic
model.

The canonical semantic model should be AEON-native.

So the overall model becomes:

1. author writes Markdown-compatible content
2. content is parsed into AEON-native node structure
3. that structure can be emitted as AES
4. a restricted Markdown model can materialize that AES subset
5. renderers may then materialize Markdown text, HTML, plaintext, UI trees, or other targets

## Proposed Naming

- `fmt.md.aeon`
  The AEON profile and node vocabulary for Markdown-shaped documents.
- `fmt.md.aes`
  The AES representation of `fmt.md.aeon` content.

This keeps the naming aligned with the idea that Markdown here is not just text syntax, but a
formalized AEON-facing format profile.

## Proposed Architecture

The cleanest architecture is a layered one:

1. `fmt.md.aeon`
   Defines the node vocabulary and profile rules.
2. `fmt.md.aes`
   Defines the AES representation of that vocabulary.
3. restricted Markdown document model
   Materializes valid `fmt.md` AES into a semantic editing model.
4. renderers
   Materialize that model into Markdown text, HTML, or other outputs.

This keeps:

- semantic structure separate from presentation
- AES interoperability separate from renderer concerns
- editing APIs separate from source-text formatting

## Restricted Markdown Document Model

Just as Titonic gives AEON a live TypeScript document model, `fmt.md` likely wants a narrower
profile-specific model.

That model should not be a general AEON node editor.
It should be a constrained semantic model for Markdown-shaped content.

Example direction:

- `MdDocument`
- `MdParagraph`
- `MdHeading`
- `MdList`
- `MdListItem`
- `MdBlockQuote`
- `MdCodeBlock`
- `MdText`
- `MdStrong`
- `MdEm`
- `MdInlineCode`
- `MdLink`
- `MdImage`

The purpose of that model is:

- easier semantic editing
- stronger invariants than generic node trees
- easier Markdown-specific transforms
- easier multi-target rendering

## Recommended Boundary

The model should:

- accept AES
- validate/project the `fmt.md` subset
- expose restricted Markdown-semantic objects
- export back to AES

The model should not own presentation-heavy rendering logic.

That means:

- AES export belongs on the model side
- Markdown text rendering should live outside the model
- HTML rendering should live outside the model

This keeps the model semantic rather than presentation-coupled.

## Canonical Shape

The semantic content should be represented as nodes.

Example direction:

```aeon
content:node = <document(
  <heading@{level:number=2}("Title")>,
  <paragraph(
    "Paragraph with ",
    <strong("bold")>,
    " and ",
    <code("inline code")>,
    "."
  )>,
  <list@{ordered:boolean=false}(
    <item(<paragraph("one")>)>,
    <item(<paragraph("two")>)>
  )>
)>
```

This is the important design boundary:

- Markdown is not preserved as HTML tags
- Markdown is not flattened into plain strings
- Markdown is represented as AEON-native structural content

## Relationship To Annotation Streams

This fits naturally into the annotation-stream work.

A comment annotation could carry:

- raw Markdown source
- parsed `fmt.md.aeon` node payload
- or both

Example idea:

```aeon
annotation:object = {
  kind:string = "doc"
  raw:string = "## Title\nParagraph."
  payload:node = <document(
    <heading@{level:number=2}("Title")>,
    <paragraph("Paragraph.")>
  )>
}
```

My recommendation is to preserve both:

- `raw` keeps author intent and exact source text
- `payload` gives the semantic AEON structure

If the payload is `fmt.md.aeon`, then annotation consumers can choose between:

- using the raw Markdown source
- using the restricted Markdown model
- rendering it to Markdown text again
- rendering it to HTML or another target

## Minimum Vocabulary

The first version should define a small reserved node vocabulary for GitHub-flavored Markdown.

Suggested initial nodes:

- `document`
- `paragraph`
- `heading`
- `em`
- `strong`
- `code`
- `code_block`
- `link`
- `image`
- `list`
- `item`
- `blockquote`
- `thematic_break`
- `line_break`

Useful attributes:

- `heading@{level:number=1..6}`
- `list@{ordered:boolean}`
- `code_block@{language:string="ts"}`
- `link@{href:string="..."}`
- `image@{src:string="...", alt:string="..."}`

Possible later nodes:

- `table`
- `table_head`
- `table_row`
- `table_cell`
- `task_list`
- `task_item`

## GitHub-Flavored Markdown Scope

The first target should be GitHub-flavored Markdown, but not necessarily every edge case on day
one.

Phase 1 should aim to cover:

- headings
- paragraphs
- emphasis
- strong emphasis
- inline code
- fenced code blocks
- links
- images
- unordered and ordered lists
- blockquotes
- thematic breaks

Phase 1 should probably defer:

- tables
- task lists
- footnotes
- raw HTML passthrough
- every GitHub extension nuance

Those can be added once the base node vocabulary feels stable.

## Rendering Strategy

There are three obvious ways to get Markdown text back out:

1. render directly from AES
2. make the model render itself
3. use separate renderers that accept the model

The recommended choice is `3`.

Why:

- direct AES-to-Markdown skips the semantic editing layer
- model-owned rendering couples semantics to presentation
- external renderers make multi-target output much cleaner

So the preferred pipeline is:

1. ingest AEON or AES
2. project into restricted Markdown model
3. edit or transform semantically
4. export to AES when needed
5. render to Markdown, HTML, plaintext, or another target through separate renderer tools

## Proposed Package Split

The implemented first slice now follows this package split:

- `@aeon-tonics/fmt-md-model`
  Restricted Markdown document model backed by `fmt.md.aes`
- `@aeon-tonics/fmt-md-parse-markdown`
  Parses a first GitHub-flavored Markdown slice into the restricted model
- `@aeon-tonics/fmt-md-render-markdown`
  Renders the model to Markdown text
- `@aeon-tonics/fmt-md-render-html`
  Renders the model to HTML
- `@aeon-tonics/fmt-md-validate`
  Validates AEON, AES, and in-memory model values against the restricted profile
- `@aeon-tonics/fmt-md-annotation-payload`
  Converts AEON annotation stream records into `fmt.md` document payloads

Potentially later:

- `@aeon-tonics/fmt-md-render-plaintext`
  Renders the model to plain text for search, preview, or terminal surfaces
- `@aeon-tonics/fmt-md-format-markdown`
  Provides stricter deterministic Markdown formatting if the renderer later needs profile-aware
  normalization controls
- `@aeon-tonics/fmt-md-parse-gfm-extended`
  Adds deferred GitHub Markdown extensions such as tables and task lists

This split gives each concern a clear owner and keeps AEON core out of Markdown-specific policy.

## AEON-Native Rendering Principle

The semantic model should remain renderer-neutral.

That means a node like:

```aeon
<strong("bold")>
```

should mean “strong emphasis,” not “HTML `<strong>` specifically.”

Likewise:

```aeon
<heading@{level:number=2}("Title")>
```

should mean “level-2 heading,” not “literal Markdown source `##`.”

This allows:

- HTML rendering
- plaintext rendering
- terminal rendering
- editor rendering
- custom UI materialization

all from the same semantic source.

## Raw Source Preservation

The format should preserve the distinction between:

- raw Markdown source text
- parsed AEON-native structure

This matters for:

- round-tripping
- formatting tools
- editor UX
- exact source recovery

So the model should support a dual representation when needed:

- `raw`
- `ast` or `payload`

## `fmt.md.aes`

At the AES layer, the same node structure would simply appear as ordinary value-bearing assignment
events whose values are node literals and nested child values.

The point of `fmt.md.aes` is not to invent a new AES type.
It is to define how Markdown semantics are expressed using ordinary AES-compatible AEON structure.

That also means a model or renderer can consume the same data without any AES special-casing.

## Design Rule

The simplest useful rule is:

- Markdown syntax is an input surface
- AEON nodes are the semantic form
- AES is the interchange boundary
- HTML is a renderer output

That avoids locking the ecosystem into web semantics too early.

## Example Mapping

Markdown input:

```md
## Title

Paragraph with **bold** and `code`.
```

`fmt.md.aeon` direction:

```aeon
doc:node = <document(
  <heading@{level:number=2}("Title")>,
  <paragraph(
    "Paragraph with ",
    <strong("bold")>,
    " and ",
    <code("code")>,
    "."
  )>
)>
```

## Recommendation

This is a strong direction.

If AEON wants Markdown to participate as a first-class semantic citizen, then formalizing it as
`fmt.md.aeon` / `fmt.md.aes` is better than treating Markdown as prose that eventually becomes
HTML.

The first implementation pass has covered:

1. reserved node and attribute vocabulary
2. `fmt.md.aes` projection rules through the model
3. restricted Markdown document model
4. Markdown and HTML renderers over that model
5. Markdown parser into the model
6. validation helpers for AEON, AES, and in-memory values
7. annotation payload adapter from AEON annotation records into `fmt.md` documents

The next spec work should tighten:

- reserved node names
- reserved attributes
- mapping rules from GFM syntax into AEON nodes
- round-trip expectations
- model invariants
- renderer boundaries
- annotation payload envelope shape if raw Markdown and parsed payload are exported together as AES
