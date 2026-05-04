# @aeon-tonics/aeon-edit

Titonic-powered CLI for safe semantic AEON file edits.

## When To Use This Tool

- Use `aeon-edit` when you want to inspect, plan, dry-run, write, log, and undo direct AEON source edits with semantic guardrails.
- Use it after `aes-diff` when a review shows that a follow-up change should be made directly to source rather than through a patch-application flow.
- Start with `aeon-edit --examples` or `examples/diff-edit-workflow` for guarded edit loops and undo/log/ledger behavior.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

First-slice commands:

```sh
aeon-edit get file.aeon $.path
aeon-edit inspect file.aeon $.path
aeon-edit list file.aeon
aeon-edit plan-set file.aeon $.path '2'
aeon-edit plan-attr-set file.aeon $.app owner '"tools"'
aeon-edit plan-node-attr-set file.aeon $.view id '"main"'
aeon-edit plan-attr-annotation-set file.aeon $.app owner source '"ui"'
aeon-edit plan-node-attr-annotation-set file.aeon $.view id source '"ui"'
aeon-edit set file.aeon $.path '2'
aeon-edit delete file.aeon $.path
aeon-edit append file.aeon $.items '3'
aeon-edit insert file.aeon $.items[1] '9'
aeon-edit batch file.aeon ops.json
aeon-edit batch file.aeon ops.json --diff
aeon-edit batch file.aeon ops.json --check
aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.jsonl
aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.aeon --log-format aeon
aeon-edit batch file.aeon ops.json --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
aeon-edit log list --log .aeon-edit/log.jsonl --json
aeon-edit log show --log .aeon-edit/log.jsonl --json
aeon-edit log list --log .aeon-edit/log.jsonl
aeon-edit log show --log .aeon-edit/log.jsonl
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --id <id> --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
aeon-edit attr get file.aeon $.app owner
aeon-edit attr set file.aeon $.app owner '"tools"'
aeon-edit attr delete file.aeon $.app owner
aeon-edit attr-annotation get file.aeon $.app owner source
aeon-edit attr-annotation set file.aeon $.app owner source '"ui"'
aeon-edit attr-annotation delete file.aeon $.app owner source
aeon-edit node-attr get file.aeon $.view id
aeon-edit node-attr set file.aeon $.view id '"main"'
aeon-edit node-attr delete file.aeon $.view id
aeon-edit node-attr-annotation get file.aeon $.view id source
aeon-edit node-attr-annotation set file.aeon $.view id source '"ui"'
aeon-edit node-attr-annotation delete file.aeon $.view id source
aeon-edit export-aes file.aeon
```

Mutation commands print edited AEON to stdout by default. Use `--out <file>` or `--write` to write
to disk. Successful writes now log by default to `.aeon-edit/log.jsonl` beside the target file.
Use `--log <file>` to override that location; `.jsonl` logs are line-oriented JSON, while `.aeon`
logs are strict AEON documents with `entries:list` node records. Use `--no-log` to disable logging
for a single command. `undo` previews by default and only mutates files when `--write` is present;
the plain-text preview shows affected paths, a semantic AES diff, and the restored AEON source.
Use `--ledger <file> --ledger-key <file>` on writes or `undo --write` to append signed provenance
events to an `aeon-ledger` JSONL ledger.

See [`AEON_EDIT_REFERENCE.md`](./AEON_EDIT_REFERENCE.md) for the implemented command, path, value,
and output contract. For agentic editing, see [`AI_WORKFLOW.md`](./AI_WORKFLOW.md) or run:

```sh
aeon-edit --ai
aeon-edit --examples
```
