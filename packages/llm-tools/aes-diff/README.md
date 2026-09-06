# @aeon-tonics/aes-diff

Semantic diff utilities for AEON Assignment Event Streams.

## When To Use This Tool

- Use `aes-diff` when you need to understand what changed semantically between two AEON or AES states before deciding what to edit or apply.
- Use it before `aeon-edit` for guarded follow-up edits, or before `aeon-apply` when you want to produce a semantic patch.
- Start with `aes-diff --examples` or `examples/diff-edit-workflow` for review-plus-edit loops, or `examples/apply-workflow` for patch-generation workflows.

For the central tool-selection guide, see [`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md).

This package compares AES events by canonical path and reports stable, machine-readable changes.
It is intentionally a pure library first; CLI and patch application can build on top once the result
shape settles.

```ts
import { diffAeon, formatAesDiffText, summarizeAesDiff } from '@aeon-tonics/aes-diff';

const diff = diffAeon('a:number = 1', 'a:number = 2');

console.log(formatAesDiffText(diff).text);
console.log(summarizeAesDiff(diff).headline);
```

Public API:

- `diffAes(beforeEvents, afterEvents, options?)`
- `diffAeon(beforeSource, afterSource, options?)`
- `diffTelex(beforeTelex, afterTelex, options?)`
- `parseAesTelex(telex, options?)`
- `encodePatchedTelex(events, source)`
- `formatAesDiffText(diff, options?)`
- `formatAesDiffJson(diff)`
- `summarizeAesDiff(diff, options?)`
- `createAesPatch(diff)`
- `applyAesPatch(baseEvents, patch, options?)`

See [`AES_DIFF_REFERENCE.md`](./AES_DIFF_REFERENCE.md) for the implemented result, summary, patch,
and CLI contracts. For agentic review workflows, see [`AI_WORKFLOW.md`](./AI_WORKFLOW.md) or run
`aes-diff --ai`.

CLI:

```sh
aes-diff before.aeon after.aeon
aes-diff --ai
aes-diff --examples
aes-diff --json before.aeon after.aeon
aes-diff --summary before.aeon after.aeon
aes-diff --check before.aeon after.aeon
aes-diff --patch before.aeon after.aeon
aes-diff --from-aes before.aes.json after.aes.json
aes-diff --from-telex before.telex.aes after.telex.aes
aes-diff --path $.app before.aeon after.aeon
aes-diff apply --from-aes base.aes.json patch.json
aes-diff apply --from-telex base.telex.aes patch.json
```
