import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTitonicFromAeon,
  createTitonicFromAes,
  deleteTitonicValue,
  deleteTitonicAttribute,
  deleteTitonicAttributeAnnotation,
  exportTitonicAeon,
  exportTitonicAes,
  deleteTitonicNodeAttributeAnnotation,
  getTitonicAttribute,
  getTitonicAttributeAnnotation,
  getTitonicAttributeAnnotations,
  getTitonicAttributes,
  getTitonicNodeAttribute,
  getTitonicNodeAttributeAnnotation,
  getTitonicNodeAttributeAnnotations,
  getTitonicNodeAttributes,
  getTitonicValue,
  isTitonic,
  isTitonicElement,
  resolveTitonicAddress,
  TITONIC_CHILDREN,
  deleteTitonicNodeAttribute,
  setTitonicAttribute,
  setTitonicAttributeAnnotation,
  setTitonicNodeAttributeAnnotation,
  setTitonicNodeAttribute,
  setTitonicValue,
  titonicAt,
  titonicDate,
  titonicDateTime,
  titonicElement,
  titonicEncoding,
  titonicHex,
  titonicRadix,
  titonicSansa,
  titonicSeparator,
  titonicToggle,
  titonicTime,
  type TitonicList,
  type TitonicElement,
  type TitonicNativeScalar,
  type TitonicObject,
  type TitonicTuple,
} from './index.js';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';

test('titonic exposes strict scalars as live typed properties', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'a:number = 2',
    'name:string = "AEON"',
    'enabled:boolean = true',
  ].join('\n'));

  assert.equal(isTitonic(titonic), true);
  assert.equal(titonic.a, 2);
  assert.equal(titonic.name, 'AEON');
  assert.equal(titonic.enabled, true);

  titonic.a = 7;
  titonic.name = 'Titonic';
  titonic.enabled = false;

  assert.equal(titonic.a, 7);
  assert.equal(titonic.name, 'Titonic');
  assert.equal(titonic.enabled, false);
});

test('titonic rejects invalid assignments for strict number fields', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'a:number = 2',
  ].join('\n'));

  assert.throws(() => {
    titonic.a = 'oops';
  }, /finite numbers/);

  assert.throws(() => {
    titonic.a = Number.NaN;
  }, /finite numbers/);

  assert.throws(() => {
    titonic.a = Number.POSITIVE_INFINITY;
  }, /finite numbers/);
});

test('titonic supports object and list CRUD with strict-friendly inferred datatypes for object members', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'config:object = { name:string = "x" }',
    'items:list = [1, 2]',
  ].join('\n'));

  const config = titonic.config as TitonicObject;
  const items = titonic.items as TitonicList;

  config.enabled = true;
  config.name = 'updated';
  delete config.name;

  assert.equal(config.enabled, true);
  assert.equal(config.name, undefined);

  assert.equal(items.length, 2);
  items.push(3);
  items[0] = 10;
  delete items[1];

  assert.deepEqual(items.map((value: unknown) => value), [10, 3]);

  const exported = exportTitonicAes(titonic);
  const exportedPaths = exported.map((event) => `${formatPath(event.path)}:${event.datatype ?? ''}:${event.value.type}`);

  assert.deepEqual(exportedPaths, [
    '$.["aeon:mode"]::StringLiteral',
    '$.config:object:ObjectNode',
    '$.config.enabled:boolean:BooleanLiteral',
    '$.items:list:ListNode',
    '$.items[0]::NumberLiteral',
    '$.items[1]::NumberLiteral',
  ]);
});

test('titonic can be created directly from strict AES and exported back to minimized aeon', () => {
  const compiled = compile([
    'aeon:mode = "strict"',
    'a:number = 2',
    'config:object = { flag:boolean = true }',
  ].join('\n'), {
    datatypePolicy: 'allow_custom',
  });

  assert.equal(compiled.errors.length, 0);

  const titonic = createTitonicFromAes(compiled.events);
  (titonic.config as TitonicObject).extra = 5;

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\na:number=2\nconfig:object={flag:boolean=true,extra:number=5}',
  );

  const roundTrip = compile(exportedAeon, {
    datatypePolicy: 'allow_custom',
  });
  assert.equal(roundTrip.errors.length, 0);
});

