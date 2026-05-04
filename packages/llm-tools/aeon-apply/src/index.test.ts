import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyAeonPatch,
  discoverAeonApplyTargets,
  formatAeonApplyText,
  planAeonApply,
} from './index.js';
import { createAesPatch, diffAeon } from '../../aes-diff/dist/index.js';

const before = [
  'aeon:mode = "strict"',
  'app:object = {',
  '  status:string = "draft"',
  '  count:number = 1',
  '}',
].join('\n');

const after = [
  'aeon:mode = "strict"',
  'app:object = {',
  '  status:string = "ready"',
  '  count:number = 1',
  '}',
].join('\n');

test('applyAeonPatch dry-runs an aes-diff patch against matching AEON source', () => {
  const patch = createAesPatch(diffAeon(before, after));
  const result = applyAeonPatch(before, patch, 'doc.aeon');

  assert.equal(result.applicable, true);
  assert.equal(result.applied, false);
  assert.equal(result.changed, true);
  assert.equal(result.diagnostics.length, 0);
  assert.match(result.output ?? '', /status:string="ready"/);
});

test('applyAeonPatch rejects stale targets conservatively', () => {
  const patch = createAesPatch(diffAeon(before, after));
  const stale = before.replace('"draft"', '"other"');
  const result = applyAeonPatch(stale, patch, 'doc.aeon');

  assert.equal(result.applicable, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'PATCH_STALE_BASE'), true);
});

test('planAeonApply discovers targets and can write accepted patches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-apply-'));
  const nested = join(dir, 'nested');
  await mkdir(nested);
  const one = join(dir, 'one.aeon');
  const two = join(nested, 'two.aeon');
  await writeFile(one, before, 'utf8');
  await writeFile(two, before, 'utf8');

  const patch = createAesPatch(diffAeon(before, after));
  const files = await discoverAeonApplyTargets([dir]);
  const result = await planAeonApply(patch, [dir], { write: true });

  assert.deepEqual(files, [one, two].sort());
  assert.equal(result.ok, true);
  assert.equal(result.write, true);
  assert.deepEqual(result.targets.map((target) => target.applied), [true, true]);
});

test('formatAeonApplyText renders target status and diagnostics', () => {
  const text = formatAeonApplyText({
    format: 'aeon.apply',
    version: 1,
    ok: false,
    write: false,
    targets: [{
      file: 'doc.aeon',
      applicable: false,
      applied: false,
      changed: false,
      diagnostics: [{ code: 'PATCH_STALE_BASE', message: 'stale', path: '$.app.status' }],
    }],
  });

  assert.match(text, /AEON apply: blocked; 1 targets; dry-run/);
  assert.match(text, /blocked doc\.aeon/);
  assert.match(text, /PATCH_STALE_BASE \$\.app\.status: stale/);
});
