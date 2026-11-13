import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPortableEvents } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { convertAeonMode } from './index.js';

test('convertAeonMode preserves structural identities', () => {
  const result = convertAeonMode(
    'aeon:mode = "transport"\nage\\A1\\ = 42\nitems = [\\B2\\ = "green"]',
    { target: 'strict' },
  );
  assert.equal(result.text, 'aeon:mode="strict"\nage\\A1\\:number=42\nitems:list=[\\B2\\:string="green"]');
});

test('convertAeonMode preserves attribute-entry and node-head structural identities', () => {
  const result = convertAeonMode(
    'aeon:mode = "transport"\nvalue@{source\\META\\ = "user"} = <tag\\HEAD\\>',
    { target: 'strict' },
  );
  assert.match(result.text, /source\\META\\:string="user"/);
  assert.match(result.text, /<tag\\HEAD\\:node>/);
});

test('convertAeonMode strips ordinary datatypes when converting strict to transport', () => {
  const source = [
    'aeon:mode = "strict"',
    'name:string = "Aeon"',
    'count:number = 1',
    'config:object = { enabled:boolean = true }',
    'items:list = [:number = 1, :string = "two"]',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'transport' });

  assert.equal(result.text, [
    'aeon:mode="transport"',
    'name="Aeon"',
    'count=1',
    'config={enabled=true}',
    'items=[1,"two"]',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode preserves embed inline and envelope datatypes in transport mode', () => {
  const source = [
    'aeon:mode = "strict"',
    'payload:embed = &SGVsbG8=',
    'snippet:inline = &YWJj',
    'close:envelope = { hash:hex = #AABBCC }',
    'plain:encoding = &AAAA',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'transport' });

  assert.equal(result.text, [
    'aeon:mode="transport"',
    'payload:embed=&SGVsbG8=',
    'snippet:inline=&YWJj',
    'close:envelope={hash=#AABBCC}',
    'plain=&AAAA',
  ].join('\n'));
});

