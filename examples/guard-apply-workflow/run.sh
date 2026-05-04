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
DRY_RUN="$TMP_DIR/dry-run.json"

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

printf '\n%s\n' '2. Run edit-preflight on the same working subtree and write the artifact'
if node "$GUARD_CLI" edit-preflight "$TARGET" --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --json --out "$PREFLIGHT"; then
  printf '%s\n' 'Expected edit-preflight to fail because the app subtree has pointer/clone risk.' >&2
  exit 1
else
  :
fi
sed -n '1,50p' "$PREFLIGHT"

printf '\n%s\n' '3. Read compact guard advice for script branching'
node "$GUARD_CLI" decide "$TARGET" --target '$.app.status' --scope '$.app' --clone-scope '$.app' --graph-prefix --advice-exit block --json --out "$ADVICE"
sed -n '1,20p' "$ADVICE"
if ! grep -q '"advice": "warn"' "$ADVICE"; then
  printf '%s\n' 'Expected guard advice to be warn for the continuation example.' >&2
  exit 1
fi

printf '\n%s\n' '4. Continue to dry-run the semantic patch because this workflow soft-passes warn advice'
node "$APPLY_CLI" "$PATCH" "$TARGET" --check --json > "$DRY_RUN"
sed -n '1,40p' "$DRY_RUN"

printf '\n%s\n' 'Temporary workspace cleaned up.'
