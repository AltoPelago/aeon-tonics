# AEON Tonics

Custom tonic workspace for experiments built on top of the AEON TypeScript implementation.

## For AI Agents

Use the tool-native guides when reviewing or editing AEON:

```sh
aes-diff --ai
aeon-edit --ai
aeon-apply --ai
aeon-apply patch.json repo/ --check --json
```

For the combined semantic-review and guarded-edit loop, see
[`AI_AGENT_WORKFLOWS.md`](./AI_AGENT_WORKFLOWS.md). A runnable fixture lives at
[`examples/diff-edit-workflow`](./examples/diff-edit-workflow) and is included in `npm run test`
through `npm run test:examples`.

For a central runnable examples index, use `npm run examples:list` or see
[`examples/README.md`](./examples/README.md).
Use `npm run docs:agent-check` to verify that the core agent docs still carry the expected
cross-links and navigation sections.
This check is also included in `npm run test` through `npm run test:docs`.

## Agent CLI Map

Main agent-facing tools in typical workflow order:

- `aes-diff`
  Review semantic changes or generate semantic patches. Try `aes-diff --examples`.
- `aeon-search`
  Discover candidate semantic paths, values, and kinds before deeper inspection. Try `aeon-search --examples`.
- `aeon-graph`
  Inspect containment, clone, and pointer relationships for impact analysis. Try `aeon-graph --examples`.
- `aeon-lint`
  Run focused pass/fail guards over diagnostics and sensitive scopes. Try `aeon-lint --examples`.
- `aeon-guard`
  Use opinionated preflight summaries and `proceed|warn|block` decisions. Try `aeon-guard --examples`.
- `aeon-edit`
  Inspect, plan, dry-run, write, log, and undo guarded direct AEON edits. Try `aeon-edit --examples`.
- `aeon-apply`
  Dry-run or apply semantic patches once the migration path is understood. Try `aeon-apply --examples`.

For routing help across these tools, see [`AI_AGENT_WORKFLOWS.md`](./AI_AGENT_WORKFLOWS.md).

## Package Layout

The workspace is grouped by intent rather than by publication name:

- `packages/export`
  AEON/AES export helpers such as `@aeon-tonics/minizer`, which takes AES and
  renders minimized AEON text, `@aeon-tonics/compactor`, which emits compact
  AEON while preserving selected comments, `@aeon-tonics/mode-converter`, which
  switches AEON between strict and transport mode, and `@aeon-tonics/prettifier`,
  which expands AEON for human editing without canonical reordering.
- `packages/annotation`
  Annotation-oriented adapters such as `@aeon-tonics/fmt-and-annotation-payload`, which projects
  AEON annotation records into embedded headerless `&ND` payloads.
- `packages/llm-tools`
  Agent-facing CLIs for semantic review, search, graph inspection, linting, guarded edits,
  patch application, and verification: `aes-diff`, `aeon-search`, `aeon-graph`, `aeon-lint`,
  `aeon-guard`, `aeon-edit`, `aeon-apply`, and `aeon-verify`.
- `packages/document`
  `&ND` document-model tooling: `@aeon-tonics/fmt-and-model` and
  `@aeon-tonics/fmt-and-editor`.
- `packages/foundations`
  Reusable tonic foundations: `@aeon-tonics/titonic` and the small
  `@aeon-tonics/starter-tonic` example package. See
  [`packages/foundations/titonic/README.md`](./packages/foundations/titonic/README.md) for the
  Titonic package charter and design boundary.
- `packages/provenance`
  Provenance and integrity tools such as `@aeon-tonics/signed-ledger`.

The legacy `fmt-md-*` packages have been removed from the active workspace. Historical proposal
material remains only for migration context.

## Fmt AND Quick Start

If you are migrating from the old Markdown-oriented path, start here:

- [`packages/document/fmt-and-model/FMT_AND_MIGRATION.md`](./packages/document/fmt-and-model/FMT_AND_MIGRATION.md)
  Package-by-package replacement matrix from `fmt-md-*` to `fmt.and-*`.
- [`examples/fmt-and-model-workflow`](./examples/fmt-and-model-workflow)
  Runnable end-to-end example for `&ND` text, model, AES, canonical `&ND`, HTML, and diagnostics.
- [`examples/fmt-and-editor-workflow`](./examples/fmt-and-editor-workflow)
  Runnable example for higher-level semantic document edits over `FmtAndDocument`.
- [`examples/fmt-and-annotation-payload-workflow`](./examples/fmt-and-annotation-payload-workflow)
  Runnable example for AEON annotation records into embedded headerless `&ND` payloads.
- [`packages/document/fmt-and-model/FMT_AND_REFERENCE.md`](./packages/document/fmt-and-model/FMT_AND_REFERENCE.md)
  Current `fmt.and` node vocabulary and bridge contract.
- [`packages/document/fmt-and-editor/CHOOSING_A_LAYER.md`](./packages/document/fmt-and-editor/CHOOSING_A_LAYER.md)
  Quick guide for choosing between direct model work and the higher-level editor layer.

Workspace guide:

- [`BUILDING_TONICS.md`](./BUILDING_TONICS.md)
  Explains when to stay at AES, when to use Titonic, and when to build a custom tonic.
- [`AI_AGENT_WORKFLOWS.md`](./AI_AGENT_WORKFLOWS.md)
  Shows how agents should combine `aes-diff` and `aeon-edit` for semantic review and guarded edits.
- [`examples/diff-edit-workflow`](./examples/diff-edit-workflow)
  Runnable fixture for the combined `aes-diff` and `aeon-edit` workflow.
