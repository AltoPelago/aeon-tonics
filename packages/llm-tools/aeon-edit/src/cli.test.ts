import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  generateLedgerKeyPair,
  parseLedgerJsonl,
  verifyLedger,
} from '../../../provenance/signed-ledger/dist/index.js';

const execFileAsync = promisify(execFile);
const cliPath = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

const source = [
  'aeon:mode = "strict"',
  'app:object = {',
  '  name:string = "Aeon"',
  '  count:number = 1',
  '}',
  'items:list = [1, 2]',
].join('\n');

test('CLI gets a value', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'get', file, '$.app.name']);

  assert.equal(result.stdout, 'Aeon\n');
});

test('CLI prints embedded agent workflow with --ai', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--ai']);

  assert.match(result.stdout, /AEON Edit agent workflow/);
  assert.match(result.stdout, /aeon-edit list file\.aeon --json/);
  assert.match(result.stdout, /aeon-edit batch file\.aeon ops\.json --check/);
  assert.match(result.stdout, /EXPECTATION_MISMATCH/);
});

test('CLI prints runnable workflow references with --examples', async () => {
  const result = await execFileAsync(process.execPath, [cliPath, '--examples']);

  assert.match(result.stdout, /AEON Edit Examples/);
  assert.match(result.stdout, /examples\/diff-edit-workflow/);
  assert.match(result.stdout, /examples\/guard-workflow/);
});

test('CLI prints edited AEON to stdout by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2']);
  const unchanged = await readFile(file, 'utf8');

  assert.match(result.stdout, /count:number=2/);
  assert.equal(unchanged, source);
});

test('CLI prettifies minimized AEON to stdout without changing source order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'z:number=1\naeon:mode="strict"\napp:object={name:string="Aeon",count:number=1}', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'prettify', file]);
  const unchanged = await readFile(file, 'utf8');

  assert.equal(result.stdout, [
    'z:number = 1',
    'aeon:mode = "strict"',
    'app:object = {',
    '  name:string = "Aeon"',
    '  count:number = 1',
    '}',
    '',
  ].join('\n'));
  assert.equal(unchanged, 'z:number=1\naeon:mode="strict"\napp:object={name:string="Aeon",count:number=1}');
});

test('CLI compacts AEON while preserving semantic comments by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    '//# docs',
    'a:number = 1 //? required',
    '// plain',
    'b:string = "two"',
  ].join('\n'), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'compact', file]);

  assert.equal(result.stdout, [
    '//# docs',
    'a:number=1 //? required',
    'b:string="two"',
    '',
  ].join('\n'));
});

test('CLI compact can preserve regular comments', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, '// plain\na = 1', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'compact', file, '--comments', 'all']);

  assert.equal(result.stdout, '// plain\na=1\n');
});

test('CLI converts strict AEON to transport mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'aeon:mode = "strict"\nname:string = "Aeon"\npayload:embed = $SGVsbG8=', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'convert-mode', file, 'transport']);

  assert.equal(result.stdout, 'aeon:mode="transport"\nname="Aeon"\npayload:embed=$SGVsbG8=\n');
});

test('CLI converts transport AEON to strict mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'aeon:mode = "transport"\nname = "Aeon"\ncount = 1\nitems = [1, "two"]', 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'convert-mode', file, 'strict']);

  assert.equal(
    result.stdout,
    'aeon:mode="strict"\nname:string="Aeon"\ncount:number=1\nitems:list=[:number=1,:string="two"]\n',
  );
});

test('CLI prettify writes expanded AEON with --write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, 'aeon:mode="strict"\napp:object={name:string="Aeon"}', 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'prettify', file, '--write', '--no-log']);
  const written = await readFile(file, 'utf8');

  assert.equal(written, [
    'aeon:mode = "strict"',
    'app:object = {',
    '  name:string = "Aeon"',
    '}',
    '',
  ].join('\n'));
});

test('CLI writes edited AEON with --out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const out = join(dir, 'out.aeon');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'delete', file, '$.app.name', '--out', out]);
  const written = await readFile(out, 'utf8');

  assert.doesNotMatch(written, /name:string/);
});

test('CLI writes edited AEON in place with --write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.name', '"Titonic"', '--write']);
  const written = await readFile(file, 'utf8');

  assert.match(written, /name:string="Titonic"/);
});