test('titonic supports live pointer alias reads and writes', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'a:number = 2',
    'b:number = ~>a',
    'config:object = { count:number = 1 }',
    'mirror:object = ~>config',
  ].join('\n'));

  assert.equal(titonic.b, 2);
  titonic.b = 9;
  assert.equal(titonic.a, 9);

  const mirror = titonic.mirror as TitonicObject;
  const config = titonic.config as TitonicObject;
  assert.equal(mirror.count, 1);
  mirror.count = 5;
  assert.equal(config.count, 5);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\na:number=9\nb:number=~>a\nconfig:object={count:number=5}\nmirror:object=~>config',
  );
});

test('titonic supports clone detachment on object mutation and exports concretely after divergence', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'base:object = { count:number = 2 }',
    'copy:object = ~base',
  ].join('\n'));

  const copy = titonic.copy as TitonicObject;
  const base = titonic.base as TitonicObject;

  assert.equal(copy.count, 2);
  base.count = 7;
  assert.equal(copy.count, 7);

  copy.count = 9;
  assert.equal(copy.count, 9);
  assert.equal(base.count, 7);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nbase:object={count:number=7}\ncopy:object={count:number=9}',
  );
});

test('titonic supports clone detachment for nested object updates', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'base:object = { inner:object = { count:number = 2 } }',
    'copy:object = ~base',
  ].join('\n'));

  const base = titonic.base as TitonicObject;
  const copy = titonic.copy as TitonicObject;
  const copyInner = copy.inner as TitonicObject;
  const baseInner = base.inner as TitonicObject;

  copyInner.count = 11;

  assert.equal(copyInner.count, 11);
  assert.equal(baseInner.count, 2);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nbase:object={inner:object={count:number=2}}\ncopy:object={inner:object={count:number=11}}',
  );
});

test('titonic supports clone detachment for list mutation', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'base:list = [1, 2]',
    'copy:list = ~base',
  ].join('\n'));

  const base = titonic.base as TitonicList;
  const copy = titonic.copy as TitonicList;

  copy[0] = 7;
  copy.push(9);

  assert.deepEqual(base.map((value: unknown) => value), [1, 2]);
  assert.deepEqual(copy.map((value: unknown) => value), [7, 2, 9]);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nbase:list=[1,2]\ncopy:list=[7,2,9]',
  );
});

test('titonic preserves binding attributes through lookup and export', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'a@{unit:string = "px"}:number = 2',
    'config:object = { count@{unit:string = "ms"}:number = 5 }',
  ].join('\n'));

  const topAttrs = getTitonicAttributes(titonic, ['a']);
  const nestedAttrs = getTitonicAttributes(titonic, ['config', 'count']);

  assert.equal(topAttrs?.get('unit')?.value.type, 'StringLiteral');
  assert.equal(topAttrs?.get('unit')?.datatype, 'string');
  assert.equal(nestedAttrs?.get('unit')?.value.type, 'StringLiteral');
  assert.equal(nestedAttrs?.get('unit')?.datatype, 'string');

  titonic.a = 3;
  (titonic.config as TitonicObject).count = 8;

  const exported = exportTitonicAes(titonic);
  const aEvent = exported.find((event) => formatPath(event.path) === '$.a');
  const countEvent = exported.find((event) => formatPath(event.path) === '$.config.count');

  assert.equal(aEvent?.annotations?.get('unit')?.datatype, 'string');
  assert.equal(countEvent?.annotations?.get('unit')?.datatype, 'string');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\na@{unit:string="px"}:number=3\nconfig:object={count@{unit:string="ms"}:number=8}',
  );
});

