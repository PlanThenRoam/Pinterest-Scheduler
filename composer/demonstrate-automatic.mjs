// Private local acceptance harness. The input manifest and outputs stay outside
// the repository; source URLs and genuine planner assets are never committed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveAutomatic} from '../supabase/functions/composer/art-direction.mjs';
import {createRendererSession,sha} from './renderer.mjs';
import {zipPngs} from '../supabase/functions/composer/archive.mjs';
import sharp from 'sharp';
const [manifest,destination]=process.argv.slice(2);if(!manifest||!destination)throw Error('Usage: demonstrate-automatic.mjs PRIVATE_MANIFEST OUTPUT_DIRECTORY');
const started=Date.now(),assets=JSON.parse(await fs.readFile(manifest,'utf8')),dir=path.resolve(destination);await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(dir,'assets'),{recursive:true});
async function source(a){const local=path.join(dir,'assets',a.id+'.png');try{const b=await fs.readFile(local);if(sha(b)===a.checksum)return b;}catch{}const u=new URL(a.url);if(u.origin!=='https://wyoamcydkbblvujvyljs.supabase.co'||!u.pathname.startsWith('/storage/v1/object/sign/composer-private/'))throw Error('Untrusted source URL');const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Source download failed');const b=Buffer.from(await r.arrayBuffer());if(sha(b)!==a.checksum)throw Error('Source checksum mismatch');await fs.writeFile(local,b);return b;}
for(let i=0;i<assets.length;i+=4)await Promise.all(assets.slice(i,i+4).map(source));
const prepStart=Date.now(),page=n=>assets.find(a=>a.kind==='page'&&a.metadata.page_number===n).id,planner=assets[0].planner_id;
const copy=[
 ['London, after the lights come on.','A Christmas trip with time to enjoy it.',null],
 ['Choose your London route.','Find the pace that fits your Christmas trip.',5],
 ['Make space for the festive dates.','Keep the seasonal calendar beside your plans.',6],
 ['Follow the lights through the West End.','See the genuine itinerary before you set off.',10],
 ['Your Christmas in London planner.','Bring your festive trip together.',1],
 ['Christmas in London planner','Your festive trip, thoughtfully planned.',1],
 ['Christmas in London planner','Explore the lights with a route beside you.',10]
];
const brief={planner_id:planner,angle:'A thoughtful festive city break',publication_at:'2026-09-15T10:00:00+01:00',promotion_mode:'evergreen',quantities:{slides:5,pins:2},outputs:copy.map(([headline,supporting_copy,n],i)=>({key:i<5?'slide_'+(i+1):'pin_'+(i-4),format:i<5?'square':'pinterest',role:i===0?'hook':i<4?'proof':i===4?'cover_cta':'pin',headline,supporting_copy,page_ids:n?[page(n)]:[],...(i>=4?{cta:'Get the planner on Etsy.'}:{}),...(i>=5?{product_identification:'Christmas in London planner',promotion_mode:'evergreen'}:{})}))};
await fs.writeFile(path.join(dir,'brief.json'),JSON.stringify(brief,null,2));const history=[],reports=[],session=await createRendererSession();
try{
 for(let campaign=1;campaign<=2;campaign++){
  const campaignStart=Date.now(),name='campaign_'+campaign,outdir=path.join(dir,name);await fs.mkdir(outdir,{recursive:true});let resolved;
  for(let candidate=1;candidate<=30;candidate++){
   const trial=resolveAutomatic(brief,assets,history,{seed:'acceptance-'+campaign+'-'+candidate});
   try{for(const o of trial.outputs)await session.preflight(o.composition,assets);resolved=trial;break;}catch(e){console.log(JSON.stringify({campaign,candidate,rejected:e.message}));}
  }
  if(!resolved)throw Error('No measured candidate fits the exact demonstration copy');
  await fs.writeFile(path.join(outdir,'resolved.json'),JSON.stringify(resolved,null,2));
  const renderingStart=Date.now(),rendered=[];
  for(let i=0;i<resolved.outputs.length;i+=2){const results=await Promise.all(resolved.outputs.slice(i,i+2).map(async o=>{const selected=assets.filter(a=>a.id===o.composition.background_id||o.composition.planner_page_ids.includes(a.id)),r=await session.render(o.composition,selected,source,{scope:planner});await fs.writeFile(path.join(outdir,o.key+'.png'),r.png);await fs.writeFile(path.join(outdir,o.key+'_phone.png'),r.phone);const record={key:o.key,checksum:r.checksum,phone_checksum:r.phone_checksum,validation:r.validation,timings:r.timings,layout:r.layout,renderer:r.renderer};await fs.writeFile(path.join(outdir,o.key+'.json'),JSON.stringify(record,null,2));return record;}));rendered.push(...results);}
  const exportStart=Date.now(),files=await Promise.all(resolved.outputs.map(async o=>({name:o.key+'.png',bytes:await fs.readFile(path.join(outdir,o.key+'.png'))}))),zip=zipPngs(files,{expectedCount:7});await fs.writeFile(path.join(dir,name+'.zip'),zip);
  const thumbs=await Promise.all(resolved.outputs.map(async o=>({input:await sharp(path.join(outdir,o.key+'.png')).resize({width:240}).png().toBuffer()})));
  const sheet=sharp({create:{width:1680,height:360,channels:3,background:'#ecece6'}}).composite(thumbs.map((t,i)=>({...t,left:i*240,top:0}))).png();await sheet.toFile(path.join(dir,name+'_review.png'));
  history.unshift({...resolved.signatures});const report={campaign,seed:resolved.seed,outputs:rendered,exceptions:resolved.exceptions,signatures:resolved.signatures,timings:{source_loading_ms:prepStart-started,preparation_ms:renderingStart-campaignStart,rendering_ms:exportStart-renderingStart,export_ms:Date.now()-exportStart,end_to_end_ms:Date.now()-campaignStart,overall_elapsed_ms:Date.now()-started},zip_checksum:sha(zip),approval:'technical_test_not_owner_approved'};reports.push(report);await fs.writeFile(path.join(dir,'acceptance.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({campaign,seed:resolved.seed,outputs:rendered.length,timings:report.timings,signatures:report.signatures}));
 }
}finally{await session.close();}
