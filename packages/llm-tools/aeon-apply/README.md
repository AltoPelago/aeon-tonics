# @aeon-tonics/aeon-apply

Conservative semantic patch application for AEON documents.

## When To Use This Tool

- Use `aeon-apply` when you already have an `aes-diff --patch` result and want to dry-run or apply that semantic migration to one or more AEON files.
- Use it after `aeon-guard` when preflight should influence whether a warned patch is reviewed, continued, or blocked before write.
- Start with `aeon-apply --examples` or `examples/apply-workflow` for baseline patch application, and `examples/guard-apply-workflow` or `examples/guard-apply-blocked-workflow` for guarded apply decisions.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

First-slice CLI:

```sh
aeon-apply patch.json file.aeon
aeon-apply patch.json repo/ --json
aeon-apply patch.json file.aeon --check
aeon-apply patch.json file.aeon --write
aeon-apply patch.json file.aeon --write --log edit-log.jsonl
aeon-apply patch.json file.aeon --write --log edit-log.aeon --log-format aeon
aeon-apply patch.json file.aeon --write --ledger ledger.jsonl --ledger-key key.json
aeon-apply --ai
aeon-apply --examples
```

The first implementation consumes `aes-diff --patch` JSON, checks applicability against each
target's compiled AES stream, and materializes accepted results as minimized AEON. Dry-run is the
default; use `--write` to update files.

When `--log` is provided, writes are recorded using the `aeon.edit.log` format, so they can be
inspected and undone with `aeon-edit log ...` and `aeon-edit undo ...`. When `--ledger` and
`--ledger-key` are provided, writes append signed `aeon.apply.applied` ledger entries.

For agent-oriented usage, see [`AI_WORKFLOW.md`](./AI_WORKFLOW.md).

Future slices should route source mutation through `aeon-edit` when patch operations can be safely
lowered into guarded edit batches, then expose edit logs and signed ledger passthrough.