test('titonic preserves AEON-native scalar wrappers through read, write, and export', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'enabled:toggle = yes',
    'color:hex = #Ff_00_Aa',
    'mask:radix[10] = %1A',
    'payload:embed = &QmFzZTY0IQ==',
    'parts:set[|] = ^a|b|c',
    'day:date = 2026-04-24',
    'stamp:datetime = 2026-04-24T09:30:00Z',
    'opens:time = 09:30:00Z',
  ].join('\n'));

  assert.equal((titonic.color as TitonicNativeScalar).kind, 'hex');
  assert.equal((titonic.color as TitonicNativeScalar).raw, '#Ff_00_Aa');
  assert.equal((titonic.mask as TitonicNativeScalar).kind, 'radix');
  assert.equal((titonic.parts as TitonicNativeScalar).value, 'a|b|c');

  titonic.enabled = titonicToggle('off');
  titonic.color = titonicHex('#00FF00');
  titonic.mask = titonicRadix('%2B');
  titonic.payload = titonicEncoding('&SGVsbG8=');
  titonic.parts = titonicSeparator('x|y');
  titonic.day = titonicDate('2026-04-25');
  titonic.stamp = titonicDateTime('2026-04-25T10:45:00Z');
  titonic.opens = titonicTime('10:45:00Z');

  assert.throws(() => {
    titonic.color = '#ffffff';
  }, /hex fields only accept titonicHex/);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nenabled:toggle=off\ncolor:hex=#00FF00\nmask:radix[10]=%2B\npayload:embed=&SGVsbG8=\nparts:set[|]=^x|y\nday:date=2026-04-25\nstamp:datetime=2026-04-25T10:45:00Z\nopens:time=10:45:00Z',
  );
});

test('titonic can create new AEON-native scalar fields from wrapper helpers', () => {
  const titonic = createTitonicFromAeon('aeon:mode = "strict"');

  titonic.color = titonicHex('ABCDEF');
  titonic.created = titonicDate('2026-04-24');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\ncolor:hex=#ABCDEF\ncreated:date=2026-04-24',
  );
});

test('titonic preserves SANSA address literals as native scalar values', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'link:sansa = $.inventory.items[2].sku',
  ].join('\n'));

  const link = titonic.link as TitonicNativeScalar;
  assert.equal(link.kind, 'sansa');
  assert.equal(link.value, '$.inventory.items[2].sku');

  titonic.link = titonicSansa('?.name');

  assert.throws(() => {
    titonic.link = '$.name';
  }, /sansa fields only accept titonicSansa/);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(exportedAeon, 'aeon:mode="strict"\nlink:sansa=?.name');
});

test('titonic supports fixed-arity tuple reads, indexed updates, and tuple export', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'pair:tuple<int32, int32> = (1, 2)',
  ].join('\n'));

  const pair = titonic.pair as TitonicTuple;

  assert.equal(Object.prototype.toString.call(pair), '[object TitonicTuple]');
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map((value: unknown) => value), [1, 2]);

  pair[1] = 7;

  assert.deepEqual(pair.map((value: unknown) => value), [1, 7]);

  assert.throws(() => {
    pair.push(9);
  }, /fixed arity/);

  assert.throws(() => {
    delete pair[0];
  }, /fixed arity/);

  assert.throws(() => {
    pair.length = 1;
  }, /fixed arity/);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(exportedAeon, 'aeon:mode="strict"\npair:tuple<int32, int32>=(1,7)');
});

test('titonic preserves tuple kind on whole-value replacement and clone detachment', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'pair:tuple<int32, int32> = (1, 2)',
    'copy:tuple<int32, int32> = ~pair',
  ].join('\n'));

  titonic.pair = [3, 4];
  const copy = titonic.copy as TitonicTuple;

  assert.deepEqual(copy.map((value: unknown) => value), [3, 4]);

  copy[0] = 9;

  assert.deepEqual((titonic.pair as TitonicTuple).map((value: unknown) => value), [3, 4]);
  assert.deepEqual(copy.map((value: unknown) => value), [9, 4]);

  assert.throws(() => {
    titonic.pair = [1, 2, 3];
  }, /fixed arity of 2/);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\npair:tuple<int32, int32>=(3,4)\ncopy:tuple<int32, int32>=(9,4)',
  );
});

