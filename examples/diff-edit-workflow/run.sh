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
WORK="$TMP_DIR/working.aeon"
WORK_AEON="$TMP_DIR/working-aeon-log.aeon"
OPS="$TMP_DIR/ops.json"
LOG="$TMP_DIR/edit-log.jsonl"
LOG_AEON="$TMP_DIR/edit-log.aeon"
LEDGER="$TMP_DIR/ledger.jsonl"
LEDGER_KEY="$TMP_DIR/ledger-key.json"

DIFF_CLI="$ROOT/packages/llm-tools/aes-diff/dist/cli.js"
EDIT_CLI="$ROOT/packages/llm-tools/aeon-edit/dist/cli.js"
LEDGER_CLI="$ROOT/packages/provenance/signed-ledger/dist/cli.js"
CORE_INDEX="$ROOT/../aeon/implementations/typescript/packages/core/dist/index.js"

cp "$AFTER" "$WORK"
cp "$AFTER" "$WORK_AEON"

node "$LEDGER_CLI" keygen --out "$LEDGER_KEY" --key-id diff-edit-example >/dev/null

printf '%s\n' '1. Review semantic change from before.aeon to after.aeon'
node "$DIFF_CLI" "$BEFORE" "$WORK"

printf '\n%s\n' '2. Get compact planning summary'
node "$DIFF_CLI" --summary "$BEFORE" "$WORK"

printf '\n%s\n' '3. Inspect the current edit target'
node "$EDIT_CLI" inspect "$WORK" '$.app.status' --json

printf '\n%s\n' '4. Generate a guarded edit plan'
node "$EDIT_CLI" plan-set "$WORK" '$.app.status' '"ready"' > "$OPS"
cat "$OPS"

printf '\n%s\n' '5. Dry-run the guarded edit'
node "$EDIT_CLI" batch "$WORK" "$OPS" --check

printf '\n%s\n' '6. Apply the guarded edit to the temp copy with an undo log and signed ledger'
node "$EDIT_CLI" batch "$WORK" "$OPS" --write --log "$LOG" --ledger "$LEDGER" --ledger-key "$LEDGER_KEY"

printf '\n%s\n' '7. Inspect the JSONL edit log and signed ledger'
node "$EDIT_CLI" log list --log "$LOG" --json
node "$EDIT_CLI" log show --log "$LOG" --json
node "$LEDGER_CLI" inspect --ledger "$LEDGER" --json
HEAD_AFTER_EDIT=$(node "$LEDGER_CLI" head --ledger "$LEDGER")
node "$LEDGER_CLI" verify --ledger "$LEDGER" --key "$LEDGER_KEY" --expect-head "$HEAD_AFTER_EDIT" --json

printf '\n%s\n' '8. Verify the edited semantic result'
node "$DIFF_CLI" --path '$.app' "$BEFORE" "$WORK"

printf '\n%s\n' '9. Undo the logged write and append an undo ledger event'
node "$EDIT_CLI" undo "$WORK" --log "$LOG" --write --ledger "$LEDGER" --ledger-key "$LEDGER_KEY"

printf '\n%s\n' '10. Verify undo returned the temp copy to after.aeon and the ledger head moved'
node "$DIFF_CLI" "$AFTER" "$WORK"
HEAD_AFTER_UNDO=$(node "$LEDGER_CLI" head --ledger "$LEDGER")
node "$LEDGER_CLI" verify --ledger "$LEDGER" --key "$LEDGER_KEY" --expect-head "$HEAD_AFTER_UNDO" --json
if [ "$HEAD_AFTER_EDIT" = "$HEAD_AFTER_UNDO" ]; then
  printf '%s\n' 'Ledger head did not move after undo.' >&2
  exit 1
fi

printf '\n%s\n' '11. Repeat the edit with an AEON log'
node "$EDIT_CLI" batch "$WORK_AEON" "$OPS" --write --log "$LOG_AEON" --log-format aeon

printf '\n%s\n' '12. Inspect the AEON edit log'
node "$EDIT_CLI" log list --log "$LOG_AEON" --json
node "$EDIT_CLI" log show --log "$LOG_AEON" --json

printf '\n%s\n' '13. Verify the AEON log itself compiles cleanly'
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url'; const moduleUrl = pathToFileURL(process.argv[1]).href; const { compile } = await import(moduleUrl); const source = readFileSync(process.argv[2], 'utf8'); const result = compile(source); if (result.errors.length > 0) { console.error(JSON.stringify(result.errors, null, 2)); process.exit(1); } console.log('AEON log compiles cleanly.');" "$CORE_INDEX" "$LOG_AEON"

printf '\n%s\n' '14. Undo the AEON-logged write'
node "$EDIT_CLI" undo "$WORK_AEON" --log "$LOG_AEON" --write

printf '\n%s\n' '15. Verify AEON-log undo returned the temp copy to after.aeon'
node "$DIFF_CLI" "$AFTER" "$WORK_AEON"

printf '\n%s\n' 'Temporary workspace cleaned up.'
