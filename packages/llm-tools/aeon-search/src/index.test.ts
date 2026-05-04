import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import {
  formatAeonSearchPaths,
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
