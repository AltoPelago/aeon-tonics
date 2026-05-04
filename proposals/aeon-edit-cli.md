# Proposal: AEON Edit CLI

## Summary

Create a Titonic-powered command line tool for safe, scriptable edits to AEON files.

Status: first implementation exists in `packages/llm-tools/aeon-edit`. The current package includes `get`,
`set`, `delete`, `append`, `insert`, `export-aes`, safe stdout/`--out`/`--write` behavior, and JSON
output.

The CLI should expose practical CRUD operations over AEON documents without asking users or agents
to perform brittle text edits.

The core idea:

- `@aeon/core` parses AEON into AES
- `@aeon-tonics/titonic` provides the live document model and path-based mutation safety
- the edit CLI exposes those operations to humans, scripts, and AI agents
- output is emitted as AEON or AES

## Why This Matters

Many workflows need small, precise AEON edits:

- update config values
- add examples
- migrate files
- edit metadata
- inspect paths
- automate repository-wide changes
- apply future AES diff patches

Without a semantic edit CLI, automation tends to fall back to text replacement. That is risky for
AEON because formatting, datatype intent, node literals, references, and metadata all carry meaning.

## Design Goal

The CLI should be:

- semantic rather than text-editing-first
- path-addressed
- safe by default
- easy for agents to call
- usable by humans without writing TypeScript
- aligned with Titonic rather than duplicating its document model

The CLI is not a replacement for Titonic.
It is the operational interface over Titonic.

## Proposed Package Shape

Suggested package name:

- `@aeon-tonics/aeon-edit`

Possible binary:

- `aeon-edit`

The package should live in:

```text
packages/llm-tools/aeon-edit
```

## Core Commands

### Read

```sh
aeon-edit get file.aeon $.app.name
aeon-edit list file.aeon
aeon-edit inspect file.aeon $.app
```

`get` returns a value.
`list` returns known top-level paths.
`inspect` returns value plus datatype and metadata.

### Value Mutation

```sh
aeon-edit set file.aeon $.app.name '"Aeon"'
aeon-edit delete file.aeon $.features[2]
aeon-edit append file.aeon $.features '"search"'
aeon-edit insert file.aeon $.features[0] '"search"'
```

Values should be parsed as AEON snippets by default, not JSON strings.

Example:

```sh
aeon-edit set config.aeon $.port '3000'
aeon-edit set config.aeon $.theme '"dark"'
aeon-edit set config.aeon $.enabled 'true'
```

### Metadata Mutation

Binding attributes:

```sh
aeon-edit attr get file.aeon $.server port
aeon-edit attr set file.aeon $.server port '8080'
aeon-edit attr delete file.aeon $.server port
```

Nested attribute annotations:

```sh
aeon-edit attr-annotation get file.aeon $.server port source
aeon-edit attr-annotation set file.aeon $.server port source '"generated"'
aeon-edit attr-annotation delete file.aeon $.server port source
```

Node head attributes should use explicit node commands so the boundary stays clear:

```sh
aeon-edit node-attr get file.aeon $.view theme
aeon-edit node-attr set file.aeon $.view theme '"compact"'
aeon-edit node-attr delete file.aeon $.view theme
```

### Import And Export

```sh
aeon-edit export-aes file.aeon
aeon-edit from-aes file.aes.json --out file.aeon
aeon-edit canonical file.aeon
aeon-edit format file.aeon
aeon-edit minimize file.aeon
```

`canonical` should emit the existing canonical AEON representation when available. It is useful for
deterministic checks, reviews, and future diff workflows, but it should not become the editing
substrate for phase 1.

`format` can be deferred if there is no full pretty-printer.
`minimize` can use the existing minizer tonic.

## Safety Defaults

The CLI should avoid surprising writes.

Recommended defaults:

- print edited AEON to stdout
- only write back with `--write`
- support `--out path` for explicit output files
- support `--dry-run`
- support `--check` for CI-style validation
- support `--json` for machine-readable output
- preserve semantic metadata through Titonic export
- support canonical output/check modes once wired to the existing canonical representation

Examples:

```sh
aeon-edit set file.aeon $.count '2'
aeon-edit set file.aeon $.count '2' --write
aeon-edit set file.aeon $.count '2' --out updated.aeon
aeon-edit set file.aeon $.count '2' --json
```

## Path Syntax

The CLI should accept a readable path syntax and translate it to Titonic path segments.

Initial syntax:

- `$.name`
- `$.nested.value`
- `$.items[0]`
- `$."quoted key"`

Node children should use an explicit `children` segment in the normal path syntax because Titonic
uses `TITONIC_CHILDREN` internally to avoid confusing node children with ordinary object keys.

CLI syntax should initially follow the existing path style:

- `$.view.children[0]`

Internally this maps to:

```ts
['view', TITONIC_CHILDREN, 0]
```

An alternate spelling such as `$.view::children[0]` is not needed for phase 1. It would only become
useful if the CLI must distinguish between a node child axis and a literal object property named
`children` in a context where both are addressable through the same path surface.

## Output Modes

### Human Text

Human output should be compact:

```text
$.app.name = "Aeon"
```

Mutation output should say what changed:

```text
changed $.app.name
```

### JSON

JSON output should be stable for scripts and agents:

