import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {unzipSync} from 'fflate';
import {resolveAutomatic,compareDesign,acceptableDesign,automaticLayout,LAYOUT_FAMILIES,TREATMENTS,CTA_TREATMENTS,SYSTEMS,sourceIdentity,fontSupported,assertCampaignStyle,campaignStyle,CAMPAIGN_TREATMENTS,CAMPAIGN_CTA_TREATMENTS} from '../../supabase/functions/composer/art-direction.mjs';
import {validatePromotion,promotionStage} from '../../supabase/functions/composer/promotions.mjs';
import {GOOGLE_FONTS} from '../../supabase/functions/composer/font-manifest.mjs';
import {createRendererSession,fontBank,sha} from '../renderer.mjs';
import {zipPngs} from '../../supabase/functions/composer/archive.mjs';

export const planner='11111111-1111-4111-8111-111111111111';
export function fixture(){
 const assets=[];for(let i=0;i<10;i++)for(const portrait of [false,true])assets.push({id:`10000000-0000-4000-8000-${String(i+(portrait?100:0)).padStart(12,'0')}`,kind:'background',planner_id:planner,width:portrait?1000:1080,height:portrait?1500:1080,checksum:'f'.repeat(64),metadata:portrait?{source_asset_id:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`}:{}});
 const pages=[1,2,3,4].map(i=>({id:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`,planner_id:planner,kind:'page',width:1600,height:2262,checksum:'f'.repeat(64),source_checksum:'a'.repeat(64),metadata:{page_number:i}}));assets.push(...pages);
 const outputs=Array.from({length:7},(_,i)=>({key:(i<5?'slide_':'pin_')+(i<5?i+1:i-4),format:i<5?'square':'pinterest',role:i===0?'hook':i<4?'proof':i===4?'cover_cta':'pin',headline:i===0?'A brighter winter':i<4?'Explore at your pace':i===4?'Your Rome planner':'Rome planner',supporting_copy:'A thoughtful route. Time to enjoy it.',...(i>=4?{cta:'Get the planner on Etsy'}:{}),page_ids:i?[pages[i<4?i:0].id]:[],...(i>=5?{product_identification:'Rome planner',promotion_mode:'evergreen'}:{})}));
 return {assets,brief:{planner_id:planner,angle:'A relaxed winter journey',publication_at:'2026-09-15T10:00:00+01:00',promotion_mode:'evergreen',quantities:{slides:5,pins:2},outputs}};
}
test('two campaigns differ while every slide and pin shares one visual style',()=>{
 const {brief,assets}=fixture(),one=resolveAutomatic(brief,assets,[],{seed:'first-campaign'}),history=[{...one.signatures}],two=resolveAutomatic(brief,assets,history,{seed:'second-campaign'});
 for(const r of [one,two]){assert.equal(r.outputs.length,7);assert.equal(new Set(r.outputs.map(o=>JSON.stringify(o.composition.design.fonts))).size,1);assertCampaignStyle(r.outputs.map(o=>o.composition));assert.ok(new Set(r.outputs.slice(1,4).map(o=>o.composition.design.layout_family)).size>=3);assert.equal(r.similarity.scope,'between_campaigns');assert.equal(r.outputs[0].composition.planner_page_ids.length,0);assert.equal(r.outputs[4].composition.planner_page_ids[0],assets.find(a=>a.kind==='page').id);assert.ok(r.outputs.slice(0,4).every(o=>!o.composition.cta));}
 assert.ok(compareDesign(one.signatures.campaign,two.signatures.campaign).major_differences>=3);assert.ok(two.exceptions.length>=4);assert.ok(two.exceptions.every(x=>x.code==='BACKGROUND_LRU_REUSE'));
 assert.equal(acceptableDesign({...one.signatures.carousel,font_pairing:['Other']},[one.signatures.carousel]),false);
});
test('saved seed/spec reproducibility is independent of subsequent history; variation preserves locked content',()=>{
 const {brief,assets}=fixture(),one=resolveAutomatic(brief,assets,[],{seed:'reproduce'});
 assert.deepEqual(resolveAutomatic(brief,assets,[],{seed:'reproduce'}),one);
 assert.deepEqual(resolveAutomatic(brief,assets,[one.signatures],{seed:'reproduce',previous:one}),one);
 const two=resolveAutomatic(brief,assets,[],{seed:'new-layout',previous:one,mode:'layout'});
 assert.deepEqual(two.brief,one.brief);two.outputs.forEach((o,i)=>{assert.equal(o.composition.background_id,one.outputs[i].composition.background_id);assert.deepEqual(o.composition.design.fonts,one.outputs[i].composition.design.fonts);assert.deepEqual(o.composition.design.cta,one.outputs[i].composition.design.cta);assert.deepEqual(o.composition.design.blocks,one.outputs[i].composition.design.blocks);});
 const changed=structuredClone(brief);changed.outputs[1].headline='Different words';assert.throws(()=>resolveAutomatic(changed,assets,[],{seed:'no',previous:one}),/LOCKED_CONTENT_CHANGED/);
});
test('correction changes one output, genuine source IDs and complete page geometry remain protected',()=>{
 const {brief,assets}=fixture(),one=resolveAutomatic(brief,assets,[],{seed:'correction'});one.outputs.forEach((o,i)=>{o.composition_id='id'+i;o.revision=1;});
 const changed=structuredClone(brief);changed.outputs[2].headline='More time to explore';const two=resolveAutomatic(changed,assets,[],{seed:'correction2',previous:one,mode:'correction'});
 assert.equal(two.outputs.filter((o,i)=>JSON.stringify(o.composition)!==JSON.stringify(one.outputs[i].composition)).length,1);
 assert.deepEqual(two.outputs[2].composition.design.fonts,one.outputs[2].composition.design.fonts);assert.equal(two.outputs[2].composition.background_id,one.outputs[2].composition.background_id);assert.equal(two.outputs[2].composition.design.layout_family,one.outputs[2].composition.design.layout_family);assert.ok(two.outputs.slice(0,5).every(o=>JSON.stringify(o.composition.design.fonts)===JSON.stringify(two.outputs[0].composition.design.fonts)));
 for(const o of two.outputs)for(const p of o.layout.layers.filter(l=>l.asset_id))assert.ok(Math.abs(p.width/p.height-1600/2262)<1e-8);
 const scarce=assets.filter(a=>a.kind==='page'||Number(a.id.slice(-12))%100<3);assert.throws(()=>resolveAutomatic(brief,scarce,[],{seed:'scarce'}),/INSUFFICIENT_DISTINCT_BACKGROUNDS/);
});
test('promotion boundaries use publication timestamps and business timezone, reject missing discount/dates, and mark expired reuse stale',()=>{
 const {brief}=fixture();brief.promotion_mode='promotion';brief.promotion_id='offer';for(const o of brief.outputs.filter(o=>o.format==='pinterest'))o.promotion_mode='promotion';
 const p={id:'offer',planner_ids:[planner],revision:1,discount_percent:15,starts_at:'2026-09-13T23:00:00Z',ends_at:'2026-09-20T23:00:00Z',announce_from:'2026-09-12T23:00:00Z',timezone:'Europe/London',date_wording:'14–20 September 2026',confirmation_status:'confirmed',approved_wording:{advance:'15% off, 14–20 September 2026. Starts 14 September.',active:'15% off, 14–20 September 2026.'}};
 assert.equal(promotionStage(p,'2026-09-13T22:59:59Z'),'advance');assert.equal(promotionStage(p,'2026-09-13T23:00:00Z'),'active');assert.equal(promotionStage(p,'2026-09-20T22:59:59Z'),'active');assert.equal(promotionStage(p,'2026-09-20T23:00:00Z'),'expired');
 let r=validatePromotion(brief,[p],{now:'2026-09-14T10:00:00Z'});assert.ok(r.issues.some(x=>x.output==='slide_5'&&x.code==='PROMOTION_DISCOUNT_MISSING'));assert.ok(r.issues.some(x=>x.output==='pin_1'&&x.code==='PROMOTION_DATES_MISSING'));assert.ok(!r.issues.some(x=>x.output==='slide_1'));
 for(const o of brief.outputs.filter(o=>o.cta))o.supporting_copy=p.approved_wording.active;assert.equal(validatePromotion(brief,[p],{now:'2026-09-14T10:00:00Z'}).valid,true);
 assert.ok(validatePromotion(brief,[p],{now:'2026-09-21T00:00:00Z',reuse:true}).issues.every(x=>x.code==='PROMOTION_EXPIRED_STALE'));
 assert.equal(validatePromotion(brief,[{...p,confirmation_status:'pending_wording'}]).valid,false);
 const evergreen=structuredClone(brief);evergreen.promotion_mode='evergreen';assert.ok(validatePromotion(evergreen,[]).issues.some(x=>x.code==='PROMOTION_NOT_FOUND'));for(const o of evergreen.outputs)o.promotion_mode='evergreen';assert.ok(validatePromotion(evergreen,[],{plan:{promotion_required:true}}).issues.some(x=>x.code==='PROMOTION_NOT_FOUND'));
 brief.publication_at='2026-09-13T12:00:00+01:00';assert.ok(validatePromotion(brief,[p]).issues.some(x=>x.code==='PROMOTION_WORDING_MISMATCH'));
});
test('all twenty official font files match hashes and actual advertised styles; unsupported weights are rejected',async()=>{
 assert.equal(GOOGLE_FONTS.length,20);for(const f of GOOGLE_FONTS){for(const v of f.files){const b=await fs.readFile(new URL('../fonts/'+v.file,import.meta.url));assert.equal(sha(b),v.checksum);assert.ok(v.codepoints.includes(163));}const first=f.files[0];await fontBank(f.family,{weight:first.weight_min,italic:first.style==='italic'});}
 for(const family of ['Poppins','Barlow Condensed'])for(const weight of [100,200]){assert.equal(fontSupported(family,weight,false),true);assert.equal(fontSupported(family,weight,true),true);await fontBank(family,{weight});}assert.equal(fontSupported('DM Sans',1000,false),true);await fontBank('DM Sans',{weight:1000});
 assert.equal(fontSupported('Anton',700,false),false);assert.equal(fontSupported('Missing Family',400,false),false);await assert.rejects(fontBank('Anton',{weight:700}),/UNAVAILABLE/);await assert.rejects(fontBank('Bebas Neue',{italic:true}),/UNAVAILABLE/);
});
test('all twelve layout families have distinct geometry across hook and proof arrangements',()=>{
 const {brief,assets}=fixture(),r=resolveAutomatic(brief,assets,[],{seed:'geometry'}),signatures=[];
 for(const family of LAYOUT_FAMILIES){const shapes=[];for(const index of [0,1]){const s=structuredClone(r.outputs[index].composition);s.design.layout_family=family;let layout;try{layout=automaticLayout(s,assets);}catch(e){e.message=family+":"+index+":"+e.message;throw e;}shapes.push(layout.layers.map(({name,x,y,width,height})=>({name,x,y,width,height})));}signatures.push(JSON.stringify(shapes));}
 assert.equal(new Set(signatures).size,12);
});
test('real renderer keeps shared font sizes and effects, exports seven complete PNGs and rejects long/missing-glyph text',async()=>{
 const {brief,assets}=fixture();const source=new Map();for(const a of assets){const b=await sharp({create:{width:a.width,height:a.height,channels:3,background:a.kind==='page'||Number(a.id.slice(-12))%2?'#ffffff':'#2a4963'}}).png().toBuffer();a.checksum=sha(b);source.set(a.id,b);}
 const resolved=resolveAutomatic(brief,assets,[],{seed:'render-demo'}),session=await createRendererSession();
 try{const rendered=[];for(const o of resolved.outputs){const selected=assets.filter(a=>a.id===o.composition.background_id||o.composition.planner_page_ids.includes(a.id));const r=await session.render(o.composition,selected,a=>source.get(a.id)).catch(e=>{console.error(o.key,o.composition.design.layout_family,JSON.stringify(e.preflight));throw e;});assert.ok(r.validation.valid);assert.ok(r.validation.font_families<=2);assert.ok(r.preflight.exact_text);assert.equal(r.validation.campaign_style_locked,true);assert.equal(r.layout.panels.length,0);assert.equal(r.layout.text_effect.back_panels,false);assert.ok(r.preflight.lines.every(l=>l.font_size===o.composition.design.blocks[l.name].size));assert.ok(r.layout.contrast_choices.every(c=>!c.unboxed&&c.colour===o.composition.design.blocks[c.name].colour));assert.equal((await sharp(r.phone).metadata()).width,360);rendered.push({name:o.key+'.png',bytes:r.png});}
  const zip=zipPngs(rendered,{expectedCount:7}),files=unzipSync(zip);assert.equal(Object.keys(files).length,7);for(const f of rendered)assert.equal(sha(files[f.name]),sha(f.bytes));
  const s=structuredClone(resolved.outputs[0].composition);s.headline='A very long approved headline '.repeat(8);await assert.rejects(session.preflight(s,assets),/COPY_DOES_NOT_FIT/);
  s.headline='Explore 🪐';await assert.rejects(session.preflight(s,assets),/GLYPH/);
 }finally{await session.close();}
});

