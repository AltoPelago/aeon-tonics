import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { formatPath } from '../../../../../aeon/implementations/typescript/packages/aes/dist/index.js';
import {
  appendInline,
  appendBlockquote,
  appendCodeBlock,
  appendExtensionBlock,
  appendHeading,
  appendHorizontalRule,
  appendList,
  appendListItem,
  appendParagraph,
  appendTable,
  appendText,
  collectFmtAndDiagnostics,
  createBlockquoteNode,
  createCodeBlockNode,
  createCodeNode,
  createDocumentFragmentNode,
  createEmphasisNode,
  createExtensionBlockNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createListItemNode,
  createLinkNode,
  createParagraphNode,
  createStrongNode,
  createTableCellNode,
  createTableNode,
  createTextNode,
  FmtAndDocument,
  type NdDocument,
  createFmtAndDocumentFromAeon,
  createFmtAndDocumentFromAes,
  createFmtAndDocumentFromNdDocument,
  emitFmtAndCanonical,
  exportFmtAndAeon,
  exportFmtAndAes,
  getNodeAtPath,
  insertBlockAtPath,
  insertInlineAtPath,
  parseFmtAndDocument,
  removeNodeAtPath,
  replaceNodeAtPath,
  replaceInlineChildren,
  renderFmtAndHtml,
  toNdDocument,
} from './index.js';

test('fmt.and model projects strict nd-shaped nodes from aeon', () => {
  const document = createFmtAndDocumentFromAeon(`
doc:node = <document(
  <heading@{level:number=2}("Title")>,
  <paragraph("Hello ", <strong("world")>, <link@{href:string="https://example.test"}("link")>)>,
  <list@{ordered:boolean=false}(
    <list_item(<paragraph("one")>)>,
    <list_item(<paragraph("two")>)>
  )>,
  <extension_block@{name:string="document/meta"}("title = \\"Hello\\"", <document_fragment(<paragraph("Fallback")>)>)>,
  <table(
    <table_header(<table_cell("Name")>,<table_cell("Value")>)>,
    <table_row(<table_cell("A")>,<table_cell(<code("1")>)>)>
  )>
)>
`);

  assert.equal(document.bindingKey, 'doc');
  assert.equal(document.root.children.length, 5);
  assert.deepEqual(document.root.children[0], {
    type: 'heading',
    level: 2,
    children: [{ type: 'text', text: 'Title' }],
  });
  assert.deepEqual(document.root.children[3], {
    type: 'extension_block',
    name: 'document/meta',
    text: 'title = "Hello"',
    fallback: {
      type: 'document_fragment',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Fallback' }],
        },
      ],
    },
  });
});

test('fmt.and model exports edited documents back to aes and minimized aeon', () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Guide' }],
      },
      {
        type: 'code_block',
        ordered: true,
        language: 'aeon',
        text: 'title = "Guide"',
      },
      {
        type: 'extension_block',
        name: 'document/meta',
        text: 'title = "Guide"',
        fallback: {
          type: 'document_fragment',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Metadata unavailable.' }],
            },
          ],
        },
      },
    ],
  }, {
    bindingKey: 'article',
  });

  document.root.children.push({
    type: 'paragraph',
    children: [
      { type: 'text', text: 'Read ' },
      {
        type: 'link',
        href: 'https://example.test',
        children: [{ type: 'text', text: 'more' }],
      },
      { type: 'text', text: '.' },
    ],
  });

  const exportedEvents = exportFmtAndAes(document).map((event) => ({ path: formatPath(event.path), type: event.value.type }));
  assert.deepEqual(exportedEvents[0], { path: '$.article', type: 'NodeLiteral' });
  assert.ok(exportedEvents.some((event) => event.path === '$.article[3][1]' && event.type === 'NodeLiteral'));
  assert.equal(
    exportFmtAndAeon(document).text,
    'article:node=<document(<heading@{level:number=1}("Guide")>,<code_block@{ordered:boolean=true,language:string="aeon"}("title = \\"Guide\\"")>,<extension_block@{name:string="document/meta"}("title = \\"Guide\\"",<document_fragment(<paragraph("Metadata unavailable.")>)>)>,<paragraph("Read ",<link@{href:string="https://example.test"}("more")>,".")>)>',
  );
});

