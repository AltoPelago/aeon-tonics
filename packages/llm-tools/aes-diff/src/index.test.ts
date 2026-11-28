import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, exportTelex } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  applyAesPatch,
  createAesPatch,
  diffAeon,
  diffAes,
  diffTelex,
  encodePatchedTelex,
  parseAesTelex,
  formatAesDiffJson,
  formatAesDiffText,
  summarizeAesDiff,
} from './index.js';

test('diffTelex compares complete portable streams and keeps identity outside path identity', () => {
  const before = compile('a\\old-id\\:string = "one"\n<tag\\head-id\\("child")>');
  const after = compile('a\\new-id\\:string = "two"\n<tag\\head-id\\("child")>');
  assert.equal(before.errors.length, 0);
  assert.equal(after.errors.length, 0);

  const diff = diffTelex(exportTelex(before.events), exportTelex(after.events));
  const binding = diff.changes.find((change) => change.path === '$.a');

  assert.equal(binding?.kind, 'changed');
  assert.deepEqual(binding?.kind === 'changed' ? binding.delta.parts : [], ['identity', 'value']);
  assert.deepEqual(diff.changes.map((change) => change.path), ['$.a']);
  assert.equal(diff.summary.unchanged, 2);
});

test('portable node tags remain value changes when metadata is excluded', () => {
  const telex = (source: string) => {
    const compiled = compile(source);
    assert.deepEqual(compiled.errors, []);
    return exportTelex(compiled.events);
  };
  const before = telex('<rows(<item("first")>, <item("second")>)>');
  const after = telex('<rows(<item("first")>, <entry("second")>)>');
  const diff = diffTelex(before, after, { includeMetadata: false });
  assert.equal(diff.summary.unchanged, 4);
  assert.deepEqual(diff.changes.map((change) => [change.path, change.kind]), [['$.rows[1]', 'changed']]);
  const [change] = diff.changes;
  assert.deepEqual(change?.kind === 'changed' ? change.delta.parts : [], ['value']);

  const parsed = parseAesTelex(before);
  const applied = applyAesPatch(parsed.records, createAesPatch(diff));
  assert.equal(applied.ok, true);
  const replay = diffTelex(encodePatchedTelex(applied.events, parsed), after);
  assert.deepEqual(replay.changes, []);
});

test('excluding headers retains explicitly body-scoped aeon-prefixed nodes', () => {
  const diff = diffAeon(
    'aeon:mode="transport"\n<"aeon:mode"("before")>',
    'aeon:mode="transport"\n<"aeon:mode"("after")>',
    { includeHeaders: false },
  );
  assert.deepEqual(diff.diagnostics, []);
  assert.ok(diff.changes.some((change) => change.path === '$.["aeon:mode"][0]'));
  for (const change of diff.changes) {
    assert.equal(change.kind, 'changed');
    if (change.kind === 'changed') assert.deepEqual(change.delta.parts, ['value']);
  }
});

test('a labelled native body occurrence can match an unlabelled legacy event at the same path', () => {
  const before = compile('"aeon:demo"="before"').events;
  const after = compile('"aeon:demo"="after"').events;
  const legacy = before.map(({sourcePlane: _plane, ...event}) => event);
  for (const includeHeaders of [true, false]) {
    const options = { includeHeaders };
    const unchanged = diffAes(before, legacy, options);
    assert.deepEqual(unchanged.changes, []);
    assert.deepEqual(diffAes(legacy, before, options).changes, []);
    const noOp = applyAesPatch(before, createAesPatch(unchanged));
    assert.equal(noOp.ok, true);
    assert.deepEqual(noOp.events, before);

    const patch = createAesPatch(diffAes(before, after));
    const result = applyAesPatch(legacy, patch, options);
    assert.equal(result.ok, includeHeaders);
    if (includeHeaders) assert.deepEqual(diffAes(result.events, after).changes, []);
  }
  const mixedPlanes = compile('aeon:demo="header"\n"aeon:demo"="before"').events;
  const options = { includeHeaders: false };
  assert.deepEqual(diffAes(mixedPlanes, legacy, options).changes, []);
  const ambiguous = diffAes(legacy, after, options);
  assert.deepEqual(ambiguous.changes, []);
  assert.equal(ambiguous.diagnostics[0]?.code, 'AMBIGUOUS_SOURCE_PLANE');
  assert.equal(createAesPatch(ambiguous).applicable, false);
  const [body] = before;
  assert.ok(body);
  const changed = diffAes([{...body, sourcePlane: 'header'}], before).changes[0];
  assert.deepEqual(changed?.kind === 'changed' ? changed.delta.parts : [], ['header']);
});