test('CLI writes to the default log path when --write is used without --log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, '.aeon-edit', 'log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write']);
  const logged = JSON.parse(await readFile(log, 'utf8'));

  assert.equal(logged.target, file);
  assert.deepEqual(logged.affectedPaths, ['$.app', '$.app.count']);
});

test('CLI skips the default log path when --no-log is provided', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, '.aeon-edit', 'log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--no-log']);

  await assert.rejects(readFile(log, 'utf8'));
});

test('CLI logs JSONL writes and can undo the latest matching edit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);
  const edited = await readFile(file, 'utf8');
  const logged = JSON.parse(await readFile(log, 'utf8'));

  assert.match(edited, /count:number=2/);
  assert.equal(logged.format, 'aeon.edit.log');
  assert.equal(logged.beforeText, source);
  assert.match(logged.afterText, /count:number=2/);
  assert.deepEqual(logged.affectedTopLevel, ['$.app']);
  assert.deepEqual(logged.affectedPaths, ['$.app', '$.app.count']);

  await execFileAsync(process.execPath, [cliPath, 'undo', file, '--log', log, '--write']);
  const restored = await readFile(file, 'utf8');

  assert.equal(restored, source);
});

test('CLI writes signed ledger events for edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  const ledger = join(dir, 'ledger.jsonl');
  const key = join(dir, 'key.json');
  const keyPair = generateLedgerKeyPair('aeon-edit-test');
  await writeFile(file, source, 'utf8');
  await writeFile(key, JSON.stringify(keyPair), 'utf8');

  await execFileAsync(process.execPath, [
    cliPath,
    'set',
    file,
    '$.app.count',
    '2',
    '--write',
    '--log',
    log,
    '--ledger',
    ledger,
    '--ledger-key',
    key,
  ]);

  const entries = parseLedgerJsonl(await readFile(ledger, 'utf8'));
  const result = verifyLedger(entries, [{
    keyId: keyPair.keyId,
    algorithm: keyPair.algorithm,
    publicJwk: keyPair.publicJwk,
  }]);

  assert.equal(result.ok, true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.payload.kind, 'aeon.edit.applied');
  assert.equal(entries[0]!.payload.target, file);
  assert.equal(entries[0]!.payload.editLogRecordId, JSON.parse(await readFile(log, 'utf8')).id);
  assert.deepEqual(entries[0]!.payload.affectedPaths, ['$.app', '$.app.count']);
});

test('CLI writes signed ledger events for undo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  const ledger = join(dir, 'ledger.jsonl');
  const key = join(dir, 'key.json');
  const keyPair = generateLedgerKeyPair('aeon-edit-test');
  await writeFile(file, source, 'utf8');
  await writeFile(key, JSON.stringify(keyPair), 'utf8');

  await execFileAsync(process.execPath, [
    cliPath,
    'set',
    file,
    '$.app.count',
    '2',
    '--write',
    '--log',
    log,
    '--ledger',
    ledger,
    '--ledger-key',
    key,
  ]);
  const logRecord = JSON.parse(await readFile(log, 'utf8'));

  await execFileAsync(process.execPath, [
    cliPath,
    'undo',
    file,
    '--log',
    log,
    '--write',
    '--ledger',
    ledger,
    '--ledger-key',
    key,
  ]);

  const entries = parseLedgerJsonl(await readFile(ledger, 'utf8'));
  const result = verifyLedger(entries, [{
    keyId: keyPair.keyId,
    algorithm: keyPair.algorithm,
    publicJwk: keyPair.publicJwk,
  }]);

  assert.equal(result.ok, true);
  assert.equal(entries.length, 2);
  assert.equal(entries[1]!.payload.kind, 'aeon.edit.undone');
  assert.equal(entries[1]!.previousHash, entries[0]!.entryHash);
  assert.equal(entries[1]!.payload.undoneEditLogRecordId, logRecord.id);
  assert.equal(await readFile(file, 'utf8'), source);
});