test('all available unboxed headline and CTA treatments pass actual measured rendering',async()=>{
 const {brief,assets}=fixture();for(const o of brief.outputs){o.headline=o.format==='pinterest'?'3 Rome planner routes':'3 winter routes';o.supporting_copy='Plan a brighter trip.';}
 const wanted=new Map([...CAMPAIGN_TREATMENTS.map(t=>['type:'+t,null]),...CAMPAIGN_CTA_TREATMENTS.map(t=>['cta:'+t,null])]);
 for(let i=0;i<100&&[...wanted.values()].some(v=>!v);i++){
  const r=resolveAutomatic(brief,assets,[],{seed:'preset-coverage-'+i});
  for(const o of r.outputs){const s=o.composition;for(const key of ['type:'+s.design.treatment,...(s.cta?['cta:'+s.design.cta.treatment]:[])])if(!wanted.get(key))wanted.set(key,s);}
 }
 assert.ok([...wanted.values()].every(Boolean),'Unreachable presets: '+[...wanted].filter(([,v])=>!v).map(([k])=>k).join(', '));
 const source=new Map();for(const a of assets){const b=await sharp({create:{width:a.width,height:a.height,channels:3,background:a.kind==='page'?'#ffffff':'#2a4963'}}).png().toBuffer();a.checksum=sha(b);source.set(a.id,b);}
 const session=await createRendererSession();try{for(const [key,s] of wanted){const selected=assets.filter(a=>a.id===s.background_id||s.planner_page_ids.includes(a.id));const r=await session.render(s,selected,a=>source.get(a.id)).catch(e=>{e.message=key+': '+e.message;throw e;});assert.ok(r.validation.valid,key);assert.ok(r.preflight.exact_text,key);}}finally{await session.close();}
});


