import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAddressOrThrow } from '@altopelago/sansa';
import { createTitonicFromAeon, resolveTitonicAddress, exportTitonicAeon } from './index.js';

const source = "aeon:mode=\"strict\"\nitem\\i\\:number=42\n<book()>";

for (const suffix of ['&key("item")', '&tag("book")', '&headTag("book")']) {
  for (const prefix of ['$.*', '$.absent.*', "$.\\i\\"]) {
    for (const representation of ['string', 'AST'] as const) {
      test(`Titonic rejects property selectors for ${prefix}${suffix} (${representation})`, () => {
        const document = createTitonicFromAeon(source);
        const before = exportTitonicAeon(document);
        const text = prefix + suffix;
        const address = parseAddressOrThrow(text);
        const result = resolveTitonicAddress(document, representation === 'AST' ? address : text);
        assert.deepEqual(result.bindings, []);
        assert.equal(result.exact, false);
        assert.deepEqual(result.diagnostics.map(({ code, selectorIndex }) => [code, selectorIndex]), [
          ['TITONIC_RESOLVE_UNSUPPORTED_SELECTOR', address.selectors.findIndex((s) => s.type === 'propertyFilter')],
        ]);
        assert.equal(exportTitonicAeon(document), before);
      });
    }
  }
}

test('property denial does not acquire a missing context root or spend an identity allowance', () => {
  const document = createTitonicFromAeon(source);
  for (const text of ['?.*&key("item")', "$.\\i\\&key(\"item\")"]) {
    const result = resolveTitonicAddress(document, text, { maxIdentityInspections: 0 });
    assert.deepEqual(result.bindings, []);
    assert.equal(result.diagnostics[0]?.code, 'TITONIC_RESOLVE_UNSUPPORTED_SELECTOR');
  }
});

test('ordinary and identity reads keep the original target after property denial', () => {
  const document = createTitonicFromAeon(source);
  resolveTitonicAddress(document, '$.*&key("absent")');
  for (const text of ['$.item', "$.\\i\\"]) {
    const result = resolveTitonicAddress(document, text);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.bindings.map((b) => [b.pathText, b.value]), [['$.item', 42]]);
  }
});