test('portable datatype components are classified as datatype changes', () => {
  const diff = diffAes(
    [{ path: '$.a', kind: 'SeparatorLiteral', datatype: 'csv', clarifiers: [{ kind: 'StringLiteral', value: '.' }], value: 'one.two' }],
    [{ path: '$.a', kind: 'SeparatorLiteral', datatype: 'csv', clarifiers: [{ kind: 'StringLiteral', value: '|' }], value: 'one.two' }],
  );

  assert.deepEqual(diff.changes[0]?.kind === 'changed' ? diff.changes[0].delta.parts : [], ['datatype']);
});

test('diffTelex rejects incomplete streams under the default complete profile', () => {
  const incomplete = [
    'telex.aes=1',
    '',
    'path=$.a.b',
    'kind=StringLiteral',
    'value=value',
    '',
  ].join('\n');

  assert.throws(
    () => diffTelex(incomplete, incomplete),
    /Telex validation failed/u,
  );
});

test('diffAeon reports added, removed, changed, and unchanged paths', () => {
  const diff = diffAeon(
    'same:number = 1\nold:string = "gone"\ncount:number = 1',
    'same:number = 1\ncount:number = 2\nextra:boolean = true',
  );

  assert.deepEqual(diff.summary, {
    added: 1,
    removed: 1,
    changed: 1,
    unchanged: 1,
    metadataChanged: 0,
    referenceChanged: 0,
    headerChanged: 0,
  });
  assert.deepEqual(
    diff.changes.map((change) => [change.kind, change.path]),
    [
      ['changed', '$.count'],
      ['added', '$.extra'],
      ['removed', '$.old'],
    ],
  );
  assert.deepEqual(diff.changes[0]?.kind === 'changed' ? diff.changes[0].delta.parts : [], ['value']);
});

test('classifies datatype, metadata, reference, and header changes', () => {
  const diff = diffAeon(
    'aeon:profile = "old"\na@{unit:string="ms"}:number = 1\nb = ~a',
    'aeon:profile = "new"\na@{unit:string="s"}:string = "1"\nb = ~>a',
  );

  const changed = new Map(diff.changes.map((change) => [change.path, change]));
  const header = changed.get('$.["aeon:profile"]');
  const a = changed.get('$.a');
  const b = changed.get('$.b');

  assert.equal(header?.kind, 'changed');
  assert.deepEqual(header?.kind === 'changed' ? header.delta.parts : [], ['header']);
  assert.equal(a?.kind, 'changed');
  assert.deepEqual(a?.kind === 'changed' ? a.delta.parts : [], ['datatype', 'value', 'metadata']);
  assert.equal(b?.kind, 'changed');
  assert.deepEqual(b?.kind === 'changed' ? b.delta.parts : [], ['reference']);
  assert.equal(diff.summary.metadataChanged, 1);
  assert.equal(diff.summary.referenceChanged, 1);
  assert.equal(diff.summary.headerChanged, 1);
});

test('can exclude header changes from comparison', () => {
  const diff = diffAeon('aeon:profile = "old"\na = 1', 'aeon:profile = "new"\na = 1', {
    includeHeaders: false,
  });

  assert.equal(diff.changes.length, 0);
  assert.equal(diff.summary.unchanged, 1);
});

test('can ignore metadata and source span changes', () => {
  const before = compile('a@{unit:string="ms"}:number = 1');
  const after = compile('\n\na@{unit:string="s"}:number = 1');

  assert.equal(before.errors.length, 0);
  assert.equal(after.errors.length, 0);

  const withoutMetadata = diffAes(before.events, after.events, {
    includeMetadata: false,
  });
  assert.equal(withoutMetadata.changes.length, 0);
  assert.equal(withoutMetadata.summary.unchanged, 1);

  const withSpans = diffAes(before.events, after.events, {
    includeMetadata: false,
    includeSourceSpans: true,
  });
  assert.equal(withSpans.changes[0]?.kind, 'changed');
  assert.deepEqual(withSpans.changes[0]?.kind === 'changed' ? withSpans.changes[0].delta.parts : [], ['span']);
});

test('can scope comparison to path filters', () => {
  const diff = diffAeon(
    'app = {\n  name:string = "Aeon"\n  count:number = 1\n}\nother = "old"',
    'app = {\n  name:string = "Aeon"\n  count:number = 2\n  added:boolean = true\n}\nother = "new"',
    { pathFilters: ['$.app'] },
  );

  assert.deepEqual(
    diff.changes.map((change) => [change.kind, change.path]),
    [
      ['changed', '$.app'],
      ['added', '$.app.added'],
      ['changed', '$.app.count'],
    ],
  );
  assert.equal(diff.summary.unchanged, 1);
});

