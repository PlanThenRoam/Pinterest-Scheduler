import {createReadStream,createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import {createBrotliDecompress} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {extract} from 'tar-fs';
const root=path.dirname(fileURLToPath(import.meta.url)),cache=path.join(root,'.cache','chromium-143.0.4');
let preparing;
export function browserPath(){return preparing??=prepare();}
async function prepare(){
 const bin=path.join(root,'node_modules','@sparticuz','chromium','bin');await fs.mkdir(cache,{recursive:true});const ready=path.join(cache,'ready');
 try{await fs.access(ready);}catch{
  await pipeline(createReadStream(path.join(bin,'chromium.br')),createBrotliDecompress(),createWriteStream(path.join(cache,'chromium'),{mode:0o700}));
  for(const [name,dest] of [['fonts',path.join(cache,'fonts')],['swiftshader',cache]]){await fs.mkdir(dest,{recursive:true});await pipeline(createReadStream(path.join(bin,name+'.tar.br')),createBrotliDecompress(),extract(dest,{chown:false}));}
  await fs.writeFile(ready,'143.0.4');
 }
 await fs.writeFile(path.join(cache,'fonts','fonts.conf'),`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${path.join(cache,'fonts','fonts')}</dir><cachedir>${path.join(cache,'font-cache')}</cachedir></fontconfig>`);process.env.FONTCONFIG_PATH=path.join(cache,'fonts');process.env.FONTCONFIG_FILE=path.join(cache,'fonts','fonts.conf');return path.join(cache,'chromium');
}
