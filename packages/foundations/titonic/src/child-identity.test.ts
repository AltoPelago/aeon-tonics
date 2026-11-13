import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { parseAddressOrThrow, type SansaAddress } from '@altopelago/sansa';
import {
  createTitonicFromAeon, createTitonicFromAes, exportTitonicAeon, exportTitonicAes,
  getTitonicValue, resolveTitonicAddress, setTitonicValue, TITONIC_CHILDREN,
  type TitonicResolveOptions, type TitonicObject,
} from './index.js';

const from = (source: string) => createTitonicFromAeon(`aeon:mode="strict"\n${source}`);
const paths = (document: TitonicObject, address: string, options?: TitonicResolveOptions) => {
  const result = resolveTitonicAddress(document, address, options);
  assert.deepEqual(result.diagnostics, []);
  return result.bindings.map((binding) => binding.pathText);
};

test('child identities compose over object/list/tuple and retain actual paths and values', () => {
  const document = from('group\\g\\:object={items:list=[\\a\\={name\\n\\:string="hello"}]}\npair:tuple=(\\x\\="x",\\y\\="y")');
  const result = resolveTitonicAddress(document, '$.\\g\\.items.\\a\\.\\n\\');
  assert.equal(result.exact, false);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.bindings.map((b) => [b.pathText, b.portablePath, b.titonicPath, b.value]), [
    ['$.group.items[0].name', ['group', 'items', 0, 'name'], ['group', 'items', 0, 'name'], 'hello'],
  ]);
  assert.deepEqual(paths(document, '$.pair.\\y\\'), ['$.pair[1]']);
});

test('child identity searches direct children and excludes contextual scope root', () => {
  const document = from('group\\g\\:object={nested\\n\\:string="world"}');
  assert.deepEqual(paths(document, '$.\\n\\'), []);
  assert.deepEqual(paths(document, '?.\\g\\', { contextPath: ['group'] }), []);
  assert.deepEqual(paths(document, '?.\\n\\', { contextPath: ['group'] }), ['$.group.nested']);
  assert.equal(resolveTitonicAddress(document, '?.\\n\\').diagnostics[0]?.code,
    'TITONIC_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT');
});

test('child identity composes with existing expansion, filters and parents', () => {
  const document = from('group:object={nested\\n\\:string="world"}');
  assert.deepEqual(paths(document, '$.*.\\n\\%StringLiteral'), ['$.group.nested']);
  assert.deepEqual(paths(document, '$.**.\\n\\.^'), ['$.group']);
});

test('node binding/head IDs stay distinct and return portable and internal paths', () => {
  const document = from('view\\binding\\:node=<panel\\head\\:node(\\text\\="hello",<br\\nestedHead\\>)>');
  assert.deepEqual(paths(document, '$.\\head\\'), []);
  assert.deepEqual(paths(document, '$.\\binding\\'), ['$.view']);
  const head = resolveTitonicAddress(document, '$.view.\\head\\');
  assert.deepEqual(head.bindings.map((b) => [b.pathText, b.occurrence, b.value]), [['$.view[0]', 'node-head', 'panel']]);
  const child = resolveTitonicAddress(document, '$.view.\\head\\.\\text\\');
  assert.deepEqual(child.bindings.map((b) => [b.pathText, b.titonicPath, b.value]), [
    ['$.view[0][0]', ['view', TITONIC_CHILDREN, 0], 'hello'],
  ]);
  assert.deepEqual(paths(document, '$.view.\\head\\.\\head\\'), []);
  assert.deepEqual(paths(document, '$.view[0][1].\\nestedHead\\'), ['$.view[0][1][0]']);
});

test('binding identity does not cross attribute/local spaces or use quoted keys as metadata', () => {
  const document = from('item\\i\\@{note\\note\\:string="meta"}:string="hello"\n"\\\\i\\\\":string="key"');
  assert.deepEqual(paths(document, '$.\\note\\'), []);
  assert.deepEqual(paths(document, '$.["\\\\i\\\\"]'), ['$.["\\\\i\\\\"]']);
  for (const [address, code] of [
    ['$.\\i\\.@.\\note\\', 'TITONIC_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE'],
    ['$.\\i\\.<"schema">.\\note\\', 'TITONIC_RESOLVE_UNSUPPORTED_LOCAL_SPACE'],
  ]) {
    const result = resolveTitonicAddress(document, address!);
    assert.equal(result.diagnostics[0]?.code, code);
    assert.deepEqual(result.bindings, []);
  }
});

