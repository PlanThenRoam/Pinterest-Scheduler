import {createReadStream,createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import {createBrotliDecompress} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {extract} from 'tar-fs';
const root=path.dirname(fileURLToPath(import.meta.url)),cache=path.join(root,'.cache','chromium-143.0.4-atomic');
let preparing;
export function browserPath(){return preparing??=prepareBrowserCache(cache).catch(e=>{preparing=null;throw e;});}
export async function prepareBrowserCache(target){
 const bin=path.join(root,'node_modules','@sparticuz','chromium','bin');await fs.mkdir(path.dirname(target),{recursive:true});const ready=path.join(target,'ready');
 try{await fs.access(ready);}catch{
  // Never write a binary or its libraries where another process can launch it.
  const staging=await fs.mkdtemp(target+'-building-');
  try{
   await pipeline(createReadStream(path.join(bin,'chromium.br')),createBrotliDecompress(),createWriteStream(path.join(staging,'chromium'),{mode:0o700}));
   for(const [name,dest] of [['fonts',path.join(staging,'fonts')],['swiftshader',staging]]){await fs.mkdir(dest,{recursive:true});await pipeline(createReadStream(path.join(bin,name+'.tar.br')),createBrotliDecompress(),extract(dest,{chown:false}));}
   await fs.writeFile(path.join(staging,'fonts','fonts.conf'),`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${path.join(target,'fonts','fonts')}</dir><cachedir>${path.join(target,'font-cache')}</cachedir></fontconfig>`);
   await fs.writeFile(path.join(staging,'ready'),'143.0.4');
   try{await fs.rename(staging,target);}catch(e){if(!['EEXIST','ENOTEMPTY'].includes(e.code))throw e;await fs.access(ready);}
  }finally{await fs.rm(staging,{recursive:true,force:true});}
 }
 process.env.FONTCONFIG_PATH=path.join(target,'fonts');process.env.FONTCONFIG_FILE=path.join(target,'fonts','fonts.conf');return path.join(target,'chromium');
}
