# Temporal reference resolver

`@aeon-tonics/temporal-reference-resolver` is an executable design probe for
AEON temporal claims. It is deliberately downstream of Core.

The resolver reports profile admission, authority assessment, and mapping
cardinality separately. It never treats a timezone gap as invalid syntax,
silently chooses a side of an overlap, infers an offset from `-00:00`, or
assumes that lexical `Z` proves an unsmeared source clock.

The exported authorities are small, pinned conformance fixtures rather than
production databases:

- `ietf:leap-seconds.list@2017-01-01-fixture` covers the 2016 positive leap;
- `iana:tzdb@2025b-fixture` covers Melbourne's 2025 gap and overlap windows;
- `google:leap-smear@linear-24h-fixture` exercises a named smear boundary.

Applications must supply maintained authority data before using the same API
shape for production resolution. The test profiles are conformance probes, not
default policy recommendations.
