# Guard And Apply Workflow Example

This fixture demonstrates the recommended guarded migration loop:

1. Create a semantic patch with `aes-diff --patch`.
2. Run `aeon-guard edit-preflight` against the same working document and subtree.
3. Write the full preflight report directly to an artifact file with `--out`.
4. Read compact `aeon-guard decide --advice-exit block` output for script branching.
5. Continue to `aeon-apply --check` because this workflow soft-passes `warn`.

Run it from the workspace root:

```sh
sh examples/guard-apply-workflow/run.sh
```

The script builds temporary AEON files and report artifacts, so it does not mutate this fixture.
