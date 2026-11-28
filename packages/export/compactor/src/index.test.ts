import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, projectPortableEvents } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { compact, compactAeon } from './index.js';

test('compactAeon preserves semantic comments by default and drops plain comments', () => {
  const source = [
    '//# docs',
    'a:number = 1 //? required',
    '// plain',
    '//@ machine',
    'b:string = "two"',
  ].join('\n');

  const result = compactAeon(source);

  assert.equal(result.text, [
    '//# docs',
    'a:number=1 //? required',
    '//@ machine',
    'b:string="two"',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('compactAeon keeps placed semantic comments around binding landmarks', () => {
  const cases = [
    ['a:string= /?comment?/ "hello"', 'a:string= /?comment?/ "hello"'],
    ['b:string /?comment?/ = "hello"', 'b:string /?comment?/ ="hello"'],
    ['c:/?comment?/ string = "hello"', 'c: /?comment?/ string="hello"'],
    ['d /?comment?/ :string = "hello"', 'd /?comment?/ :string="hello"'],
    ['e @{a:n=2} /?comment?/ :string = "hello"', 'e@{a:n=2} /?comment?/ :string="hello"'],
    ['f /?comment?/ @{a:n=2} :string = "hello"', 'f /?comment?/ @{a:n=2}:string="hello"'],
  ] as const;

  for (const [source, expected] of cases) {
    const result = compactAeon(source);

    assert.equal(result.text, expected, source);
    assert.equal(compile(result.text).errors.length, 0, source);
  }
});

test('compactAeon keeps line comments on a safe line when placed inside a binding', () => {
  const result = compactAeon('a:string= //? comment\n"hello"');

  assert.equal(result.text, 'a:string= //? comment\n"hello"');
  assert.equal(compile(result.text).errors.length, 0);
});

test('compactAeon can preserve regular comments as standalone lines', () => {
  const source = [
    '// plain before',
    'a = {',
    '  // plain inside',
    '  b = 1',
    '}',
    '/* plain after */',
  ].join('\n');

  const result = compactAeon(source, { comments: 'all', trailingNewline: true });

  assert.equal(result.text, [
    '// plain before',
    'a={b=1}',
    '// plain inside',
    '/* plain after */',
    '',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('compactAeon can strip all comments', () => {
  const result = compactAeon('//# docs\na = 1 //? hint\n// plain', { comments: 'none' });

  assert.equal(result.text, 'a=1');
});

test('compactAeon compacts intrinsic nodes without adding binding wrappers', () => {
  const source = '<root @{ <badge> } ( "first", <tail> )>\nobject = { <child> }';
  const result = compactAeon(source);
  assert.equal(result.text, '<root@{<badge>}("first",<tail>)>\nobject={<child>}');
  assert.deepEqual(compile(result.text).errors, []);
});

test('compact preserves intrinsic node comment layout and respects comment selection', () => {
  const source = [
    '//@ root',
    '<root /? head ?/ @{<badge /@ tag @/>}(',
    '  /* plain */ /@ first @/ /@ second @/ "first",',
    '  <tail>',
    ')> //? end',
    'next = 1',
  ].join('\n');
  const before = compile(source);
  assert.deepEqual(before.errors, []);
  const result = compactAeon(source);
  const replay = compile(result.text);
  const layout = (annotations: typeof before.annotations) => annotations?.map(({raw, target, placement}) => ({raw, target, placement}));
  assert.deepEqual(replay.errors, []);
  assert.deepEqual(layout(replay.annotations), layout(before.annotations));
  assert.deepEqual(projectPortableEvents(replay.events), projectPortableEvents(before.events));
  assert.doesNotMatch(result.text, /plain/u);
  assert.equal(compactAeon(result.text).text, result.text);
  assert.equal(compact(before.events, source, { comments:'all', trailingNewline:true }).text, source + '\n');
  const stripped = compactAeon(source, { comments:'none' });
  assert.equal(stripped.text, '<root@{<badge>}("first",<tail>)>\nnext=1');
});

test('compact preserves annotated nodes inside the header without a body node', () => {
  const source = 'aeon:header={x={<leaf /@ tag @/ >}}\nnext = 1';
  const before = compile(source);
  assert.deepEqual(before.errors, []);
  const layout = (annotations: typeof before.annotations) => annotations?.map(({raw, target, placement}) => ({raw, target, placement}));

  for (const comments of ['semantic', 'all'] as const) {
    const result = compactAeon(source, {comments});
    const after = compile(result.text);
    assert.deepEqual(after.errors, []);
    assert.deepEqual(layout(after.annotations), layout(before.annotations));
  }
  assert.equal(compactAeon(source, {comments:'none'}).text, 'aeon:x={<leaf>}\nnext=1');
});

test('compact preserves the raw CR in a selected trailing line comment', () => {
  for (const ending of ['\r', '\r\n', '\n']) {
    const source = '<n /@ inside @/> //? after' + ending;
    const before = compile(source);
    assert.deepEqual(before.errors, []);
    for (const trailingNewline of [false, true]) {
      const result = compact(before.events, source, {trailingNewline});
      const after = compile(result.text);
      assert.deepEqual(after.errors, []);
      assert.deepEqual(after.annotations?.map(({raw}) => raw), before.annotations?.map(({raw}) => raw));
      assert.equal(result.text.endsWith('\n'), trailingNewline);
    }
  }
});
