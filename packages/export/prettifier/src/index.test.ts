import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath, projectPortableEvents } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { prettify, prettifyAeon } from './index.js';

test('prettify preserves symbolic spelling, identities and reference targets through nested formatting', () => {
  const source = String.raw`stage\STATE\@{kind:symbol=|metadata|}:symbol=|ready\|now|
items=[|one|,{value\VALUE\=|two|}]
copy=~stage
pointer=~>items[1].value`;
  const before = compile(source);
  assert.deepEqual(before.errors, []);
  const result = prettifyAeon(source);
  const after = compile(result.text);
  assert.deepEqual(after.errors, []);
  assert.match(result.text, /\|ready\\\|now\|/);
  const observed = (events: typeof before.events) => projectPortableEvents(events)
    .map(({path, kind, identity, datatype, value}) => ({path, kind, identity, datatype, value}));
  assert.deepEqual(observed(after.events), observed(before.events));
  assert.equal(prettifyAeon(result.text).text, result.text);
});

test('prettify keeps quoted aeon-prefixed body keys distinct from header reference targets', () => {
  const source = 'aeon:header={x={leaf=1}}\n"aeon:x"=2\ncopy=~>["aeon:x"].leaf';
  const before = compile(source);
  assert.deepEqual(before.errors, []);
  const result = prettifyAeon(source);
  assert.match(result.text, /^"aeon:x" = 2$/m);
  const after = compile(result.text);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(after.events.find((event) => event.key === 'copy')?.value.type,
    'PointerReference');
  assert.deepEqual(projectPortableEvents(after.events), projectPortableEvents(before.events));
});

test('prettify preserves intrinsic nodes, child order and identities', () => {
  const source = String.raw`<tag\ROOT\@{source\META\:string="user",<badge\BADGE\>}(\CHILD\:string="text",<part>,<part>)>
object={<section>}
attached@{<mark>}=true
copy=~tag[0]`;
  const result = prettifyAeon(source);
  assert.equal(result.text, String.raw`<tag\ROOT\@{source\META\:string = "user", <badge\BADGE\>}(
  \CHILD\:string = "text",
  <part>,
  <part>
)>
object = {
  <section>
}
attached@{<mark>} = true
copy = ~tag[0]`);
  const before = compile(source);
  const after = compile(result.text);
  assert.deepEqual(before.errors, []);
  assert.deepEqual(after.errors, []);
  assert.deepEqual(projectPortableEvents(after.events), projectPortableEvents(before.events));
  assert.equal(prettifyAeon(result.text).text, result.text);
});

test('prettify expands minimized aeon without reordering top-level bindings', () => {
  const source = 'z:number=1\naeon:mode="strict"\napp:object={name:string="AEON",config:object={debug:boolean=true},items:list=[1,{done:boolean=true}]}\ncopy=~app.name';
  const result = prettifyAeon(source);

  assert.equal(
    result.text,
    [
      'z:number = 1',
      '"aeon":mode = "strict"',
      'app:object = {',
      '  name:string = "AEON"',
      '  config:object = {',
      '    debug:boolean = true',
      '  }',
      '  items:list = [',
      '    1,',
      '    {',
      '      done:boolean = true',
      '    }',
      '  ]',
      '}',
      'copy = ~app.name',
    ].join('\n'),
  );

  const roundTrip = compile(result.text);
  assert.equal(roundTrip.errors.length, 0);
  const bindings = (events: typeof roundTrip.events) => events.map((event) =>
    [formatPath(event.path), event.sourcePlane, event.datatype]);
  assert.deepEqual(bindings(roundTrip.events), bindings(compile(source).events));
});

test('prettify renders lowered aeon shortcut headers without datatypes', () => {
  const compiled = compile([
    'aeon:header = {',
    '  mode:string = "strict"',
    '  encoding:string = "utf-8"',
    '}',
  ].join('\n'));
  assert.equal(compiled.errors.length, 0);

  const result = prettify(compiled.events, { trailingNewline: true });

  assert.equal(result.text, 'aeon:mode = "strict"\naeon:encoding = "utf-8"\n');
  assert.equal(compile(result.text).errors.length, 0);
});

test('prettify renders reference attribute paths with explicit attribute-space segments', () => {
  const source = 'value@{meta:string="ok","x.y":string="dot"}=1\ncopy=~value.@.meta\nquoted=~value.@.["x.y"]';
  const result = prettifyAeon(source);

  assert.equal(
    result.text,
    [
      'value@{meta:string = "ok", "x.y":string = "dot"} = 1',
      'copy = ~value.@.meta',
      'quoted = ~value.@.["x.y"]',
    ].join('\n'),
  );
  assert.doesNotMatch(result.text, /~value@/);
  assert.equal(compile(result.text, { maxAttributeDepth: 2 }).errors.length, 0);
});
