#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root_dir"

node --input-type=module <<'EOF'
import { compile } from '../aeon/implementations/typescript/packages/core/dist/index.js';
import { emitFmtAndCanonical } from './packages/document/fmt-and-model/dist/index.js';
import { parseFmtAndAnnotationPayloads } from './packages/annotation/fmt-and-annotation-payload/dist/index.js';

const source = `//# # Title
name:string = "Aeon" //? [* required]
//# [x]
`;

const compiled = compile(source);
const parsed = await parseFmtAndAnnotationPayloads(compiled.annotations ?? []);

console.log('== Payloads ==');
for (const payload of parsed.payloads) {
  console.log(`kind=${payload.record.kind}`);
  console.log(`text=${JSON.stringify(payload.text)}`);
  console.log(await emitFmtAndCanonical(payload.document, { profile: 'embedded' }));
}

console.log('== Issues ==');
console.log(JSON.stringify(parsed.issues, null, 2));
EOF