```json
{
  "ok": true,
  "operation": "set",
  "path": "$.app.name",
  "changed": true,
  "output": {
    "format": "aeon",
    "text": "app:object={name:string=\"Aeon\"}"
  }
}
```

Errors should also be structured:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PATH",
    "message": "Expected a property or index after $.app"
  }
}
```

## Agentic Workflow Expectations

For AI agents, this CLI should be predictable enough to use as a safe edit primitive.

Agent-friendly requirements:

- exact path targeting
- JSON output for every command
- no writes unless `--write` or `--out` is supplied
- non-zero exit codes for failed operations
- parse errors with stable codes
- before/after summaries for mutation commands
- optional diff output once `@aeon-tonics/aes-diff` exists

The CLI should let an agent do:

```sh
aeon-edit set file.aeon $.app.version '"1.2.0"' --write --json
aeon-edit inspect file.aeon $.app.version --json
```

without needing to reimplement AEON parsing or Titonic mutation rules.

## Relationship To AES Diff

The edit CLI and AES diff tool should stay separate packages.

Recommended relationship:

- `aeon-edit` performs semantic edits
- `aes-diff` compares semantic results
- later, `aeon-edit --diff` can call `aes-diff` after a mutation
- later, `aeon-edit apply-patch` can apply AES patches if the diff tool grows patch support

This keeps the CLI useful immediately while avoiding premature patch semantics.

## Relationship To Signed Ledgers

Edit logs and signed ledgers should also stay separate.

Recommended relationship:

- `aeon-edit` logs are operational records for local review and snapshot-based undo
- signed ledgers are append-only provenance streams with hash-chain integrity and signatures
- an undo should restore from the edit log, then optionally emit a new signed ledger event
- a signed ledger should never delete or rewrite the original edit event

Future `aeon-edit` integration can add explicit ledger flags:

```sh
aeon-edit batch file.aeon ops.json --write --ledger .aeon-ledger/ledger.jsonl --ledger-key key.json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write --ledger .aeon-ledger/ledger.jsonl --ledger-key key.json
```

The separate ledger proposal lives at [`signed-ledger.md`](./signed-ledger.md).

## First Slice Scope

Phase 1 should implement:

- `get`
- `set`
- `delete`
- `export-aes`
- `--json`
- `--out`
- `--write`
- path parsing for properties and list indexes
- node child addressing through `$.node.children[index]`
- AEON snippet parsing for values

Phase 1 can defer:

- metadata editing
- node-head metadata editing
- canonical/minimize commands
- path globbing
- batch operations
- diff integration
- patch application

## Implementation Plan

### Phase 0: Library Helpers

Before wiring command parsing, create small internal helpers:

- parse CLI path into Titonic path segments
- parse AEON value snippets into Titonic-compatible values
- serialize operation results to human text or JSON
- write output safely to stdout, `--out`, or source file with `--write`

Tests should cover:

- ordinary property paths
- list indexes
- quoted keys
- invalid path diagnostics
- scalar snippet parsing

### Phase 1: Minimal CLI

Create `packages/llm-tools/aeon-edit`.

Public binary:

```json
{
  "bin": {
    "aeon-edit": "./dist/cli.js"
  }
}
```

Initial commands:

```sh
aeon-edit get <file> <path>
aeon-edit set <file> <path> <value>
aeon-edit delete <file> <path>
aeon-edit export-aes <file>
aeon-edit canonical <file>
aeon-edit minimize <file>
```

Implementation notes:

- use `fs/promises` for file IO
- use `createTitonicFromAeon`
- use `getTitonicValue`, `setTitonicValue`, and `deleteTitonicValue`
- use `exportTitonicAes` and `exportTitonicAeon`
- use the existing canonical representation for `canonical` once the package boundary is wired
- write changed AEON to stdout unless `--write` or `--out` is set

### Phase 2: Metadata Commands

Add:

- `attr get`
- `attr set`
- `attr delete`
- `attr-annotation get`
- `attr-annotation set`
- `attr-annotation delete`
- `node-attr get`
- `node-attr set`
- `node-attr delete`

These should call Titonic’s explicit metadata helpers rather than inventing new metadata behavior.

### Phase 3: Ergonomics

Add:

- `append`
- `insert`
- `list`
- `inspect`
- batch mode from JSON operations
- `--check`
- `--diff` once `@aeon-tonics/aes-diff` exists

Batch mode should use the same operation result shape as single commands.

### Phase 4: Patch Integration

Once AES diff patch support exists, add:

- `aeon-edit diff before.aeon after.aeon`
- `aeon-edit apply-patch file.aeon patch.json`

Patch application should be conservative and reject stale base states.

## Decisions And Remaining Questions

Settled for phase 1:

- `set` values should be AEON snippets, not JSON values.
- the CLI should live as tonic/tooling, not inside the core AEON TypeScript implementation.
- node children should use `$.node.children[0]` because that matches the current addressing style.
- canonical AEON should be considered as an output/check mode, not as the primary edit substrate.

Remaining questions:

- Should `--write` preserve source formatting where possible, or is minimized AEON acceptable for
  phase 1?
- Should canonical output be exposed as `canonical`, `format --canonical`, or both?

## Recommendation

Build this after the pure AES diff library starts taking shape, but before patch application.

The edit CLI gives agents and humans a safe operational surface immediately, and the diff tool can
later become its review and patch companion.
