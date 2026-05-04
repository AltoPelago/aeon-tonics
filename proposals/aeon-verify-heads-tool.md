# Proposal: AEON Verify Heads Tool

## Summary

Create a small tool that verifies many ledger heads against remembered or published expectations.

Suggested package name:

- `@aeon-tonics/aeon-verify-heads`

Possible binary:

- `aeon-verify-heads`

Status: proposed future implementation.

## Why This Matters

The signed ledger becomes much stronger when the latest known head is tracked outside the ledger file.

For one ledger, `aeon-ledger verify --expect-head ...` is enough.
For many ledgers across a repository or project, a dedicated tool becomes more useful.

## Core Idea

Store expected heads in a manifest:

```json
{
  "ledgers": [
    {
      "path": "docs/.aeon-ledger/ledger.jsonl",
      "expectedHead": "sha256:..."
    }
  ]
}
```

Then verify them together:

```sh
aeon-verify-heads ledger-manifest.json
```

## Design Goal

This tool should be:

- simple
- CI-friendly
- good at detecting rollback or truncation across many ledgers

It does not need to be a general-purpose ledger tool.
It is a policy/operations layer on top of `signed-ledger`.

## Recommendation

Defer this until ledger usage becomes common across multiple directories or repositories.
