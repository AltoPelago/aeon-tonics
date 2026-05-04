# @aeon-tonics/signed-ledger

Append-only signed ledger primitives for AEON ecosystem events.

First-slice CLI:

```sh
aeon-ledger keygen --out .aeon-ledger/key.json --key-id local-dev
aeon-ledger append --ledger .aeon-ledger/ledger.jsonl --event event.json --key .aeon-ledger/key.json
aeon-ledger verify --ledger .aeon-ledger/ledger.jsonl --keyring .aeon-ledger/keyring.json
aeon-ledger head --ledger .aeon-ledger/ledger.jsonl
aeon-ledger verify --ledger .aeon-ledger/ledger.jsonl --keyring .aeon-ledger/keyring.json --expect-head sha256:...
aeon-ledger inspect --ledger .aeon-ledger/ledger.jsonl
```

The first implementation uses JSONL entries, stable canonical JSON, SHA-256 hashes, and Ed25519
signatures. AEON projection is documented in [`../../proposals/signed-ledger.md`](../../proposals/signed-ledger.md).

## Guarantees

This ledger is tamper-evident, not tamper-proof.

It detects:

- edited payloads or entry metadata
- broken hash chains
- removed or reordered entries when the remaining chain no longer matches
- forged entries from someone without the signing private key
- rollback or truncation when verification is given a remembered head via `--expect-head`

It does not prevent:

- deleting the ledger file
- replacing the ledger with an older valid copy unless a trusted head is checked
- creating valid alternate history if the signing private key is compromised
- proving real-world identity without an external trust process for public keys
- proving that every edit tool actually emitted ledger events unless the workflow enforces that

For rollback protection, publish or store the output of `aeon-ledger head` somewhere harder to rewrite
and verify future ledgers with `--expect-head`.
