import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { minimize } from './index.js';

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

test('minimize can add a trailing newline when requested', () => {
  const compiled = compile('name = "AEON"');
  assert.equal(compiled.errors.length, 0);

  const result = minimize(compiled.events, { trailingNewline: true });
  assert.equal(result.text, 'name="AEON"\n');
});