test('titonic materializes node literals as live element objects and preserves head metadata', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string = "hero"}:node("hello", <br>, (1, 2))>',
  ].join('\n'));

  const view = titonic.view as TitonicElement;

  assert.equal(isTitonicElement(view), true);
  assert.equal(view.tag, 'panel');
  assert.equal(view.datatype, 'node');
  assert.equal(view.children.length, 3);
  assert.equal(view.children[0], 'hello');
  assert.equal((view.children[1] as TitonicElement).tag, 'br');
  assert.deepEqual((view.children[2] as TitonicTuple).map((value: unknown) => value), [1, 2]);
  assert.equal(getTitonicNodeAttributes(view)?.get('id')?.datatype, 'string');

  view.tag = 'section';
  view.children.push('world');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<section@{id:string="hero"}:node("hello",<br>,(1,2),"world")>',
  );
});

test('titonic can create and replace node literals via titonicElement()', () => {
  const titonic = createTitonicFromAeon('aeon:mode = "strict"');

  titonic.view = titonicElement('panel', ['hello', titonicElement('br')], { datatype: 'node' });

  const view = titonic.view as TitonicElement;
  assert.equal(view.tag, 'panel');
  assert.equal((view.children[1] as TitonicElement).tag, 'br');

  view.children = [titonicElement('span', ['updated'], { datatype: 'node' })];
  view.tag = 'section';

  assert.throws(() => {
    view.datatype = 'contact';
  }, /strict-mode node heads only accept datatype "node"/);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<section:node(<span:node("updated")>)>',
  );
});

test('titonic supports pointer alias reads and writes for node values', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel:node("hello")>',
    'mirror:node = ~>view',
  ].join('\n'));

  const view = titonic.view as TitonicElement;
  const mirror = titonic.mirror as TitonicElement;

  assert.equal(mirror.tag, 'panel');
  assert.equal(mirror.children[0], 'hello');

  mirror.tag = 'section';
  mirror.children.push('world');

  assert.equal(view.tag, 'section');
  assert.deepEqual(view.children.map((value: unknown) => value), ['hello', 'world']);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<section:node("hello","world")>\nmirror:node=~>view',
  );
});

test('titonic keeps node clones symbolic under read-only access and detaches on mutation', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel:node("hello", <br:node>)>',
    'copy:node = ~view',
  ].join('\n'));

  const copy = titonic.copy as TitonicElement;

  assert.equal(copy.tag, 'panel');
  assert.equal((copy.children[1] as TitonicElement).tag, 'br');

  const beforeMutation = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    beforeMutation,
    'aeon:mode="strict"\nview:node=<panel:node("hello",<br:node>)>\ncopy:node=~view',
  );

  (copy.children[1] as TitonicElement).tag = 'hr';

  const view = titonic.view as TitonicElement;
  assert.equal((view.children[1] as TitonicElement).tag, 'br');
  assert.equal((copy.children[1] as TitonicElement).tag, 'hr');

  const afterMutation = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    afterMutation,
    'aeon:mode="strict"\nview:node=<panel:node("hello",<br:node>)>\ncopy:node=<panel:node("hello",<hr:node>)>',
  );
});

test('titonic supports node head attribute CRUD and preserves export', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string = "hero", tone:string = "info"}:node>',
  ].join('\n'));

  const view = titonic.view as TitonicElement;

  assert.equal(getTitonicNodeAttribute(view, 'id')?.datatype, 'string');
  assert.equal(getTitonicNodeAttribute(view, 'tone')?.value.type, 'StringLiteral');

  setTitonicNodeAttribute(view, 'id', 'main');
  setTitonicNodeAttribute(view, 'enabled', true);
  assert.equal(deleteTitonicNodeAttribute(view, 'tone'), true);
  assert.equal(deleteTitonicNodeAttribute(view, 'missing'), false);

  assert.equal(getTitonicNodeAttribute(view, 'id')?.datatype, 'string');
  assert.equal(getTitonicNodeAttribute(view, 'enabled')?.datatype, 'boolean');
  assert.equal(getTitonicNodeAttributes(view)?.has('tone'), false);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel@{id:string="main",enabled:boolean=true}:node>',
  );
});

