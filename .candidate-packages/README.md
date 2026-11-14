# Reviewed local SANSA candidate

Titonic declares `@altopelago/sansa` `0.15.0-rc.1` and imports its public package.
The private npm workspace overrides that dependency with the reviewed archive
from merged SANSA commit `0436666`. This is local development preparation;
official publication and deployment remain held.

The reviewed archive is retained on the integration branch. From the repo root,
verify it and install the locked graph using npm 11.13.0:

```sh
npm run prepare:sansa-candidate
npm ci --offline --ignore-scripts --no-audit --fund=false
```

The helper verifies SHA-256
`bb3243188ca46198301d778fb92ea6c174842372671084b481330b965c1be759`
before copying and refuses different bytes. Without an argument it verifies the
staged archive. It does not fetch, publish or repack anything. Only this exact
reviewed archive is versioned; other tarballs remain ignored. The helper accepts
the retained readiness archive as an optional argument when restoring the file.

The override's relative path is interpreted from the consuming workspace,
`packages/foundations/titonic`. The generated root lock normalises the resolution
to `.candidate-packages` and records the archive's actual integrity. A missing
archive fails closed. Repeated frozen offline `npm ci` must preserve the lock.

Before an official release, remove the local override/archive and qualify real final
registry versions/integrities and their artifacts. Do not represent the local
archive checksum as a registry checksum. Other AEON imports still use the
documented sibling workspace; standalone registry packaging is not qualified.