test('CLI can list and show JSONL edit log records', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);
  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.name', '"Logged"', '--write', '--log', log]);

  const listed = await execFileAsync(process.execPath, [cliPath, 'log', 'list', '--log', log, '--json']);
  const list = JSON.parse(listed.stdout);
  assert.equal(list.command, 'log list');
  assert.equal(list.value.length, 2);
  assert.equal(list.value[0].diffSummary.changed, 2);
  assert.deepEqual(list.value[0].affectedTopLevel, ['$.app']);
  assert.deepEqual(list.value[0].affectedPaths, ['$.app', '$.app.count']);

  const shown = await execFileAsync(process.execPath, [cliPath, 'log', 'show', list.value[0].id, '--log', log, '--json']);
  const show = JSON.parse(shown.stdout);
  assert.equal(show.command, 'log show');
  assert.equal(show.value.id, list.value[0].id);
  assert.equal(show.value.beforeText, source);
  assert.deepEqual(show.value.affectedPaths, ['$.app', '$.app.count']);
});

test('CLI renders human-readable log list and show output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);

  const listed = await execFileAsync(process.execPath, [cliPath, 'log', 'list', '--log', log]);
  assert.match(listed.stdout, /summary: 0 added, 0 removed, 2 changed/);
  assert.match(listed.stdout, /affected: \$\.app, \$\.app\.count/);

  const shown = await execFileAsync(process.execPath, [cliPath, 'log', 'show', '--log', log]);
  assert.match(shown.stdout, /edit log /);
  assert.match(shown.stdout, /affected top-level: \$\.app/);
  assert.match(shown.stdout, /--- before aeon ---/);
  assert.match(shown.stdout, /count:number = 1/);
  assert.match(shown.stdout, /--- after aeon ---/);
  assert.match(shown.stdout, /count:number=2/);
});

test('CLI undo can target specific JSONL log records by id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);
  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.name', '"Logged"', '--write', '--log', log]);

  const listed = await execFileAsync(process.execPath, [cliPath, 'log', 'list', '--log', log, '--json']);
  const records = JSON.parse(listed.stdout).value as readonly { readonly id: string }[];

  await execFileAsync(process.execPath, [cliPath, 'undo', file, '--log', log, '--id', records[1]!.id, '--write']);
  const firstUndo = await readFile(file, 'utf8');
  assert.match(firstUndo, /count:number=2/);
  assert.match(firstUndo, /name:string="Aeon"/);

  await execFileAsync(process.execPath, [cliPath, 'undo', file, '--log', log, '--id', records[0]!.id, '--write']);
  const secondUndo = await readFile(file, 'utf8');
  assert.equal(secondUndo, source);
});

test('CLI undo preview shows semantic diff and affected paths in human mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);

  const preview = await execFileAsync(process.execPath, [cliPath, 'undo', file, '--log', log]);

  assert.match(preview.stdout, /undo preview/);
  assert.match(preview.stdout, /affected: \$\.app, \$\.app\.count/);
  assert.match(preview.stdout, /changed/);
  assert.match(preview.stdout, /--- restored aeon ---/);
  assert.match(preview.stdout, /count:number = 1/);
});

test('CLI can filter log records by target and latest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const fileA = join(dir, 'a.aeon');
  const fileB = join(dir, 'b.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(fileA, source, 'utf8');
  await writeFile(fileB, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', fileA, '$.app.count', '2', '--write', '--log', log]);
  await execFileAsync(process.execPath, [cliPath, 'set', fileB, '$.app.count', '3', '--write', '--log', log]);
  await execFileAsync(process.execPath, [cliPath, 'set', fileA, '$.app.name', '"Filtered"', '--write', '--log', log]);

  const listed = await execFileAsync(process.execPath, [
    cliPath,
    'log',
    'list',
    '--log',
    log,
    '--target',
    fileA,
    '--limit',
    '1',
    '--json',
  ]);
  const list = JSON.parse(listed.stdout);
  assert.equal(list.value.length, 1);
  assert.equal(list.value[0].target, fileA);

  const shown = await execFileAsync(process.execPath, [
    cliPath,
    'log',
    'show',
    '--log',
    log,
    '--target',
    fileA,
    '--latest',
    '--json',
  ]);
  const show = JSON.parse(shown.stdout);
  assert.equal(show.value.target, fileA);
  assert.match(show.value.afterText, /name:string="Filtered"/);
});

test('CLI writes AEON node logs and can undo from them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.aeon');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.name', '"Logged"', '--write', '--log', log]);
  const logText = await readFile(log, 'utf8');

  assert.match(logText, /aeon:profile = "aeon\.edit\.log\.v1"/);
  assert.match(logText, /entries:list = \[/);
  assert.match(logText, /<edit@\{/);
  assert.match(logText, /<record:node\(/);
  assert.deepEqual(compile(logText).errors, []);

  await execFileAsync(process.execPath, [cliPath, 'undo', file, '--log', log, '--write']);
  const restored = await readFile(file, 'utf8');

  assert.equal(restored, source);
});

test('CLI can list and show AEON edit log records', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.aeon');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);

  const listed = await execFileAsync(process.execPath, [cliPath, 'log', 'list', '--log', log, '--json']);
  const list = JSON.parse(listed.stdout);
  assert.equal(list.value.length, 1);
  assert.equal(list.value[0].command, 'set');
  assert.deepEqual(list.value[0].affectedPaths, ['$.app', '$.app.count']);

  const shown = await execFileAsync(process.execPath, [cliPath, 'log', 'show', '--log', log, '--json']);
  const show = JSON.parse(shown.stdout);
  assert.equal(show.value.id, list.value[0].id);
  assert.match(show.value.afterText, /count:number=2/);
  assert.deepEqual(show.value.affectedTopLevel, ['$.app']);
});

test('CLI undo refuses stale targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const log = join(dir, 'edit-log.jsonl');
  await writeFile(file, source, 'utf8');

  await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--write', '--log', log]);
  await writeFile(file, source, 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'undo', file, '--log', log, '--write']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.error.code, 'UNDO_STALE_TARGET');
      return true;
    },
  );
});

