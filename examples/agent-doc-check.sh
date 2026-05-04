#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

require_pattern() {
  file=$1
  pattern=$2
  if ! rg -q --fixed-strings "$pattern" "$file"; then
    printf 'Missing required pattern in %s: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_pattern "$root_dir/README.md" "## Agent CLI Map"
require_pattern "$root_dir/README.md" "aes-diff"
require_pattern "$root_dir/README.md" "aeon-search"
require_pattern "$root_dir/README.md" "aeon-graph"
require_pattern "$root_dir/README.md" "aeon-lint"
require_pattern "$root_dir/README.md" "aeon-guard"
require_pattern "$root_dir/README.md" "aeon-edit"
require_pattern "$root_dir/README.md" "aeon-apply"
require_pattern "$root_dir/README.md" '[`AI_AGENT_WORKFLOWS.md`](./AI_AGENT_WORKFLOWS.md)'

require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" "## Workflow Chooser"
require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" '[`examples/diff-edit-workflow`](./examples/diff-edit-workflow)'
require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" '[`examples/search-graph-lint-workflow`](./examples/search-graph-lint-workflow)'
require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" '[`examples/guard-workflow`](./examples/guard-workflow)'
require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" '[`examples/guard-apply-workflow`](./examples/guard-apply-workflow)'
require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" '[`examples/guard-apply-blocked-workflow`](./examples/guard-apply-blocked-workflow)'
require_pattern "$root_dir/AI_AGENT_WORKFLOWS.md" '[`examples/guard-decide-workflow`](./examples/guard-decide-workflow)'

require_pattern "$root_dir/examples/README.md" "## Tool Order"
require_pattern "$root_dir/examples/README.md" '[`../AI_AGENT_WORKFLOWS.md`](../AI_AGENT_WORKFLOWS.md)'

for readme in \
  "$root_dir/packages/llm-tools/aes-diff/README.md" \
  "$root_dir/packages/llm-tools/aeon-edit/README.md" \
  "$root_dir/packages/llm-tools/aeon-apply/README.md" \
  "$root_dir/packages/llm-tools/aeon-search/README.md" \
  "$root_dir/packages/llm-tools/aeon-graph/README.md" \
  "$root_dir/packages/llm-tools/aeon-lint/README.md" \
  "$root_dir/packages/llm-tools/aeon-guard/README.md"
do
  require_pattern "$readme" "## When To Use This Tool"
  require_pattern "$readme" '[`../../../AI_AGENT_WORKFLOWS.md`](../../../AI_AGENT_WORKFLOWS.md)'
done

printf 'Agent docs look consistent.\n'
