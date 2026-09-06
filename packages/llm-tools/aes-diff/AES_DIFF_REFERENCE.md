# AES Diff Reference

This document describes the current implemented `@aeon-tonics/aes-diff` contract.

The package compares AEON Assignment Event Streams by canonical path and emits semantic,
machine-readable changes. Text output is a presentation layer over the structured result.

For the embedded agent-safe workflow, run `aes-diff --ai` or see
[`AI_WORKFLOW.md`](./AI_WORKFLOW.md).

## Inputs

### AES

`diffAes(beforeEvents, afterEvents, options?)` compares two arrays of `AssignmentEvent`.

### AEON

`diffAeon(beforeSource, afterSource, options?)` compiles both AEON sources with `@aeon/core`, then
compares the emitted AES events.

Compile errors are returned as diagnostics instead of being thrown.

## Options

```ts
interface DiffAesOptions {
  readonly includeHeaders?: boolean;
  readonly includeMetadata?: boolean;
  readonly includeSourceSpans?: boolean;
  readonly strictUniquePaths?: boolean;
  readonly pathFilters?: readonly string[];
}
```

Defaults:

- `includeHeaders: true`
- `includeMetadata: true`
- `includeSourceSpans: false`
- `strictUniquePaths: true`
- `pathFilters: []`

`pathFilters` scopes comparison to canonical path subtrees such as `$.app` or `$.schema.rules`.

## Diff Result

Diffs use this envelope:

```ts
interface AesDiffResult {
  readonly format: 'aes.diff';
  readonly version: 1;
  readonly changes: readonly AesChange[];
  readonly summary: AesDiffSummary;
  readonly diagnostics: readonly AesDiffDiagnostic[];
}
```

Change kinds:

- `added`
- `removed`
- `changed`

Changed events include `delta.parts`.

Current delta parts:

- `datatype`
- `value`
- `metadata`
- `reference`
- `header`
- `span`

## Diagnostics

Current diagnostic codes:

- `AEON_COMPILE_ERROR`
- `DUPLICATE_PATH`
- `PATCH_NOT_APPLICABLE`
- `PATCH_STALE_BASE`

Diagnostics are intended for agent and CLI workflows. They should be treated as structured failure
signals, not just text messages.

## Planning Summary

`summarizeAesDiff(diff, options?)` returns a compact planning view:

```ts
interface AesDiffPlanningSummary {
  readonly headline: string;
  readonly affectedTopLevel: readonly string[];
  readonly paths: readonly string[];
  readonly highRisk: readonly AesDiffHighRiskChange[];
  readonly diagnostics: readonly AesDiffDiagnostic[];
}
```

High-risk changes currently include:

- datatype changes
- reference changes
- header changes

This summary is derived from `AesDiffResult`; it is not the canonical diff.

## Patch Shape

`createAesPatch(diff)` emits a reviewable patch object:

```ts
interface AesPatch {
  readonly format: 'aes.patch';
  readonly version: 1;
  readonly applicable: boolean;
  readonly operations: readonly AesPatchOperation[];
  readonly diagnostics: readonly AesDiffDiagnostic[];
}
```

Operations:

- `add`
- `remove`
- `replace`

Patches with diagnostics are marked `applicable: false`.

## Patch Application

`applyAesPatch(baseEvents, patch, options?)` applies an AES patch to AES events only.

It is conservative:

- refuses patches marked non-applicable
- refuses patches containing diagnostics
- refuses `add` when the path already exists
- refuses `remove` when the path is missing or stale
- refuses `replace` when the base event no longer matches the patch precondition
- returns the original base events on failure

Patch application does not edit AEON source text.

## CLI

Compare AEON files:

```sh
aes-diff before.aeon after.aeon
```

Print the embedded agent workflow:

```sh
aes-diff --ai
```

Machine-readable diff:

```sh
aes-diff --json before.aeon after.aeon
```

Planning summary:

```sh
aes-diff --summary before.aeon after.aeon
```

Reviewable patch:

```sh
aes-diff --patch before.aeon after.aeon
```

Compare AES JSON:

```sh
aes-diff --from-aes before.aes.json after.aes.json
```

This is the legacy TypeScript `AssignmentEvent` JSON compatibility route.

Compare complete portable AES streams:

```sh
aes-diff --from-telex before.telex.aes after.telex.aes
```

Telex is parsed and validated before comparison. The default profile is
complete when the stream does not declare one. Structural identities remain
event fields and do not participate in path identity. Datatype, generics, and
clarifiers are compared as one datatype descriptor while remaining separately
available in portable records.

Apply an AES patch to AES JSON:

```sh
aes-diff apply --from-aes base.aes.json patch.json
```

The apply command prints `{ "events": [...] }` on success and structured diagnostics on failure.

Apply a patch containing portable records and emit Telex:

```sh
aes-diff apply --from-telex base.telex.aes patch.json
```

## Safety Boundary

This package is AES-native.

It currently does not:

- preserve AEON source formatting
- apply patches to AEON source files
- perform three-way merge
- infer moves or renames
- resolve patch conflicts

Those should be layered on later, likely through the AEON edit CLI and Titonic.
