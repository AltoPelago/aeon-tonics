# Proposal: Signed AEON Ledger

## Summary

Create an append-only signed ledger for AEON ecosystem events.

Status: first implementation exists in `packages/provenance/signed-ledger`. The current package includes stable
JSON canonicalization, JSONL entry parsing/formatting, Ed25519 key generation, append, verify,
inspect, head inspection, expected-head checks, and tamper-detection tests.

The ledger records each event as an immutable entry linked to the previous entry by hash. Each entry
is signed by an identity key, so consumers can verify both authorship and chain integrity.

This should be separate from `aeon-edit` logs.

Edit logs are operational: they help inspect and undo recent writes. A signed ledger is provenance:
it records what happened, who signed it, and whether the record has been altered. Undo should never
delete or rewrite history. It should add a new signed event that describes the undo.

## Why This Matters

AEON workflows are moving toward agentic and tool-assisted editing. That makes it useful to answer:

- who or what changed this document?
- what tool produced the change?
- what semantic paths were affected?
- was the history altered after the fact?
- did an undo happen, and what did it undo?
- can another tool verify the chain without trusting the local workspace?

The current `aeon-edit` log is intentionally convenient. It stores snapshots and summaries for
preview and undo. It is not tamper-evident: a process can edit or delete log lines.

A signed ledger gives us a stronger audit surface without making everyday edits heavy.

## Security Guarantees

This is a tamper-evident ledger, not tamper-proof storage.

It can detect:

- edits to payloads
- edits to entry metadata
- broken `previousHash` chains
- invalid payload hashes or entry hashes
- signatures that no longer verify
- entries forged by someone without the private key
- rollback or truncation when the verifier has a trusted expected head

It cannot prevent:

- deletion of the ledger file
- replacement with an older valid ledger if no trusted head is checked
- valid alternate histories created by someone who controls the private key
- loss or destruction of local key material
- false identity claims unless public keys are trusted through an external process
- edits that bypass ledger emission unless the workflow requires ledger verification

The operational rule is: keep or publish the latest known `entryHash` head. A local ledger by itself
can prove internal consistency, but a remembered or externally published head is what makes rollback
and truncation detectable.

## Boundary

The ledger should not replace edit logs.

Recommended split:

- `aeon-edit` log: local operational history, snapshots, undo support, human review.
- signed ledger: append-only provenance stream, hash chain, signatures, verification.

`aeon-edit` can optionally emit both:

```sh
aeon-edit batch file.aeon ops.json --write --log .aeon-edit/log.jsonl --ledger .aeon-ledger/ledger.jsonl
```

If a write is undone later, the ledger gets another entry:

```text
edit event -> undo event
```

The original edit event remains part of the ledger.

## Proposed Package Shape

Suggested package name:

- `@aeon-tonics/signed-ledger`

Possible binary:

- `aeon-ledger`

Possible package location:

```text
packages/provenance/signed-ledger
```

The package should expose a small library first, then CLI commands:

- `createLedgerEntry(event, options)`
- `appendLedgerEntry(existingEntries, event, signer)`
- `verifyLedger(entries, publicKeys)`
- `canonicalizeLedgerPayload(payload)`

CLI shape:

```sh
aeon-ledger append --ledger ledger.jsonl --event event.json --key key.pem
aeon-ledger verify --ledger ledger.jsonl --pubkey pubkey.pem --expect-head sha256:...
aeon-ledger inspect --ledger ledger.jsonl
aeon-ledger head --ledger ledger.jsonl
aeon-ledger export-aes --ledger ledger.jsonl
```

## Entry Model

Initial JSONL entry shape:

```ts
interface SignedLedgerEntry {
  readonly format: 'aeon.ledger.entry';
  readonly version: 1;
  readonly index: number;
  readonly id: string;
  readonly timestamp: string;
  readonly previousHash: string | null;
  readonly payloadHash: string;
  readonly entryHash: string;
  readonly signature: LedgerSignature;
  readonly payload: LedgerPayload;
}

interface LedgerSignature {
  readonly algorithm: 'ed25519';
  readonly keyId: string;
  readonly value: string;
}

type LedgerPayload =
  | AeonEditLedgerPayload
  | AeonUndoLedgerPayload
  | GenericLedgerPayload;
```