test('titonic applies node head attribute mutation through pointer aliases and clone detachment', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string = "hero"}:node>',
    'mirror:node = ~>view',
    'copy:node = ~view',
  ].join('\n'));

  const mirror = titonic.mirror as TitonicElement;
  const copy = titonic.copy as TitonicElement;
  const view = titonic.view as TitonicElement;

  setTitonicNodeAttribute(mirror, 'id', 'live');
  setTitonicNodeAttribute(copy, 'id', 'copy');

  assert.equal(getTitonicNodeAttribute(view, 'id')?.value.type, 'StringLiteral');
  assert.equal((getTitonicNodeAttribute(view, 'id')?.value as { value: string }).value, 'live');
  assert.equal((getTitonicNodeAttribute(copy, 'id')?.value as { value: string }).value, 'copy');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel@{id:string="live"}:node>\nmirror:node=~>view\ncopy:node=<panel@{id:string="copy"}:node>',
  );
});

test('titonic supports nested node-head attribute annotation CRUD', () => {
  const compiled = compile([
    'aeon:mode = "strict"',
    'view:node = <panel@{id@{source:string = "seed"}:string = "hero"}:node>',
  ].join('\n'), {
    datatypePolicy: 'allow_custom',
    maxAttributeDepth: 2,
  });
  assert.equal(compiled.errors.length, 0);

  const titonic = createTitonicFromAes(compiled.events);

  const view = titonic.view as TitonicElement;

  assert.equal(getTitonicNodeAttributeAnnotations(view, 'id')?.get('source')?.datatype, 'string');
  assert.equal(
    (getTitonicNodeAttributeAnnotation(view, 'id', 'source')?.value as { value: string }).value,
    'seed',
  );

  setTitonicNodeAttributeAnnotation(view, 'id', 'source', 'ui');
  setTitonicNodeAttributeAnnotation(view, 'id', 'locked', true);

  assert.equal(
    (getTitonicNodeAttributeAnnotation(view, 'id', 'source')?.value as { value: string }).value,
    'ui',
  );
  assert.equal(getTitonicNodeAttributeAnnotation(view, 'id', 'locked')?.datatype, 'boolean');

  assert.equal(deleteTitonicNodeAttributeAnnotation(view, 'id', 'source'), true);
  assert.equal(deleteTitonicNodeAttributeAnnotation(view, 'id', 'missing'), false);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel@{id@{locked:boolean=true}:string="hero"}:node>',
  );
});

test('titonic applies nested node-head annotation mutation through pointer aliases and clone detachment', () => {
  const compiled = compile([
    'aeon:mode = "strict"',
    'view:node = <panel@{id@{source:string = "seed"}:string = "hero"}:node>',
    'mirror:node = ~>view',
    'copy:node = ~view',
  ].join('\n'), {
    datatypePolicy: 'allow_custom',
    maxAttributeDepth: 2,
  });
  assert.equal(compiled.errors.length, 0);

  const titonic = createTitonicFromAes(compiled.events);

  const mirror = titonic.mirror as TitonicElement;
  const copy = titonic.copy as TitonicElement;
  const view = titonic.view as TitonicElement;

  setTitonicNodeAttributeAnnotation(mirror, 'id', 'source', 'live');
  setTitonicNodeAttributeAnnotation(copy, 'id', 'source', 'copy');

  assert.equal(
    (getTitonicNodeAttributeAnnotation(view, 'id', 'source')?.value as { value: string }).value,
    'live',
  );
  assert.equal(
    (getTitonicNodeAttributeAnnotation(copy, 'id', 'source')?.value as { value: string }).value,
    'copy',
  );

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel@{id@{source:string="live"}:string="hero"}:node>\nmirror:node=~>view\ncopy:node=<panel@{id@{source:string="copy"}:string="hero"}:node>',
  );
});

