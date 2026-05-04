#!/bin/sh
set -eu

cat <<'EOF'
# AEON Tonics Examples

Run these from the workspace root:

- examples/diff-edit-workflow
  Semantic diff plus guarded edit loop with aes-diff and aeon-edit.
- examples/fmt-and-model-workflow
  End-to-end &ND text, model, AES, canonical, HTML, and diagnostics flow.
- examples/fmt-and-editor-workflow
  Higher-level semantic editing flow over an in-memory FmtAndDocument.
- examples/fmt-and-annotation-payload-workflow
  Annotation-stream to embedded &ND payload flow.
- examples/apply-workflow
  Semantic patch generation plus conservative aeon-apply dry runs.
- examples/search-graph-lint-workflow
  Search, graph path extraction, and focused linting over sensitive scopes.
- examples/guard-workflow
  Preset graph and lint preflight with persisted guard artifacts.
- examples/guard-apply-workflow
  Guarded migration workflow that warns, records advice, and continues to aeon-apply --check.
- examples/guard-apply-blocked-workflow
  Stricter guarded migration workflow that stops before apply when advice stays at warn.
- examples/guard-decide-workflow
  Compact aeon-guard decide behavior and advice-exit policy handling.

Quick start:

```sh
sh examples/diff-edit-workflow/run.sh
sh examples/guard-decide-workflow/run.sh
```
EOF
