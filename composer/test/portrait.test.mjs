import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {resolveLayout,PROFILES,PRESETS,FONTS} from '../../supabase/functions/composer/core.mjs';
import {createRendererSession,sha} from '../renderer.mjs';
import {readPinAsset} from '../../supabase/functions/composer/pin-asset.ts';
import {handleCampaign} from '../../supabase/functions/composer/campaigns.ts';
import {zipPngs} from '../../supabase/functions/composer/archive.mjs';
import {unzipSync} from 'fflate';

const planner='10000000-0000-4000-8000-000000000001';
const bg={id:'10000000-0000-4000-8000-000000000002',planner_id:planner,kind:'background',width:1000,height:1500,metadata:{}};
const page={id:'10000000-0000-4000-8000-000000000003',planner_id:planner,kind:'page',width:1414,height:2000};
const second={...page,id:'10000000-0000-4000-8000-000000000004'};
const spec={planner_id:planner,background_id:bg.id,output_type:'pinterest',font_family:'Lora',composition_profile:'balanced_premium',headline:'Your next adventure',supporting_copy:'A thoughtful journey starts here.',planner_page_ids:[page.id],layout_preset:'proof_right'};

test('portrait presets preserve page proportions and keep all layers inside the canvas',()=>{
 for(const preset of PRESETS)for(const profile of PROFILES){
  const s={...spec,composition_profile:profile,layout_preset:preset,planner_page_ids:preset.endsWith('hook')?[]:preset==='proof_pair'?[page.id,second.id]:[page.id]};
  const r=resolveLayout(s,[bg,page,second]);assert.equal(r.width,1000);assert.equal(r.height,1500);
  for(const l of r.layers){assert.ok(l.x>=0&&l.y>=0&&l.x+l.width<=1000&&l.y+l.height<=1500);if(l.asset_id)assert.ok(Math.abs(l.width/l.height-page.width/page.height)<1e-10);}
 }
 assert.throws(()=>resolveLayout(spec,[{...bg,width:1080,height:1080},page]),/matching output dimensions/);
 assert.throws(()=>resolveLayout({...spec,output_type:'square'},[bg,page]),/matching output dimensions/);
 assert.throws(()=>resolveLayout(spec,[{...bg,metadata:{protected_zones:[{x:0,y:0,width:1000,height:1500}]}},page]),/protected/);
 const r=resolveLayout({...spec,cta:'Explore the planner'},[bg,page]);assert.ok(r.layers.find(x=>x.name==='cta'));
});

test('portrait rendering, true page pixels, exact copy, five distinct fonts and ZIP bytes survive export',async()=>{
 const bgBytes=await sharp({create:{width:1000,height:1500,channels:3,background:'#142C35'}}).png().toBuffer();
 const pageBytes=await sharp({create:{width:1414,height:2000,channels:3,background:'#fff9f0'}}).composite([{input:Buffer.from('<svg width="1414" height="2000"><rect x="100" y="100" width="1214" height="1800" fill="#147777"/></svg>')}]).png().toBuffer();
 const a=[{...bg,checksum:sha(bgBytes)},{...page,checksum:sha(pageBytes)}],session=await createRendererSession(),files=[];
 try{
  for(const family of FONTS.slice(0,5)){
   const r=await session.render({...spec,font_family:family},a,async asset=>asset.kind==='page'?pageBytes:bgBytes);
   assert.equal(r.validation.width,1000);assert.equal(r.validation.height,1500);assert.equal(r.preflight.exact_text,true);
   const l=r.layout.layers.find(x=>x.asset_id),pixel=await sharp(r.png).extract({left:Math.round(l.x+l.width/2),top:Math.round(l.y+l.height/2),width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...pixel],[20,119,119]);
   files.push({name:`pin_0${files.length+1}.png`,bytes:r.png});
  }
  const opened=unzipSync(zipPngs(files));assert.equal(Object.keys(opened).length,5);for(const f of files)assert.equal(sha(opened[f.name]),sha(f.bytes));
 }finally{await session.close();}
});

