import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../../../../aeon/implementations/typescript/packages/core/dist/index.js';
import { emitFmtAndCanonical } from '../../../document/fmt-and-model/dist/index.js';
import {
  extractFmtAndAnnotationText,
  parseFmtAndAnnotationPayload,
  parseFmtAndAnnotationPayloads,
} from './index.js';

test('parses core annotation records into fmt.and payloads', async () => {
  const result = compile('//# # Title\nname:string = "Aeon" //? [* required]');
  const parsed = await parseFmtAndAnnotationPayloads(result.annotations ?? []);

  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.payloads.length, 2);
  assert.equal(parsed.payloads[0]?.record.kind, 'doc');
  assert.equal(parsed.payloads[0]?.text, '# Title');
  assert.equal(
    await emitFmtAndCanonical(parsed.payloads[0]!.document, { profile: 'embedded' }),
    '# Title\n',
  );
  assert.equal(parsed.payloads[1]?.record.kind, 'hint');
  assert.equal(
    await emitFmtAndCanonical(parsed.payloads[1]!.document, { profile: 'embedded' }),
    '[* required]\n',
  );
});

test('can filter annotation kinds', async () => {
  const result = compile('//# # Docs\nvalue:number = 1 //? [* hint]');
  const parsed = await parseFmtAndAnnotationPayloads(result.annotations ?? [], {
    includeKinds: ['doc'],
  });

  assert.equal(parsed.payloads.length, 1);
  assert.equal(parsed.payloads[0]?.record.kind, 'doc');
});

test('strips line and block annotation delimiters', () => {
  assert.equal(
    extractFmtAndAnnotationText({ form: 'line', raw: '//@ [* meta]' }),
    '[* meta]',
  );
  assert.equal(
    extractFmtAndAnnotationText({ form: 'block', raw: '/#\n# Block\n\nText\n#/' }),
    '# Block\n\nText',
  );
});

test('parses a single payload and preserves the source record', async () => {
  const result = compile('/# paragraph #/\nname:string = "Aeon"');
  const record = result.annotations?.[0];

  assert.ok(record);
  const payload = await parseFmtAndAnnotationPayload(record);

  assert.equal(payload.record, record);
  assert.equal(payload.text, 'paragraph');
  assert.equal(
    await emitFmtAndCanonical(payload.document, { profile: 'embedded' }),
    'paragraph\n',
  );
});

test('collects issues for invalid embedded nd payloads', async () => {
  const result = compile('//# [x]\nvalue:number = 1');
  const parsed = await parseFmtAndAnnotationPayloads(result.annotations ?? []);

  assert.equal(parsed.payloads.length, 0);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0]?.errorCode, 'unknown_inline_type');
});
