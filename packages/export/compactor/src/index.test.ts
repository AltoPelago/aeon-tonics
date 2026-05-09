import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { compactAeon } from './index.js';

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
