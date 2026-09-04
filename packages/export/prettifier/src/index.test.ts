import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import { prettify, prettifyAeon } from './index.js';

test('prettify preserves structural identities at every headed occurrence', () => {
  const source = 'value\\BIND\\@{source\\META\\:string="user"}=<tag\\HEAD\\(\\CHILD\\:string="text")>';
  const result = prettifyAeon(source);

  assert.equal(
    result.text,
    'value\\BIND\\@{source\\META\\:string = "user"} = <tag\\HEAD\\(\\CHILD\\:string = "text")>',
  );
});

test('prettify expands minimized aeon without reordering top-level bindings', () => {
  const source = 'z:number=1\naeon:mode="strict"\napp:object={name:string="AEON",config:object={debug:boolean=true},items:list=[1,{done:boolean=true}]}\ncopy=~app.name';
  const result = prettifyAeon(source);

  assert.equal(
    result.text,
    [
      'z:number = 1',
      'aeon:mode = "strict"',
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
  assert.deepEqual(
    roundTrip.events.map((event) => formatPath(event.path)),
    compile(source).events.map((event) => formatPath(event.path)),
  );
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
