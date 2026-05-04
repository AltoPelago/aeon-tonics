#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root_dir"

node --input-type=module <<'EOF'
import {
  appendBlockquote,
  appendCodeBlock,
  appendExtensionBlock,
  appendHeading,
  appendHorizontalRule,
  createCodeNode,
  createDocumentFragmentNode,
  createLinkNode,
  createStrongNode,
  appendParagraph,
  appendTable,
  appendText,
  getNodeAtPath,
  insertInlineAtPath,
  parseFmtAndDocument,
  replaceNodeAtPath,
  toNdDocument,
  exportFmtAndAes,
  exportFmtAndAeon,
  emitFmtAndCanonical,
  renderFmtAndHtml,
  collectFmtAndDiagnostics,
} from './packages/document/fmt-and-model/dist/index.js';

const source = `&ND v1

# Guide

This is [* deterministic].
`;

const parsed = await parseFmtAndDocument(source);
if (!parsed.ok) {
  throw new Error(`unexpected parse failure: ${parsed.errorCode}`);
}

console.log('== Parsed FmtAndDocument ==');
console.log(JSON.stringify(parsed.document.root, null, 2));
console.log();

const introParagraph = parsed.document.root.children[1];
if (!introParagraph || introParagraph.type !== 'paragraph') {
  throw new Error('expected second block to be a paragraph');
}

insertInlineAtPath(parsed.document, [1, 0], 'Updated: ', { position: 'before' });
appendText(introParagraph, ' It now includes a second sentence added through the live model.');
appendParagraph(parsed.document, 'This paragraph was appended directly to the FmtAndDocument tree.');
appendHeading(parsed.document, 2, 'Notes');
appendBlockquote(parsed.document, 'Quoted guidance added through the helper layer.');
appendExtensionBlock(parsed.document, 'document/meta', 'title = "Guide"', {
  fallback: 'Metadata unavailable.',
});
replaceNodeAtPath(parsed.document, [5, 'fallback'], createDocumentFragmentNode('Metadata unavailable via path helper.'));
appendCodeBlock(parsed.document, 'title = "Guide"', { language: 'aeon', ordered: true });
appendTable(parsed.document, ['Name', 'Value'], [[
  'Guide',
  [createCodeNode('1')],
]]);
appendHorizontalRule(parsed.document);
appendParagraph(parsed.document, [
  'See ',
  createLinkNode('https://example.test', [
    'the ',
    createCodeNode('guide'),
  ]),
  ' and read ',
  createStrongNode('carefully'),
  '.',
]);

console.log('== Mutated FmtAndDocument ==');
console.log(JSON.stringify(parsed.document.root, null, 2));
console.log();

console.log('== Path Lookup Example ==');
console.log(JSON.stringify(getNodeAtPath(parsed.document, [5, 'fallback', 0]), null, 2));
console.log();

console.log('== Bridged NdDocument ==');
console.log(JSON.stringify(toNdDocument(parsed.document), null, 2));
console.log();

console.log('== Exported AES Summary ==');
console.log(JSON.stringify(
  exportFmtAndAes(parsed.document).map((event) => ({
    key: event.key,
    valueType: event.value.type,
  })),
  null,
  2,
));
console.log();

console.log('== Minimized AEON ==');
console.log(exportFmtAndAeon(parsed.document).text);
console.log();

console.log('== Canonical &ND ==');
console.log(await emitFmtAndCanonical(parsed.document, { profile: 'standalone' }));
console.log();

console.log('== HTML ==');
console.log(await renderFmtAndHtml(parsed.document));
console.log();

console.log('== Diagnostics For Invalid Input ==');
console.log(JSON.stringify(
  await collectFmtAndDiagnostics(`&ND v1

Text
---
`),
  null,
  2,
));
EOF
