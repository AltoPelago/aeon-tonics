# Diff And Edit Workflow Example

This fixture demonstrates the recommended agent loop:

1. Review a semantic change with `aes-diff`.
2. Inspect the current target with `aeon-edit`.
3. Generate a guarded edit plan.
4. Dry-run the plan.
5. Apply it to a temporary working copy with a JSONL undo log and signed ledger.
6. Inspect the log with `aeon-edit log list`, `aeon-edit log show`, and `aeon-ledger inspect`.
7. Verify the edited semantic result with `aes-diff`.
8. Undo the logged write and append an undo ledger event.
9. Verify the temporary file returned to the original `after.aeon` state and the ledger verifies
   against its current head.
10. Repeat the flow with an AEON log and verify the log itself compiles.

Run it from the workspace root:

```sh
sh examples/diff-edit-workflow/run.sh
```

The script copies `after.aeon` to a temporary directory before editing, so it does not mutate this
fixture.

Both fixture files include `aeon:mode = "strict"` because `aeon-edit` is backed by Titonic and only
edits strict-mode documents.

The example starts with this semantic change:

```sh
aes-diff examples/diff-edit-workflow/before.aeon examples/diff-edit-workflow/after.aeon
```

Then it applies this guarded follow-up edit:

```sh
aeon-edit plan-set working.aeon $.app.status '"ready"' > ops.json
aeon-edit batch working.aeon ops.json --check
aeon-ledger keygen --out ledger-key.json --key-id diff-edit-example
aeon-edit batch working.aeon ops.json --write --log edit-log.jsonl --ledger ledger.jsonl --ledger-key ledger-key.json
```

Then it inspects and undoes the logged write:

```sh
aeon-edit log list --log edit-log.jsonl --json
aeon-edit log show --log edit-log.jsonl --json
aeon-ledger inspect --ledger ledger.jsonl --json
aeon-ledger verify --ledger ledger.jsonl --key ledger-key.json --expect-head "$(aeon-ledger head --ledger ledger.jsonl)"
aeon-edit undo working.aeon --log edit-log.jsonl --write --ledger ledger.jsonl --ledger-key ledger-key.json
```

Finally it repeats the same write with an AEON log:

```sh
aeon-edit batch working-aeon-log.aeon ops.json --write --log edit-log.aeon --log-format aeon
aeon-edit log list --log edit-log.aeon --json
aeon-edit log show --log edit-log.aeon --json
aeon-edit undo working-aeon-log.aeon --log edit-log.aeon --write
```

The script also verifies that `edit-log.aeon` compiles cleanly through AEON core before undoing it.
