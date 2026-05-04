# Proposal: AES Diff Tool

## Summary

Create an AES-native diff tool that compares two AEON documents or two AES streams and produces a
deterministic description of what changed at the assignment-event level.

Status: first implementation exists in `packages/llm-tools/aes-diff`. The current package includes the pure
library, planning summaries, JSON/text formatters, a CLI, path filters, embedded `--ai` workflow
guidance, reviewable patch generation, and conservative AES-to-AES patch application.

This tool would answer questions like:

- what bindings were added, removed, or changed?
- which changes are semantic versus only textual?
- can two AEON documents be compared without collapsing them into plain JS first?

## Why This Matters

The AES boundary is already the semantic interchange point in the AEON stack.
That makes it the natural place to compare two documents when the goal is meaning rather than text.

An AES diff tool would be valuable for:

- migration tooling
- review tooling
- audit trails
- synchronization and patch generation
- editor features such as change summaries
- testing higher-level tonics and transforms

Without an AES diff layer, comparison tends to happen either:

- too early, as raw text diff, which is noisy
- or too late, after materialization into plain runtime objects, which can lose AEON-native meaning

## Design Goal

The tool should compare two AES streams in a way that is:

- deterministic
- path-aware
- datatype-aware
- reference-aware
- friendly to downstream tooling
- suitable for agentic workflows

It should not try to solve every merge problem on day one.
The first job is to produce a clean semantic diff.

## Agentic Workflow Expectations

For AI-assisted development, the diff result should be useful as a working memory map, not just a
review artifact.

That means the tool should prioritize:

- stable path-addressed changes
- machine-readable output first, human-readable formatting second
- clear change kinds that describe what semantic fact changed
- low-noise comparison through AES rather than raw text
- configurable sensitivity for metadata, annotations, headers, and source spans
- confidence flags when a comparison is lossless, partial, or heuristic
- patch-oriented structure so later tools can safely apply or reject changes

The ideal agent-facing result answers:

- what changed?
- where did it change?
- what exact before and after values were involved?
- can this change be safely applied elsewhere?
- what should be shown to a human reviewer?

The implemented CLI now embeds this as a tool-native workflow:

```sh
aes-diff --ai
```

Recommended agent loop:

1. Compare semantically with `aes-diff before.aeon after.aeon` for a human-readable overview.
2. Use `aes-diff --summary before.aeon after.aeon` for compact planning and path selection.
3. Use `aes-diff --json before.aeon after.aeon` when another tool or model needs the full result.
4. Use `aes-diff --path $.some.subtree before.aeon after.aeon` to limit review to intended scope.
5. Use `aes-diff --check before.aeon after.aeon` for CI or agent gates.
6. Use `aes-diff --patch before.aeon after.aeon` only when reviewing or applying AES-native patch
   operations.

Current `--check` exit codes:

- `0`: no semantic changes
- `1`: semantic changes are present
- `2`: diagnostics, parse failure, IO failure, or invalid arguments

Important boundary:

- `aes-diff` compares and can create/apply AES-native patches, but it does not edit AEON source.
- AEON source edits should flow through `aeon-edit plan-* -> batch --check -> batch --write`.

## Proposed Package Shape

Suggested package name:

- `@aeon-tonics/aes-diff`

Possible public surface:

- `diffAes(before, after, options?)`
- `diffAeon(beforeSource, afterSource, options?)`
- `formatAesDiff(diff, options?)`

Implemented public surface:

- `diffAes(beforeEvents, afterEvents, options?)`
- `diffAeon(beforeSource, afterSource, options?)`
- `formatAesDiffText(diff, options?)`
- `formatAesDiffJson(diff)`
- `summarizeAesDiff(diff, options?)`
- `createAesPatch(diff)`
- `applyAesPatch(baseEvents, patch, options?)`

## Core Input Modes

### AES to AES

This should be the core API.

```ts
const diff = diffAes(beforeEvents, afterEvents);
```

### AEON to AEON

This is the convenience API.

```ts
const diff = diffAeon(beforeText, afterText);
```

Internally it would compile both sides to AES first.

## Proposed Output Model

The output should be structured, not just human-readable text.

Example shape:

```ts
interface AesDiffResult {
  readonly format: 'aes.diff';
  readonly version: 1;
  readonly changes: readonly AesChange[];
  readonly summary: {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly unchanged: number;
    readonly metadataChanged: number;
    readonly referenceChanged: number;
  };
  readonly diagnostics: readonly AesDiffDiagnostic[];
}

type AesChange =
  | {
      readonly kind: 'added';
      readonly path: string;
      readonly after: AssignmentEvent;
    }
  | {
      readonly kind: 'removed';
      readonly path: string;
      readonly before: AssignmentEvent;
    }
  | {
      readonly kind: 'changed';
      readonly path: string;
      readonly before: AssignmentEvent;
      readonly after: AssignmentEvent;
      readonly delta: EventDelta;
    };
```

Where `EventDelta` could eventually expose:

- datatype changed
- value changed
- annotations changed
- reference target changed
- value kind changed

Suggested initial change kinds:

- `added`
- `removed`
- `changed`
- `datatype_changed`
- `value_changed`
- `metadata_changed`
- `reference_changed`
- `header_changed`

`changed` can be used as the coarse public kind while `delta.parts` exposes the finer-grained
classification.

## Comparison Semantics

The default diff should be semantic, not textual.

That means:

