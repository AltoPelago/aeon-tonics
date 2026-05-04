# AES Diff Agent Workflow

Use this workflow when an AI agent or automation needs to compare AEON or AES safely.

The same guide is embedded in the CLI:

```sh
aes-diff --ai
```

## Safe Review Loop

1. Compare AEON semantically:

```sh
aes-diff before.aeon after.aeon
aes-diff --json before.aeon after.aeon
```

2. Get a compact planning summary:

```sh
aes-diff --summary before.aeon after.aeon
```

3. Gate CI or agent checks:

```sh
aes-diff --check before.aeon after.aeon
```

4. Scope review to intended subtrees or domains:

```sh
aes-diff --path $.app before.aeon after.aeon
aes-diff --no-metadata before.aeon after.aeon
```

5. Build an AES-native patch when needed:

```sh
aes-diff --patch before.aeon after.aeon > patch.json
aes-diff apply --from-aes base.aes.json patch.json
```

## Exit Codes

- `0`: no semantic changes, or command succeeded
- `1`: `--check` found semantic changes
- `2`: diagnostics, parse failure, IO failure, or invalid arguments

## Agent Rules

- Prefer `--summary` for planning and `--json` for programmatic review.
- Treat diagnostics as failure signals, even when partial diff data is present.
- Use `--path` to limit review to the intended subtree before acting on a diff.
- Use `--patch` only for AES-native patch review/application; it does not edit AEON source.
- For source edits, use `aeon-edit plan-* -> batch --check -> batch --write`.
