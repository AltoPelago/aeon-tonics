# AES portability audit

Status: implementation audit, 2026-09-06

## Boundary rule

Tonics may use the TypeScript `AssignmentEvent[]` representation within a
single process. A stream that crosses an implementation, process, or persistence
boundary uses portable AES, with Telex as its text encoding.

Serializing `AssignmentEvent[]` as JSON does not make that implementation shape
a portable AES encoding.

## Interchange surfaces

| Surface | Contract | Status |
| --- | --- | --- |
| `aes-diff --from-aes` | Legacy TypeScript event JSON | Retained as an explicit compatibility route. |
| `aes-diff --from-telex` | Complete portable AES in Telex | Implemented for diff and patch creation. Input is parsed and validated. |
| `aes-diff apply --from-telex` | Portable patch plus complete Telex base | Implemented; successful output is Telex. |
| `aeon-edit export-aes` | Legacy TypeScript event JSON | Retained as an explicit compatibility route. |
| `aeon-edit export-telex` | Complete portable AES in Telex | Implemented; AEON document headers remain opt-in. |

## Same-process surfaces

The minizer, prettifier, mode converter, compactor, starter tonic, Titonic,
`fmt.and` model, graph, search, lint, guard, and source patch application APIs
currently receive native events or compile AEON source in the same TypeScript
process. They are not serialized interchange boundaries and do not require a
Telex encode/decode cycle internally.

Their existing identity tests cover preservation through rendering, conversion,
editing, and model export. Telex import should be added to an individual model
only when that model is expected to accept a portable external stream; it must
not be simulated by casting parsed Telex records to `AssignmentEvent`.

The signed-ledger JSONL format is a ledger protocol containing application
payloads and signatures. It is not an AES event encoding. A future ledger whose
payload is AES should identify and sign the exact Telex or Film bytes used.

## Path and identity contract

Portable event paths and edit-model paths are related but are not identical
namespaces:

| Occurrence | Portable AES path | Current `aeon-edit` owner path |
| --- | --- | --- |
| Node binding | `$.a` | `$.a` |
| Node head | `$.a[0]` | `$.a` with a `node-attr` operation |
| First node child | `$.a[0][0]` | `$.a.children[0]` |
| Binding attribute `x` | `$.a.@.x` | `$.a` plus attribute key `x` |
| Node-head attribute `x` | `$.a[0].@.x` | `$.a` plus node-attribute key `x` |

The edit CLI paths are application-facing Titonic addresses. Export to Telex is
the explicit translation boundary. Structural identity remains the `identity`
field of the corresponding portable event and never becomes part of either
path.

References in portable records use portable event paths. Legacy in-process
references retain their native parser representation until exported.

## Datatypes and headers

Portable comparison treats `datatype`, `generics`, and `clarifiers` as one
semantic datatype descriptor while preserving them as separate fields in patch
records. This prevents a consumer from reparsing an encoded datatype string.

Body-only Telex is the default. `aeon-edit export-telex --include-headers`
selects the `aeon.document.v0` projection and emits `header=` records. Header
identity is distinct from body path identity and headers participate in diffs
unless `--no-headers` is selected.

## Ordering

Diff traversal and patch operations are canonical-path ordered for deterministic
review. This is not an original-order or signing representation. Consumers that
sign a ledger or source-order-sensitive stream must retain and sign the original
Telex or Film byte sequence rather than a diff patch result.
