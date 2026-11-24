# Public stable integration inputs

Prepared 25 November 2026 for the AEON 0.17.0 release investigation. This adoption
selects exact verified stable registry artifacts.
Tonics keeps its own package versions and existing source/build/admission contracts.

- SANSA npm `0.15.0`, producer `56381b7cfe57c188b43dcabbf74bcfec0144fa9e`.
- AEON npm `0.17.0`, producer `b477b6689b7b7f9f3363c77a4297303b038e2ca0`.
- Node 24.22.2, the workspace's declared npm 11.13.0, and the selected AEON
  compiler inputs TypeScript 7.0.2 / Node types 26.6.6.

[Exact public artifact inputs](releases/aeon-0.17.0.json) record immutable
versions/integrities. They pin inputs, not a completed test/acceptance result.
The AEON npm stable release uses protected GitHub OIDC publication with verified CI provenance;
registry signatures, archive integrity and actual content remain separate checks.

## Source layout and qualification boundary

Normal development still expects the built sibling `aeon` layout named in the
README, scripts and TypeScript configuration. This change does not port the
Tonics packages into a new standalone distribution or replace those imports.
The old SANSA staging command is an optional historical reproduction tool, not a
prerequisite for the active `npm ci --ignore-scripts` graph.

For registry-backed acceptance, use a fresh source artifact and a temporary
qualification graph that adds the exact public AEON packages/compiler tools.
Project the installed public package directories into the existing sibling
layout used by the unchanged relative imports. The projection contains registry
payloads, not an implementation source checkout; record its mapping and hashes.
Keep all local Tonics packages in their existing workspace layout. Capture the
qualification-only manifest/lock separately from the actual Tonics manifest/lock,
verify the declared SANSA version/integrity agrees, then run the unchanged
workspace build, typecheck, full tests and docs checks. Do not describe this as
standalone installed Tonics packaging or blanket platform acceptance.

Per [RELEASING](../RELEASING.md), exact source, artifact, command, target and
consumer-denial results require independent owning QA before acceptance. Normal
workspace installs and the temporary fixture are distinct verification surfaces.
Source/registry success does not admit a new property consumer or stored selector.
Owning stable graph adoption, Tonics publication and production deployment remain
separate decisions. No compatibility/target assertion or resource budget changes.
