# @aeon-tonics/aeon-verify

Unified verification gate for AEON files.

First-slice CLI:

```sh
aeon-verify file.aeon
aeon-verify file.aeon --json
aeon-verify file.aeon --strict
aeon-verify file.aeon --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json
aeon-verify file.aeon --ledger .aeon-ledger/ledger.jsonl --ledger-key .aeon-ledger/key.json --expect-head sha256:...
```

The first implementation verifies AEON compilation, AES emission, optional strict-mode declaration,
and optional signed-ledger integrity.
