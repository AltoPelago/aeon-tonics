# AEON Apply AI Workflow

`aeon-apply` is the conservative migration step between semantic review and source mutation.

Use it when you already have an `aes.patch` and want to test whether that patch can safely land on
one or more AEON targets.

## Recommended Loop

```sh
aes-diff --patch before.aeon after.aeon > patch.json
aeon-search repo/ --path '$.app.status' --json
aeon-apply patch.json repo/ --check --json
aeon-apply patch.json repo/ --write --log .aeon-edit/log.jsonl
aeon-verify changed-file.aeon --strict
```

For AEON-native logs:

```sh
aeon-apply patch.json file.aeon --write --log .aeon-edit/log.aeon --log-format aeon
aeon-edit undo file.aeon --log .aeon-edit/log.aeon --write
```

## Agent Rules

- Treat dry-run as mandatory before write.
- Inspect every blocked target; do not force stale applications.
- `PATCH_STALE_BASE` means the target does not match the patch precondition.
- Prefer narrowing targets with `aeon-search` before applying repo-wide patches.
- Use `aes-diff` after writing to verify the semantic result.

## Current Boundary

The first implementation materializes accepted patches back to minimized AEON directly.

It does not lower AES patch operations into `aeon-edit` batches. Instead, `--log` writes compatible
`aeon.edit.log` records after successful application, and `--ledger/--ledger-key` appends signed
`aeon.apply.applied` ledger entries.

That means `aeon-edit undo` can undo logged `aeon-apply` writes, while the ledger preserves both the
apply event and any later undo event.
