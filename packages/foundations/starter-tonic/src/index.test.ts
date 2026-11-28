import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, projectPortableEvents } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type { Value } from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import {
  createStarterTonicFromAeon,
  createStarterTonicFromAes,
  exportStarterTonicAeon,
  exportStarterTonicAes,
} from './index.js';

test('starter tonic preserves raw symbolic snapshots and parsed-value writes', () => {
  const source = String.raw`stage\STATE\:symbol=|ready\|now|
nested={value=|inside|}
alias=~stage`;
  const doc = createStarterTonicFromAeon(source);
  assert.equal(doc.snapshot()['stage'], String.raw`|ready\|now|`);
  assert.deepEqual(doc.snapshot()['nested'], {value: '|inside|'});
  const stage = doc.getValue('stage');
  assert.ok(stage);
  assert.equal(stage.type, 'SymbolicLiteral');
  doc.setParsed('fresh', stage, {structuralId: 'FRESH', datatype: 'symbol'});
  doc.set('other', true);
  const result = exportStarterTonicAeon(doc);
  const replay = compile(result.text);
  assert.deepEqual(replay.errors, []);
  assert.match(result.text, /stage\\STATE\\:symbol=\|ready\\\|now\|/);
  assert.match(result.text, /fresh\\FRESH\\:symbol=\|ready\\\|now\|/);
  const alias = replay.events.find((event) => event.key === 'alias')?.value;
  assert.equal(alias?.type, 'CloneReference');
  assert.ok(alias?.type === 'CloneReference');
  assert.deepEqual(alias.path, ['stage']);
});

test('starter tonic can load top-level bindings and expose a simple snapshot view', () => {
  const doc = createStarterTonicFromAeon('aeon:mode = "strict"\ntitle:string = "Hello"\ncount:number = 2\ncopy:string = ~title');

  assert.deepEqual(doc.keys(), ['title', 'count', 'copy']);
  assert.deepEqual(doc.snapshot(), {
    title: 'Hello',
    count: 2,
    copy: {
      kind: 'clone',
      path: 'title',
    },
  });

  const count = doc.get('count');
  assert.equal(count?.datatype, 'number');
});

test('starter tonic supports top-level CRUD from plain js values and exports minimized aeon', () => {
  const doc = createStarterTonicFromAeon('title = "Hello"');

  doc.set('published', true);
  doc.set('tags', ['guide', 'starter']);
  doc.set('config', {
    retries: 3,
    enabled: true,
  });
  doc.delete('title');

  assert.deepEqual(doc.snapshot(), {
    published: true,
    tags: ['guide', 'starter'],
    config: {
      retries: 3,
      enabled: true,
    },
  });

  const result = exportStarterTonicAeon(doc);
  assert.equal(
    result.text,
    'published=true\ntags=["guide","starter"]\nconfig={retries=3,enabled=true}',
  );
});

test('starter tonic can be created from aes and can set parsed values for advanced aeon forms', () => {
  const compiled = compile('title@{lang:string = "en", "x.y":string = "dot"}:string = "Hello"\n<panel("child")>', { maxAttributeDepth: 2 });
  assert.equal(compiled.errors.length, 0);

  const doc = createStarterTonicFromAes(compiled.events);
  const pointerValue: Value = {
    type: 'PointerReference',
    path: ['title'],
    span: compiled.events[0]!.value.span,
  };
  doc.setParsed('pointer', pointerValue);
  doc.setParsed('lang', {
    type: 'CloneReference',
    path: ['title', { type: 'attr', key: 'lang' }],
    span: compiled.events[0]!.value.span,
  });
  doc.setParsed('quoted', {
    type: 'CloneReference',
    path: ['title', { type: 'attr', key: 'x.y' }],
    span: compiled.events[0]!.value.span,
  });

  const exported = exportStarterTonicAes(doc);
  assert.equal(exported.length, 6);
  assert.ok(projectPortableEvents(exported).some((event) => event.path === '$.panel[0]' && event.value === 'child'));
  assert.equal(
    exportStarterTonicAeon(doc).text,
    'title@{lang:string="en","x.y":string="dot"}:string="Hello"\n<panel("child")>\npointer=~>title\nlang=~title.@.lang\nquoted=~title.@.["x.y"]',
  );
});

test('starter tonic preserves datatype clarifiers', () => {
  const doc = createStarterTonicFromAeon('value:radix[16] = %ff');

  assert.equal(exportStarterTonicAeon(doc).text, 'value:radix[16]=%ff');
});

test('starter tonic preserves structural identities through reads and unrelated writes', () => {
  const doc = createStarterTonicFromAeon(String.raw`<tag\HEAD\@{source\META\:string = "user"}(\CHILD\:string = "text")>`);

  assert.equal(doc.get('tag')?.structuralId, 'HEAD');
  assert.equal(doc.get('tag')?.annotations?.get('source')?.structuralId, 'META');
  doc.set('other', true);

  assert.equal(
    exportStarterTonicAeon(doc).text,
    String.raw`<tag\HEAD\@{source\META\:string="user"}(\CHILD\:string="text")>
other=true`,
  );
});

