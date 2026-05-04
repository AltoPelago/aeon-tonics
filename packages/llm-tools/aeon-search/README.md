# @aeon-tonics/aeon-search

Semantic search over AEON/AES events.

## When To Use This Tool

- Use `aeon-search` when you need to discover candidate paths, values, datatypes, or broad kinds before deciding what to inspect or guard next.
- Use it before `aeon-graph` or `aeon-lint` when you want to turn a broad semantic question into a concrete path list.
- Start with `aeon-search --examples` or `examples/search-graph-lint-workflow` when the goal is discovery first, then graphing or linting.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

First-slice CLI:

```sh
aeon-search repo/ --path '$.app.status'
aeon-search repo/ --path-prefix '$.app'
aeon-search repo/ --value '"draft"'
aeon-search repo/ --datatype string
aeon-search repo/ --kind node
aeon-search repo/ --kind reference
aeon-search repo/ --json
aeon-search repo/ --path-prefix '$.app' --format paths
aeon-search repo/ --path-prefix '$.app' --format paths --out app-paths.txt
aeon-search --examples
```

The first implementation recursively discovers `.aeon` files, compiles them to AES, and searches by
canonical path, value, datatype, and broad value kind. Use `--format paths` or `--paths` to emit a
unique sorted path list that can be written directly to files for downstream tools like
`aeon-lint --pointer-under-file ...` or `aeon-lint --clone-into-file ...`. Use `--out <file>` when
you want the CLI to materialize that list itself instead of relying on shell redirection.
