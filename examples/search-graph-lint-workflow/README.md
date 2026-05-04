# Search / Graph / Lint Workflow

Shows how an agent can:

1. Discover candidate scopes with `aeon-search --format paths --out ...`
2. Discover reference endpoints with `aeon-graph --format paths --from|--to --out ...`
3. Feed those scope files directly into `aeon-lint --pointer-under-file` and `--clone-into-file`

Run with:

```sh
sh examples/search-graph-lint-workflow/run.sh
```
