import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath, projectPortableEvents } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { minimize } from './index.js';

test('minimize deduplicates detached attributes with equivalent number values', () => {
  const [binding] = compile('<n@{amount:number=1_000}>').events;
  const [projection] = compile('<n@{amount:number=1000}>').events;
  assert.ok(binding && projection?.annotations);
  const replay = compile(minimize([{...binding, annotations: projection.annotations}]).text);
  assert.deepEqual(replay.errors, []);
  assert.deepEqual(projectPortableEvents(replay.events), projectPortableEvents([binding]));
});

test('minimize renders native binding attributes on the intrinsic node', () => {
  const [event] = compile('<section@{own="own"}>').events;
  const [label] = compile('label="label"').events;
  assert.ok(event && label);
  const annotations = new Map(event.annotations);
  annotations.set('label', {value: label.value});
  const output = minimize([{...event, annotations}]).text;
  const replay = compile(output);
  assert.deepEqual(replay.errors, []);
  assert.deepEqual([...replay.events[0]!.annotations!.keys()], ['label', 'own']);

  annotations.set('own', {value: label.value});
  assert.throws(() => minimize([{...event, annotations}]), /Conflicting attribute "own"/);
});

test('minimize rejects a native node whose named key differs from its tag', () => {
  const [event] = compile('<section>').events;
  assert.ok(event);
  const mismatched = {
    ...event,
    path: { segments: [{type: 'root'}, {type: 'member', key: 'view'}] } as const,
  };
  assert.throws(() => minimize([mismatched]), /Node tag "section" must match its key "view"/);
});

test("minimize keeps a node child's trimtick kind and payload", () => {
  const source = 'aeon:mode="strict"\n<tag(:trimtick=>`\n    a\\`b\n  c\\\\d\n `)>';
  const before = compile(source);
  assert.deepEqual(before.errors, []);
  const after = compile(minimize(before.events).text);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(projectPortableEvents(after.events), projectPortableEvents(before.events));
});

test('minimize preserves structural identities in named and anonymous heads', () => {
  const source = 'age\\A1\\:int32 = 42\nitems = [\\B2\\:string = "green"]';
  const result = compile(source);
  assert.equal(result.errors.length, 0);
  assert.equal(minimize(result.events).text, 'age\\A1\\:int32=42\nitems=[\\B2\\:string="green"]');
});

test('minimize renders node declarations directly in every scope', () => {
  const source = String.raw`<tag\TAG\@{source\META\:string = "user", <badge\BADGE\>}:node("text", <item>, <item>)>
doc = { <"aeon:header"@{meta = 1}> }
holder@{<logo@{role = "brand"}>} = 2
<"aeon":node()>
copy = ~tag[0]
pointer = ~>doc.["aeon:header"]
label = ~holder.@.logo.@.role`;
  const options = {maxAttributeDepth:2};
  const before = compile(source, options);
  assert.deepEqual(before.errors, []);
  const output = minimize(before.events).text;
  assert.equal(output, String.raw`<tag\TAG\@{source\META\:string="user",<badge\BADGE\>}:node("text",<item>,<item>)>
doc={<"aeon:header"@{meta=1}>}
holder@{<logo@{role="brand"}>}=2
<"aeon":node>
copy=~tag[0]
pointer=~>doc.["aeon:header"]
label=~holder.@.logo.@.role`);
  const after = compile(output, options);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(projectPortableEvents(after.events), projectPortableEvents(before.events));
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

test('minimize preserves symbolic literal spelling from the current parser', () => {
  const compiled = compile('stage:symbol = |this has \\| spaces|');
  assert.deepEqual(compiled.errors, []);
  const result = minimize(compiled.events);
  assert.equal(result.text, 'stage:symbol=|this has \\| spaces|');
  const again = compile(result.text);
  assert.deepEqual(again.errors, []);
  const projected = (events: typeof compiled.events) => events.map((event) => {
    assert.equal(event.value.type, 'SymbolicLiteral');
    if (event.value.type !== 'SymbolicLiteral') throw new Error('Expected symbolic literal');
    return [event.value.type, event.value.value, event.value.raw];
  });
  assert.deepEqual(projected(again.events), projected(compiled.events));
});
