# Proposal: AEON Verify Tool

## Summary

Create a unified verification tool that checks whether an AEON document or workspace is valid,
policy-compliant, and safe to accept.

This should be the "confidence pass" tool for the AEON ecosystem.

Suggested package name:

- `@aeon-tonics/aeon-verify`

Possible binary:

- `aeon-verify`

Status: first implementation exists in `packages/llm-tools/aeon-verify`. The current package includes
single-file compile/AES verification, optional strict-mode declaration checks, optional signed-ledger
verification, expected-head checks, JSON/human CLI output, and tests.

## Why This Matters

Right now, confidence is spread across several tools and boundaries:

- `@aeon/core` for parsing and AES generation
- `@aeos/core` for schema validation
- `aes-diff` for semantic comparison
- `aeon-edit` for guarded edits
- `signed-ledger` for provenance verification

That is powerful, but an agent or human still has to compose the checks manually.

A verifier would answer:

- is this document valid strict-mode AEON?
- does it satisfy AEOS validation?
- does it satisfy profile or policy checks?
- does its ledger verify?
- does the ledger head match what we expected?
- is the current state acceptable for commit, publish, or downstream materialization?

## Design Goal

`aeon-verify` should be:

- compositional
- deterministic
- machine-readable
- strict about failures
- easy to run in CI or agent loops

It should not become an editor.
Its job is to evaluate state, not to mutate it.

## Proposed Package Shape

Possible public surface:

- `verifyAeonDocument(source, options?)`
- `verifyAeonFile(path, options?)`
- `verifyAeonWorkspace(root, options?)`
- `formatAeonVerification(result, options?)`

## CLI Shape

```sh
aeon-verify file.aeon
aeon-verify file.aeon --json
aeon-verify file.aeon --schema schema.aes
aeon-verify file.aeon --ledger .aeon-ledger/ledger.jsonl --ledger-key key.json
aeon-verify file.aeon --ledger .aeon-ledger/ledger.jsonl --expect-head sha256:...
aeon-verify repo/ --workspace --json
```

## Verification Layers

### Layer 1: AEON Parse And Strictness

Checks:

- file parses
- `aeon:mode` requirements are met when requested
- compile diagnostics are surfaced

### Layer 2: AES Validity

Checks:

- AES emits cleanly
- duplicate canonical path diagnostics are surfaced
- reference and metadata issues are reported

### Layer 3: AEOS Or Profile Validation

Checks:

- AEOS schema acceptance
- profile validation such as `fmt.and`
- future tonic-specific profile contracts

### Layer 4: Provenance

Checks:

- signed ledger parses
- signatures verify
- expected head matches
- optional signer policies pass

### Layer 5: Policy

Checks:

- required metadata exists
- forbidden paths are absent
- required ledger use is present
- local repository rules are satisfied

## Proposed Result Shape

```ts
interface AeonVerificationResult {
  readonly ok: boolean;
  readonly format: 'aeon.verify';
  readonly version: 1;
  readonly file?: string;
  readonly checks: readonly VerificationCheck[];
  readonly diagnostics: readonly VerificationDiagnostic[];
}

interface VerificationCheck {
  readonly kind: 'parse' | 'aes' | 'aeos' | 'profile' | 'ledger' | 'policy';
  readonly ok: boolean;
  readonly summary: string;
}

interface VerificationDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path?: string;
  readonly message: string;
}
```

## Agentic Workflow

This tool should become the final gate in an agent loop:

1. inspect with `aes-diff`
2. mutate with `aeon-edit`
3. sign with `signed-ledger`
4. verify with `aeon-verify`

That lets an agent ask one clean question at the end:

```sh
aeon-verify file.aeon --ledger .aeon-ledger/ledger.jsonl --expect-head sha256:...
```

## First Slice Scope

Phase 1:

- single-file verification
- parse and AES diagnostics
- optional ledger verification
- optional expected-head verification
- JSON and human output

Phase 1 can defer:

- workspace manifests
- AEOS schema autodiscovery
- deep policy configuration
- tonic-specific plugin checks

## Recommendation

Build this in the next tranche.

It is the highest-value safety tool after `aes-diff`, `aeon-edit`, and `signed-ledger`, because it
turns many low-level guarantees into one operational command.
