import fs from 'node:fs/promises';import path from 'node:path';
import {createRendererSession,render,sha} from './renderer.mjs';
const input=process.argv[2];if(!input)throw Error('Private benchmark input path required');
const {slides,assets}=JSON.parse(await fs.readFile(input,'utf8')),out=path.join(path.dirname(input),'campaign-benchmark');await fs.mkdir(out,{recursive:true});
const buffers=new Map(),loadStart=performance.now();for(const a of assets){const url=new URL(a.url);if(url.origin!=='https://wyoamcydkbblvujvyljs.supabase.co'||!url.pathname.startsWith('/storage/v1/object/sign/composer-private/'))throw Error('Untrusted asset URL');const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Benchmark asset unavailable');const bytes=Buffer.from(await r.arrayBuffer());if(sha(bytes)!==a.checksum)throw Error('Benchmark asset mismatch');buffers.set(a.id,bytes);}
const downloadMs=performance.now()-loadStart,results=[],expected=new Map();
for(const mode of ['isolated',1,2,3]){
 const started=performance.now(),session=mode==='isolated'?null:await createRendererSession(),slots=[...slides],renders=[];
 try{await Promise.all(Array.from({length:mode==='isolated'?1:mode},async()=>{while(slots.length){const slide=slots.shift(),ids=[slide.composition.background_id,...slide.composition.planner_page_ids],selected=assets.filter(a=>ids.includes(a.id));const r=await (session?session.render(slide.composition,selected,a=>buffers.get(a.id),{scope:'private-benchmark'}):render(slide.composition,selected,a=>buffers.get(a.id)));if(expected.has(slide.number)&&expected.get(slide.number)!==r.checksum)throw Error('Concurrency changed PNG bytes');expected.set(slide.number,r.checksum);renders.push({number:slide.number,checksum:r.checksum,timings:r.timings,validation:r.validation,preflight:r.preflight});if(mode===2)await fs.writeFile(path.join(out,`slide_${slide.number}.png`),r.png);}}));}
 finally{if(session)await session.close();}
 results.push({mode,elapsed_ms:Math.round(performance.now()-started),browser_starts:session?.statistics.browser_starts||5,session:session?.statistics||null,slides:renders.sort((a,b)=>a.number-b.number)});
 console.log(JSON.stringify({mode,elapsed_ms:results.at(-1).elapsed_ms,all_valid:renders.every(r=>r.validation.valid),identical_bytes:true}));
}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({input_assets_download_ms:Math.round(downloadMs),results,note:'Same settled five-slide content and full validation. External asset download measured separately. No creative preparation or GitHub queue wait included.'},null,2));
