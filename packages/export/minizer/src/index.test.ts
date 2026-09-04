import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { minimize } from './index.js';

test('minimize preserves structural identities in named and anonymous heads', () => {
  const source = 'age\\A1\\:int32 = 42\nitems = [\\B2\\:string = "green"]';
  const result = compile(source);
  assert.equal(result.errors.length, 0);
  assert.equal(minimize(result.events).text, 'age\\A1\\:int32=42\nitems=[\\B2\\:string="green"]');
});

test('minimize compacts top-level bindings and preserves nested structure through top-level AES values', () => {
  const source = 'app:object = { name:string = "AEON", port:int32 = 8080, debug = true }\nitems = [1, { done = true }]\ncopy = ~app.name\nptr = ~>app.port';
  const compiled = compile(source);

  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events);
  assert.equal(
    result.text,
    'app:object={name:string="AEON",port:int32=8080,debug=true}\nitems=[1,{done=true}]\ncopy=~app.name\nptr=~>app.port',
  );

  const roundTrip = compile(result.text);
  assert.equal(roundTrip.errors.length, 0);
  assert.deepEqual(
    roundTrip.events.map((event) => ({ path: formatPath(event.path), type: event.value.type })),
    compiled.events.map((event) => ({ path: formatPath(event.path), type: event.value.type })),
  );
});

test('minimize renders binding annotations and quoted keys compactly', () => {
  const source = 'value@{meta:string = "ok", "odd key" = false}:int32 = 1';
  const compiled = compile(source);

  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events);
  assert.equal(result.text, 'value@{meta:string="ok","odd key"=false}:int32=1');
});

test('minimize renders SANSA address literals as raw literals', () => {
  const source = 'link:sansa = $.inventory.items[2].sku';
  const compiled = compile(source, { datatypePolicy: 'allow_custom' });

  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events);
  assert.equal(result.text, 'link:sansa=$.inventory.items[2].sku');

  const roundTrip = compile(result.text, { datatypePolicy: 'allow_custom' });
  assert.equal(roundTrip.errors.length, 0);
  assert.equal(roundTrip.events[0]?.value.type, 'SansaAddressLiteral');
});

test('minimize renders reference attribute paths with explicit attribute-space segments', () => {
  const source = 'value@{meta:string = "ok", "x.y":string = "dot"} = 1\ncopy = ~value.@.meta\nquoted = ~value.@.["x.y"]';
  const compiled = compile(source, { maxAttributeDepth: 2 });

  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events);
  assert.equal(
    result.text,
    'value@{meta:string="ok","x.y":string="dot"}=1\ncopy=~value.@.meta\nquoted=~value.@.["x.y"]',
  );
  assert.doesNotMatch(result.text, /~value@/);

  const roundTrip = compile(result.text, { maxAttributeDepth: 2 });
  assert.equal(roundTrip.errors.length, 0);
});

test('minimize renders lowered aeon shortcut headers without datatypes', () => {
  const source = [
    'aeon:header = {',
    '  mode:string = "strict"',
    '  encoding:string = "utf-8"',
    '  profile:string = "aeon.gp.profile.v1"',
    '  version:string = "1"',
    '}',
  ].join('\n');
  const compiled = compile(source);

  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events);
  assert.equal(
    result.text,
    [
      'aeon:mode="strict"',
      'aeon:encoding="utf-8"',
      'aeon:profile="aeon.gp.profile.v1"',
      'aeon:version="1"',
    ].join('\n'),
  );

  const roundTrip = compile(result.text);
  assert.equal(roundTrip.errors.length, 0);
  assert.deepEqual(
    roundTrip.events.map((event) => ({ path: formatPath(event.path), type: event.value.type })),
    compiled.events.map((event) => ({ path: formatPath(event.path), type: event.value.type })),
  );
});

test('minimize can add a trailing newline when requested', () => {
  const compiled = compile('name = "AEON"');
  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events, { trailingNewline: true });
  assert.equal(result.text, 'name="AEON"\n');
});
