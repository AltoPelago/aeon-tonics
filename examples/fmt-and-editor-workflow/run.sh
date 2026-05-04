#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root_dir"

node --input-type=module <<'EOF'
import {
  FmtAndDocument,
  createExtensionBlockNode,
  createParagraphNode,
  createStrongNode,
  emitFmtAndCanonical,
  renderFmtAndHtml,
} from './packages/document/fmt-and-model/dist/index.js';
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
} from './packages/document/fmt-and-editor/dist/index.js';

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

console.log('== Initial FmtAndDocument ==');
console.log(JSON.stringify(document.root, null, 2));
console.log();

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
wrapBlockInBlockquote(document, [4]);
unwrapBlockquote(document, [4]);
setExtensionFallback(document, [6], 'Metadata changed through fmt-and-editor.');
removeInlineAtPath(document, [2, 2]);
clearExtensionFallback(document, [6]);
removeBlockAtPath(document, [1]);

console.log('== Edited FmtAndDocument ==');
console.log(JSON.stringify(document.root, null, 2));
console.log();

console.log('== Canonical &ND ==');
console.log(await emitFmtAndCanonical(document, { profile: 'standalone' }));
console.log();

console.log('== HTML ==');
console.log(await renderFmtAndHtml(document));
EOF
