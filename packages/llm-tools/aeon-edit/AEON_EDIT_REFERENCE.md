# AEON Edit Reference

This document describes the current implemented `@aeon-tonics/aeon-edit` contract.

`aeon-edit` is a Titonic-powered CLI for semantic edits to strict AEON files. It uses AEON core to
compile source into AES, Titonic to perform live document mutations, and Titonic/minizer export to
emit AEON again.

## Strict-Mode Requirement

Input AEON must currently include:

```aeon
aeon:mode = "strict"
```

This follows Titonic's current safety boundary.

`aeon-edit` currently loads documents with `maxAttributeDepth: 2` so commands can inspect and mutate
one layer of nested binding attribute annotations, such as:

```aeon
app@{owner@{source:string = "seed"}:string = "core"}:object = {}
```

For an embedded agent-safe workflow, run:

```sh
aeon-edit --ai
```

The same workflow is documented in [`AI_WORKFLOW.md`](./AI_WORKFLOW.md).

## Commands

### `get`

```sh
aeon-edit get file.aeon $.app.name
```

Reads a value at a path.

### `inspect`

```sh
aeon-edit inspect file.aeon $.app
```

Reads a path summary, including kind, declared datatype when known, binding attributes,
node-head attributes when the path is a node, and directly editable child paths.

### `list`

```sh
aeon-edit list file.aeon
```

Lists reusable edit paths for the document. Node children are emitted as `.children[index]` paths so
they can be passed back into `get`, `set`, `inspect`, or metadata commands.

### `plan-set`

```sh
aeon-edit plan-set file.aeon $.app.count '2'
```

Emits a batch ops JSON object for a guarded `set` operation. The current value at the path is rendered
as `expect`, so the plan can be reviewed, saved, and passed directly to `aeon-edit batch`.

### `plan-attr-set`

```sh
aeon-edit plan-attr-set file.aeon $.app owner '"tools"'
```

Emits a guarded binding attribute update using the current attribute value as `expectAttribute`.

### `plan-node-attr-set`

```sh
aeon-edit plan-node-attr-set file.aeon $.view id '"main"'
```

Emits a guarded node-head attribute update using the current node attribute value as
`expectAttribute`.

### `plan-attr-annotation-set`

```sh
aeon-edit plan-attr-annotation-set file.aeon $.app owner source '"ui"'
```

Emits a guarded nested binding attribute annotation update using the current parent attribute value
as `expectAttribute` and current nested annotation value as `expectAnnotation`.

### `plan-node-attr-annotation-set`

```sh
aeon-edit plan-node-attr-annotation-set file.aeon $.view id source '"ui"'
```

Emits a guarded nested node-head attribute annotation update using the current parent node attribute
value as `expectAttribute` and current nested annotation value as `expectAnnotation`.

### `set`

```sh
aeon-edit set file.aeon $.app.count '2'
aeon-edit set file.aeon $.app.name '"Aeon"'
```

Sets a value from an AEON snippet.

### `delete`

```sh
aeon-edit delete file.aeon $.app.name
```

Deletes an object member or list item.

### `append`

```sh
aeon-edit append file.aeon $.items '3'
```

Appends an AEON snippet value to a list.

### `insert`

```sh
aeon-edit insert file.aeon $.items[1] '9'
```

Inserts an AEON snippet value before the indexed list item.

### `batch`

```sh
aeon-edit batch file.aeon ops.json
```

Applies multiple mutation operations in one document load/export cycle. The ops file can be a JSON
array or an object with an `operations` array:

```json
{
  "operations": [
    { "command": "set", "path": "$.app.count", "value": "2" },
    { "command": "append", "path": "$.items", "value": "3" },
    { "command": "attr.set", "path": "$.app", "key": "owner", "value": "\"tools\"" },
    { "command": "node-attr.set", "path": "$.view", "key": "id", "value": "\"main\"" }
  ]
}
```

Supported batch commands:

- `set`
- `delete`
- `append`
- `insert`
- `attr.set`
- `attr.delete`
- `attr-annotation.set`
- `attr-annotation.delete`
- `node-attr.set`
- `node-attr.delete`
- `node-attr-annotation.set`
- `node-attr-annotation.delete`

### `undo`

```sh
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --id 2026-04-26T08:32:10.120Z-abc123 --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --json
```

Restores the `beforeText` from the latest matching edit log record. Undo is intentionally
snapshot-based in this slice: it refuses to write unless the current file exactly matches the logged
`afterText`.

