import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_AEON_LINT_RULES,
  formatAeonLintSarif,
  formatAeonLintText,
  lintAeonFiles,
} from './index.js';

test('lintAeonFiles uses default rules and reports pointer findings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\nptr = ~>base', 'utf8');

  const result = await lintAeonFiles([dir]);

  assert.deepEqual(result.rules, [...DEFAULT_AEON_LINT_RULES]);
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.rule, 'no-pointer');
  assert.equal(result.findings[0]?.from, '$.ptr');
  assert.equal(result.findings[0]?.to, '$.base');
});

test('lintAeonFiles reports diagnostics through no-diagnostic', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'bad.aeon'), 'broken:number = ', 'utf8');

  const result = await lintAeonFiles([dir], { rules: ['no-diagnostic'] });

  assert.equal(result.ok, false);
  assert.equal(result.findings.length > 0, true);
  assert.equal(result.findings[0]?.rule, 'no-diagnostic');
});

test('lintAeonFiles scopes incoming-reference findings with references filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\ncopy = ~base\nother:string = "y"', 'utf8');

  const result = await lintAeonFiles([dir], {
    rules: ['no-incoming-reference'],
    references: '$.base',
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.rule, 'no-incoming-reference');
  assert.equal(result.findings[0]?.to, '$.base');
});

test('lintAeonFiles keeps no-external-reference quiet for same-file references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\ncopy = ~base\nptr = ~>base', 'utf8');

  const result = await lintAeonFiles([dir], { rules: ['no-external-reference'] });

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
});

test('lintAeonFiles reports pointer references originating under a protected scope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base }\notherPtr = ~>base', 'utf8');

  const result = await lintAeonFiles([dir], { pointerUnder: ['$.app'] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.rules.includes('no-pointer-under'), true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.rule, 'no-pointer-under');
  assert.equal(result.findings[0]?.from, '$.app.ptr');
});

test('lintAeonFiles reports clone references landing in a protected scope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { theme = ~base }\nother = ~base', 'utf8');

  const result = await lintAeonFiles([dir], { cloneInto: ['$.app'] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.rules.includes('no-clone-into'), true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.rule, 'no-clone-into');
  assert.equal(result.findings[0]?.from, '$.app.theme');
});

test('lintAeonFiles derives pointer scopes from graph prefixes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { ptr = ~>base }\npanel:object = { ptr = ~>base }', 'utf8');

  const result = await lintAeonFiles([dir], { pointerUnderGraphPrefixes: ['$.app'] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.rules.includes('no-pointer-under'), true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.from, '$.app.ptr');
});

test('lintAeonFiles derives clone scopes from graph prefixes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aeon-lint-'));
  await writeFile(join(dir, 'doc.aeon'), 'base:string = "x"\napp:object = { theme = ~base }\npanel:object = { theme = ~base }', 'utf8');

  const result = await lintAeonFiles([dir], { cloneIntoGraphPrefixes: ['$.app'] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.rules.includes('no-clone-into'), true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.from, '$.app.theme');
});

test('formatAeonLintText renders compact findings', () => {
  const text = formatAeonLintText({
    format: 'aeon.lint',
    version: 1,
    ok: false,
    rules: ['no-pointer'],
    findings: [{
      rule: 'no-pointer',
      file: 'doc.aeon',
      from: '$.ptr',
      to: '$.base',
      path: '$.base',
      message: 'Pointer reference from $.ptr to $.base.',
    }],
    graph: {
      format: 'aeon.graph',
      version: 1,
      nodes: [],
      edges: [],
      diagnostics: [],
    },
  });

  assert.match(text, /AEON lint: failed \(1 findings across 1 rules\)/);
  assert.match(text, /rules: no-pointer/);
  assert.match(text, /no-pointer: doc\.aeon \$\.ptr -> \$\.base: Pointer reference from \$\.ptr to \$\.base\./);
});

test('formatAeonLintSarif renders SARIF results with AEON path metadata', () => {
  const sarif = formatAeonLintSarif({
    format: 'aeon.lint',
    version: 1,
    ok: false,
    rules: ['no-pointer', 'no-external-reference'],
    findings: [{
      rule: 'no-pointer',
      file: 'doc.aeon',
      from: '$.ptr',
      to: '$.base',
      path: '$.base',
      message: 'Pointer reference from $.ptr to $.base.',
    }],
    graph: {
      format: 'aeon.graph',
      version: 1,
      nodes: [],
      edges: [],
      diagnostics: [],
    },
  });

  const parsed = JSON.parse(sarif);
  assert.equal(parsed.version, '2.1.0');
  assert.equal(parsed.runs[0].tool.driver.name, 'aeon-lint');
  assert.equal(parsed.runs[0].tool.driver.rules[0].id, 'no-pointer');
  assert.equal(parsed.runs[0].results[0].ruleId, 'no-pointer');
  assert.equal(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, 'doc.aeon');
  assert.equal(parsed.runs[0].results[0].locations[0].logicalLocations[0].name, '$.base');
  assert.equal(parsed.runs[0].results[0].properties.fromPath, '$.ptr');
});
