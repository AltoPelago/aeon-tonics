# Proposal: AEON Graph Tool

## Summary

Create a graph and dependency inspection tool for AEON/AES references, pointers, and structural
relationships.

Suggested package name:

- `@aeon-tonics/aeon-graph`

Possible binary:

- `aeon-graph`

Status: first slice implemented.

Implemented package:

- `packages/llm-tools/aeon-graph`

Implemented binary:

- `aeon-graph`

The first slice recursively discovers `.aeon` files, compiles them to AES, emits assignment nodes,
emits structural containment edges, emits clone and pointer reference edges, supports JSON and
compact text output, exports Graphviz DOT with plain or agent-oriented themes, and filters by local
path, incoming references to a target path, structural ancestors/descendants, or edge kind. It also
supports compact summary output and fail-on gates for agent preflight checks.

## Why This Matters

As AEON documents become more interconnected, it becomes useful to ask:

- what references point at this path?
- what depends on this node?
- what changes if this binding is rewritten?
- where are clone or pointer boundaries?

That is hard to answer from text and awkward to answer from plain object materialization.

## Design Goal

`aeon-graph` should expose a structural dependency view over AES.

It should help with:

- impact analysis
- migration planning
- debugging reference-heavy documents
- future editor tooling

## Possible CLI

```sh
aeon-graph file.aeon --path '$.theme'
aeon-graph repo/ --references '$.shared.palette'
aeon-graph repo/ --descendants '$.app'
aeon-graph repo/ --ancestors '$.app.theme.primary'
aeon-graph repo/ --edge-kind contains
aeon-graph repo/ --edge-kind pointer --json
aeon-graph repo/ --format dot
aeon-graph repo/ --format dot --dot-theme agent
aeon-graph repo/ --summary --json
aeon-graph repo/ --summary --json --fail-on pointer
aeon-graph repo/ --references '$.shared.palette' --summary --json --fail-on incoming-reference
aeon-graph repo/ --references '$.shared.palette' --summary --json --fail-on external-reference
aeon-graph file.aeon --json
aeon-graph --ai
```

## Recommendation

Keep this as a small read-only impact-analysis helper for agents. Future slices can add richer
reference/path normalization and optional visual export helpers as reference-heavy documents become
common.