Use `--id` to undo a specific log record instead of the latest matching record. The same stale-target
guard still applies.

Without `--write`, undo is a preview: in plain text mode it shows the affected paths, semantic AES
diff, and restored AEON source instead of touching the file. With `--json`, the preview is returned
as `{ ok, command, id, file, output }`.

### `log list`

```sh
aeon-edit log list --log .aeon-edit/log.jsonl --json
```

Lists compact log summaries. Plain text output is formatted for review and includes the id, command,
timestamp, target, diff summary, and affected paths. JSON output returns `{ ok, command, value }`,
where `value` contains record ids, timestamps, commands, targets, diff summaries, affected top-level
bindings, and compact affected paths.

### `log show`

```sh
aeon-edit log show --log .aeon-edit/log.jsonl --json
aeon-edit log show <id> --log .aeon-edit/log.jsonl --json
```

Shows the latest log record by default, or a specific record when an id is provided. Plain text
output is formatted as a readable record with before/after AEON sections. JSON output includes the
full record shape, including `beforeText` and `afterText`, plus the affected path summary stored at
write time.

### `export-aes`

```sh
aeon-edit export-aes file.aeon
```

Exports the current document as AES JSON:

```json
{
  "events": []
}
```

This command is retained for compatibility with consumers of the TypeScript
`AssignmentEvent` shape.

### `export-telex`

```sh
aeon-edit export-telex file.aeon
aeon-edit export-telex file.aeon --include-headers --out file.telex.aes
```

Exports the current document as complete portable AES encoded in Telex.
Headers are omitted by default. When requested, they use the
`aeon.document.v0` projection and `header=` records rather than ordinary body
paths.

### `attr get`

```sh
aeon-edit attr get file.aeon $.app owner
```

Reads a binding attribute entry.

### `attr set`

```sh
aeon-edit attr set file.aeon $.app owner '"tools"'
```

Sets a binding attribute from an AEON snippet.

### `attr delete`

```sh
aeon-edit attr delete file.aeon $.app owner
```

Deletes a binding attribute.

### `attr-annotation get`

```sh
aeon-edit attr-annotation get file.aeon $.app owner source
```

Reads a nested annotation from a binding attribute.

### `attr-annotation set`

```sh
aeon-edit attr-annotation set file.aeon $.app owner source '"ui"'
```

Sets a nested binding attribute annotation from an AEON snippet.

### `attr-annotation delete`

```sh
aeon-edit attr-annotation delete file.aeon $.app owner source
```

Deletes a nested binding attribute annotation.

### `node-attr get`

```sh
aeon-edit node-attr get file.aeon $.view id
```

Reads a node-head attribute entry from the node element at a path.

### `node-attr set`

```sh
aeon-edit node-attr set file.aeon $.view id '"main"'
```

Sets a node-head attribute from an AEON snippet.

### `node-attr delete`

```sh
aeon-edit node-attr delete file.aeon $.view id
```

Deletes a node-head attribute.

### `node-attr-annotation get`

```sh
aeon-edit node-attr-annotation get file.aeon $.view id source
```

Reads a nested annotation from a node-head attribute.

### `node-attr-annotation set`

```sh
aeon-edit node-attr-annotation set file.aeon $.view id source '"ui"'
```

Sets a nested node-head attribute annotation from an AEON snippet.

### `node-attr-annotation delete`

```sh
aeon-edit node-attr-annotation delete file.aeon $.view id source
```

Deletes a nested node-head attribute annotation.

## Path Syntax

Current supported path syntax:

- `$.name`
- `$.nested.value`
- `$.items[0]`
- `$."quoted key"`
- `$["quoted key"]`
- `$.node.children[0]`

`children` maps to Titonic's internal `TITONIC_CHILDREN` segment for node children.

## Value Syntax

Mutation values are AEON snippets, not JSON.

Examples:

- number: `'2'`
- string: `'"Aeon"'`
- boolean: `'true'`
- null: `'null'`
- object: `'{ name:string = "Aeon" }'`
- list: `'[1, 2]'`
- tuple: `'(1, "two")'`
- node: `'<tag("child")>'`

The current snippet parser infers a broad datatype from the first token before passing the value
through Titonic.

## Output And Writes

Mutation commands are safe by default: they print edited AEON to stdout and do not modify files.

Write modes:

```sh
aeon-edit set file.aeon $.count '2' --out updated.aeon
aeon-edit set file.aeon $.count '2' --write
```

