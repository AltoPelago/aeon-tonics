import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  formatAeonSearchPaths,
  formatAeonSearchText,
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

test('searchAesEvents uses intrinsic tags and direct portable descendant paths', () => {
  const compiled = compile('<"panel  title"@{<badge>}:node("hello", <br>, <br>)>', { maxAttributeDepth: 2 });
  assert.deepEqual(compiled.errors, []);

  const path = '$.["panel  title"]';
  const matches = searchAesEvents(compiled.events, { pathPrefix: path }, { file: 'doc.aeon' });

  assert.deepEqual(matches.map(({path, kind, tag, preview}) => [path, kind, tag, preview]), [
    [path, 'node', 'panel  title', '<"panel  title">'],
    [`${path}.@.badge`, 'node', 'badge', '<badge>'],
    [`${path}[0]`, 'string', undefined, '"hello"'],
    [`${path}[1]`, 'node', 'br', '<br>'],
    [`${path}[2]`, 'node', 'br', '<br>'],
  ]);
  assert.deepEqual(searchAesEvents(compiled.events, { kind: 'node', value: '<br>' }).map(match => match.path), [
    `${path}[1]`,
    `${path}[2]`,
  ]);
  const display = formatAeonSearchText({format: 'aeon.search', version: 1, matches, diagnostics: []});
  assert.ok(display.includes('doc.aeon $.["panel  title"] node :node = <"panel  title">'));
});

test('searchAeonFiles keeps compiler paths for diagnostics inside a node', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-search-'));
  await writeFile(join(dir, 'broken.aeon'), '<panel(~missing)>', 'utf8');

  const result = await searchAeonFiles([dir], {});

  assert.equal(result.diagnostics[0]?.path, '$.panel[0]');
  assert.equal(result.diagnostics[0]?.targetPath, '$.missing');
  assert.match(result.diagnostics[0]?.message ?? '', /\$\.missing/u);
});