test('titonic supports binding attribute CRUD via document paths', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'a@{unit:string = "px"}:number = 2',
    'config:object = { count@{unit:string = "ms"}:number = 5 }',
  ].join('\n'));

  assert.equal(getTitonicAttribute(titonic, ['a'], 'unit')?.datatype, 'string');
  assert.equal(getTitonicAttribute(titonic, ['config', 'count'], 'unit')?.datatype, 'string');

  setTitonicAttribute(titonic, ['a'], 'unit', 'rem');
  setTitonicAttribute(titonic, ['a'], 'step', 4);
  assert.equal(deleteTitonicAttribute(titonic, ['config', 'count'], 'unit'), true);
  assert.equal(deleteTitonicAttribute(titonic, ['config', 'count'], 'missing'), false);

  assert.equal(getTitonicAttribute(titonic, ['a'], 'step')?.datatype, 'number');
  assert.equal((getTitonicAttribute(titonic, ['a'], 'unit')?.value as { value: string }).value, 'rem');
  assert.equal(getTitonicAttributes(titonic, ['config', 'count']), undefined);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\na@{unit:string="rem",step:number=4}:number=2\nconfig:object={count:number=5}',
  );
});

test('titonic supports nested binding attribute annotation CRUD via document paths', () => {
  const compiled = compile([
    'aeon:mode = "strict"',
    'a@{unit@{source:string = "seed"}:string = "px"}:number = 2',
  ].join('\n'), {
    datatypePolicy: 'allow_custom',
    maxAttributeDepth: 2,
  });
  assert.equal(compiled.errors.length, 0);

  const titonic = createTitonicFromAes(compiled.events);

  assert.equal(
    (getTitonicAttributeAnnotation(titonic, ['a'], 'unit', 'source')?.value as { value: string }).value,
    'seed',
  );

  setTitonicAttributeAnnotation(titonic, ['a'], 'unit', 'source', 'ui');
  setTitonicAttributeAnnotation(titonic, ['a'], 'unit', 'locked', true);
  assert.equal(deleteTitonicAttributeAnnotation(titonic, ['a'], 'unit', 'source'), true);
  assert.equal(deleteTitonicAttributeAnnotation(titonic, ['a'], 'unit', 'missing'), false);

  assert.equal(getTitonicAttributeAnnotations(titonic, ['a'], 'unit')?.get('locked')?.datatype, 'boolean');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\na@{unit@{locked:boolean=true}:string="px"}:number=2',
  );
});

test('titonic applies binding attribute mutation through pointer aliases and clone detachment', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'base:object = { count@{unit:string = "ms"}:number = 5 }',
    'mirror:object = ~>base',
    'copy:object = ~base',
  ].join('\n'));

  setTitonicAttribute(titonic, ['mirror', 'count'], 'unit', 'live');
  setTitonicAttribute(titonic, ['copy', 'count'], 'unit', 'copy');

  assert.equal(
    (getTitonicAttribute(titonic, ['base', 'count'], 'unit')?.value as { value: string }).value,
    'live',
  );
  assert.equal(
    (getTitonicAttribute(titonic, ['copy', 'count'], 'unit')?.value as { value: string }).value,
    'copy',
  );

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nbase:object={count@{unit:string="live"}:number=5}\nmirror:object=~>base\ncopy:object={count@{unit:string="copy"}:number=5}',
  );
});

test('titonic supports path-based value CRUD for ordinary objects and lists', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'config:object = { count:number = 1 }',
    'items:list = [1, 2]',
  ].join('\n'));

  assert.equal(getTitonicValue(titonic, ['config', 'count']), 1);
  assert.deepEqual((getTitonicValue(titonic, ['items']) as TitonicList).map((value: unknown) => value), [1, 2]);

  setTitonicValue(titonic, ['config', 'count'], 5);
  setTitonicValue(titonic, ['config', 'enabled'], true);
  setTitonicValue(titonic, ['items', 1], 9);
  setTitonicValue(titonic, ['items', 2], 7);

  assert.equal(deleteTitonicValue(titonic, ['config', 'count']), true);
  assert.equal(deleteTitonicValue(titonic, ['items', 0]), true);
  assert.equal(deleteTitonicValue(titonic, ['config', 'missing']), false);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nconfig:object={enabled:boolean=true}\nitems:list=[9,7]',
  );
});

