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
SUMMARY_JSON="$TMP_DIR/summary.json"
PREFLIGHT_JSON="$TMP_DIR/preflight.json"
INCOMING_JSON="$TMP_DIR/incoming.json"

GUARD_CLI="$ROOT/packages/llm-tools/aeon-guard/dist/cli.js"

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

printf '%s\n' '1. Summarize graph risk with aeon-guard summary'
node "$GUARD_CLI" summary "$DOC" --json --out "$SUMMARY_JSON"
sed -n '1,20p' "$SUMMARY_JSON"

printf '\n%s\n' '2. Run a combined edit preflight and write the report artifact'
if node "$GUARD_CLI" edit-preflight "$DOC" --target '$.baseStatus' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out "$PREFLIGHT_JSON"; then
  printf '%s\n' 'Expected edit-preflight to fail.' >&2
  exit 1
else
  :
fi
sed -n '1,40p' "$PREFLIGHT_JSON"

printf '\n%s\n' '3. Run a narrower incoming-reference check for the same target'
if node "$GUARD_CLI" incoming "$DOC" '$.baseStatus' --json --out "$INCOMING_JSON"; then
  printf '%s\n' 'Expected incoming check to fail.' >&2
  exit 1
else
  :
fi
sed -n '1,30p' "$INCOMING_JSON"

printf '\n%s\n' 'Temporary workspace cleaned up.'
