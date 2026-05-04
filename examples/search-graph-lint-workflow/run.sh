#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

DOC="$TMP_DIR/doc.aeon"
APP_PATHS="$TMP_DIR/app-paths.txt"
POINTER_SOURCES="$TMP_DIR/pointer-sources.txt"
CLONE_SOURCES="$TMP_DIR/clone-sources.txt"

SEARCH_CLI="$ROOT/packages/llm-tools/aeon-search/dist/cli.js"
GRAPH_CLI="$ROOT/packages/llm-tools/aeon-graph/dist/cli.js"
LINT_CLI="$ROOT/packages/llm-tools/aeon-lint/dist/cli.js"

cat > "$DOC" <<'EOF'
aeon:mode = "strict"

baseTheme:string = "dark"
baseStatus:string = "draft"

app:object = {
  theme:string = ~baseTheme
  liveStatus:string = ~>baseStatus
  title:string = "Console"
}

panel:object = {
  status:string = ~>baseStatus
}
EOF

printf '%s\n' '1. Discover a protected app scope with aeon-search'
node "$SEARCH_CLI" "$DOC" --path '$.app' --format paths --out "$APP_PATHS"
cat "$APP_PATHS"

printf '\n%s\n' '2. Lint pointer edges originating inside the discovered app scopes'
if node "$LINT_CLI" "$DOC" --pointer-under-file "$APP_PATHS" --json; then
  printf '%s\n' 'Expected pointer-under lint to fail.' >&2
  exit 1
else
  :
fi

printf '\n%s\n' '3. Discover pointer source paths directly from the graph'
node "$GRAPH_CLI" "$DOC" --edge-kind pointer --format paths --from --out "$POINTER_SOURCES"
cat "$POINTER_SOURCES"

printf '\n%s\n' '4. Lint pointer source paths from the graph output'
if node "$LINT_CLI" "$DOC" --pointer-under-file "$POINTER_SOURCES" --json; then
  printf '%s\n' 'Expected graph-derived pointer-under lint to fail.' >&2
  exit 1
else
  :
fi

printf '\n%s\n' '5. Discover clone-receiving bindings directly from the graph'
node "$GRAPH_CLI" "$DOC" --edge-kind clone --format paths --from --out "$CLONE_SOURCES"
cat "$CLONE_SOURCES"

printf '\n%s\n' '6. Lint clone bindings inside protected canonical scopes'
if node "$LINT_CLI" "$DOC" --clone-into-file "$APP_PATHS" --json; then
  printf '%s\n' 'Expected clone-into lint to fail.' >&2
  exit 1
else
  :
fi

printf '\n%s\n' '7. Verify graph-derived clone paths also fail the focused lint'
if node "$LINT_CLI" "$DOC" --clone-into-file "$CLONE_SOURCES" --json; then
  printf '%s\n' 'Expected graph-derived clone-into lint to fail.' >&2
  exit 1
else
  :
fi

printf '\n%s\n' 'Temporary workspace cleaned up.'