test('titonic applies path-based value mutation through pointer aliases and clone detachment', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'base:object = { count:number = 1 }',
    'mirror:object = ~>base',
    'copy:object = ~base',
  ].join('\n'));

  setTitonicValue(titonic, ['mirror', 'count'], 8);
  setTitonicValue(titonic, ['copy', 'count'], 9);

  assert.equal(getTitonicValue(titonic, ['base', 'count']), 8);
  assert.equal(getTitonicValue(titonic, ['copy', 'count']), 9);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nbase:object={count:number=8}\nmirror:object=~>base\ncopy:object={count:number=9}',
  );
});

test('titonic supports path-based addressing of node children', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel:node("hello", <br:node>, "world")>',
  ].join('\n'));

  assert.equal(getTitonicValue(titonic, ['view', TITONIC_CHILDREN, 0]), 'hello');
  assert.equal((getTitonicValue(titonic, ['view', TITONIC_CHILDREN, 1]) as TitonicElement).tag, 'br');

  setTitonicValue(titonic, ['view', TITONIC_CHILDREN, 1], titonicElement('hr', [], { datatype: 'node' }));
  setTitonicValue(titonic, ['view', TITONIC_CHILDREN, 3], 'tail');
  assert.equal(deleteTitonicValue(titonic, ['view', TITONIC_CHILDREN, 0]), true);

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel:node(<hr:node>,"world","tail")>',
  );
});

test('titonic resolves exact SANSA member and position addresses', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'inventory:object = { items:list = [{ sku:string = "A1", qty:number = 3 }, { sku:string = "B2", qty:number = 5 }] }',
  ].join('\n'));

  const result = resolveTitonicAddress(titonic, '$.inventory.items[1].sku');

  assert.equal(result.exact, true);
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.bindings.map((binding) => [binding.pathText, binding.value, binding.datatype]), [
    ['$.inventory.items[1].sku', 'B2', 'string'],
  ]);
});

test('titonic resolves SANSA direct expansion and representation filters', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'inventory:object = { items:list = [{ sku:string = "A1", qty:number = 3 }] }',
  ].join('\n'));

  const expanded = resolveTitonicAddress(titonic, '$.inventory.items[0].*');
  const strings = resolveTitonicAddress(titonic, '$.inventory.items[0].*%stringLiteral');

  assert.equal(expanded.exact, false);
  assert.deepEqual(expanded.bindings.map((binding) => [binding.pathText, binding.representationKind]), [
    ['$.inventory.items[0].sku', 'stringLiteral'],
    ['$.inventory.items[0].qty', 'numberLiteral'],
  ]);
  assert.deepEqual(strings.bindings.map((binding) => binding.pathText), ['$.inventory.items[0].sku']);
});

test('titonic resolves SANSA descendant expansion and semantic type filters', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'inventory:object = { items:list = [{ sku:string = "A1", qty:number = 3 }, { sku:string = "B2", qty:number = 5 }] }',
  ].join('\n'));

  const result = resolveTitonicAddress(titonic, '$.inventory.**#number');

  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.bindings.map((binding) => [binding.pathText, binding.value]), [
    ['$.inventory.items[0].qty', 3],
    ['$.inventory.items[1].qty', 5],
  ]);
});

test('titonic resolves SANSA name patterns with question-mark wildcards', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'inventory:object = { item_a:string = "A", item_b:string = "B", item_backup:string = "old", status:string = "ready" }',
  ].join('\n'));

  const result = resolveTitonicAddress(titonic, '$.inventory.("item?*")');

  assert.deepEqual(result.bindings.map((binding) => [binding.pathText, binding.value]), [
    ['$.inventory.item_a', 'A'],
    ['$.inventory.item_b', 'B'],
    ['$.inventory.item_backup', 'old'],
  ]);
});