test('convertAeonMode preserves transport-shaped datatypes while stripping plain scalar hints', () => {
  const source = [
    'aeon:mode = "strict"',
    'plainRadix:radix = %22',
    'fixedRadix:radix2 = %1010',
    'shapedRadix:radix[12] = %22',
    'plainSep:sep = ^1.2.0',
    'shapedSep:sep["."] = ^1.2.0',
    'plainList:list = [:n = 1, :n = 2]',
    'shapedList:list<n> = [:n = 1, :n = 2]',
    'shapedTuple:tuple<n, string> = (:n = 1, :string = "two")',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'transport' });

  assert.equal(result.text, [
    'aeon:mode="transport"',
    'plainRadix=%22',
    'fixedRadix:radix2=%1010',
    'shapedRadix:radix[12]=%22',
    'plainSep=^1.2.0',
    'shapedSep:sep["."]=^1.2.0',
    'plainList=[1,2]',
    'shapedList:list<n>=[1,2]',
    'shapedTuple:tuple<n, string>=(1,"two")',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode preserves explicit custom datatypes when converting to transport', () => {
  const source = [
    'aeon:mode = "custom"',
    'name:label = "Aeon"',
    'meta@{ tag:label = "docs" }:object = { score:rating = 5 }',
    'items:list<label> = [:label = "one", :string = "two"]',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'transport' });

  assert.equal(result.text, [
    'aeon:mode="transport"',
    'name:label="Aeon"',
    'meta@{tag:label="docs"}={score:rating=5}',
    'items:list<label>=[:label="one","two"]',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode converts to custom mode while preserving custom datatypes and inferring missing ones', () => {
  const source = [
    'aeon:mode = "transport"',
    'name:label = "Aeon"',
    'count = 1',
    'items = [1, "two"]',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'custom' });

  assert.equal(result.text, [
    'aeon:mode="custom"',
    'name:label="Aeon"',
    'count:number=1',
    'items:list=[:number=1,:string="two"]',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode rejects explicit custom datatypes when converting to strict', () => {
  assert.throws(
    () => convertAeonMode('aeon:mode = "transport"\nname:label = "Aeon"', { target: 'strict' }),
    /Cannot convert custom datatype to strict mode: label/,
  );

  assert.throws(
    () => convertAeonMode('aeon:mode = "transport"\nitems:list<label> = ["one"]', { target: 'strict' }),
    /Cannot convert custom datatype to strict mode: list<label>/,
  );
});

test('convertAeonMode strips node literal datatypes in transport mode', () => {
  const source = [
    'aeon:mode = "strict"',
    'panel:node = <card:node("title")>',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'transport' });

  assert.equal(result.text, [
    'aeon:mode="transport"',
    'panel=<card("title")>',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode infers reference datatypes from their targets in strict mode', () => {
  const source = [
    'aeon:mode = "transport"',
    'base = 1',
    'annotated @{ note = "hello" } = 3',
    'copy = ~base',
    'pointer = ~>base',
    'noteCopy = ~annotated.@.note',
    'nested = { count = 2 }',
    'nestedCopy = ~nested.count',
    'items = [1, "two"]',
    'itemCopy = ~items[1]',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'strict' });

  assert.equal(result.text, [
    'aeon:mode="strict"',
    'base:number=1',
    'annotated@{note:string="hello"}:number=3',
    'copy:number=~base',
    'pointer:number=~>base',
    'noteCopy:string=~annotated.@.note',
    'nested:object={count:number=2}',
    'nestedCopy:number=~nested.count',
    'items:list=[:number=1,:string="two"]',
    'itemCopy:string=~items[1]',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode infers datatypes when converting transport to strict', () => {
  const source = [
    'aeon:mode = "transport"',
    'name = "Aeon"',
    'count = 1',
    'enabled = true',
    'choice = on',
    'color = #AABBCC',
    'release = ^1.2.0',
    'day = 2026-05-09',
    'meeting = 2026-05-09T09:30&Australia/Melbourne',
    'config = { enabled = true }',
    'items = [1, "two"]',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'strict' });

  assert.equal(result.text, [
    'aeon:mode="strict"',
    'name:string="Aeon"',
    'count:number=1',
    'enabled:boolean=true',
    'choice:toggle=on',
    'color:hex=#AABBCC',
    'release:sep=^1.2.0',
    'day:date=2026-05-09',
    'meeting:wtc=2026-05-09T09:30&Australia/Melbourne',
    'config:object={enabled:boolean=true}',
    'items:list=[:number=1,:string="two"]',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode adds a mode header when one is absent', () => {
  const result = convertAeonMode('name = "Aeon"', { target: 'strict' });

  assert.equal(result.text, 'aeon:mode="strict"\nname:string="Aeon"');
});

const symbolicSource = [
  'aeon:mode = "transport"',
  'status\\STATE\\ = |ready\\|now|',
  'meta@{kind\\META\\ = |annotation|} = |value|',
  'nested = { value\\NESTED\\ = |nested| }',
  'items = [\\ITEM\\ = |list|]',
  'pair = (|tuple|)',
  'panel = <tag\\HEAD\\(|child|)>',
  'copy = ~status',
  'pointer = ~>nested.value',
].join('\n');

for (const target of ['strict', 'transport', 'custom'] as const) {
  test(`convertAeonMode preserves symbolic values, identities and reference targets in ${target}`, () => {
    const before = compile(symbolicSource);
    assert.deepEqual(before.errors, []);
    const result = convertAeonMode(symbolicSource, { target });
    const after = compile(result.text);
    assert.deepEqual(after.errors, []);
    const observed = (events: typeof before.events) => projectPortableEvents(events)
      .filter((record) => record.kind === 'SymbolicLiteral'
        || record.kind === 'CloneReference' || record.kind === 'PointerReference'
        || record.identity !== undefined)
      .map(({path, kind, identity, value}) => ({path, kind, identity, value}));
    assert.deepEqual(observed(after.events), observed(before.events));
    assert.match(result.text, /\|ready\\\|now\|/);
    for (const key of ['status', 'copy', 'pointer']) {
      assert.equal(after.events.find((event) => event.key === key)?.datatype,
        target === 'transport' ? undefined : 'symbol');
    }
  });
}

test('convertAeonMode accepts reserved symbol annotations through strict roundtrips', () => {
  const strict = convertAeonMode(symbolicSource, { target: 'strict' });
  assert.equal(convertAeonMode(strict.text, { target: 'strict' }).text, strict.text);
  const transport = convertAeonMode(strict.text, { target: 'transport' });
  assert.equal(convertAeonMode(transport.text, { target: 'strict' }).text, strict.text);
  const custom = convertAeonMode(strict.text, { target: 'custom' });
  assert.equal(convertAeonMode(custom.text, { target: 'strict' }).text, strict.text);
});

test('transport conversion retains an anonymous identity when removing its datatype', () => {
  const result = convertAeonMode(String.raw`aeon:mode="strict"
items:list=[\ITEM\:number=1]`, {target: 'transport'});
  assert.equal(result.text, String.raw`aeon:mode="transport"
items=[\ITEM\=1]`);
  const replay = compile(result.text);
  assert.deepEqual(replay.errors, []);
  assert.equal(projectPortableEvents(replay.events)
    .find((record) => record.path === '$.items[0]')?.identity, 'ITEM');
});

test('convertAeonMode still rejects custom datatypes attached to symbolic values in strict mode', () => {
  for (const source of [
    'stage:application = |ready|',
    'meta@{stage:application = |ready|} = |value|',
    'items = [:application = |ready|]',
  ]) {
    assert.throws(() => convertAeonMode(source, { target: 'strict' }),
      /Cannot convert custom datatype to strict mode: application/);
  }
});
