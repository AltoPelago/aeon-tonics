# Proposal: AEON Lint Tool

## Summary

Create a policy and intent linting tool for AEON documents.

Suggested package name:

- `@aeon-tonics/aeon-lint`

Possible binary:

- `aeon-lint`

Status: proposed future implementation.

## Why This Matters

Schema validation answers whether a document is structurally allowed.
Linting answers whether it follows local conventions, policies, and intent.

Examples:

- required metadata must be present
- forbidden paths must not appear
- certain values must remain canonical
- specific directories must require signed ledger emission
- profile-specific naming conventions must hold

## Design Goal

`aeon-lint` should be:

- configurable
- policy-oriented
- strict where needed
- ergonomic for CI and agent workflows

## Possible CLI

```sh
aeon-lint file.aeon --config aeon-lint.json
aeon-lint repo/ --config aeon-lint.json --json
```

## Configuration Direction

Possible rules:

- `requiredPaths`
- `forbiddenPaths`
- `requiredAttributes`
- `allowedDatatypes`
- `requiredLedger`
- `requiredProfiles`

## Recommendation

Defer this until we have clearer recurring policy patterns from real usage of `aeon-edit`,
`signed-ledger`, and future profile tools.