test('campaign styles stay unified through partial changes, geometry changes cannot introduce per-output effects',()=>{
 const {brief,assets}=fixture(),one=resolveAutomatic(brief,assets,[],{seed:'unified'});
 for(const mode of ['all','typography','cta','layout']){
  let next;try{next=resolveAutomatic(brief,assets,[],{seed:'unified-'+mode,previous:one,mode});}catch(e){e.message=mode+': '+e.message;throw e;}
  assertCampaignStyle(next.outputs.map(o=>o.composition));
  const effects=new Map();for(const o of next.outputs){assert.equal(o.layout.panels.length,0);assert.notEqual(o.composition.design.treatment,'solid_panel');assert.ok(CAMPAIGN_CTA_TREATMENTS.includes(o.composition.design.cta.treatment));}for(const o of next.outputs)for(const panel of o.layout.panels){const visual=JSON.stringify([panel.colour,panel.opacity,panel.gradient||false,panel.radius||0,panel.outline||false,panel.accent||null]);if(effects.has(panel.name))assert.equal(visual,effects.get(panel.name));else effects.set(panel.name,visual);}
 }
 let formerPanel;for(let i=0;i<100&&!formerPanel;i++){const candidate=resolveAutomatic(brief,assets,[],{seed:'former-panel-'+i});if(candidate.outputs[0].composition.design.system_id==='panel')formerPanel=candidate;}
 assert.ok(formerPanel);const corrected=structuredClone(brief);corrected.outputs[1].headline='A calm winter route';const correction=resolveAutomatic(corrected,assets,[],{seed:'panel-correction',previous:formerPanel,mode:'correction'});assertCampaignStyle(correction.outputs.map(o=>o.composition));assert.ok(correction.outputs.every(o=>o.layout.panels.length===0&&o.composition.design.treatment!=='solid_panel'));
 const original=one.outputs[1].composition;
 for(const change of [d=>d.blocks.headline.weight=400,d=>d.palette.panel='#123456',d=>d.treatment='solid_panel',d=>d.cta.treatment='text',d=>delete d.style_scope,d=>d.colour_mode='auto']){
  const edited=structuredClone(original);change(edited.design);
  if(JSON.stringify(campaignStyle(edited))!==JSON.stringify(campaignStyle(original)))assert.throws(()=>assertCampaignStyle([original,edited]),/CAMPAIGN_STYLE_LOCKED/);
 }
 const moved=structuredClone(original);moved.design.layout_family='editorial_right';Object.assign(moved.design.blocks.headline,{x:60,y:60,width:400,height:240});assertCampaignStyle([original,moved]);
 const older=structuredClone(one);for(const o of older.outputs){delete o.composition.design.style_scope;delete o.composition.design.colour_mode;}
 assert.deepEqual(resolveAutomatic(brief,assets,[],{seed:older.seed,previous:older}),older);
 assert.throws(()=>resolveAutomatic(brief,assets,[],{seed:'legacy-layout',previous:older,mode:'layout'}),/CAMPAIGN_STYLE_REFRESH_REQUIRED/);
 assertCampaignStyle(resolveAutomatic(brief,assets,[],{seed:'legacy-refresh',previous:older}).outputs.map(o=>o.composition));
});
