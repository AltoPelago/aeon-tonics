# Proposal: AEON Search Tool

## Summary

Create a semantic search tool for AEON and AES.

Instead of grepping source text, this tool should search by canonical path, value shape, datatype,
metadata, reference structure, and profile-relevant semantics.

Suggested package name:

- `@aeon-tonics/aeon-search`

Possible binary:

- `aeon-search`

Status: first slice implemented.

Implemented package:

- `packages/llm-tools/aeon-search`

Implemented binary:

- `aeon-search`

The first slice provides recursive `.aeon` file discovery, AEON-to-AES compilation, path and
path-prefix matching, raw preview value matching, datatype matching, broad kind matching, JSON
output, compact human output, and compile diagnostics.

## Why This Matters

Text search is often the wrong layer for AEON work.

An agent or human usually wants to ask questions like:

- where is `$.app.status` used?
- which files contain a reference value?
- which bindings still equal `"draft"` semantically?
- which nodes expose a particular attribute?
- which files would be affected by a migration?

Those are semantic queries, not raw text queries.

## Design Goal

`aeon-search` should be:

- path-aware
- datatype-aware
- profile-aware where possible
- scriptable
- fast enough for repository scans

It should complement `rg`, not replace it.
When meaning matters more than syntax, `aeon-search` should be the better tool.

## Proposed Package Shape

Possible public surface:

- `searchAeonFiles(files, query, options?)`
- `searchAesEvents(events, query, options?)`
- `formatAeonSearch(result, options?)`

## CLI Shape

```sh
aeon-search repo/ --path '$.app.status'
aeon-search repo/ --value '"draft"'
aeon-search repo/ --datatype reference
aeon-search repo/ --kind node
aeon-search repo/ --json
```

## Query Modes

### Path Search

Examples:

```sh
aeon-search repo/ --path '$.app.status'
aeon-search repo/ --path-prefix '$.app'
```

### Value Search

Examples:

```sh
aeon-search repo/ --value '"draft"'
aeon-search repo/ --value 'true'
```

### Datatype Or Kind Search

Examples:

```sh
aeon-search repo/ --datatype string
aeon-search repo/ --kind node
aeon-search repo/ --kind reference
```

### Metadata Search

Future scope:

Examples:

```sh
aeon-search repo/ --attr owner
aeon-search repo/ --attr owner --attr-value '"core"'
aeon-search repo/ --node-attr id
```

### Reference Search

Future scope:

Examples:

```sh
aeon-search repo/ --reference
aeon-search repo/ --reference-target '$.shared.theme'
```

## Result Shape

```ts
interface AeonSearchResult {
  readonly format: 'aeon.search';
  readonly version: 1;
  readonly matches: readonly AeonSearchMatch[];
  readonly diagnostics: readonly AeonSearchDiagnostic[];
}

interface AeonSearchMatch {
  readonly file: string;
  readonly path: string;
  readonly kind: string;
  readonly datatype?: string;
  readonly preview?: string;
}
```

## Agentic Workflow

This tool is especially valuable before edits:

1. search candidate files
2. inspect exact paths
3. plan edits
4. apply guarded changes
5. verify results

That makes repo-wide refactors or migrations much easier to scope responsibly.

## First Slice Scope

Phase 1:

- recursive file discovery: implemented
- path search: implemented
- path-prefix search: implemented
- value search: implemented
- datatype/kind search: implemented
- JSON output: implemented
- compact human output: implemented
- compile diagnostics: implemented

Phase 1 can defer:

- advanced ranking
- profile-aware query languages
- persistent indexes
- interactive TUI flows

## Recommendation

Build this in the next tranche.

This is the main productivity tool missing from the current agent workflow.
