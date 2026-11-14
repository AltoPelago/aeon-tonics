#!/usr/bin/env node
// Stage the reviewed archive without accessing the registry or credentials.
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha256='bb3243188ca46198301d778fb92ea6c174842372671084b481330b965c1be759';
const target=fileURLToPath(new URL('../.candidate-packages/altopelago-sansa-0.15.0-rc.1-0436666.tgz',import.meta.url));
const args=process.argv.slice(2);
if(args.length>1)throw new Error('Usage: node scripts/stage-sansa-candidate.mjs [reviewed-archive.tgz]');
function verify(path) {
  if(!existsSync(path))throw new Error(`Missing candidate archive: ${path}. Supply the reviewed archive as the sole argument.`);
  if(createHash('sha256').update(readFileSync(path)).digest('hex')!==sha256)
    throw new Error(`SANSA candidate checksum mismatch: ${path}`);
}
const source=args.length?resolve(args[0]):target;
verify(source);
if(source!==target) {
  if(existsSync(target))verify(target);
  else copyFileSync(source,target);
}
verify(target);
console.log(JSON.stringify({status:'verified',archive:target,sha256,publication:false}));