test('identity budget counts every child, including after the match and unsuccessful scans', () => {
  const document = from('a\\a\\:string="a"\nb:string="b"');
  assert.deepEqual(paths(document, '$.\\a\\', { maxIdentityInspections: 2 }), ['$.a']);
  for (const identity of ['a', 'missing']) {
    const result = resolveTitonicAddress(document, `$.\\${identity}\\`, { maxIdentityInspections: 1 });
    assert.deepEqual(result.bindings, []);
    assert.deepEqual(result.diagnostics.map((d) => [d.code, d.limit, d.observed, d.selectorIndex]), [
      ['SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED', 1, 2, 0],
    ]);
  }
  assert.deepEqual(paths(from('empty:object={}'), '$.empty.\\x\\', { maxIdentityInspections: 0 }), []);
});

test('one call shares budget across chained steps and resets on the next call', () => {
  const document = from('group\\g\\:object={value\\v\\:string="hello"}');
  for (let i = 0; i < 2; i += 1) {
    const result = resolveTitonicAddress(document, '$.\\g\\.\\v\\', { maxIdentityInspections: 1 });
    assert.deepEqual(result.bindings, []);
    assert.deepEqual(result.diagnostics.map((d) => [d.code, d.limit, d.observed, d.selectorIndex]), [
      ['SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED', 1, 2, 1],
    ]);
    assert.deepEqual(paths(document, '$.\\g\\.\\v\\', { maxIdentityInspections: 2 }), ['$.group.value']);
  }
});

test('whole-call budget spans parents and discards an earlier parent match', () => {
  const document = from('a:object={x\\x\\:string="x"}\nb:object={y\\y\\:string="y"}');
  const result = resolveTitonicAddress(document, '$.*.\\x\\', { maxIdentityInspections: 1 });
  assert.deepEqual(result.bindings, []);
  assert.equal(result.diagnostics[0]?.code, 'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
  assert.equal(result.diagnostics[0]?.observed, 2);
});

test('the same exposed child ID can match under separate alias parents in order', () => {
  const document = from('target:object={name\\n\\:string="hello"}\nmirror:object=~>target\ncopy:object=~target');
  assert.deepEqual(paths(document, '$.*.\\n\\', { maxIdentityInspections: 3 }), [
    '$.target.name', '$.mirror.name', '$.copy.name',
  ]);
  const limited = resolveTitonicAddress(document, '$.*.\\n\\', { maxIdentityInspections: 2 });
  assert.deepEqual(limited.bindings, []);
  assert.equal(limited.diagnostics[0]?.observed, 3);
});

for (const limit of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, null, '2']) {
  test(`invalid identity inspection limit fails explicitly: ${String(limit)}`, () => {
    const result = resolveTitonicAddress(from('a\\a\\:string="a"'), '$.\\a\\',
      { maxIdentityInspections: limit } as unknown as TitonicResolveOptions);
    assert.deepEqual(result.bindings, []);
    assert.equal(result.diagnostics[0]?.code, 'SANSA_RESOLVE_INVALID_IDENTITY_LIMIT');
  });
}

test('default inspection limit remains finite', () => {
  const document = from('items:list=[]');
  const items = document.items as unknown[];
  for (let index = 0; index < 10_001; index += 1) items.push('x');
  const result = resolveTitonicAddress(document, '$.items.\\missing\\');
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.diagnostics.map((d) => [d.code, d.limit, d.observed]), [
    ['SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED', 10_000, 10_001],
  ]);
});

test('duplicate or malformed adapter IDs fail without partial bindings', () => {
  const events = compile('aeon:mode="strict"\na\\a\\:string="a"\nb\\b\\:string="b"').events;
  for (const identity of ['a', '', 'bad!']) {
    const document = createTitonicFromAes(events.map((e) => e.key === 'b' ? { ...e, structuralId: identity } : e));
    const result = resolveTitonicAddress(document, '$.\\a\\');
    assert.deepEqual(result.bindings, []);
    assert.equal(result.diagnostics[0]?.code, identity === 'a' ? 'SANSA_RESOLVE_AMBIGUOUS_IDENTITY' : 'SANSA_RESOLVE_INVALID_IDENTITY');
  }
});

test('caller identity AST is normalized and cannot forge exactness/root/identity', () => {
  const document = from('a\\a\\:string="a"');
  const address = parseAddressOrThrow('$.\\a\\');
  const forged = { ...address, isExact: true, canonical: '$.wrong' };
  const result = resolveTitonicAddress(document, forged);
  assert.equal(result.exact, false);
  assert.equal(forged.isExact, true);
  assert.deepEqual(result.bindings.map((b) => b.pathText), ['$.a']);
  for (const invalid of [
    { ...address, root: { type: 'root', kind: 'unknown' } },
    { ...address, selectors: [{ type: 'childIdentity', identity: 'bad!' }] },
  ]) {
    const failed = resolveTitonicAddress(document, invalid as SansaAddress);
    assert.equal(failed.diagnostics[0]?.code, 'SANSA_RESOLVE_INVALID_ADDRESS');
    assert.deepEqual(failed.bindings, []);
  }
});