test('fmt.and model editing helpers support common block and inline edits', () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [],
  });

  appendHeading(document, 2, 'Guide');

  const intro = appendParagraph(document, 'Intro');
  appendText(intro, ' extended.');

  const list = appendList(document, { ordered: false });
  appendListItem(list, 'One');
  appendListItem(list, [
    createParagraphNode([
      createTextNode('Two '),
      {
        type: 'strong',
        children: [createTextNode('items')],
      },
    ]),
  ]);

  const quoteItem = createListItemNode('Quoted');
  const quoteParagraph = quoteItem.children[0];
  assert(quoteParagraph);
  assert.equal(quoteParagraph.type, 'paragraph');
  replaceInlineChildren(quoteParagraph, 'Updated');
  list.children.push(quoteItem);

  const quote = appendBlockquote(document, [
    createParagraphNode('Quoted block'),
  ]);
  appendParagraph(quote, 'Nested note');

  appendExtensionBlock(document, 'document/meta', 'title = "Guide"', {
    fallback: [
      createParagraphNode('Metadata unavailable.'),
    ],
  });
  appendCodeBlock(document, 'title = "Guide"', { language: 'aeon', ordered: true });
  appendTable(document, ['Name', 'Value'], [[
    'Guide',
    [createCodeNode('1')],
  ]]);
  appendHorizontalRule(document);

  assert.deepEqual(document.root, {
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 2,
        children: [{ type: 'text', text: 'Guide' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Intro' },
          { type: 'text', text: ' extended.' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        children: [
          {
            type: 'list_item',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'One' }],
              },
            ],
          },
          {
            type: 'list_item',
            children: [
              {
                type: 'paragraph',
                children: [
                  { type: 'text', text: 'Two ' },
                  {
                    type: 'strong',
                    children: [{ type: 'text', text: 'items' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'list_item',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Updated' }],
              },
            ],
          },
        ],
      },
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Quoted block' }],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Nested note' }],
          },
        ],
      },
      {
        type: 'extension_block',
        name: 'document/meta',
        text: 'title = "Guide"',
        fallback: {
          type: 'document_fragment',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Metadata unavailable.' }],
            },
          ],
        },
      },
      {
        type: 'code_block',
        ordered: true,
        language: 'aeon',
        text: 'title = "Guide"',
      },
      {
        type: 'table',
        header: [
          { children: [{ type: 'text', text: 'Name' }] },
          { children: [{ type: 'text', text: 'Value' }] },
        ],
        rows: [
          [
            { children: [{ type: 'text', text: 'Guide' }] },
            { children: [{ type: 'code', text: '1' }] },
          ],
        ],
      },
      {
        type: 'horizontal_rule',
      },
    ],
  });
});

test('fmt.and model structured constructors create richer block nodes', () => {
  assert.deepEqual(createHeadingNode(3, 'Section'), {
    type: 'heading',
    level: 3,
    children: [{ type: 'text', text: 'Section' }],
  });

  assert.deepEqual(createBlockquoteNode('Quoted'), {
    type: 'blockquote',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Quoted' }],
      },
    ],
  });

  assert.deepEqual(
    createExtensionBlockNode('media/image.v1', 'src = "./swan.png"', {
      fallback: createDocumentFragmentNode('Image unavailable.'),
    }),
    {
      type: 'extension_block',
      name: 'media/image.v1',
      text: 'src = "./swan.png"',
      fallback: {
        type: 'document_fragment',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Image unavailable.' }],
          },
        ],
      },
    },
  );

  assert.deepEqual(createCodeBlockNode('payload', { language: 'aeon', ordered: true }), {
    type: 'code_block',
    text: 'payload',
    language: 'aeon',
    ordered: true,
  });

  assert.deepEqual(
    createTableNode(['Name', 'Value'], [[
      'Guide',
      [createCodeNode('1')],
    ]]),
    {
      type: 'table',
      header: [
        { children: [{ type: 'text', text: 'Name' }] },
        { children: [{ type: 'text', text: 'Value' }] },
      ],
      rows: [
        [
          { children: [{ type: 'text', text: 'Guide' }] },
          { children: [{ type: 'code', text: '1' }] },
        ],
      ],
    },
  );

  assert.deepEqual(createTableCellNode('Cell'), {
    children: [{ type: 'text', text: 'Cell' }],
  });

  assert.deepEqual(createHorizontalRuleNode(), {
    type: 'horizontal_rule',
  });
});

