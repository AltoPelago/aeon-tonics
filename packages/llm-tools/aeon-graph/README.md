# @aeon-tonics/aeon-graph

Reference and dependency inspection over AEON/AES.

## When To Use This Tool

- Use `aeon-graph` when you need structural containment, clone relationships, pointer relationships, or compact graph summaries before editing.
- Use it after `aeon-search` when you already know a path or scope and want dependency impact, incoming references, or subtree traversal.
- Start with `aeon-graph --examples` or `examples/search-graph-lint-workflow` for graph-driven scope extraction, or `examples/guard-workflow` for preflight-oriented graph review.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

First-slice CLI:

```sh
aeon-graph file.aeon
aeon-graph repo/ --json
aeon-graph repo/ --summary --json
aeon-graph repo/ --summary --json --fail-on pointer
aeon-graph repo/ --references '$.shared.theme' --summary --json --fail-on incoming-reference
aeon-graph repo/ --references '$.shared.theme' --summary --json --fail-on external-reference
aeon-graph repo/ --format dot
aeon-graph repo/ --format dot --dot-theme agent
aeon-graph repo/ --edge-kind pointer --format paths --from
aeon-graph repo/ --edge-kind clone --format paths --to
aeon-graph repo/ --edge-kind pointer --format paths --from --out pointer-sources.txt
aeon-graph repo/ --edge-kind pointer --from-path-prefix '$.app' --format paths --from --out app-pointer-sources.txt
aeon-graph repo/ --path '$.app.theme'
aeon-graph repo/ --references '$.shared.theme'
aeon-graph repo/ --descendants '$.app'
aeon-graph repo/ --ancestors '$.app.theme.primary'
aeon-graph repo/ --edge-kind contains
aeon-graph repo/ --edge-kind pointer --json
aeon-graph --ai
aeon-graph --examples
```

The first implementation recursively discovers `.aeon` files, compiles them to AES, emits graph
nodes for assignment events, emits structural `contains` edges for parent/child paths, and emits
reference edges for clone and pointer references. Use `--edge-kind contains|clone|pointer` to
isolate structural, clone, or pointer relationships. Use `--descendants <path>` and
`--ancestors <path>` to traverse structural containment scopes before applying other filters. Use
`--format text|json|dot|paths` to choose compact text, machine-readable JSON, Graphviz DOT, or a
newline-delimited unique path list. In `paths` mode, use `--from` and `--to` to emit source paths,
target paths, or both from the filtered edge set. Use `--out <file>` when you want the CLI to
materialize the result directly for a downstream step. Use `--from-path-prefix <path>` and
`--to-path-prefix <path>` to narrow the filtered edge set by source-side or target-side structural
scope before formatting.
`--dot-theme plain|agent` can make DOT output more visually distinct for review; `agent`
highlights pointer edges as higher-risk. `--json` remains available as a shortcut for
`--format json`. Use `--summary` for compact preflight output with edge-kind counts, affected
files, pointer-risk paths, and diagnostics. Use
`--fail-on pointer|incoming-reference|external-reference|diagnostic` as a preflight gate;
`incoming-reference` fails on any clone or pointer edge in the filtered graph. `external-reference`
is reserved for cross-file reference edges; current AEON compilation rejects unresolved cross-file
targets before graphing. Policy failures exit `1`, while compile or usage failures exit `2`.
