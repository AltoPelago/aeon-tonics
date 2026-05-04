# Apply Workflow Example

This fixture demonstrates the recommended semantic patch application loop:

1. Create an `aes.patch` with `aes-diff --patch`.
2. Dry-run that patch against one or more target AEON files with `aeon-apply`.
3. Review the per-target applicability and semantic diff summary.
4. Apply only accepted targets with `aeon-apply --write`.
5. Record the write in an `aeon.edit.log` compatible undo log and signed ledger.
6. Verify the resulting AEON against the intended output with `aes-diff`.
7. Undo through `aeon-edit undo` using the apply log.
8. Repeat the write with an AEON log and verify the log compiles.
9. Confirm stale targets are rejected instead of overwritten.

Run it from the workspace root:

```sh
sh examples/apply-workflow/run.sh
```

The script copies fixture files into a temporary directory before writing, so it does not mutate this
fixture.

The core loop is:

```sh
aes-diff --patch before.aeon after.aeon > patch.json
aeon-apply patch.json target.aeon --check
aeon-apply patch.json target.aeon --write --log edit-log.jsonl --ledger ledger.jsonl --ledger-key key.json
aes-diff after.aeon target.aeon
aeon-edit undo target.aeon --log edit-log.jsonl --write --ledger ledger.jsonl --ledger-key key.json
aeon-apply patch.json target.aeon --write --log edit-log.aeon --log-format aeon
```

`aeon-apply` is intentionally conservative. If the target no longer matches the patch precondition,
the tool reports `PATCH_STALE_BASE` and exits non-zero.
