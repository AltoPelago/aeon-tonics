#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

BEFORE="$TMP_DIR/before.aeon"
AFTER="$TMP_DIR/after.aeon"
TARGET="$TMP_DIR/target.aeon"
PATCH="$TMP_DIR/patch.json"
PREFLIGHT="$TMP_DIR/preflight.json"
ADVICE="$TMP_DIR/advice.json"

DIFF_CLI="$ROOT/packages/llm-tools/aes-diff/dist/cli.js"
GUARD_CLI="$ROOT/packages/llm-tools/aeon-guard/dist/cli.js"
APPLY_CLI="$ROOT/packages/llm-tools/aeon-apply/dist/cli.js"

cat > "$BEFORE" <<'EOF'
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

cat > "$AFTER" <<'EOF'
aeon:mode = "strict"

aBaseTheme:string = "dark"
aBaseStatus:string = "draft"

app:object = {
  theme:string = ~aBaseTheme
  liveStatus:string = ~>aBaseStatus
  status:string = "ready"
}

panel:object = {
  status:string = ~>aBaseStatus
}
EOF

cp "$BEFORE" "$TARGET"

printf '%s\n' '1. Create a semantic patch for the intended change'
node "$DIFF_CLI" --patch "$BEFORE" "$AFTER" > "$PATCH"
sed -n '1,40p' "$PATCH"

printf '\n%s\n' '2. Run edit-preflight and capture the blocking report'
if node "$GUARD_CLI" edit-preflight "$TARGET" --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out "$PREFLIGHT"; then
  printf '%s\n' 'Expected edit-preflight to fail and block the apply step.' >&2
  exit 1
else
  :
fi
sed -n '1,60p' "$PREFLIGHT"

printf '\n%s\n' '3. Read compact guard advice for script branching'
if node "$GUARD_CLI" decide "$TARGET" --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out "$ADVICE"; then
  printf '%s\n' 'Expected advice-only preflight to signal non-zero warn state.' >&2
  exit 1
else
  :
fi
sed -n '1,20p' "$ADVICE"
if ! grep -q '"advice": "warn"' "$ADVICE"; then
  printf '%s\n' 'Expected guard advice to be warn for the blocked example.' >&2
  exit 1
fi

printf '\n%s\n' '4. Stop before aeon-apply because this workflow treats warn as a hard stop'
printf '%s\n' 'aeon-apply intentionally not run.'
if [ -f "$APPLY_CLI" ]; then
  :
fi

printf '\n%s\n' 'Temporary workspace cleaned up.'
