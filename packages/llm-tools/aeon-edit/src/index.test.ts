import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAeonEditBatch,
  appendAeonEditValue,
  deleteAeonEditAttribute,
  deleteAeonEditAttributeAnnotation,
  deleteAeonEditNodeAttribute,
  deleteAeonEditNodeAttributeAnnotation,
  deleteAeonEditValue,
  exportAeonEditAes,
  exportAeonEditTelex,
  getAeonEditAttribute,
  getAeonEditAttributeAnnotation,
  getAeonEditNodeAttribute,
  getAeonEditNodeAttributeAnnotation,
  getAeonEditValue,
  inspectAeonEditPath,
  insertAeonEditValue,
  listAeonEditPaths,
  parseAeonEditPath,
  planAeonEditAttributeAnnotationSet,
  planAeonEditAttributeSet,
  planAeonEditNodeAttributeAnnotationSet,
  planAeonEditNodeAttributeSet,
  planAeonEditSet,
  preflightAeonEditBatch,
  setAeonEditAttribute,
  setAeonEditAttributeAnnotation,
  setAeonEditNodeAttribute,
  setAeonEditNodeAttributeAnnotation,
  setAeonEditValue,
} from './index.js';

const source = [
  'aeon:mode = "strict"',
  'app:object = {',
  '  name:string = "Aeon"',
  '  count:number = 1',
  '}',
  'items:list = [1, 2]',
].join('\n');

test('parses CLI paths into Titonic path segments', () => {
  assert.deepEqual(parseAeonEditPath('$.app.name'), ['app', 'name']);
  assert.deepEqual(parseAeonEditPath('$.items[1]'), ['items', 1]);
  assert.deepEqual(parseAeonEditPath('$."quoted key"'), ['quoted key']);
});

test('gets values through Titonic', () => {
  const result = getAeonEditValue(source, '$.app.name');

  assert.deepEqual(result, {
    ok: true,
    command: 'get',
    path: '$.app.name',
    value: 'Aeon',
  });
});

test('sets values from AEON snippets and exports edited AEON', () => {
  const result = setAeonEditValue(source, '$.app.count', '2');

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.match(result.output?.text ?? '', /count:number=2/);
});

test('preserves structural identities while editing values', () => {
  const identifiedSource = String.raw`aeon:mode = "strict"
app\APP\:object = { count\COUNT\:number = 1 }
view\VIEW\:node = <panel\HEAD\>`;
  const result = setAeonEditValue(identifiedSource, '$.app.count', '2');
  const output = result.output?.text ?? '';

  assert.match(output, /app\\APP\\:object/);
  assert.match(output, /count\\COUNT\\:number=2/);
  assert.match(output, /view\\VIEW\\:node=<panel\\HEAD\\>/);
});

test('deletes values and exports edited AEON', () => {
  const result = deleteAeonEditValue(source, '$.app.name');

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.doesNotMatch(result.output?.text ?? '', /name:string/);
});

test('appends values to lists and exports edited AEON', () => {
  const result = appendAeonEditValue(source, '$.items', '3');

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.match(result.output?.text ?? '', /items:list=\[1,2,3\]/);
});

test('inserts values into lists and exports edited AEON', () => {
  const result = insertAeonEditValue(source, '$.items[1]', '9');

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.match(result.output?.text ?? '', /items:list=\[1,9,2\]/);
});

test('applies batch operations in one document mutation cycle', () => {
  const result = applyAeonEditBatch([
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '  count:number = 1',
    '}',
    'items:list = [1]',
    'view:node = <panel@{id:string="hero"}:node>',
  ].join('\n'), [
    { command: 'set', path: '$.app.count', value: '2' },
    { command: 'append', path: '$.items', value: '3' },
    { command: 'attr.set', path: '$.app', key: 'owner', value: '"tools"' },
    { command: 'node-attr.set', path: '$.view', key: 'id', value: '"main"' },
  ]);
  const operationResults = result.value as readonly { readonly changed: boolean }[];

  assert.equal(result.changed, true);
  assert.equal(operationResults.every((operation) => operation.changed), true);
  assert.match(result.output?.text ?? '', /count:number=2/);
  assert.match(result.output?.text ?? '', /items:list=\[1,3\]/);
  assert.match(result.output?.text ?? '', /owner:string="tools"/);
  assert.match(result.output?.text ?? '', /id:string="main"/);
});

test('preflights batch operations before mutation', () => {
  const result = preflightAeonEditBatch(source, [
    { command: 'set', path: '$.missing', value: '2' },
    { command: 'append', path: '$.app', value: '3' },
    { command: 'delete', path: '$.alreadyMissing' },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    'PATH_NOT_FOUND',
    'TARGET_NOT_LIST',
    'DELETE_NOOP',
  ]);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.severity), [
    'error',
    'error',
    'warning',
  ]);
});