- compare by canonical event path
- compare datatypes explicitly
- compare value kind explicitly
- compare annotation structure explicitly
- compare reference targets explicitly

Examples:

- `"1"` versus `1` is a real change
- `1` versus `1.0` may or may not be a change depending on whether AES preserves them distinctly
- `~a` versus `~>a` is a real change
- annotation changes count as real changes even if the value stays the same

## First Slice Scope

The initial version should stay deliberately narrow.

Phase 1:

- top-level and nested assignment comparison by path
- added, removed, and changed event detection
- datatype/value/annotation/reference comparison
- machine-readable diff result
- optional simple text formatter
- JSON formatter for CLI and agent use
- diagnostics for duplicate paths or unsupported event shapes

Phase 1 should not try to solve:

- three-way merge
- conflict resolution
- patch application
- structural move detection
- fuzzy equivalence rules

## Implementation Plan

### Phase 0: Fixture And Shape Lock

Define a small CTS-like fixture set before writing the diff engine.

Fixtures should cover:

- scalar value changes
- datatype changes
- added and removed bindings
- nested object/list paths
- binding attributes and nested annotations
- node literals and node head attributes
- references and clone references
- header events
- duplicate-path diagnostics

Deliverables:

- `packages/llm-tools/aes-diff/src/fixtures.test.ts`
- expected JSON snapshots or inline assertions for `AesDiffResult`

### Phase 1: Pure Library

Create `@aeon-tonics/aes-diff`.

Public API:

- `diffAes(beforeEvents, afterEvents, options?)`
- `diffAeon(beforeSource, afterSource, options?)`
- `formatAesDiffText(result, options?)`
- `formatAesDiffJson(result, options?)`

Initial options:

```ts
interface DiffAesOptions {
  readonly includeHeaders?: boolean;
  readonly includeMetadata?: boolean;
  readonly includeSourceSpans?: boolean;
  readonly strictUniquePaths?: boolean;
  readonly pathFilters?: readonly string[];
}
```

Recommended defaults:

- include headers: `true`
- include metadata: `true`
- include source spans: `false`
- strict unique paths: `true`
- path filters: `[]`

Core implementation steps:

1. normalize AES events into a path-indexed map
2. compare key sets for added and removed paths
3. compare shared paths by stable structural serialization
4. produce `EventDelta` with datatype, value, metadata, and reference parts
5. sort changes deterministically by canonical path
6. emit diagnostics instead of throwing for non-fatal issues

### Phase 2: Agent-Oriented Summaries

Add summary helpers that compress a full diff into planning-friendly sections.

Public API:

- `summarizeAesDiff(result, options?)`

Output should include:

- one-line headline
- counts by change kind
- affected top-level bindings
- highest-risk changes, such as datatype or reference changes
- optional compact path list

This should remain derived data so the core diff result stays canonical.

### Phase 3: CLI Surface

Add a CLI only after the library result shape is stable.

Possible commands:

```sh
aes-diff before.aeon after.aeon
aes-diff --ai
aes-diff --json before.aeon after.aeon
aes-diff --summary before.aeon after.aeon
aes-diff --check before.aeon after.aeon
aes-diff --no-metadata before.aeon after.aeon
aes-diff --path $.app before.aeon after.aeon
aes-diff --patch before.aeon after.aeon
aes-diff --from-aes before.json after.json
aes-diff apply --from-aes base.aes.json patch.json
```

CLI defaults:

- text output for humans
- `--json` for agents and scripts
- `--summary` for compact planning
- `--ai` for embedded agent workflow guidance
- non-zero exit when semantic changes exist if `--check` is passed

### Phase 4: Patch Preparation

Patch preparation and conservative AES-to-AES patch application now exist.

Implemented API:

- `createAesPatch(diff)`
- `applyAesPatch(baseEvents, patch, options?)`

Patch mode should include stale-base detection and conflict diagnostics.

## Important Edge Cases

### Header Events

Decide whether header events should:

- be included in the same diff stream
- or be split into `headerChanges` and `bindingChanges`

My recommendation:

- include them, but mark them explicitly as header changes

That keeps the tool complete while still allowing UIs to present them separately.

### Multiple Events At Similar Paths

The tool should rely on canonical AES paths rather than source ordering alone.

If the same canonical path appears more than once in invalid or recovery-mode data, the API should
either:

- reject that input
- or expose a strict option that requires unique paths

### Node Literals

Node values should compare as values attached to events, not as a separate child-event stream.

That matches current AEON/AES behavior and keeps the diff aligned with the actual semantic boundary.

### Attributes And Nested Annotations

These should be part of the semantic diff, not treated as incidental metadata.

This is especially important if the tool is later used for:

- schema-aware workflows
- authoring tools
- audit logs

## Future Extensions

Once the base diff exists, the next natural expansions are:

- merge support
- change classification rules
- human-oriented renderers for CLI or review tooling
- AEON-source patch application through `aeon-edit`
- richer agent plans that combine diff summaries with guarded edit plans

One especially useful later step would be:

- `diffTitonic(beforeDoc, afterDoc)` as a convenience wrapper over exported AES

## Recommendation

This feels high-value and well-aligned with the ecosystem.

It belongs at the AES boundary because:

- it preserves AEON-native meaning
- it remains reusable by multiple tonics and tools
- it can support both low-level and high-level workflows later

If implemented, I would start with a small pure library first and only add formatting or patch
features once the core diff semantics feel stable.