test('CLI appends and inserts list values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const appended = await execFileAsync(process.execPath, [cliPath, 'append', file, '$.items', '3']);
  assert.match(appended.stdout, /items:list=\[1,2,3\]/);

  const inserted = await execFileAsync(process.execPath, [cliPath, 'insert', file, '$.items[1]', '9']);
  assert.match(inserted.stdout, /items:list=\[1,9,2\]/);
});

test('CLI applies batch operations from JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '  count:number = 1',
    '}',
    'items:list = [1]',
    'view:node = <panel@{id:string="hero"}:node>',
  ].join('\n'), 'utf8');
  await writeFile(ops, JSON.stringify({
    operations: [
      { command: 'set', path: '$.app.count', value: '2' },
      { command: 'append', path: '$.items', value: '3' },
      { command: 'attr.set', path: '$.app', key: 'owner', value: '"tools"' },
      { command: 'node-attr.set', path: '$.view', key: 'id', value: '"main"' },
    ],
  }), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);

  assert.match(result.stdout, /count:number=2/);
  assert.match(result.stdout, /items:list=\[1,3\]/);
  assert.match(result.stdout, /owner:string="tools"/);
  assert.match(result.stdout, /id:string="main"/);
});

test('CLI emits batch operation results as JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.app.count', value: '2' },
  ]), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.command, 'batch');
  assert.equal(parsed.value[0].changed, true);
  assert.match(parsed.output.text, /count:number=2/);
});

test('CLI can review mutation output as an AES diff', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'set', file, '$.app.count', '2', '--diff']);

  assert.match(result.stdout, /AES diff:/);
  assert.match(result.stdout, /~ \$\.app\.count/);
});

test('CLI includes diff JSON when requested for batch edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.app.count', value: '2' },
  ]), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--diff', '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.diff.format, 'aes.diff');
  assert.equal(parsed.diff.changes.some((change: { readonly path: string }) => change.path === '$.app.count'), true);
});

test('CLI check mode exits zero for semantic changes without writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.app.count', value: '2' },
  ]), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--check', '--write']);
  const unchanged = await readFile(file, 'utf8');

  assert.match(result.stdout, /AES diff:/);
  assert.match(result.stdout, /~ \$\.app\.count/);
  assert.equal(unchanged, source);
});

test('CLI check mode exits one for semantic no-ops', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.app.count', value: '1' },
  ]), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--check']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stdout ?? '', /AES diff: 0 added, 0 removed, 0 changed/);
      return true;
    },
  );
});

test('CLI batch preflight blocks invalid operations before mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.missing', value: '2' },
  ]), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.preflight.diagnostics[0].code, 'PATH_NOT_FOUND');
      return true;
    },
  );
});

test('CLI batch reports no-op delete warnings in JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'delete', path: '$.missing' },
  ]), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--json']);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.changed, false);
  assert.equal(parsed.preflight.diagnostics[0].code, 'DELETE_NOOP');
});

