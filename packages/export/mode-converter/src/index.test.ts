import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { convertAeonMode } from './index.js';

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
    'payload:embed = $SGVsbG8=',
    'snippet:inline = $YWJj',
    'close:envelope = { hash:hex = #AABBCC }',
    'plain:encoding = $AAAA',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'transport' });

  assert.equal(result.text, [
    'aeon:mode="transport"',
    'payload:embed=$SGVsbG8=',
    'snippet:inline=$YWJj',
    'close:envelope={hash=#AABBCC}',
    'plain=$AAAA',
  ].join('\n'));
});

test('convertAeonMode preserves transport-shaped datatypes while stripping plain scalar hints', () => {
  const source = [
    'aeon:mode = "strict"',
    'plainRadix:radix = %22',
    'fixedRadix:radix2 = %1010',
    'shapedRadix:radix[12] = %22',
    'plainSep:sep = ^1.2.0',
    'shapedSep:sep[.] = ^1.2.0',
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
    'shapedSep:sep[.]=^1.2.0',
    'plainList=[1,2]',
    'shapedList:list<n>=[1,2]',
    'shapedTuple:tuple<n, string>=(1,"two")',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
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
    'noteCopy = ~annotated@note',
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
    'noteCopy:string=~annotated@note',
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
    'config = { enabled = true }',
    'items = [1, "two"]',
  ].join('\n');

  const result = convertAeonMode(source, { target: 'strict' });

  assert.equal(result.text, [
    'aeon:mode="strict"',
    'name:string="Aeon"',
    'count:number=1',
    'enabled:boolean=true',
    'choice:switch=on',
    'color:hex=#AABBCC',
    'release:sep=^1.2.0',
    'day:date=2026-05-09',
    'config:object={enabled:boolean=true}',
    'items:list=[:number=1,:string="two"]',
  ].join('\n'));
  assert.equal(compile(result.text).errors.length, 0);
});

test('convertAeonMode adds a mode header when one is absent', () => {
  const result = convertAeonMode('name = "Aeon"', { target: 'strict' });

  assert.equal(result.text, 'aeon:mode="strict"\nname:string="Aeon"');
});