test('qualified identity addresses are explicitly unsupported', () => {
  const document = from('a\\a\\:string="a"');
  const address = parseAddressOrThrow('$.\\a\\');
  // A cycle must not reach the recursive qualifier renderer.
  const qualifier: Record<string, unknown> = {}; qualifier.self = qualifier;
  const failed = resolveTitonicAddress(document, { ...address, qualifierExpression: qualifier } as unknown as SansaAddress);
  assert.equal(failed.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_IDENTITY_QUALIFIER');
  assert.deepEqual(failed.bindings, []);
  const parsed = resolveTitonicAddress(document, '$.\\a\\:count');
  assert.equal(parsed.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_IDENTITY_QUALIFIER');
  assert.deepEqual(parsed.bindings, []);
});

test('unknown runtime selectors produce a diagnostic rather than escaping the dispatcher', () => {
  const address = { ...parseAddressOrThrow('$'), selectors: [{ type: 'futureSelector' }] };
  const result = resolveTitonicAddress(from('a:string="a"'), address as unknown as SansaAddress);
  assert.equal(result.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_SELECTOR');
  assert.deepEqual(result.bindings, []);
});

test('identity resolution retains live proxy identity and fresh structural paths after insertion', () => {
  const document = from('items:list=[\\first\\={name:string="one"},\\second\\={name:string="two"}]');
  const first = resolveTitonicAddress(document, '$.items.\\first\\').bindings[0]!;
  assert.equal(first.value, getTitonicValue(document, ['items', 0]));
  (document.items as unknown[]).splice(0, 0, { name: 'new' });
  assert.equal(first.pathText, '$.items[0]');
  const next = resolveTitonicAddress(document, '$.items.\\first\\').bindings[0]!;
  assert.equal(next.value, first.value);
  assert.equal(next.pathText, '$.items[1]');
});

test('reordered snapshots select the same authored identity at the new structural path', () => {
  const first = from('items:list=[\\first\\="one",\\second\\="two"]');
  const second = from('items:list=[\\second\\="two",\\first\\="one"]');
  assert.deepEqual(paths(first, '$.items.\\first\\'), ['$.items[0]']);
  assert.deepEqual(paths(second, '$.items.\\first\\'), ['$.items[1]']);
  assert.equal(resolveTitonicAddress(second, '$.items.\\first\\').bindings[0]?.value, 'one');
});

test('pointer/clone binding IDs stay distinct from targets and reads retain references', () => {
  const document = from('target\\target\\:object={name\\name\\:string="hello"}\nmirror\\mirror\\:object=~>target\ncopy\\copy\\:object=~target');
  const before = exportTitonicAeon(document);
  assert.deepEqual(paths(document, '$.\\target\\'), ['$.target']);
  assert.deepEqual(paths(document, '$.\\mirror\\.\\name\\'), ['$.mirror.name']);
  assert.deepEqual(paths(document, '$.\\copy\\.\\name\\'), ['$.copy.name']);
  assert.equal(exportTitonicAeon(document), before);
  setTitonicValue(document, ['copy', 'name'], 'detached');
  assert.equal(getTitonicValue(document, ['target', 'name']), 'hello');
  assert.equal(resolveTitonicAddress(document, '$.copy.\\name\\').bindings[0]?.value, 'detached');
  setTitonicValue(document, ['mirror', 'name'], 'live');
  assert.equal(getTitonicValue(document, ['target', 'name']), 'live');
});

test('identity-selected clone containers retain existing copy-on-write proxy behavior', () => {
  const document = from('target\\t\\:object={nested\\n\\:object={name:string="hello"}}\ncopy\\c\\:object=~target\nmirror\\m\\:object=~>target');
  const before = exportTitonicAeon(document);
  const nested = resolveTitonicAddress(document, '$.\\c\\.\\n\\').bindings[0]!.value as TitonicObject;
  assert.equal(exportTitonicAeon(document), before);
  nested.name = 'detached';
  assert.equal(((document.target as TitonicObject).nested as TitonicObject).name, 'hello');
  assert.equal(((document.copy as TitonicObject).nested as TitonicObject).name, 'detached');
  const mirror = resolveTitonicAddress(document, '$.\\m\\.\\n\\').bindings[0]!.value as TitonicObject;
  mirror.name = 'live';
  assert.equal(((document.target as TitonicObject).nested as TitonicObject).name, 'live');
});

test('identity-selected scalar references return values without container proxy conversion', () => {
  const document = from('target\\t\\:string="hello"\ncopy\\c\\:string=~target\nmirror\\m\\:string=~>target');
  const before = exportTitonicAeon(document);
  for (const identity of ['c', 'm']) {
    const result = resolveTitonicAddress(document, `$.\\${identity}\\`);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.bindings[0]?.value, 'hello');
  }
  assert.equal(exportTitonicAeon(document), before);
});

test('identity-selected containers do not invoke special proxy properties named like bindings', () => {
  const document = from('toJSON\\json\\:object={name:string="json"}\ntarget:object={hasOwnProperty\\own\\:object={name:string="original"}}\ncopy:object=~target');
  const json = resolveTitonicAddress(document, '$.\\json\\').bindings[0]!.value as TitonicObject;
  assert.equal(json, getTitonicValue(document, ['toJSON']));
  assert.equal(json.name, 'json');
  const copy = resolveTitonicAddress(document, '$.copy.\\own\\').bindings[0]!.value as TitonicObject;
  copy.name = 'detached';
  assert.equal(getTitonicValue(document, ['target', 'hasOwnProperty', 'name']), 'original');
  assert.equal(getTitonicValue(document, ['copy', 'hasOwnProperty', 'name']), 'detached');
});

test('source/AES/export round trips preserve selected targets including special numbers', () => {
  const document = from('nan\\nan\\:nan=NaN\ninf\\inf\\:infinity=Infinity\nvalue\\v\\:string="hello"');
  for (const snapshot of [document, createTitonicFromAes(exportTitonicAes(document)), createTitonicFromAeon(exportTitonicAeon(document))]) {
    assert.deepEqual(paths(snapshot, '$.\\nan\\'), ['$.nan']);
    assert.deepEqual(paths(snapshot, '$.\\inf\\'), ['$.inf']);
    assert.deepEqual(paths(snapshot, '$.\\v\\'), ['$.value']);
  }
});

test('new parser value kinds remain explicitly unsupported by the Titonic model', () => {
  assert.throws(() => from('stage:symbol=|ready|'), /does not support SymbolicLiteral/);
});

test('body identities and export preserve explicit header/body planes for aeon-prefixed keys', () => {
  const document = createTitonicFromAeon('aeon:header={x={leaf=1}}\n"aeon:x"\\body\\:string="body"\ncopy=~>["aeon:x"].leaf', { requireStrictMode: false });
  assert.deepEqual(paths(document, '$.\\body\\'), ['$.["aeon:x"]']);
  const body = exportTitonicAes(document).find((event) => event.key === 'aeon:x' && event.sourcePlane === 'body');
  assert.equal(body?.structuralId, 'body');
  const again = compile(exportTitonicAeon(document));
  assert.deepEqual(again.errors, []);
  const reference = again.events.find((event) => event.key === 'copy')!.value;
  assert.equal(reference.type, 'PointerReference');
  if (reference.type !== 'PointerReference') throw new Error('Expected pointer');
  assert.deepEqual(reference.path, ['aeon:x', 'leaf']);
  assert.deepEqual(paths(createTitonicFromAeon(exportTitonicAeon(document), { requireStrictMode: false }), '$.\\body\\'), ['$.["aeon:x"]']);
});

test('identity caller AST cannot inject a selector through filter data', () => {
 const document=from('target\\target\\:object={leaf\\leaf\\:string="x"}');
 for(const type of ['semanticTypeFilter','representationKindFilter'] as const) {
  const base=parseAddressOrThrow('$.\\target\\');
  const address={...base,selectors:[...base.selectors,{type,name:'object.\\leaf\\'}]};
  const result=resolveTitonicAddress(document,address);
  assert.deepEqual(result.bindings,[]);
  assert.equal(result.diagnostics[0]?.code,'SANSA_RESOLVE_INVALID_ADDRESS');
 }
});

test('identity allowance bounds object child enumeration before eager materialization', () => {
 for(const width of [32,128]) {
  const events=compile(`aeon:mode="strict"\n${Array.from({length:width},(_,i)=>`k${i}:number=1`).join('\n')}`).events;
  const document=createTitonicFromAes(events);
  const entries=Map.prototype.entries;
  let yielded=0;
  Map.prototype.entries=function* () {
   for(const pair of entries.call(this)) { if(this.size===width) yielded++; yield pair; }
   return undefined;
  };
  try {
   const result=resolveTitonicAddress(document,'$.\\missing\\',{maxIdentityInspections:1});
   assert.equal(result.diagnostics[0]?.code,'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
   assert.equal(yielded,2);
  } finally {Map.prototype.entries=entries;}
 }
});