test('batch reports warning-only no-op deletes without failing preflight', () => {
  const result = applyAeonEditBatch(source, [
    { command: 'delete', path: '$.missing' },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.preflight?.ok, true);
  assert.equal(result.preflight?.diagnostics[0]?.code, 'DELETE_NOOP');
  assert.equal((result.value as readonly { readonly changed: boolean }[])[0]?.changed, false);
});

test('batch optimistic value guards block stale edits', () => {
  const result = applyAeonEditBatch(source, [
    { command: 'set', path: '$.app.count', value: '2', expect: '3' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.preflight?.diagnostics[0]?.code, 'EXPECTATION_MISMATCH');
  assert.equal(result.output, undefined);
});

test('batch optimistic metadata guards allow matching edits', () => {
  const withMetadata = [
    'aeon:mode = "strict"',
    'app@{owner@{source:string="seed"}:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');
  const result = applyAeonEditBatch(withMetadata, [
    {
      command: 'attr-annotation.set',
      path: '$.app',
      key: 'owner',
      annotationKey: 'source',
      value: '"ui"',
      expectAttribute: '"core"',
      expectAnnotation: '"seed"',
    },
  ]);

  assert.equal(result.ok, true);
  assert.match(result.output?.text ?? '', /source:string="ui"/);
});

test('batch optimistic metadata guards block stale metadata edits', () => {
  const withMetadata = [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');
  const result = applyAeonEditBatch(withMetadata, [
    { command: 'attr.set', path: '$.app', key: 'owner', value: '"tools"', expectAttribute: '"wrong"' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.preflight?.diagnostics[0]?.code, 'EXPECTATION_MISMATCH');
});

test('plans guarded set operations from current document values', () => {
  const result = planAeonEditSet(source, '$.app.count', '2');
  const plan = result.value as { readonly operations: readonly { readonly command: string; readonly expect?: string; readonly value?: string }[] };

  assert.equal(result.ok, true);
  assert.equal(plan.operations[0]?.command, 'set');
  assert.equal(plan.operations[0]?.expect, '1');
  assert.equal(plan.operations[0]?.value, '2');
});

test('plans guarded binding attribute set operations', () => {
  const withMetadata = [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');
  const result = planAeonEditAttributeSet(withMetadata, '$.app', 'owner', '"tools"');
  const plan = result.value as { readonly operations: readonly { readonly command: string; readonly expectAttribute?: string; readonly value?: string }[] };

  assert.equal(plan.operations[0]?.command, 'attr.set');
  assert.equal(plan.operations[0]?.expectAttribute, '"core"');
  assert.equal(plan.operations[0]?.value, '"tools"');
});

test('plans guarded node attribute set operations', () => {
  const withNode = [
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string="hero"}:node>',
  ].join('\n');
  const result = planAeonEditNodeAttributeSet(withNode, '$.view', 'id', '"main"');
  const plan = result.value as { readonly operations: readonly { readonly command: string; readonly expectAttribute?: string; readonly value?: string }[] };

  assert.equal(plan.operations[0]?.command, 'node-attr.set');
  assert.equal(plan.operations[0]?.expectAttribute, '"hero"');
  assert.equal(plan.operations[0]?.value, '"main"');
});

test('plans guarded binding attribute annotation set operations', () => {
  const withMetadata = [
    'aeon:mode = "strict"',
    'app@{owner@{source:string="seed"}:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');
  const result = planAeonEditAttributeAnnotationSet(withMetadata, '$.app', 'owner', 'source', '"ui"');
  const plan = result.value as { readonly operations: readonly { readonly command: string; readonly expectAttribute?: string; readonly expectAnnotation?: string; readonly value?: string }[] };

  assert.equal(plan.operations[0]?.command, 'attr-annotation.set');
  assert.equal(plan.operations[0]?.expectAttribute, '"core"');
  assert.equal(plan.operations[0]?.expectAnnotation, '"seed"');
  assert.equal(plan.operations[0]?.value, '"ui"');
});

test('plans guarded node attribute annotation set operations', () => {
  const withNode = [
    'aeon:mode = "strict"',
    'view:node = <panel@{id@{source:string="seed"}:string="hero"}:node>',
  ].join('\n');
  const result = planAeonEditNodeAttributeAnnotationSet(withNode, '$.view', 'id', 'source', '"ui"');
  const plan = result.value as { readonly operations: readonly { readonly command: string; readonly expectAttribute?: string; readonly expectAnnotation?: string; readonly value?: string }[] };

  assert.equal(plan.operations[0]?.command, 'node-attr-annotation.set');
  assert.equal(plan.operations[0]?.expectAttribute, '"hero"');
  assert.equal(plan.operations[0]?.expectAnnotation, '"seed"');
  assert.equal(plan.operations[0]?.value, '"ui"');
});

test('exports AES events', () => {
  const result = exportAeonEditAes(source);
  const events = result.output?.events as readonly unknown[];

  assert.equal(result.ok, true);
  assert.equal(result.output?.format, 'aes');
  assert.equal(events.length > 0, true);
});

test('exports complete portable Telex with headers opt-in', () => {
  const body = exportAeonEditTelex(source);
  const document = exportAeonEditTelex(source, true);

  assert.equal(body.output?.format, 'telex');
  assert.match(body.output?.text ?? '', /^telex\.aes=0$/m);
  assert.match(body.output?.text ?? '', /path=\$\.app/m);
  assert.doesNotMatch(body.output?.text ?? '', /^header=/m);
  assert.match(document.output?.text ?? '', /^projection=aeon\.document\.v0$/m);
  assert.match(document.output?.text ?? '', /^header=\$\.\["aeon:mode"\]$/m);
});

test('inspects a path with value and metadata summary', () => {
  const withMetadata = [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');

  const result = inspectAeonEditPath(withMetadata, '$.app');
  const inspection = result.value as {
    readonly kind: string;
    readonly datatype?: string;
    readonly attributes: readonly { readonly key: string }[];
    readonly children: readonly string[];
  };

  assert.equal(inspection.kind, 'object');
  assert.equal(inspection.datatype, 'object');
  assert.deepEqual(inspection.attributes.map((attribute) => attribute.key), ['owner']);
  assert.deepEqual(inspection.children, ['$.app.name']);
});

test('lists reusable edit paths including node children', () => {
  const withNode = [
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string="hero"}:node("hello", <br:node>)>',
  ].join('\n');

  const result = listAeonEditPaths(withNode);
  const entries = result.value as readonly {
    readonly path: string;
    readonly kind: string;
    readonly nodeAttributes?: readonly string[];
  }[];

  assert.equal(entries.some((entry) => entry.path === '$.view' && entry.nodeAttributes?.includes('id')), true);
  assert.equal(entries.some((entry) => entry.path === '$.view.children[0]' && entry.kind === 'string'), true);
  assert.equal(entries.some((entry) => entry.path === '$.view.children[1]' && entry.kind === 'node'), true);
});

test('gets, sets, and deletes binding attributes', () => {
  const withAttribute = [
    'aeon:mode = "strict"',
    'app@{owner:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');

  const read = getAeonEditAttribute(withAttribute, '$.app', 'owner');
  assert.equal((read.value as { readonly value?: { readonly value?: string } }).value?.value, 'core');

  const set = setAeonEditAttribute(withAttribute, '$.app', 'owner', '"tools"');
  assert.match(set.output?.text ?? '', /owner:string="tools"/);

  const deleted = deleteAeonEditAttribute(withAttribute, '$.app', 'owner');
  assert.equal(deleted.changed, true);
  assert.doesNotMatch(deleted.output?.text ?? '', /owner:string/);
});

test('gets, sets, and deletes nested binding attribute annotations', () => {
  const withAnnotation = [
    'aeon:mode = "strict"',
    'app@{owner@{source:string="seed"}:string="core"}:object = {',
    '  name:string = "Aeon"',
    '}',
  ].join('\n');

  const read = getAeonEditAttributeAnnotation(withAnnotation, '$.app', 'owner', 'source');
  assert.equal((read.value as { readonly value?: { readonly value?: string } }).value?.value, 'seed');

  const set = setAeonEditAttributeAnnotation(withAnnotation, '$.app', 'owner', 'source', '"ui"');
  assert.match(set.output?.text ?? '', /source:string="ui"/);

  const deleted = deleteAeonEditAttributeAnnotation(withAnnotation, '$.app', 'owner', 'source');
  assert.equal(deleted.changed, true);
  assert.doesNotMatch(deleted.output?.text ?? '', /source:string/);
});

test('gets, sets, and deletes node-head attributes', () => {
  const withNodeAttribute = [
    'aeon:mode = "strict"',
    'view:node = <panel@{id:string="hero"}:node>',
  ].join('\n');

  const read = getAeonEditNodeAttribute(withNodeAttribute, '$.view', 'id');
  assert.equal((read.value as { readonly value?: { readonly value?: string } }).value?.value, 'hero');

  const set = setAeonEditNodeAttribute(withNodeAttribute, '$.view', 'id', '"main"');
  assert.match(set.output?.text ?? '', /id:string="main"/);

  const deleted = deleteAeonEditNodeAttribute(withNodeAttribute, '$.view', 'id');
  assert.equal(deleted.changed, true);
  assert.doesNotMatch(deleted.output?.text ?? '', /id:string/);
});

test('gets, sets, and deletes nested node-head attribute annotations', () => {
  const withNodeAnnotation = [
    'aeon:mode = "strict"',
    'view:node = <panel@{id@{source:string="seed"}:string="hero"}:node>',
  ].join('\n');

  const read = getAeonEditNodeAttributeAnnotation(withNodeAnnotation, '$.view', 'id', 'source');
  assert.equal((read.value as { readonly value?: { readonly value?: string } }).value?.value, 'seed');

  const set = setAeonEditNodeAttributeAnnotation(withNodeAnnotation, '$.view', 'id', 'source', '"ui"');
  assert.match(set.output?.text ?? '', /source:string="ui"/);

  const deleted = deleteAeonEditNodeAttributeAnnotation(withNodeAnnotation, '$.view', 'id', 'source');
  assert.equal(deleted.changed, true);
  assert.doesNotMatch(deleted.output?.text ?? '', /source:string/);
});
