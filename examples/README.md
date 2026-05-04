# AEON Tonics Examples

Runnable workflow fixtures for the AEON tonics workspace.

For the `fmt.and` path specifically:

- open [`fmt-and-model-workflow`](./fmt-and-model-workflow) first if you want to learn document
  construction, bridges, and low-level tree helpers
- open [`fmt-and-editor-workflow`](./fmt-and-editor-workflow) first if you already have a
  `FmtAndDocument` and want common semantic edit operations

Quick terminal index:

```sh
npm run examples:list
```

Quick doc check:

```sh
npm run test:docs
```

## Tool Order

Typical agent workflow order in this workspace:

- `aes-diff`
  Review semantic changes or generate patches.
- `aeon-search`
  Discover candidate paths and values.
- `aeon-graph`
  Inspect containment and reference impact.
- `aeon-lint`
  Run focused pass/fail guards.
- `aeon-guard`
  Produce opinionated preflight summaries and decisions.
- `aeon-edit`
  Make guarded direct edits with log and undo support.
- `aeon-apply`
  Dry-run or apply semantic patches.

For the fuller routing guide, see [`../AI_AGENT_WORKFLOWS.md`](../AI_AGENT_WORKFLOWS.md).

Current workflows:

- [`fmt-and-model-workflow`](./fmt-and-model-workflow)
  End-to-end `&ND` text, model, AES, canonical, HTML, and diagnostics path through `fmt-and-model`.
- [`fmt-and-editor-workflow`](./fmt-and-editor-workflow)
  Higher-level semantic editing flow through `fmt-and-editor` over an in-memory `FmtAndDocument`.
- [`fmt-and-annotation-payload-workflow`](./fmt-and-annotation-payload-workflow)
  Annotation-stream to embedded `&ND` payload flow through `fmt-and-annotation-payload`.
- [`diff-edit-workflow`](./diff-edit-workflow)
  Semantic diff plus guarded edit loop with `aes-diff` and `aeon-edit`.
- [`apply-workflow`](./apply-workflow)
  Semantic patch generation plus conservative `aeon-apply` dry runs.
- [`search-graph-lint-workflow`](./search-graph-lint-workflow)
  Search, graph path extraction, and focused linting over sensitive scopes.
- [`guard-workflow`](./guard-workflow)
  Preset graph and lint preflight with persisted guard artifacts.
- [`guard-apply-workflow`](./guard-apply-workflow)
  Guarded migration workflow that warns, records advice, and still continues to `aeon-apply --check`.
- [`guard-apply-blocked-workflow`](./guard-apply-blocked-workflow)
  Stricter guarded migration workflow that stops before apply when guard advice stays at `warn`.
- [`guard-decide-workflow`](./guard-decide-workflow)
  Compact `aeon-guard decide` behavior, including `--advice-exit` policy handling.

Each example directory contains a `run.sh` and a short local README explaining the scenario.
