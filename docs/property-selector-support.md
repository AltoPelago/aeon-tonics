# SANSA property selectors and selected Tonics dependencies

Unreleased coordination guidance, 22 November 2026. Tonics consumes declared
packages and its selected AEON build; it does not inherit the feature set of a
neighboring SANSA checkout.

The current root override and staging helper select the reviewed Unicode/empty-key
SANSA archive `c0471ad5` documented in the
[candidate provenance](../.candidate-packages/README.md). That archive predates
property-selector parsing. The helper checks exact bytes; it does not fetch a
newer parser or grant another consumer capability. Existing child-identity and
ordinary read/mutation behavior retain their own contracts.

The coordinated AEON TypeScript/Rust SDK can supply an authoritative property
facet for read-only Resolve/direct Query, and explicit portable AEOS entrypoints
admit the selected development profile. This is not blanket Tonics support.
The legacy native-event validator remains closed. A parser upgrade alone cannot
authorize Titonic, guarded edit/apply/Graph/Instruction/SO, stored activation or
reference consumers to evaluate property predicates.

`aeon-search` exposes its documented path/prefix/value/datatype/kind search
options; it is not a general property-selector Query API. Do not infer property
support from its name, ordinary metadata or a sibling implementation's examples.
See the [portable AEOS profile](https://github.com/AltoPelago/aeon/blob/main/docs/aeos-property-selectors.md)
and [SANSA contract](https://github.com/AltoPelago/sansa/blob/main/docs/property-selectors-contract.md)
for the separately admitted entrypoints.

Any selected graph refresh must record the exact producer revision, archive,
locks and host boundaries, then verify the actual frozen/installed consumer and
original target/compatibility controls. It must not silently use another checkout
or open existing denied consumers. Local source/tarball success is distinct from
registry and platform qualification. This documentation changes no package pin,
manifest, runtime policy, default allowance or existing check.

Compatibility/target checks and the existing 1.15x latency / 1.20x memory budgets
are unchanged. Official releases, deployment and stable promotion remain held.
