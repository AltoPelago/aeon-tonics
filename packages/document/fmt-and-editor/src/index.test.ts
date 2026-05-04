import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FmtAndDocument,
  createCodeNode,
  createExtensionBlockNode,
  createParagraphNode,
  createStrongNode,
} from '../../fmt-and-model/dist/index.js';
import {
  clearExtensionFallback,
  insertHeadingBefore,
  insertHeadingAfter,
  insertParagraphBefore,
  insertParagraphAfter,
  removeBlockAtPath,
  removeInlineAtPath,
  replaceHeadingText,
  replaceParagraphText,
  setExtensionFallback,
  unwrapBlockquote,
  wrapBlockInBlockquote,
} from './index.js';

test('fmt.and editor supports common higher-level block edits', () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [
      createParagraphNode('Intro'),
      createParagraphNode('Body'),
      createExtensionBlockNode('document/meta', 'title = "Guide"', {
        fallback: 'Metadata unavailable.',
      }),
    ],
  });

  replaceParagraphText(document, [1], [
    'Body ',
    createStrongNode('updated'),
    '.',
  ]);
  insertParagraphBefore(document, [1], 'Lead-in');
  insertParagraphAfter(document, [2], 'After body');
  insertHeadingAfter(document, [3], 2, 'Notes');
  insertHeadingBefore(document, [4], 3, 'Preface');
  replaceHeadingText(document, [5], 'Notes updated');
  wrapBlockInBlockquote(document, [3]);
  unwrapBlockquote(document, [3]);
  setExtensionFallback(document, [6], [
    createParagraphNode(['New ', createCodeNode('fallback')]),
  ]);
  removeInlineAtPath(document, [2, 2]);
  clearExtensionFallback(document, [6]);
  removeBlockAtPath(document, [1]);

  assert.deepEqual(document.root, {
    type: 'document',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Intro' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Body ' },
          { type: 'strong', children: [{ type: 'text', text: 'updated' }] },
        ],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'After body' }],
      },
      {
        type: 'heading',
        level: 3,
        children: [{ type: 'text', text: 'Preface' }],
      },
      {
        type: 'heading',
        level: 2,
        children: [{ type: 'text', text: 'Notes updated' }],
      },
      {
        type: 'extension_block',
        name: 'document/meta',
        text: 'title = "Guide"',
      },
    ],
  });
});

test('fmt.and editor guards node-kind assumptions', () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [
      createParagraphNode('Intro'),
    ],
  });

  assert.throws(
    () => setExtensionFallback(document, [0], 'bad'),
    /expected extension_block/,
  );
  assert.throws(
    () => replaceParagraphText(document, [], 'bad'),
    /expected paragraph/,
  );
  assert.throws(
    () => unwrapBlockquote(document, [0]),
    /expected blockquote/,
  );
  assert.throws(
    () => removeInlineAtPath(document, [0]),
    /expected inline node/,
  );
});