- `--out <file>` writes to a separate file
- `--write` overwrites the input file
- successful `--out` or `--write` edits log by default to `.aeon-edit/log.jsonl` beside the target
- `--log <file>` overrides that default log location
- `--log-format jsonl|aeon` overrides log format inference; `.aeon` defaults to AEON, everything
  else defaults to JSONL
- `--no-log` disables logging for the command
- `--ledger <file>` appends signed provenance events to an `aeon-ledger` JSONL ledger
- `--ledger-key <file>` signs ledger events with a key generated by `aeon-ledger keygen`

Current AEON output is minimized AEON, not source-format-preserving AEON.

## Edit Logs And Undo

Successful writes can append a snapshot log record:

```sh
aeon-edit batch file.aeon ops.json --write
aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.jsonl
aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.aeon --log-format aeon
aeon-edit batch file.aeon ops.json --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
```

When `--log` is omitted, the default location is `.aeon-edit/log.jsonl` beside the target file.

JSONL records include:

- `format: "aeon.edit.log"`
- `version`
- `id`
- `timestamp`
- `command`
- `file`
- `target`
- `beforeText`
- `afterText`
- `diffSummary`
- `affectedTopLevel`
- `affectedPaths`

AEON logs are strict AEON documents shaped as:

```aeon
aeon:mode = "strict"
aeon:profile = "aeon.edit.log.v1"
entries:list = [
  <edit@{id:string = "...", timestamp:string = "...", command:string = "...", target:string = "..."}:node(
    <before:node("...")>,
    <after:node("...")>,
    <record:node("{...json...}")>
  )>
]
```

The `<record:node(...)>` child carries the same JSON payload as JSONL so undo can use either log
format.

Undo is guarded:

```sh
aeon-edit log list --log .aeon-edit/log.jsonl --json
aeon-edit log show --log .aeon-edit/log.jsonl --json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --id <id> --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
```

It only restores when the current file exactly equals the latest matching record's `afterText`.
Otherwise it exits `2` with `UNDO_STALE_TARGET`.

When `--ledger` and `--ledger-key` are supplied, successful writes append `aeon.edit.applied`
ledger events and successful `undo --write` calls append `aeon.edit.undone` events. Ledger payloads
store source hashes, semantic diff summaries, affected paths, and edit-log record ids when available;
they do not duplicate full `beforeText` or `afterText` snapshots.

## Diff Review

Mutation commands accept `--diff` to print the semantic AES diff between the original input and the
edited AEON output:

```sh
aeon-edit set file.aeon $.app.count '2' --diff
aeon-edit batch file.aeon ops.json --diff
```

With `--json`, the raw `aes.diff` object is included under `diff`. This is intended for agentic edit
review before choosing `--out` or `--write`.

## Check Mode

Mutation commands accept `--check` as a dry-run guard. It implies `--diff`, never writes to disk, and
uses the exit code to indicate whether the edit would change AES semantics:

```sh
aeon-edit batch file.aeon ops.json --check
```

- exit `0`: the edit would produce semantic changes
- exit `1`: the edit is a semantic no-op
- exit `2`: the edit failed

Batch operations are preflighted before mutation. Blocking diagnostics such as missing set paths,
non-list append/insert targets, or metadata updates against missing parent attributes return `ok:
false` and exit `2`. Warning diagnostics, such as no-op deletes, are included in `preflight` but do
not block execution.

Batch operations can also include optimistic guards. Guard values are AEON snippets and are checked
during preflight before mutation:

```json
[
  { "command": "set", "path": "$.app.count", "expect": "1", "value": "2" },
  {
    "command": "attr-annotation.set",
    "path": "$.app",
    "key": "owner",
    "annotationKey": "source",
    "expectAttribute": "\"core\"",
    "expectAnnotation": "\"seed\"",
    "value": "\"ui\""
  }
]
```

- `expect` checks the current path value.
- `expectAttribute` checks the current binding or node attribute value.
- `expectAnnotation` checks the current nested attribute annotation value.

## JSON Output

All commands accept `--json`.

Example:

```sh
aeon-edit set file.aeon $.count '2' --json
```

Errors are emitted as:

```json
{
  "ok": false,
  "error": {
    "message": "..."
  }
}
```

## Current Non-Goals

The current slice does not yet implement:

- source formatting preservation
- AEON-source patch application
- semantic inverse-operation undo
- automatic logging without an explicit `--log`

Those should be layered on top of the current Titonic-backed edit core.
