import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  formatAeonSearchPaths,
  searchAeonFiles,
  searchAesEvents,
} from './index.js';

test('formatAeonSearchPaths emits unique sorted path lists', () => {
  const text = formatAeonSearchPaths({
    format: 'aeon.search',
    version: 1,
    matches: [
      { file: 'a.aeon', path: '$.b', kind: 'string' },
      { file: 'a.aeon', path: '$.a', kind: 'string' },
      { file: 'b.aeon', path: '$.b', kind: 'string' },
    ],
    diagnostics: [],
  });

  assert.equal(text, '$.a\n$.b\n');
});

test('searchAesEvents supports downstream path extraction workflows', () => {
  const compiled = compile([
    'app:object = {',
    '  theme:string = "dark"',
    '  status:string = "draft"',
    '}',
    'other:string = "x"',
  ].join('\n'), { maxAttributeDepth: 2 });

  assert.equal(compiled.errors.length, 0);

  const matches = searchAesEvents(compiled.events, { pathPrefix: '$.app' }, { file: 'doc.aeon' });

  assert.deepEqual(matches.map((match) => match.path), ['$.app', '$.app.theme', '$.app.status']);
});

test('searchAesEvents exposes portable node-head and content paths', () => {
  const compiled = compile('view:node = <panel:node("hello", <br:node>)>', { maxAttributeDepth: 2 });
  assert.equal(compiled.errors.length, 0);

  const matches = searchAesEvents(compiled.events, { pathPrefix: '$.view' }, { file: 'doc.aeon' });

  assert.deepEqual(matches.map((match) => [match.path, match.kind]), [
    ['$.view', 'node'],
    ['$.view[0]', 'node-head'],
    ['$.view[0][0]', 'string'],
    ['$.view[0][1]', 'node'],
    ['$.view[0][1][0]', 'node-head'],
  ]);
});

test('searchAeonFiles emits portable paths for diagnostics inside node content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  await writeFile(join(dir, 'broken.aeon'), 'view:node = <panel:node(~missing)>', 'utf8');

  const result = await searchAeonFiles([dir], {});

  assert.equal(result.diagnostics[0]?.path, '$.view[0][0]');
  assert.equal(result.diagnostics[0]?.targetPath, '$.missing');
});
