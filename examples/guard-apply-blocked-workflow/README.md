# Guard And Apply Blocked Workflow Example

This fixture demonstrates the stricter guarded migration loop:

1. Create a semantic patch with `aes-diff --patch`.
2. Run `aeon-guard edit-preflight` against the same working document and subtree.
3. Write the full preflight report directly to an artifact file with `--out`.
4. Read compact `aeon-guard decide` output for script branching.
5. Stop before `aeon-apply` because this workflow treats `warn` as a hard stop.

Run it from the workspace root:

```sh
sh examples/guard-apply-blocked-workflow/run.sh
```

The script builds temporary AEON files and report artifacts, so it does not mutate this fixture.