test('starter tonic renders explicit identities on newly parsed values', () => {
  const compiled = compile(String.raw`<tag@{role\ROLE\ = "button"}(\CHILD\:string = "text")>`);
  assert.equal(compiled.errors.length, 0);
  const value = compiled.events.find((event) => event.key === 'tag')?.value;
  assert.ok(value);

  const doc = createStarterTonicFromAeon('seed = 1');
  assert.throws(() => doc.setParsed('value', value), /Node tag "tag" must match its key "value"/);
  doc.setParsed('tag', value, { structuralId: 'ROOT', datatype: 'node' });

  assert.equal(
    exportStarterTonicAeon(doc).text,
    String.raw`seed=1
<tag\ROOT\@{role\ROLE\="button"}:node(\CHILD\:string="text")>`,
  );
});

test('starter tonic replaces an intrinsic node in authored order and retains child addresses', () => {
  const doc = createStarterTonicFromAeon('<panel("old", <item>)>\ncopy = ~panel[0]\npointer = ~>panel[1]');
  const replacement = createStarterTonicFromAeon('<panel("new", <item>, <item>)>').getValue('panel');
  assert.ok(replacement);
  doc.setParsed('panel', replacement);

  assert.deepEqual(doc.keys(), ['panel', 'copy', 'pointer']);
  assert.deepEqual(doc.snapshot(), {
    panel: {
      kind: 'node', tag: 'panel', children: ['new', {kind: 'node', tag: 'item', children: []}, {kind: 'node', tag: 'item', children: []}],
    },
    copy: {kind: 'clone', path: 'panel[0]'},
    pointer: {kind: 'pointer', path: 'panel[1]'},
  });
  const source = exportStarterTonicAeon(doc).text;
  const replay = compile(source);
  assert.deepEqual(replay.errors, []);
  const projected = projectPortableEvents(exportStarterTonicAes(doc));
  assert.deepEqual(projected, projectPortableEvents(replay.events));
  assert.deepEqual(projected.map((event) => event.path), [
    '$.panel', '$.panel[0]', '$.panel[1]', '$.panel[2]', '$.copy', '$.pointer',
  ]);

  const invalidReplacement = createStarterTonicFromAeon('<panel>').getValue('panel');
  assert.ok(invalidReplacement);
  assert.throws(() => doc.setParsed('panel', invalidReplacement), /MISSING_REFERENCE_TARGET/);
  assert.equal(exportStarterTonicAeon(doc).text, source);
  assert.deepEqual(projectPortableEvents(exportStarterTonicAes(doc)), projected);
});

test('starter tonic keeps header and same-named body nodes distinct across writes and deletes', () => {
  const source = 'aeon:mode="transport"\n<"aeon:mode"("body")>\nordinary=1';
  const doc = createStarterTonicFromAeon(source);
  const inferred = createStarterTonicFromAes(compile(source).events.map(({sourcePlane: _plane, ...event}) => event));
  assert.deepEqual(projectPortableEvents(exportStarterTonicAes(inferred)), projectPortableEvents(exportStarterTonicAes(doc)));
  assert.deepEqual(doc.keys(), ['aeon:mode', 'ordinary']);
  assert.equal(doc.getValue('aeon:mode')?.type, 'NodeLiteral');

  doc.set('ordinary', null);
  assert.equal(doc.snapshot()['ordinary'], null);
  const exported = exportStarterTonicAes(doc);
  assert.equal(exported.filter((event) => event.sourcePlane === 'header').length, 1);
  assert.deepEqual(projectPortableEvents(exported).map((event) => event.path), [
    '$.["aeon:mode"]', '$.["aeon:mode"][0]', '$.ordinary',
  ]);
  assert.equal(doc.delete('aeon:mode'), true);
  assert.deepEqual(projectPortableEvents(exportStarterTonicAes(doc)).map((event) => event.path), ['$.ordinary']);
  assert.equal(exportStarterTonicAeon(doc).text, 'aeon:mode="transport"\nordinary=!none');
});

test('starter tonic plain-value writes preserve intrinsic attribute entries', () => {
  const holder = createStarterTonicFromAeon('source@{<badge("text")>}=1').get('source');
  assert.ok(holder?.annotations);
  const doc = createStarterTonicFromAeon('seed=1');
  doc.set('host', 2, {annotations: holder.annotations});
  const source = exportStarterTonicAeon(doc).text;
  assert.equal(source, 'seed=1\nhost@{<badge("text")>}=2');
  const result = compile(source);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(projectPortableEvents(exportStarterTonicAes(doc)), projectPortableEvents(result.events));
});