test('titonic resolves contextual SANSA roots from a provided path', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'inventory:object = { items:list = [{ sku:string = "A1" }, { sku:string = "B2" }] }',
  ].join('\n'));

  const result = resolveTitonicAddress(titonic, '?.sku', {
    contextPath: ['inventory', 'items', 1],
  });

  assert.deepEqual(result.bindings.map((binding) => [binding.pathText, binding.value]), [
    ['$.inventory.items[1].sku', 'B2'],
  ]);
});

test('titonic reports unsupported SANSA address spaces in the first resolve slice', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'inventory@{source:string = "seed"}:object = { items:list = [] }',
  ].join('\n'));

  const contextual = resolveTitonicAddress(titonic, '?.items');
  const attribute = resolveTitonicAddress(titonic, '$.inventory.@');
  const local = resolveTitonicAddress(titonic, '$.inventory.<"schema">');

  assert.equal(contextual.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT');
  assert.equal(attribute.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE');
  assert.equal(local.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_LOCAL_SPACE');
});

test('titonic applies node-child path mutation through pointer aliases and clone detachment', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel:node("hello", <br:node>)>',
    'mirror:node = ~>view',
    'copy:node = ~view',
  ].join('\n'));

  setTitonicValue(titonic, ['mirror', TITONIC_CHILDREN, 0], 'live');
  setTitonicValue(titonic, ['copy', TITONIC_CHILDREN, 1], titonicElement('hr', [], { datatype: 'node' }));

  assert.equal(getTitonicValue(titonic, ['view', TITONIC_CHILDREN, 0]), 'live');
  assert.equal((getTitonicValue(titonic, ['view', TITONIC_CHILDREN, 1]) as TitonicElement).tag, 'br');
  assert.equal((getTitonicValue(titonic, ['copy', TITONIC_CHILDREN, 1]) as TitonicElement).tag, 'hr');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel:node("live",<br:node>)>\nmirror:node=~>view\ncopy:node=<panel:node("live",<hr:node>)>',
  );
});

test('titonicAt groups path-based value and metadata operations ergonomically', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'config:object = { count@{unit:string = "ms"}:number = 5 }',
  ].join('\n'));

  const count = titonicAt(titonic, ['config', 'count']);

  assert.equal(count.get(), 5);
  assert.equal(count.path.length, 2);
  assert.equal(count.attributes.get('unit')?.datatype, 'string');

  count.set(8);
  count.attributes.set('unit', 's');
  count.attributes.setAnnotation('unit', 'source', 'ui');

  assert.equal(count.get(), 8);
  assert.equal((count.attributes.get('unit')?.value as { value: string }).value, 's');
  assert.equal((count.attributes.getAnnotation('unit', 'source')?.value as { value: string }).value, 'ui');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nconfig:object={count@{unit@{source:string="ui"}:string="s"}:number=8}',
  );
});

test('titonicAt works with node children and clone semantics', () => {
  const titonic = createTitonicFromAeon([
    'aeon:mode = "strict"',
    'view:node = <panel:node("hello", <br:node>)>',
    'copy:node = ~view',
  ].join('\n'));

  const child = titonicAt(titonic, ['copy', TITONIC_CHILDREN, 1]);
  assert.equal((child.get() as TitonicElement).tag, 'br');

  child.set(titonicElement('hr', [], { datatype: 'node' }));

  assert.equal((titonicAt(titonic, ['view', TITONIC_CHILDREN, 1]).get() as TitonicElement).tag, 'br');
  assert.equal((child.get() as TitonicElement).tag, 'hr');

  const exportedAeon = exportTitonicAeon(titonic, { trailingNewline: false });
  assert.equal(
    exportedAeon,
    'aeon:mode="strict"\nview:node=<panel:node("hello",<br:node>)>\ncopy:node=<panel:node("hello",<hr:node>)>',
  );
});
