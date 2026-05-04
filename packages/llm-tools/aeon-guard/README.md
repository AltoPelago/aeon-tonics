# @aeon-tonics/aeon-guard

Preset preflight guards over AEON files for agents and CI.

## When To Use This Tool

- Use `aeon-guard` when you want an opinionated preflight answer without composing `aeon-lint` and `aeon-graph` flags by hand.
- Use it before `aeon-edit` or `aeon-apply` when you need a summary, a compact `proceed|warn|block` decision, or a persisted preflight artifact.
- Start with `aeon-guard --examples` or `examples/guard-workflow` for artifact-oriented preflight, `examples/guard-apply-workflow` for warn-and-continue, and `examples/guard-apply-blocked-workflow` for warn-and-stop.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

First-slice CLI:

```sh
aeon-guard summary repo/ --json
aeon-guard decide repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --json
aeon-guard decide repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice-exit block --json
aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --json
aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice
aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice --advice-exit block
aeon-guard edit-preflight repo/ --target '$.shared.theme' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out preflight.json
aeon-guard pointers repo/ --json
aeon-guard pointer-under repo/ '$.app' --json
aeon-guard pointer-under repo/ '$.app' --graph-prefix --json
aeon-guard clone-into repo/ '$.app' --json
aeon-guard clone-into repo/ '$.app' --graph-prefix --json
aeon-guard incoming repo/ '$.shared.theme' --json
aeon-guard incoming repo/ '$.shared.theme' --external --json
aeon-guard --examples
```

`aeon-guard` keeps the existing `aeon-lint` and `aeon-graph` semantics but exposes a smaller preset
surface for common preflight questions. Use `summary` when you want counts and high-risk pointer
paths before deciding on a stricter check. Use `pointers` when you want a coarse “any pointer edges
at all?” gate. Use `pointer-under` and `clone-into` when you want scope-focused checks, and add
`--graph-prefix` when the provided path should first be expanded through graph-derived endpoints
rather than treated as a direct lint scope. Use `incoming` before rename, replace, or delete work;
add `--external` when you only care about cross-file incoming references. Use `edit-preflight`
before `aeon-edit` or `aeon-apply` when you want one opinionated report that combines graph
summary, incoming-reference protection for a changed target path, pointer-scope protection for the
mutable working subtree, and clone-scope protection for canonical subtrees that should stay fully
materialized. Use `--out <file>` when you want the report written directly for later agent steps,
CI artifacts, or review attachments. Use `--advice` when the caller only needs a compact
`block`, `warn`, or `proceed` recommendation rather than the full preflight report. Use
`--advice-exit warn` to keep the current behavior where `warn` exits non-zero, or
`--advice-exit block` when `warn` should still be reported but not fail the command.
Use `decide` when you always want the compact recommendation form and do not need the full
preflight report shape. Use `--examples` when you want the CLI to point you directly at the
runnable workflow fixtures in this workspace.
