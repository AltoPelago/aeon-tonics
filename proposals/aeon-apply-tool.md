# Proposal: AEON Apply Tool

## Summary

Create a higher-level semantic patch and migration application tool for AEON documents.

This tool should sit above `aes-diff` and `aeon-edit`, using semantic patches and guarded edits to
apply intended changes conservatively across one or more targets.

Suggested package name:

- `@aeon-tonics/aeon-apply`

Possible binary:

- `aeon-apply`

Status: first slice implemented.

Implemented package:

- `packages/llm-tools/aeon-apply`

Implemented binary:

- `aeon-apply`

The first slice consumes `aes-diff --patch` JSON, discovers one or more target `.aeon` files,
checks patch applicability against each target's compiled AES stream, defaults to dry-run, writes
only with `--write`, and reports per-target diagnostics. Accepted patches are materialized back to
minimized AEON. Writes can now emit compatible `aeon.edit.log` records and signed
`aeon.apply.applied` ledger entries.

## Why This Matters

Right now we can:

- inspect semantic changes with `aes-diff`
- make safe local edits with `aeon-edit`

What we do not yet have is a migration-focused tool that says:

- here is the semantic change I want
- here are the files it can apply to
- here is where it is safe
- here is where it should refuse because the base has drifted

That is the missing layer for broader automation.

## Design Goal

`aeon-apply` should be:

- patch-oriented
- conservative
- review-friendly
- safe by default
- able to emit logs and ledger events through `aeon-edit`

It should not try to be a blind search-and-replace engine.

## Relationship To Existing Tools

Recommended relationship:

- `aes-diff` generates and reviews semantic changes
- `aeon-apply` chooses where a semantic patch can land
- `aeon-edit` performs the actual guarded source edits

This keeps source mutation in one place and lets `aeon-apply` focus on planning and orchestration.

## Proposed Package Shape

Possible public surface:

- `planAeonApply(patch, targets, options?)`
- `applyAeonPatch(target, patch, options?)`
- `formatAeonApply(result, options?)`

## CLI Shape

```sh
aeon-apply patch.json file.aeon
aeon-apply patch.json repo/ --json
aeon-apply patch.json repo/ --check
aeon-apply patch.json repo/ --write
aeon-apply patch.json repo/ --write --log .aeon-edit/log.jsonl
aeon-apply patch.json repo/ --write --ledger .aeon-ledger/ledger.jsonl --ledger-key key.json
```

## Patch Sources

### From `aes-diff`

```sh
aes-diff --patch before.aeon after.aeon > patch.json
aeon-apply patch.json target.aeon --check
```

### From Higher-Level Migration Specs

Future direction:

```json
{
  "operations": [
    { "command": "set", "path": "$.app.status", "value": "\"ready\"" }
  ]
}
```

## Safety Model

The first implementation should be conservative.

Checks:

- patch applicability must be explicit
- stale bases should be rejected
- dry-run should be the default
- output should explain why a target was accepted or rejected
- actual writes should only occur with `--write`

Future hardening:

- lower safe patch operations into `aeon-edit` guarded batches
- optionally pass `--log`, `--ledger`, and `--ledger-key` through that `aeon-edit` mutation path
  when a patch can be lowered without changing its semantics

## Result Shape

```ts
interface AeonApplyResult {
  readonly format: 'aeon.apply';
  readonly version: 1;
  readonly ok: boolean;
  readonly targets: readonly AeonApplyTargetResult[];
}

interface AeonApplyTargetResult {
  readonly file: string;
  readonly applicable: boolean;
  readonly applied: boolean;
  readonly changed: boolean;
  readonly diffSummary?: AesDiffSummary;
  readonly diagnostics: readonly string[];
}
```

## Agentic Workflow

This tool should become the migration loop:

1. derive semantic patch from `aes-diff`
2. inspect target population with `aeon-search`
3. dry-run with `aeon-apply --check`
4. write through `aeon-edit`
5. log and sign
6. verify

## First Slice Scope

Phase 1:

- consume `aes-diff --patch` output: implemented
- apply to one or more AEON files conservatively: implemented
- dry-run by default: implemented
- optional `--write`: implemented
- per-target diagnostics: implemented
- optional `--log`, `--ledger`, and `--ledger-key`: implemented as compatible apply provenance
- `aeon-edit undo` compatibility for logged apply writes: implemented

Phase 1 can defer:

- fuzzy applicability
- merge conflict resolution
- custom migration DSLs
- workspace manifests
- guarded `aeon-edit` lowering for logs and signed ledgers

## Recommendation

Build this in the next tranche.

It is the bridge from single-file safe editing to repository-scale semantic migrations.
