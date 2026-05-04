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
SUMMARY="$TMP_DIR/summary.json"
ADVICE_WARN="$TMP_DIR/advice-warn.json"
ADVICE_SOFT="$TMP_DIR/advice-soft.json"

GUARD_CLI="$ROOT/packages/llm-tools/aeon-guard/dist/cli.js"

cat > "$DOC" <<'EOF'
aeon:mode = "strict"

aBaseTheme:string = "dark"
aBaseStatus:string = "draft"

app:object = {
  theme:string = ~aBaseTheme
  liveStatus:string = ~>aBaseStatus
  status:string = "draft"
}

panel:object = {
  status:string = ~>aBaseStatus
}
EOF

printf '%s\n' '1. Summarize graph risk for the temporary document'
node "$GUARD_CLI" summary "$DOC" --json --out "$SUMMARY"
sed -n '1,40p' "$SUMMARY"

printf '\n%s\n' '2. Read compact advice with the default warn exit behavior'
if node "$GUARD_CLI" decide "$DOC" --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out "$ADVICE_WARN"; then
  printf '%s\n' 'Expected decide to exit non-zero for warn by default.' >&2
  exit 1
else
  :
fi
sed -n '1,20p' "$ADVICE_WARN"
if ! grep -q '"advice": "warn"' "$ADVICE_WARN"; then
  printf '%s\n' 'Expected default decide advice to be warn.' >&2
  exit 1
fi

printf '\n%s\n' '3. Re-run the same decision with warn soft-passed'
node "$GUARD_CLI" decide "$DOC" --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice-exit block --json --out "$ADVICE_SOFT"
sed -n '1,20p' "$ADVICE_SOFT"
if ! grep -q '"advice": "warn"' "$ADVICE_SOFT"; then
  printf '%s\n' 'Expected soft-passed decide advice to remain warn.' >&2
  exit 1
fi

printf '\n%s\n' 'Temporary workspace cleaned up.'