The `entryHash` should be computed over the canonical entry body excluding the signature value.
`payloadHash` should be computed over the canonical payload. `previousHash` links to the prior
entry's `entryHash`.

## AEON Native Shape

An AEON ledger can be represented as a strict AEON document. Two shapes are worth considering.

### Entries List Shape

```aeon
aeon:mode = "strict"
aeon:profile = "aeon.ledger.v1"
entries:list = [
  <entry@{
    id:string = "2026-04-26T09:45:00.000Z-a1"
    index:number = 0
    previousHash:null = null
    entryHash:string = "..."
    payloadHash:string = "..."
    keyId:string = "local-dev"
    algorithm:string = "ed25519"
    signature:string = "..."
  }:node(
    <payload:node("...canonical payload json...")>
  )>
]
```

This shape is compact and familiar if the ledger is treated as a single collection value. It also
makes ordering obvious because order is represented by the list itself.

The drawback is append ergonomics: appending one event means mutating the `entries` list, usually near
the end of the file. That is still workable, but it is less naturally append-only at the document
surface.

### Envelope Binding Shape

A more AEON-native append shape is one top-level binding per event:

```aeon
aeon:mode = "strict"
aeon:profile = "aeon.ledger.v1"

"2026-04-26T09:45:00.000Z-a1":envelope = {
  index:number = 0
  id:string = "2026-04-26T09:45:00.000Z-a1"
  previousHash:null = null
  payloadHash:string = "..."
  entryHash:string = "..."
  signature:object = {
    algorithm:string = "ed25519"
    keyId:string = "local-dev"
    value:string = "..."
  }
  payload:object = {
    kind:string = "aeon.edit.applied"
    tool:string = "aeon-edit"
    target:string = "file.aeon"
    beforeHash:string = "..."
    afterHash:string = "..."
  }
}

"2026-04-26T09:46:00.000Z-a2":envelope = {
  index:number = 1
  id:string = "2026-04-26T09:46:00.000Z-a2"
  previousHash:string = "..."
  payloadHash:string = "..."
  entryHash:string = "..."
  signature:object = {
    algorithm:string = "ed25519"
    keyId:string = "local-dev"
    value:string = "..."
  }
  payload:object = {
    kind:string = "aeon.edit.undone"
    tool:string = "aeon-edit"
    target:string = "file.aeon"
    undoneLedgerEntryId:string = "2026-04-26T09:45:00.000Z-a1"
    beforeHash:string = "..."
    afterHash:string = "..."
  }
}
```

The key is quoted because timestamp ids contain punctuation that should not be treated as a bare AEON
identifier.

This shape has several advantages:

- appending means adding one top-level binding
- each event has a stable path such as `$."2026-04-26T09:45:00.000Z-a1"`
- AES consumers can see each ledger event as an assignment event
- duplicate event ids are naturally visible as duplicate top-level bindings
- an event can be copied, diffed, or inspected without traversing a list

The drawbacks:

- ordering should still be validated with `index` and `previousHash`, not only source order
- keys are long and must be quoted
- if a ledger ever needs multiple events with the same id, the shape must reject that as invalid

Recommendation: use JSONL for the first implementation format, and prefer the envelope binding shape
for `aeon.ledger.v1` projection. It fits AEON's event model better than a single mutable list while
still keeping the signed payload deterministic.

## Payloads

### Edit Payload

```ts
interface AeonEditLedgerPayload {
  readonly kind: 'aeon.edit.applied';
  readonly tool: 'aeon-edit';
  readonly toolVersion?: string;
  readonly command: string;
  readonly file: string;
  readonly target: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly diffSummary: AesDiffResult['summary'];
  readonly affectedTopLevel: readonly string[];
  readonly affectedPaths: readonly string[];
  readonly editLogRecordId?: string;
}
```

The ledger should prefer hashes and semantic summaries over full source snapshots. Full snapshots can
stay in the operational edit log. This keeps the signed ledger smaller and reduces accidental data
exposure.

### Undo Payload