test('fmt.and model inline helpers support mixed inline composition', () => {
  const paragraph = createParagraphNode([
    'Read ',
    createStrongNode('carefully'),
    ' and ',
    createEmphasisNode('slowly'),
    '. See ',
    createLinkNode('https://example.test', [
      'the ',
      createCodeNode('guide'),
    ]),
    '.',
  ]);

  appendInline(paragraph, ' Thanks.');

  assert.deepEqual(paragraph, {
    type: 'paragraph',
    children: [
      { type: 'text', text: 'Read ' },
      {
        type: 'strong',
        children: [{ type: 'text', text: 'carefully' }],
      },
      { type: 'text', text: ' and ' },
      {
        type: 'emphasis',
        children: [{ type: 'text', text: 'slowly' }],
      },
      { type: 'text', text: '. See ' },
      {
        type: 'link',
        href: 'https://example.test',
        children: [
          { type: 'text', text: 'the ' },
          { type: 'code', text: 'guide' },
        ],
      },
      { type: 'text', text: '.' },
      { type: 'text', text: ' Thanks.' },
    ],
  });
});

test('fmt.and model path helpers can read and mutate nested structures', () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [
      createHeadingNode(1, 'Guide'),
      createParagraphNode([
        'See ',
        createLinkNode('https://example.test', [
          'the ',
          createCodeNode('guide'),
        ]),
        '.',
      ]),
      createExtensionBlockNode('document/meta', 'title = "Guide"', {
        fallback: 'Metadata unavailable.',
      }),
      createTableNode(['Name', 'Value'], [[
        'Guide',
        [createCodeNode('1')],
      ]]),
    ],
  });

  assert.deepEqual(getNodeAtPath(document, [0]), createHeadingNode(1, 'Guide'));
  assert.deepEqual(getNodeAtPath(document, [1, 1]), createLinkNode('https://example.test', [
    'the ',
    createCodeNode('guide'),
  ]));
  assert.deepEqual(getNodeAtPath(document, [2, 'fallback']), createDocumentFragmentNode('Metadata unavailable.'));
  assert.deepEqual(getNodeAtPath(document, [3, 'rows', 0, 1, 0]), createCodeNode('1'));

  replaceNodeAtPath(document, [1, 1, 1], createStrongNode('manual'));
  replaceNodeAtPath(document, [2, 'fallback'], createDocumentFragmentNode('Metadata changed.'));
  insertBlockAtPath(document, [2], createHorizontalRuleNode(), { position: 'before' });
  insertInlineAtPath(document, [1, 0], 'Updated: ', { position: 'before' });
  removeNodeAtPath(document, [4, 'header', 1]);

  assert.deepEqual(document.root, {
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Guide' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Updated: ' },
          { type: 'text', text: 'See ' },
          {
            type: 'link',
            href: 'https://example.test',
            children: [
              { type: 'text', text: 'the ' },
              { type: 'strong', children: [{ type: 'text', text: 'manual' }] },
            ],
          },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'horizontal_rule',
      },
      {
        type: 'extension_block',
        name: 'document/meta',
        text: 'title = "Guide"',
        fallback: {
          type: 'document_fragment',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'Metadata changed.' }],
            },
          ],
        },
      },
      {
        type: 'table',
        header: [
          { children: [{ type: 'text', text: 'Name' }] },
        ],
        rows: [
          [
            { children: [{ type: 'text', text: 'Guide' }] },
            { children: [{ type: 'code', text: '1' }] },
          ],
        ],
      },
    ],
  });
});

test('fmt.and model can project directly from aes', () => {
  const compiled = compile('doc:node = <document(<blockquote(<paragraph("ok")>)>)>', {
    datatypePolicy: 'allow_custom',
  });
  assert.equal(compiled.errors.length, 0);

  const document = createFmtAndDocumentFromAes(compiled.events);
  assert.deepEqual(document.root, {
    type: 'document',
    children: [
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'ok' }],
          },
        ],
      },
    ],
  });
});

