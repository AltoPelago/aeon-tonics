# @aeon-tonics/aeon-lint

Rule-based linting over AEON files using compile diagnostics and AES graph semantics.

## When To Use This Tool

- Use `aeon-lint` when you want a fast pass/fail guard over AEON files rather than a deeper graph inspection.
- Use it after `aeon-search` or `aeon-graph` when you already have sensitive scopes and want focused rules like `no-pointer-under` or `no-clone-into`.
- Start with `aeon-lint --examples` or `examples/search-graph-lint-workflow` for scoped guardrails, or `examples/guard-workflow` when linting is part of a broader preflight.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

First-slice CLI:

```sh
aeon-lint repo/
aeon-lint repo/ --json
aeon-lint repo/ --format sarif
aeon-lint repo/ --rule no-diagnostic --rule no-pointer
aeon-lint repo/ --pointer-under '$.app' --json
aeon-lint repo/ --pointer-under-graph-prefix '$.app' --json
aeon-lint repo/ --pointer-under-file pointer-scopes.txt --json
aeon-lint repo/ --clone-into '$.app.theme' --json
aeon-lint repo/ --clone-into-graph-prefix '$.app' --json
aeon-lint repo/ --clone-into-file clone-scopes.txt --json
aeon-lint repo/ --references '$.shared.theme' --rule no-incoming-reference --json
aeon-lint repo/ --references '$.shared.theme' --rule no-external-reference --json
aeon-lint repo/ --descendants '$.app' --rule no-pointer
aeon-lint --ai
aeon-lint --examples
```

Default rules are `no-diagnostic` and `no-pointer`, which makes the out-of-the-box behavior useful
for CI and agent preflight. Add `--rule no-incoming-reference` when you want to protect a target
path before delete, rename, or replace work, usually paired with `--references <path>`. Add
`--rule no-external-reference` when you want the same check but only across file boundaries. Use
`--format text|json|sarif` when you need human review, agent automation, or external code-scanning
ingestion. `--json` remains a shortcut for `--format json`.

Use `--pointer-under <path>` when you want to forbid pointer edges that originate inside a protected
subtree, for example before mutating a live model section. Use `--clone-into <path>` when you want
to forbid clone references landing inside a canonical scope, for example before asserting that a
subtree is fully concrete rather than copied in. Use `--pointer-under-graph-prefix <path>` when
you want `aeon-lint` to derive exact pointer source paths from the graph under a broader structural
prefix. Use `--clone-into-graph-prefix <path>` when you want `aeon-lint` to derive exact
clone-receiving bindings from the graph first. Use `--pointer-under-file` and `--clone-into-file`
when those protected scopes come from an agent-generated batch list.

Scope files are plain text with one AEON path per line. Blank lines are ignored, and lines starting
with `#` are treated as comments.

The current `no-external-reference` rule is intentionally conservative: current AEON compilation
rejects unresolved cross-file reference targets before graphing, so this rule is mainly future-proof
until cross-file target resolution becomes available.
