# Guard Workflow Example

This fixture demonstrates the preset preflight flow around `aeon-guard`:

1. Summarize graph risk with `aeon-guard summary`.
2. Run an opinionated `edit-preflight` over a target path, mutable scope, and clone scope.
3. Write the preflight report directly to an artifact file with `--out`.
4. Run a narrower incoming-reference check for the same target.

Run it from the workspace root:

```sh
sh examples/guard-workflow/run.sh
```

The script builds a temporary AEON file and temporary report artifacts, so it does not mutate this
fixture.