test('CLI batch optimistic guards block stale edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.app.count', value: '2', expect: '3' },
  ]), 'utf8');

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'batch', file, ops, '--json']),
    (error: unknown) => {
      const failure = error as { readonly code?: number; readonly stdout?: string };
      const parsed = JSON.parse(failure.stdout ?? '{}');
      assert.equal(failure.code, 2);
      assert.equal(parsed.preflight.diagnostics[0].code, 'EXPECTATION_MISMATCH');
      return true;
    },
  );
});

test('CLI batch optimistic guards allow matching edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');
  await writeFile(ops, JSON.stringify([
    { command: 'set', path: '$.app.count', value: '2', expect: '1' },
  ]), 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);

  assert.match(result.stdout, /count:number=2/);
});

test('CLI plan-set emits a guarded batch operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'plan-set', file, '$.app.count', '2']);
  const plan = JSON.parse(result.stdout);

  assert.deepEqual(plan.operations, [
    {
      command: 'set',
      path: '$.app.count',
      expect: '1',
      value: '2',
    },
  ]);
});

test('CLI plan-set output can be applied by batch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, source, 'utf8');

  const planned = await execFileAsync(process.execPath, [cliPath, 'plan-set', file, '$.app.count', '2']);
  await writeFile(ops, planned.stdout, 'utf8');
  const applied = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);

  assert.match(applied.stdout, /count:number=2/);
});

test('CLI plan-attr-set emits and applies a guarded metadata operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n'), 'utf8');

  const planned = await execFileAsync(process.execPath, [cliPath, 'plan-attr-set', file, '$.app', 'owner', '"tools"']);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.operations[0].command, 'attr.set');
  assert.equal(plan.operations[0].expectAttribute, '"core"');

  await writeFile(ops, planned.stdout, 'utf8');
  const applied = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);
  assert.match(applied.stdout, /owner:string="tools"/);
});

test('CLI plan-node-attr-set emits and applies a guarded node metadata operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string="hero"}:node>',
  ].join('\n'), 'utf8');

  const planned = await execFileAsync(process.execPath, [cliPath, 'plan-node-attr-set', file, '$.view', 'id', '"main"']);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.operations[0].command, 'node-attr.set');
  assert.equal(plan.operations[0].expectAttribute, '"hero"');

  await writeFile(ops, planned.stdout, 'utf8');
  const applied = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);
  assert.match(applied.stdout, /id:string="main"/);
});

test('CLI plan-attr-annotation-set emits and applies a guarded nested metadata operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app@{owner@{source:string="seed"}:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n'), 'utf8');

  const planned = await execFileAsync(process.execPath, [
    cliPath,
    'plan-attr-annotation-set',
    file,
    '$.app',
    'owner',
    'source',
    '"ui"',
  ]);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.operations[0].command, 'attr-annotation.set');
  assert.equal(plan.operations[0].expectAttribute, '"core"');
  assert.equal(plan.operations[0].expectAnnotation, '"seed"');

  await writeFile(ops, planned.stdout, 'utf8');
  const applied = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);
  assert.match(applied.stdout, /source:string="ui"/);
});

test('CLI plan-node-attr-annotation-set emits and applies a guarded nested node metadata operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  const ops = join(dir, 'ops.json');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'view:node = <panel@{id@{source:string="seed"}:string="hero"}:node>',
  ].join('\n'), 'utf8');

  const planned = await execFileAsync(process.execPath, [
    cliPath,
    'plan-node-attr-annotation-set',
    file,
    '$.view',
    'id',
    'source',
    '"ui"',
  ]);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.operations[0].command, 'node-attr-annotation.set');
  assert.equal(plan.operations[0].expectAttribute, '"hero"');
  assert.equal(plan.operations[0].expectAnnotation, '"seed"');

  await writeFile(ops, planned.stdout, 'utf8');
  const applied = await execFileAsync(process.execPath, [cliPath, 'batch', file, ops]);
  assert.match(applied.stdout, /source:string="ui"/);
});

test('CLI exports AES JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, source, 'utf8');

  const result = await execFileAsync(process.execPath, [cliPath, 'export-aes', file]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(Array.isArray(parsed.events), true);
});

