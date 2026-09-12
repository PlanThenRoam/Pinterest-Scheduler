import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';
const run=promisify(execFile);
test('two cold processes publish one complete browser cache and reuse it without rewrites',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'composer-browser-qa-')),target=path.join(dir,'browser'),module=new URL('../browser.mjs',import.meta.url).href;
 const script=`import {prepareBrowserCache} from ${JSON.stringify(module)};console.log(await prepareBrowserCache(process.argv[1]));`;
 try{
  const result=await Promise.all([1,2].map(()=>run(process.execPath,['--input-type=module','-e',script,target])));assert.equal(result[0].stdout,result[1].stdout);
  const binary=path.join(target,'chromium'),bytes=await fs.readFile(binary),checksum=createHash('sha256').update(bytes).digest('hex'),before=(await fs.stat(binary)).mtimeMs;
  assert.equal((await fs.readFile(path.join(target,'ready'),'utf8')),'143.0.4');assert.deepEqual(await fs.readdir(dir),['browser']);
  const version=await run(binary,['--version']);assert.match(version.stdout,/Chromium 143/);
  await run(process.execPath,['--input-type=module','-e',script,target]);assert.equal((await fs.stat(binary)).mtimeMs,before);assert.equal(createHash('sha256').update(await fs.readFile(binary)).digest('hex'),checksum);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
