import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import type { Value } from '../../../../../aeon/implementations/typescript/packages/parser/dist/index.js';
import {
  createStarterTonicFromAeon,
  createStarterTonicFromAes,
  exportStarterTonicAeon,
  exportStarterTonicAes,
} from './index.js';

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
  const compiled = compile('title@{lang:string = "en", "x.y":string = "dot"}:string = "Hello"\nview:node = <panel("child")>', { maxAttributeDepth: 2 });
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
  assert.equal(exported.length, 5);
  assert.equal(
    exportStarterTonicAeon(doc).text,
    'title@{lang:string="en","x.y":string="dot"}:string="Hello"\nview:node=<panel("child")>\npointer=~>title\nlang=~title.@.lang\nquoted=~title.@.["x.y"]',
  );
});
