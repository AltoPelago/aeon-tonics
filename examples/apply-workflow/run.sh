#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

BEFORE="$SCRIPT_DIR/before.aeon"
AFTER="$SCRIPT_DIR/after.aeon"
STALE="$SCRIPT_DIR/stale.aeon"
TARGET="$TMP_DIR/target.aeon"
STALE_TARGET="$TMP_DIR/stale-target.aeon"
PATCH="$TMP_DIR/patch.json"
DRY_RUN="$TMP_DIR/dry-run.json"
STALE_RESULT="$TMP_DIR/stale-result.json"
LOG="$TMP_DIR/apply-log.jsonl"
LOG_AEON="$TMP_DIR/apply-log.aeon"
LEDGER="$TMP_DIR/ledger.jsonl"
LEDGER_KEY="$TMP_DIR/ledger-key.json"

DIFF_CLI="$ROOT/packages/llm-tools/aes-diff/dist/cli.js"
APPLY_CLI="$ROOT/packages/llm-tools/aeon-apply/dist/cli.js"
EDIT_CLI="$ROOT/packages/llm-tools/aeon-edit/dist/cli.js"
LEDGER_CLI="$ROOT/packages/provenance/signed-ledger/dist/cli.js"
CORE_INDEX="$ROOT/../aeon/implementations/typescript/packages/core/dist/index.js"

cp "$BEFORE" "$TARGET"
cp "$STALE" "$STALE_TARGET"
node "$LEDGER_CLI" keygen --out "$LEDGER_KEY" --key-id apply-example >/dev/null

printf '%s\n' '1. Create a semantic patch from before.aeon to after.aeon'
node "$DIFF_CLI" --patch "$BEFORE" "$AFTER" > "$PATCH"
cat "$PATCH"

printf '\n%s\n' '2. Dry-run the patch against a matching target'
node "$APPLY_CLI" "$PATCH" "$TARGET" --check --json > "$DRY_RUN"
cat "$DRY_RUN"

printf '\n%s\n' '3. Apply the patch to the target with a compatible undo log and signed ledger'
node "$APPLY_CLI" "$PATCH" "$TARGET" --write --log "$LOG" --ledger "$LEDGER" --ledger-key "$LEDGER_KEY"

printf '\n%s\n' '4. Inspect the apply log and signed ledger'
node "$EDIT_CLI" log list --log "$LOG" --json
node "$EDIT_CLI" log show --log "$LOG" --json
node "$LEDGER_CLI" inspect --ledger "$LEDGER" --json
HEAD_AFTER_APPLY=$(node "$LEDGER_CLI" head --ledger "$LEDGER")
node "$LEDGER_CLI" verify --ledger "$LEDGER" --key "$LEDGER_KEY" --expect-head "$HEAD_AFTER_APPLY" --json

printf '\n%s\n' '5. Verify the patched target now matches after.aeon semantically'
node "$DIFF_CLI" "$AFTER" "$TARGET"

printf '\n%s\n' '6. Undo the apply write through aeon-edit using the compatible log'
node "$EDIT_CLI" undo "$TARGET" --log "$LOG" --write --ledger "$LEDGER" --ledger-key "$LEDGER_KEY"
node "$DIFF_CLI" "$BEFORE" "$TARGET"
HEAD_AFTER_UNDO=$(node "$LEDGER_CLI" head --ledger "$LEDGER")
node "$LEDGER_CLI" verify --ledger "$LEDGER" --key "$LEDGER_KEY" --expect-head "$HEAD_AFTER_UNDO" --json
if [ "$HEAD_AFTER_APPLY" = "$HEAD_AFTER_UNDO" ]; then
  printf '%s\n' 'Ledger head did not move after undo.' >&2
  exit 1
fi

printf '\n%s\n' '7. Repeat apply with an AEON log and verify the log compiles'
node "$APPLY_CLI" "$PATCH" "$TARGET" --write --log "$LOG_AEON" --log-format aeon
node "$EDIT_CLI" log list --log "$LOG_AEON" --json
node "$EDIT_CLI" log show --log "$LOG_AEON" --json
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url'; const moduleUrl = pathToFileURL(process.argv[1]).href; const { compile } = await import(moduleUrl); const source = readFileSync(process.argv[2], 'utf8'); const result = compile(source, { maxAttributeDepth: 2 }); if (result.errors.length > 0) { console.error(JSON.stringify(result.errors, null, 2)); process.exit(1); } console.log('AEON apply log compiles cleanly.');" "$CORE_INDEX" "$LOG_AEON"
node "$EDIT_CLI" undo "$TARGET" --log "$LOG_AEON" --write
node "$DIFF_CLI" "$BEFORE" "$TARGET"

printf '\n%s\n' '8. Confirm stale targets are rejected'
if node "$APPLY_CLI" "$PATCH" "$STALE_TARGET" --json > "$STALE_RESULT"; then
  printf '%s\n' 'Expected stale target application to fail.' >&2
  exit 1
fi
cat "$STALE_RESULT"
if ! grep -q 'PATCH_STALE_BASE' "$STALE_RESULT"; then
  printf '%s\n' 'Expected PATCH_STALE_BASE diagnostic.' >&2
  exit 1
fi

printf '\n%s\n' 'Temporary workspace cleaned up.'