test('fmt.and model bridges from nd ast shape into fmt.and and back', () => {
  const ndDocument: NdDocument = {
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', value: 'Guide' }],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          {
            type: 'list_item',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', value: 'One' }],
              },
            ],
          },
        ],
      },
      {
        type: 'code_block',
        language: null,
        ordered: false,
        text: 'payload',
      },
      {
        type: 'extension_block',
        name: 'document/meta',
        text: 'title = "Guide"',
        fallback: {
          type: 'document_fragment',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: 'Fallback' }],
            },
          ],
        },
      },
      {
        type: 'table',
        header: [
          { children: [{ type: 'text', value: 'Name' }] },
          { children: [{ type: 'text', value: 'Value' }] },
        ],
        rows: [
          [
            { children: [{ type: 'text', value: 'A' }] },
            { children: [{ type: 'code', text: '1' }] },
          ],
        ],
      },
    ],
  };

  const document = createFmtAndDocumentFromNdDocument(ndDocument, { rootKey: 'doc' });
  assert.equal(document.bindingKey, 'doc');
  assert.deepEqual(document.root.children[1], {
    type: 'list',
    ordered: true,
    children: [
      {
        type: 'list_item',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'One' }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(toNdDocument(document), ndDocument);
});

test('fmt.and model can parse nd text through and-core bridge', async () => {
  const result = await parseFmtAndDocument(`&ND v1

# Guide

This is [* deterministic].
`);

  assert(result.ok);

  assert.deepEqual(result.document.root, {
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Guide' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'This is ' },
          {
            type: 'strong',
            children: [{ type: 'text', text: 'deterministic' }],
          },
          { type: 'text', text: '.' },
        ],
      },
    ],
  });
});

test('fmt.and model surfaces strict parse failures from and-core bridge', async () => {
  const result = await parseFmtAndDocument(`&ND v1

Text
---
`);

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail('expected parse failure');
  }

  assert.equal(result.errorCode, 'block_opener_on_paragraph_continuation');
});

test('fmt.and model can emit canonical nd text through and-core bridge', async () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Guide' }],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Hello world.' }],
      },
    ],
  });

  const text = await emitFmtAndCanonical(document, { profile: 'standalone' });
  assert.equal(text, '&ND v1\n\n# Guide\n\nHello world.\n');
});

test('fmt.and model can render html through and-core bridge', async () => {
  const document = new FmtAndDocument({
    type: 'document',
    children: [
      {
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Guide' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Visit ' },
          {
            type: 'link',
            href: 'https://example.test',
            children: [{ type: 'text', text: 'docs' }],
          },
          { type: 'text', text: '.' },
        ],
      },
    ],
  });

  const html = await renderFmtAndHtml(document);
  assert.equal(
    html,
    '<h1>Guide</h1>\n<p>Visit <a href="https://example.test" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer">docs</a>.</p>',
  );
});

test('fmt.and model can collect diagnostics through and-core bridge', async () => {
  const diagnostics = await collectFmtAndDiagnostics(`&ND v1

Text
---
`);

  assert.equal(diagnostics.ok, false);
  assert.equal(diagnostics.diagnostics.length, 1);
  assert.equal(diagnostics.diagnostics[0]?.code, 'block_opener_on_paragraph_continuation');
  assert.equal(diagnostics.diagnostics[0]?.source, 'and-core');
});

test('fmt.and model rejects unsupported nodes and invalid attributes', () => {
  assert.throws(
    () => createFmtAndDocumentFromAeon('doc:node = <document(<script("bad")>)>'),
    /unsupported block node/,
  );
  assert.throws(
    () => createFmtAndDocumentFromAeon('doc:node = <document(<heading@{level:number=7}("bad")>)>'),
    /heading requires level:number from 1 to 6/,
  );
  assert.throws(
    () => createFmtAndDocumentFromAeon('doc:node = <document(<extension_block("bad")>)>'),
    /requires name:string/,
  );
});
