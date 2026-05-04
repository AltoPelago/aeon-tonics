# fmt.and Migration Plan

This document maps the current `fmt-md-*` package family onto the emerging `fmt.and-*` /
`and-core` replacement path.

The goal is not to preserve Markdown-shaped package boundaries forever.
The goal is to preserve the useful workflows while moving the ecosystem onto `&ND` and its AES
model cleanly.

## Guiding Decision

`fmt-md-*` is transitional.

Once `fmt.and-*` covers the workflows we actually care about, the Markdown-specific packages should
be deprecated and removed rather than maintained in parallel indefinitely.

That means migration should optimize for:

- replacement of workflows
- clear package responsibilities
- minimal overlap
- no long-term split brain between Markdown and `&ND`

## Replacement Matrix

### `@aeon-tonics/fmt-md-model`

Status:

- replace with `@aeon-tonics/fmt-and-model`

Why:

- this is the closest one-to-one replacement
- `fmt-and-model` now owns AES import/export, AEON export, and typed document materialization
- it also now bridges to the `and-core` AST and text workflows

Migration target:

- `createFmtMdDocumentFromAeon(...)` -> `createFmtAndDocumentFromAeon(...)`
- `createFmtMdDocumentFromAes(...)` -> `createFmtAndDocumentFromAes(...)`
- `exportFmtMdAes(...)` -> `exportFmtAndAes(...)`
- `exportFmtMdAeon(...)` -> `exportFmtAndAeon(...)`

### `@aeon-tonics/fmt-md-parse-markdown`

Status:

- replace in spirit, not in syntax

Why:

- the real workflow was “parse prose text into a typed document model”
- in the `&ND` world, the correct replacement is parsing `&ND` text, not preserving Markdown

Migration target:

- `parseFmtMdMarkdown(...)` -> `parseFmtAndDocument(...)`

Note:

- this is not source-compatible because the source language changes from Markdown to `&ND`
- that is intentional

### `@aeon-tonics/fmt-md-render-html`

Status:

- replace with `fmt-and-model` bridge to `and-core`

Migration target:

- `renderFmtMdHtml(...)` -> `renderFmtAndHtml(...)`

Why:

- HTML projection is already present through `and-core`
- there is no strong reason to keep a separate `fmt-and-render-html` package yet unless we later
  want a pure model-only renderer with no cross-repo bridge

### `@aeon-tonics/fmt-md-render-markdown`

Status:

- retire without a like-for-like replacement

Why:

- the `&ND` ecosystem should emit canonical `&ND`, not Markdown
- keeping a Markdown renderer would prolong the transitional syntax rather than completing the move

Migration target:

- `renderFmtMdMarkdown(...)` -> `emitFmtAndCanonical(...)`

Important difference:

- output becomes canonical `&ND`, not Markdown

### `@aeon-tonics/fmt-md-validate`

Status:

- likely replace with a small `fmt-and-validate` package or fold into `fmt-and-model`

Current replacement pieces:

- strict text validity: `collectFmtAndDiagnostics(...)` and `parseFmtAndDocument(...)`
- AES/model shape validity: `createFmtAndDocumentFromAes(...)` plus explicit projection errors

Open decision:

- whether we still want a dedicated validator package for non-throwing model validation

Recommendation:

- add a small `fmt-and-validate` package only if callers truly need structured non-throwing shape
  validation across AEON, AES, and model objects
- otherwise keep validation as:
  - parser diagnostics from `and-core`
  - projection errors from `fmt-and-model`

### `@aeon-tonics/fmt-md-annotation-payload`

Status:

- replace with `@aeon-tonics/fmt-and-annotation-payload`

Why:

- the old package specifically interpreted annotation bodies as Markdown
- the `fmt.and` replacement now interprets typed annotation bodies as embedded headerless `&ND`

Expected behavior:

- consume AEON annotation records
- parse comment payloads as embedded `&ND`
- return `FmtAndDocument` payloads

## Current Coverage Summary

Today the active `fmt.and` path already covers:

- typed AES document model
- AEON import/export
- `and-core` AST bridge
- `&ND` text parse
- diagnostics
- canonical `&ND` emit
- HTML render
- annotation-payload ingestion for embedded headerless `&ND`

That means the main migration work is no longer about replacing core functionality.
It is now mostly about polish, adoption, and deciding whether a dedicated validator surface is
worth adding later.

## Recommended Deprecation Phases

### Phase 1 — Ready The Replacement Path

Status:

- completed

Criteria:

- `fmt-and-model` remains green
- key workflows are documented with examples
- annotation-payload replacement remains green
- validator decision is made

### Phase 2 — Freeze `fmt-md-*`

Status:

- completed

Actions:

- stop adding new features to `fmt-md-*`
- add README notices pointing to `fmt-and-model`
- document the replacement matrix package-by-package

### Phase 3 — Soft Deprecation

Status:

- completed

Actions:

- mark `fmt-md-*` packages as deprecated in docs and package metadata where appropriate
- keep tests only long enough to support active migrations

### Phase 4 — Removal

Status:

- completed

Actions:

- remove `fmt-md-*` packages after replacement workflows are proven
- simplify root build/typecheck/test scripts accordingly

## Current Repository State

The workspace is now in the post-removal state:

- `fmt.and-*` is the active prose path
- root build, typecheck, and test scripts no longer include any `fmt-md-*` package
- runnable examples exist for both the model workflow and the annotation-payload workflow
- historical `fmt-md` proposal material remains only for migration context

## Historical Notes

The original `fmt-md-*` packages were intentionally removed rather than maintained in parallel.
That keeps the ecosystem aligned around canonical `&ND` instead of prolonging the transition by
supporting two prose families indefinitely.

## Recommended Next Steps

1. decide later whether a dedicated `fmt-and-validate` package is actually needed
2. keep expanding runnable `fmt.and` examples where they help migration confidence
3. treat any remaining `fmt-md` references as historical and avoid reintroducing active package
   boundaries around Markdown