```ts
interface AeonUndoLedgerPayload {
  readonly kind: 'aeon.edit.undone';
  readonly tool: 'aeon-edit';
  readonly command: 'undo';
  readonly file: string;
  readonly target: string;
  readonly undoneLedgerEntryId?: string;
  readonly undoneEditLogRecordId?: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly affectedTopLevel: readonly string[];
  readonly affectedPaths: readonly string[];
}
```

Undo is not special at the ledger level. It is just another signed event that points at the event or
log record it reverses.

## Canonicalization

Signing requires deterministic bytes.

The first implementation should canonicalize payloads as JSON using stable key ordering and UTF-8
encoding. Later, if AEON has a stable canonical byte representation for this purpose, ledger entries
can sign canonical AEON instead.

Important rule:

- never sign pretty-printed or source-formatted AEON directly
- sign a canonical payload representation
- record the canonicalization algorithm in the entry format/version

## Key Management

Phase 1 should support local Ed25519 keys.

Possible CLI:

```sh
aeon-ledger keygen --out .aeon-ledger/key.json
aeon-ledger append --ledger .aeon-ledger/ledger.jsonl --key .aeon-ledger/key.json --event event.json
aeon-ledger verify --ledger .aeon-ledger/ledger.jsonl --keyring .aeon-ledger/keyring.json
```

Open questions:

- Should keys be local files, SSH keys, age keys, or WebCrypto/JWK keys?
- Should the ledger support multiple signers from day one?
- Should verification require trusted key material, or only verify internal hash-chain integrity by
  default?

Recommendation for first slice:

- use Ed25519 via Node's `crypto` APIs
- store local dev keys as JWK or PEM
- support a keyring file mapping `keyId` to public key
- keep signing explicit with `--ledger-key`

## Integration With `aeon-edit`

Suggested future flags:

```sh
aeon-edit set file.aeon $.count 2 --write --ledger .aeon-ledger/ledger.jsonl --ledger-key key.json
aeon-edit undo file.aeon --log .aeon-edit/log.jsonl --write --ledger .aeon-ledger/ledger.jsonl --ledger-key key.json
```

Default behavior should stay lightweight. Do not enable signing by default until the key story is
clear.

When `aeon-edit` emits a normal edit log and a signed ledger entry, the ledger payload can reference
the edit log record id. The ledger does not need to duplicate `beforeText` and `afterText`; it can
hash them.

## Verification

Verification should check:

- every entry parses
- `index` is contiguous
- `previousHash` matches the prior `entryHash`
- `payloadHash` matches the canonical payload bytes
- `entryHash` matches the canonical entry bytes
- signature verifies against the declared `keyId`
- optional policy checks pass, such as allowed signers or allowed event kinds

Verification output should be both human and JSON-friendly:

```json
{
  "ok": true,
  "entries": 12,
  "head": "sha256:...",
  "signers": ["local-dev"]
}
```

## Agentic Workflow

For AI-assisted editing, a signed ledger is valuable because it makes the agent's actions auditable:

1. Inspect and plan with `aes-diff` / `aeon-edit`.
2. Apply with `aeon-edit --write`.
3. Emit normal edit log for undo.
4. Emit signed ledger entry for provenance.
5. Verify the ledger head before finishing.

An agent should never remove ledger entries. If it needs to reverse a prior edit, it should create an
undo event.

## Phases

### Phase 1: Standalone Ledger Library

- JSONL entry format
- stable JSON canonicalization
- Ed25519 signing and verification
- append and verify APIs
- tests for tamper detection

### Phase 2: CLI

- `aeon-ledger keygen`
- `aeon-ledger append`
- `aeon-ledger verify`
- `aeon-ledger inspect`

### Phase 3: `aeon-edit` Integration

- `--ledger`
- `--ledger-key`
- edit event emission
- undo event emission
- docs and examples

### Phase 4: AEON Ledger Projection

- export JSONL ledger to `aeon.ledger.v1`
- optionally append directly to AEON ledger files
- validate ledger AES shape

## Non-Goals

- replacing Git history
- replacing edit logs or snapshot undo
- providing distributed consensus
- hiding or encrypting payloads
- proving real-world human identity

This is a local and portable tamper-evident provenance layer, not a global blockchain network.