- [`examples/README.md`](./examples/README.md)
  Central index for the runnable workflow fixtures in this workspace.
- [`examples/apply-workflow`](./examples/apply-workflow)
  Runnable fixture for the `aes-diff --patch` and `aeon-apply` semantic migration workflow.
- [`examples/guard-workflow`](./examples/guard-workflow)
  Runnable fixture for the `aeon-guard` preset preflight and artifact workflow.
- [`examples/guard-apply-workflow`](./examples/guard-apply-workflow)
  Runnable fixture for the `aeon-guard` plus `aeon-apply --check` guarded migration workflow.
- [`examples/guard-apply-blocked-workflow`](./examples/guard-apply-blocked-workflow)
  Runnable fixture for the stricter pattern where `aeon-guard` blocks before `aeon-apply`.
- [`examples/guard-decide-workflow`](./examples/guard-decide-workflow)
  Runnable fixture for the compact `aeon-guard decide` workflow and `--advice-exit` behavior.
- [`packages/document/fmt-and-model/FMT_AND_REFERENCE.md`](./packages/document/fmt-and-model/FMT_AND_REFERENCE.md)
  Documents the current `fmt.and` node vocabulary, bridges, and AEON mapping.
- [`packages/document/fmt-and-model/FMT_AND_MIGRATION.md`](./packages/document/fmt-and-model/FMT_AND_MIGRATION.md)
  Maps the deprecated `fmt-md-*` package family onto the `fmt.and-*` replacement path.
- [`packages/llm-tools/aes-diff/AI_WORKFLOW.md`](./packages/llm-tools/aes-diff/AI_WORKFLOW.md)
  Embeds the recommended AI-agent review loop for semantic AEON/AES diffs.
- [`packages/llm-tools/aeon-edit/AI_WORKFLOW.md`](./packages/llm-tools/aeon-edit/AI_WORKFLOW.md)
  Embeds the recommended AI-agent loop for guarded semantic AEON source edits.
- [`packages/llm-tools/aeon-apply/AI_WORKFLOW.md`](./packages/llm-tools/aeon-apply/AI_WORKFLOW.md)
  Embeds the recommended AI-agent loop for conservative semantic patch application.
- [`packages/llm-tools/aeon-graph/README.md`](./packages/llm-tools/aeon-graph/README.md)
  Documents the first reference graph inspection slice and `aeon-graph --ai` workflow.
- [`packages/llm-tools/aeon-guard/README.md`](./packages/llm-tools/aeon-guard/README.md)
  Documents the preset preflight wrapper for the most common lint and graph checks.
- [`proposals/aes-diff-tool.md`](./proposals/aes-diff-tool.md)
  Proposal for an AES-native semantic diff tool.
- [`proposals/aeon-edit-cli.md`](./proposals/aeon-edit-cli.md)
  Proposal for a Titonic-powered CLI for safe semantic AEON file edits.
- [`proposals/signed-ledger.md`](./proposals/signed-ledger.md)
  Proposal for a signed append-only provenance ledger for AEON ecosystem events.
- [`proposals/aeon-verify-tool.md`](./proposals/aeon-verify-tool.md)
  Proposal for a unified validation, policy, and provenance verification tool.
- [`proposals/aeon-search-tool.md`](./proposals/aeon-search-tool.md)
  Proposal for semantic AEON/AES search by path, value, datatype, and metadata.
- [`proposals/aeon-apply-tool.md`](./proposals/aeon-apply-tool.md)
  Proposal for conservative semantic patch and migration application.
- [`proposals/aeon-verify-heads-tool.md`](./proposals/aeon-verify-heads-tool.md)
  Proposal for verifying many published ledger heads at once.
- [`proposals/aeon-lint-tool.md`](./proposals/aeon-lint-tool.md)
  Proposal for policy and intent linting over AEON documents.
- [`proposals/aeon-graph-tool.md`](./proposals/aeon-graph-tool.md)
  Proposal for reference and dependency graph inspection over AEON/AES.
- [`proposals/annotation-stream-tool.md`](./proposals/annotation-stream-tool.md)
  Proposal for extracting comment-style annotations into AES rather than HTML.
- [`proposals/fmt-md-aes-aeon.md`](./proposals/fmt-md-aes-aeon.md)
  Archived historical proposal for the earlier `fmt.md.aeon` / `fmt.md.aes` direction.

This workspace currently reuses the built TypeScript implementation artifacts from the sibling
`../aeon/implementations/typescript` workspace instead of maintaining a separate dependency install.

## AES Ecosystem Note

In this workspace, "AES ecosystem" means the layers that produce AES, consume AES directly, or
round-trip through AES as a first-class boundary.

Core examples:

- `@aeon/core`
  Produces AES from AEON source.
- `@aeos/core`
  Consumes AES for schema validation.
- `@aeon/finalize`
  Consumes AES for generic deterministic materialization.
- `@aeon-tonics/minizer`
  Consumes AES and emits minimized AEON text.
- `@aeon-tonics/compactor`
  Consumes AEON source and emits compact AEON while preserving semantic comments
  by default.
- `@aeon-tonics/mode-converter`
  Converts AEON between strict, transport, and custom mode by stripping,
  preserving, or inferring datatypes according to each mode boundary.
- `@aeon-tonics/prettifier`
  Consumes AEON or AES and emits readable AEON text while preserving event order.
- `@aeon-tonics/titonic`
  Imports from AEON or AES, exposes a live document model, and exports AES again.

`@aeon/canonical` is closely related but sits slightly sideways to this grouping.
It is best understood as the deterministic rendering and emission layer rather than the central
AES-in materialization boundary.
