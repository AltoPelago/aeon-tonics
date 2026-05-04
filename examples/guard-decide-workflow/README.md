# Guard Decide Workflow Example

This fixture demonstrates the compact decision layer by itself:

1. Summarize graph risk with `aeon-guard summary`.
2. Produce compact advice with `aeon-guard decide`.
3. Contrast the default non-zero `warn` exit with `--advice-exit block`.

Run it from the workspace root:

```sh
sh examples/guard-decide-workflow/run.sh
```

The script builds temporary AEON files and report artifacts, so it does not mutate this fixture.