test('Pinterest campaign requires shared typography and effects, distinct backgrounds and one format',async()=>{
 let prepared=0;
 const admin={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}}};
 const slides=Array.from({length:5},(_,i)=>({number:i+1,composition:{...spec,background_id:`10000000-0000-4000-8000-00000000000${i+5}`,font_family:FONTS[0]}}));
 const args={idempotency_key:'portrait-campaign-test',planner_id:planner,title:'Portrait campaign',slides};
 const call=s=>handleCampaign('submit_marketing_campaign',{...args,slides:s},{admin,userId:'owner',selectedAssets:async()=>{prepared++;throw Error('reached asset validation')}});
 await assert.rejects(call(slides.map((s,i)=>({...s,composition:{...s.composition,font_family:FONTS[i]}}))),/CAMPAIGN_STYLE_LOCKED/);await assert.rejects(call(slides.map((s,i)=>i?s:{...s,composition:{...s.composition,typography:{shadow:true}}})),/CAMPAIGN_STYLE_LOCKED/);assert.equal(prepared,0);await assert.rejects(call(slides),/reached asset validation/);assert.equal(prepared,1);
 await assert.rejects(call(slides.map(s=>({...s,composition:{...s.composition,background_id:bg.id}}))),/distinct backgrounds/);
 await assert.rejects(call(slides.map((s,i)=>i?s:{...s,composition:{...s.composition,output_type:'square'}})),/one output format/);
});

test('pin transfer preserves reviewed bytes and rejects wrong listing, owner, approval, stale source or checksum',async()=>{
 const png=await sharp({create:{width:1000,height:1500,channels:3,background:'#142C35'}}).png().toBuffer(),checksum=sha(png);
 const c={id:'composition',user_id:'owner',spec,revision:2,approved_revision:2,status:'ready',result:{path:'owner/exports/composition/review.png',checksum,validation:{valid:true}}};
 const master={id:planner,user_id:'owner',listing_id:'123',files:[{role:'docx',checksum:'source'}]};
 const assets=[{...bg,ready:true,user_id:'owner'},{...page,ready:true,user_id:'owner',source_checksum:'source'}];
 let stored=png,downloads=0;
 const admin={from(t){let filters=[];const rows=t==='composer_compositions'?[c]:t==='seller_master_records'?[master]:assets;return {select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},in(k,v){filters.push(r=>v.includes(r[k]));return this},single:async()=>({data:rows.find(r=>filters.every(f=>f(r)))||null}),then(fn){fn({data:rows.filter(r=>filters.every(f=>f(r)))})}}},storage:{from:()=>({download:async()=>{downloads++;return {data:new Blob([stored])}}})}};
 const project={kind:'pinterest',manifest:{pins:[{link:'https://www.etsy.com/listing/123',imageRole:'pin-1'}]}},args={composition_id:c.id,composition_revision:2,checksum};
 assert.equal(sha((await readPinAsset(admin,'owner',project,args)).bytes),checksum);
 project.manifest.pins[0].link='https://www.etsy.com/listing/456';await assert.rejects(readPinAsset(admin,'owner',project,args),/must match/);assert.equal(downloads,1);project.manifest.pins[0].link='https://www.etsy.com/listing/123';
 await assert.rejects(readPinAsset(admin,'other',project,args),/Choose a portrait/);
 c.approved_revision=1;await assert.rejects(readPinAsset(admin,'owner',project,args),/visual approval/);c.approved_revision=2;
 c.revision=3;await assert.rejects(readPinAsset(admin,'owner',project,args),/visual approval/);c.revision=2;
 master.files[0].checksum='new-source';await assert.rejects(readPinAsset(admin,'owner',project,args),/STALE_SOURCE/);master.files[0].checksum='source';
 stored=await sharp(png).tint('#123456').png().toBuffer();await assert.rejects(readPinAsset(admin,'owner',project,args),/checksum mismatch/);
});