test('reports duplicate canonical path diagnostics', () => {
  const compiled = compile('a = 1');
  assert.equal(compiled.errors.length, 0);
  const event = compiled.events[0]!;
  const diff = diffAes([event, event], [event]);

  assert.equal(diff.diagnostics.length, 1);
  assert.equal(diff.diagnostics[0]?.code, 'DUPLICATE_PATH');
  assert.equal(diff.diagnostics[0]?.path, '$.a');
});

test('formats text and JSON for humans and agents', () => {
  const diff = diffAeon('a = 1', 'a = 2\nb = true');
  const text = formatAesDiffText(diff).text;
  const json = formatAesDiffJson(diff).text;

  assert.match(text, /AES diff: 1 added, 0 removed, 1 changed, 0 unchanged/);
  assert.match(text, /\~ \$\.a \(value\)/);
  assert.match(text, /\+ \$\.b/);
  assert.equal(JSON.parse(json).format, 'aes.diff');
});

test('summarizes diffs for agent planning', () => {
  const diff = diffAeon(
    'aeon:profile = "old"\napp = {\n  name:string = "Aeon"\n  count:number = 1\n  ref = ~app.name\n}\nold:boolean = true',
    'aeon:profile = "new"\napp = {\n  name:string = "Aeon"\n  count:string = "1"\n  ref = ~>app.name\n  added:boolean = true\n}',
  );
  const summary = summarizeAesDiff(diff, { maxPaths: 3 });

  assert.equal(summary.headline, '6 semantic AES changes; 1 added; 1 removed; 4 changed.');
  assert.deepEqual(summary.affectedTopLevel, ['$.["aeon:profile"]', '$.app', '$.old']);
  assert.deepEqual(summary.paths, ['$.["aeon:profile"]', '$.app', '$.app.added']);
  assert.deepEqual(summary.highRisk, [
    { path: '$.["aeon:profile"]', reasons: ['header'] },
    { path: '$.app', reasons: ['reference'] },
    { path: '$.app.count', reasons: ['datatype'] },
    { path: '$.app.ref', reasons: ['reference'] },
  ]);
});

test('creates reviewable patch operations from a diff', () => {
  const diff = diffAeon('a = 1\nold = true', 'a = 2\nnew = "ok"');
  const patch = createAesPatch(diff);

  assert.equal(patch.format, 'aes.patch');
  assert.equal(patch.version, 1);
  assert.equal(patch.applicable, true);
  assert.deepEqual(
    patch.operations.map((operation) => [operation.op, operation.path]),
    [
      ['replace', '$.a'],
      ['add', '$.new'],
      ['remove', '$.old'],
    ],
  );
  const replace = patch.operations[0];
  assert.equal(replace?.op, 'replace');
  assert.deepEqual(replace?.op === 'replace' ? replace.delta.parts : [], ['value']);
});

test('marks patches with diagnostics as non-applicable', () => {
  const diff = diffAeon('a = ', 'a = 1');
  const patch = createAesPatch(diff);

  assert.equal(patch.applicable, false);
  assert.equal(patch.diagnostics[0]?.code, 'AEON_COMPILE_ERROR');
});

test('applies patch operations to a matching AES base', () => {
  const before = compile('a = 1\nold = true');
  const after = compile('a = 2\nnew = "ok"');

  assert.equal(before.errors.length, 0);
  assert.equal(after.errors.length, 0);

  const patch = createAesPatch(diffAes(before.events, after.events));
  const result = applyAesPatch(before.events, patch);
  const verification = diffAes(result.events, after.events);

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(verification.changes.length, 0);
  assert.equal(verification.summary.unchanged, 2);
});

test('rejects patch application against a stale AES base', () => {
  const before = compile('a = 1');
  const after = compile('a = 2');
  const stale = compile('a = 3');

  assert.equal(before.errors.length, 0);
  assert.equal(after.errors.length, 0);
  assert.equal(stale.errors.length, 0);

  const patch = createAesPatch(diffAes(before.events, after.events));
  const result = applyAesPatch(stale.events, patch);

  assert.equal(result.ok, false);
  assert.equal(result.events, stale.events);
  assert.equal(result.diagnostics[0]?.code, 'PATCH_STALE_BASE');
});

test('refuses to apply non-applicable patches', () => {
  const before = compile('a = 1');
  assert.equal(before.errors.length, 0);

  const patch = createAesPatch(diffAeon('a = ', 'a = 1'));
  const result = applyAesPatch(before.events, patch);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, 'PATCH_NOT_APPLICABLE');
});

test('diffAeon reports compile diagnostics instead of throwing', () => {
  const diff = diffAeon('a = ', 'a = 1');

  assert.equal(diff.changes.length, 1);
  assert.equal(diff.diagnostics[0]?.code, 'AEON_COMPILE_ERROR');
  assert.equal(diff.diagnostics[0]?.side, 'before');
});