test('CLI inspects and lists paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
    'view:node = <panel@{id:string="hero"}:node("hello")>',
  ].join('\n'), 'utf8');

  const inspected = await execFileAsync(process.execPath, [cliPath, 'inspect', file, '$.app']);
  assert.match(inspected.stdout, /^\$\.app object:object/m);
  assert.match(inspected.stdout, /attributes: owner/);
  assert.match(inspected.stdout, /children: \$\.app\.name/);

  const listed = await execFileAsync(process.execPath, [cliPath, 'list', file]);
  assert.match(listed.stdout, /^\$\.view node:node nodeAttrs:id/m);
  assert.match(listed.stdout, /^\$\.view\.children\[0\] string/m);

  const json = await execFileAsync(process.execPath, [cliPath, 'list', file, '--json']);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.value.some((entry: { readonly path: string }) => entry.path === '$.app.name'), true);
});

test('CLI gets, sets, and deletes binding attributes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n'), 'utf8');

  const read = await execFileAsync(process.execPath, [cliPath, 'attr', 'get', file, '$.app', 'owner', '--json']);
  assert.equal(JSON.parse(read.stdout).value.value.value, 'core');

  const set = await execFileAsync(process.execPath, [cliPath, 'attr', 'set', file, '$.app', 'owner', '"tools"']);
  assert.match(set.stdout, /owner:string="tools"/);

  const deleted = await execFileAsync(process.execPath, [cliPath, 'attr', 'delete', file, '$.app', 'owner']);
  assert.doesNotMatch(deleted.stdout, /owner:string/);
});

test('CLI gets, sets, and deletes nested binding attribute annotations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'app@{owner@{source:string="seed"}:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n'), 'utf8');

  const read = await execFileAsync(process.execPath, [
    cliPath,
    'attr-annotation',
    'get',
    file,
    '$.app',
    'owner',
    'source',
    '--json',
  ]);
  assert.equal(JSON.parse(read.stdout).value.value.value, 'seed');

  const set = await execFileAsync(process.execPath, [
    cliPath,
    'attr-annotation',
    'set',
    file,
    '$.app',
    'owner',
    'source',
    '"ui"',
  ]);
  assert.match(set.stdout, /source:string="ui"/);

  const deleted = await execFileAsync(process.execPath, [
    cliPath,
    'attr-annotation',
    'delete',
    file,
    '$.app',
    'owner',
    'source',
  ]);
  assert.doesNotMatch(deleted.stdout, /source:string/);
});

test('CLI gets, sets, and deletes node-head attributes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string="hero"}:node>',
  ].join('\n'), 'utf8');

  const read = await execFileAsync(process.execPath, [cliPath, 'node-attr', 'get', file, '$.view', 'id', '--json']);
  assert.equal(JSON.parse(read.stdout).value.value.value, 'hero');

  const set = await execFileAsync(process.execPath, [cliPath, 'node-attr', 'set', file, '$.view', 'id', '"main"']);
  assert.match(set.stdout, /id:string="main"/);

  const deleted = await execFileAsync(process.execPath, [cliPath, 'node-attr', 'delete', file, '$.view', 'id']);
  assert.doesNotMatch(deleted.stdout, /id:string/);
});

test('CLI gets, sets, and deletes nested node-head attribute annotations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-edit-'));
  const file = join(dir, 'doc.aeon');
  await writeFile(file, [
    'aeon:mode = "strict"',
    'view:node = <panel@{id@{source:string="seed"}:string="hero"}:node>',
  ].join('\n'), 'utf8');

  const read = await execFileAsync(process.execPath, [
    cliPath,
    'node-attr-annotation',
    'get',
    file,
    '$.view',
    'id',
    'source',
    '--json',
  ]);
  assert.equal(JSON.parse(read.stdout).value.value.value, 'seed');

  const set = await execFileAsync(process.execPath, [
    cliPath,
    'node-attr-annotation',
    'set',
    file,
    '$.view',
    'id',
    'source',
    '"ui"',
  ]);
  assert.match(set.stdout, /source:string="ui"/);

  const deleted = await execFileAsync(process.execPath, [
    cliPath,
    'node-attr-annotation',
    'delete',
    file,
    '$.view',
    'id',
    'source',
  ]);
  assert.doesNotMatch(deleted.stdout, /source:string/);
});
