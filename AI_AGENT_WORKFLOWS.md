# AEON Agent Workflows

This guide describes how AI agents should combine the semantic AEON/AES tools in this workspace.

Use `aes-diff` to understand what changed.
Use `aeon-edit` to make guarded AEON source edits.

## Workflow Chooser

Use this when an agent needs to pick the right loop quickly.

- Review what changed semantically before or after an edit:
  Use `aes-diff` and start with [`examples/diff-edit-workflow`](./examples/diff-edit-workflow).
- Make a guarded direct edit to an AEON file:
  Use `aeon-edit` with a dry-run first, and start with [`examples/diff-edit-workflow`](./examples/diff-edit-workflow).
- Prepare a semantic patch migration and inspect whether apply work looks risky:
  Use `aeon-guard edit-preflight` plus `aeon-guard decide`, and start with [`examples/guard-workflow`](./examples/guard-workflow).
- Continue through a warned preflight to `aeon-apply --check` anyway:
  Use the soft-pass advice pattern in [`examples/guard-apply-workflow`](./examples/guard-apply-workflow).
- Stop before apply when guard advice is not clean:
  Use the strict branching pattern in [`examples/guard-apply-blocked-workflow`](./examples/guard-apply-blocked-workflow).
- Explore sensitive scopes before editing:
  Use `aeon-search`, `aeon-graph`, and `aeon-lint`, and start with [`examples/search-graph-lint-workflow`](./examples/search-graph-lint-workflow).
- Only need a compact machine-friendly recommendation:
  Use `aeon-guard decide` and start with [`examples/guard-decide-workflow`](./examples/guard-decide-workflow).

For a central workspace index of runnable fixtures, use [`examples/README.md`](./examples/README.md)
or run:

```sh
npm run examples:list
```

## Diff Then Edit

Use this loop when an agent needs to review a change, decide whether follow-up edits are needed,
and apply those edits safely.

1. Review the semantic change:

```sh
aes-diff before.aeon after.aeon
aes-diff --summary before.aeon after.aeon
```

2. Scope the review if the intent is narrow:

```sh
aes-diff --path $.app before.aeon after.aeon
aes-diff --path $.schema.rules before.aeon after.aeon
```

3. Inspect the current target before editing:

```sh
aeon-edit list after.aeon --json
aeon-edit inspect after.aeon $.app.count --json
```

4. Generate a guarded edit plan:

```sh
aeon-edit plan-set after.aeon $.app.count 2 > ops.json
```

5. Dry-run the edit:

```sh
aeon-edit batch after.aeon ops.json --check
```

6. Apply only after the dry-run is semantically correct:

```sh
aeon-edit batch after.aeon ops.json --write
```

7. Verify the final semantic result:

```sh
aes-diff before.aeon after.aeon
aes-diff --summary before.aeon after.aeon
```

## Exit Code Differences

`aes-diff --check` is a CI-style gate:

- `0`: no semantic changes
- `1`: semantic changes are present
- `2`: diagnostics, parse failure, IO failure, or invalid arguments

`aeon-edit batch --check` is an edit preview:

- `0`: the edit would make semantic AES changes
- `1`: the edit is a semantic no-op
- `2`: parse, preflight, guard, or mutation failure

## Agent Rules

- Use `aes-diff --summary` before deciding what to edit.
- Use `aes-diff --path` when the intended change is scoped to a subtree.
- Use `aeon-edit plan-*` commands rather than hand-written batch operations.
- Always run `aeon-edit batch --check` before `aeon-edit batch --write`.
- Treat `EXPECTATION_MISMATCH` as a stale-read signal and re-run `list` or `inspect`.
- Treat `aes-diff` diagnostics as failure signals even if partial diff data is present.

## Embedded Tool Guides

Each CLI also carries its own short agent guide:

```sh
aes-diff --ai
aeon-edit --ai
```

## Guard Then Apply

Use this loop when an agent is preparing a semantic patch migration and wants a compact preflight
recommendation before deciding whether to continue.

1. Create the semantic patch:

```sh
aes-diff --patch before.aeon after.aeon > patch.json
```

2. Write the full preflight report:

```sh
aeon-guard edit-preflight target.aeon --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out preflight.json
```

3. Read compact branching advice:

```sh
aeon-guard decide target.aeon --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out advice.json
```

4. Branch intentionally on the recommendation:

- Treat `proceed` as safe to continue automatically.
- Treat `warn` as either “continue to dry-run with review” or “stop before apply,” depending on the workflow.
- Use `aeon-guard decide --advice-exit block` when the continuation workflow should keep `warn` in the artifact but avoid a non-zero shell exit.
- Treat `block` as a hard stop caused by graph diagnostics.

5. If the workflow allows continuation, dry-run the patch:

```sh
aeon-apply patch.json target.aeon --check --json
```

## Runnable Example

For a concrete end-to-end fixture, run:

```sh
sh examples/diff-edit-workflow/run.sh
```

## CI Expectations

The runnable example is intentionally included in `npm run test` through `npm run test:examples`.
It protects the cross-tool workflow rather than a single package API: `aes-diff` must still review
semantic changes, `aeon-edit` must still produce and apply guarded edits, and the final result must
still be verifiable with `aes-diff`.
