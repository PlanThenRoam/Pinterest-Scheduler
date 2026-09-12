// Authorised deterministic crops of the locked square bank. Never overwrites sources.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {inspectPng} from '../supabase/functions/composer/archive.mjs';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function portraitAsset(bytes,{left=180,top=0,width=720,height=1080}={}){
 const source=inspectPng(bytes);
 if(source.width!==1080||source.height!==1080)throw Error('Crop source must be 1080 square');
 await sharp(bytes,{failOn:'warning'}).raw().toBuffer();
 if(![left,top,width,height].every(Number.isInteger)||left<0||top<0||width<=0||height<=0||left+width>source.width||top+height>source.height||width*3!==height*2)throw Error('Invalid 2:3 crop');
 const png=await sharp(bytes,{failOn:'warning'}).extract({left,top,width,height}).resize(1000,1500,{kernel:'lanczos3'}).toColourspace('srgb').png({compressionLevel:9}).toBuffer();
 const size=inspectPng(png);await sharp(png,{failOn:'warning'}).raw().toBuffer();
 return {png,checksum:digest(png),size:png.length,...size,crop:{left,top,width,height}};
}

export async function exportPortraitBank(assets,out,crops={}){
 if(assets.length!==190||new Set(assets.map(a=>a.id)).size!==190)throw Error('Expected 190 distinct square sources');
 const planners=new Map();
 for(const a of assets){
  if(!/^[a-f0-9-]{36}$/i.test(a.id)||a.kind!=='background'||a.width!==1080||a.height!==1080||!a.ready||!/^[a-f0-9]{64}$/.test(a.checksum))throw Error('Invalid verified source');
  planners.set(a.planner_id,(planners.get(a.planner_id)||0)+1);
 }
 if(planners.size!==19||[...planners.values()].some(n=>n!==10))throw Error('Expected ten backgrounds per planner');
 if(Object.keys(crops).some(id=>!assets.some(a=>a.id===id)))throw Error('Crop override has unknown source');
 for(const d of ['sources','portraits'])await fs.mkdir(path.join(out,d),{recursive:true});
 const results=[],errors=[];let cursor=0,completed=0;
 await Promise.all(Array.from({length:8},async()=>{
  while(cursor<assets.length){const i=cursor++,a=assets[i];try{
   const sourcePath=path.join(out,'sources',a.id+'.png');let bytes;
   try{bytes=await fs.readFile(sourcePath);}catch(e){
    if(e.code!=='ENOENT')throw e;
    const u=new URL(a.url);if(u.origin!=='https://wyoamcydkbblvujvyljs.supabase.co'||!u.pathname.startsWith('/storage/v1/object/sign/composer-private/'))throw Error('Untrusted source');
    const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Source download '+r.status);bytes=Buffer.from(await r.arrayBuffer());
    if(digest(bytes)!==a.checksum)throw Error('Source checksum mismatch');
    await fs.writeFile(sourcePath,bytes);
   }
   if(digest(bytes)!==a.checksum)throw Error('Source checksum mismatch');
   const r=await portraitAsset(bytes,crops[a.id]),output=path.join(out,'portraits',a.id+'.png'),temporary=output+'.'+crypto.randomUUID()+'.tmp';
   try{await fs.writeFile(temporary,r.png);if(digest(await fs.readFile(temporary))!==r.checksum)throw Error('Saved crop checksum mismatch');await fs.rename(temporary,output);}finally{await fs.rm(temporary,{force:true});}
   results[i]={source_id:a.id,source_checksum:a.checksum,planner_id:a.planner_id,logical_key:a.logical_key,checksum:r.checksum,width:r.width,height:r.height,size:r.size,crop:r.crop};
   completed++;if(completed%20===0)console.log(JSON.stringify({cropped:completed,total:190}));
  }catch(e){errors.push({source_id:a.id,error:e.message.replace(/https?:\/\/\S+/g,'[URL]')});}}
 }));
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({assets:results.filter(Boolean),errors},null,2));
 if(errors.length)throw Error(`${errors.length} source crops failed; see private manifest`);
 // Inspection sheets are private QA only; every exported asset remains an individual PNG.
 const ordered=[...assets].sort((a,b)=>a.logical_key.localeCompare(b.logical_key));
 for(let start=0;start<ordered.length;start+=10){
  const composite=[];
  for(let j=0;j<10;j++){const a=ordered[start+j],x=j%5*330,y=Math.floor(j/5)*300;
   composite.push({input:await sharp(path.join(out,'sources',a.id+'.png')).resize(140,140).toBuffer(),left:x,top:y+50},{input:await sharp(path.join(out,'portraits',a.id+'.png')).resize(160,240).toBuffer(),left:x+150,top:y+35});
  }
  await sharp({create:{width:1650,height:600,channels:3,background:'#eee9e1'}}).composite(composite).jpeg({quality:90}).toFile(path.join(out,'review-'+String(start/10+1).padStart(2,'0')+'.jpg'));
 }
 return {exported:results.length,planners:planners.size,verified:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [manifest,out,config]=process.argv.slice(2);
 if(!manifest||!out)throw Error('Provide private source manifest and output directory');
 console.log(JSON.stringify(await exportPortraitBank(JSON.parse(await fs.readFile(manifest,'utf8')),out,config?JSON.parse(await fs.readFile(config,'utf8')):{})));
}
