# AEON Edit Agent Workflow

Use this loop when an agent needs to edit AEON safely:

```sh
aeon-edit list file.aeon --json
aeon-edit inspect file.aeon $.path --json
aeon-edit plan-set file.aeon $.path '2' > ops.json
aeon-edit batch file.aeon ops.json --check
aeon-edit batch file.aeon ops.json --write
```

For metadata edits, prefer guarded planners:

```sh
aeon-edit plan-attr-set file.aeon $.app owner '"tools"' > ops.json
aeon-edit plan-node-attr-set file.aeon $.view id '"main"' > ops.json
aeon-edit plan-attr-annotation-set file.aeon $.app owner source '"ui"' > ops.json
aeon-edit plan-node-attr-annotation-set file.aeon $.view id source '"ui"' > ops.json
```

`--check` is the safety gate:

- exit `0`: the edit would make semantic AES changes
- exit `1`: the edit is a semantic no-op
- exit `2`: parse, preflight, guard, or mutation failure

Agent rules:

- Prefer `plan-*` commands over hand-written guarded ops.
- Always run `batch --check` before `batch --write`.
- Treat `EXPECTATION_MISMATCH` as a stale-read signal and re-run `list` or `inspect`.
- Prefer `--json` when another program will consume the result.

Logged writes can be undone as long as the current file still matches the logged `afterText`:

```sh
aeon-edit log list --log .aeon-edit/log.jsonl --json
aeon-edit log show --log .aeon-edit/log.jsonl --json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --id <id> --write
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write
```

Without `--write`, `undo` is a preview rather than a mutation. In plain text mode, that preview
shows the affected paths, semantic AES diff, and restored AEON source.

Successful writes default to `.aeon-edit/log.jsonl` beside the target file. Use `--log` to override
that location or `--no-log` to disable it for a single command.

For signed provenance, add an explicit ledger and signing key:

```sh
aeon-edit batch file.aeon ops.json --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
aeon-ledger verify --ledger .aeon-ledger/ledger.jsonl --key .aeon-ledger/key.json --expect-head "$(aeon-ledger head --ledger .aeon-ledger/ledger.jsonl)"
```

Use `.aeon` logs when the audit trail should remain an AEON document:

```sh
aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.aeon --log-format aeon
```

The same workflow is available from the CLI:

```sh
aeon-edit --ai
```
