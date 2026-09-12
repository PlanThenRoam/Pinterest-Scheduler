import {test} from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {render,sha,fontBank} from '../renderer.mjs';import {FONTS} from '../../supabase/functions/composer/core.mjs';
const planner='10000000-0000-4000-8000-000000000001';
const bytes=await sharp({create:{width:1080,height:1080,channels:3,background:'#142C35'}}).png().toBuffer();
const bg={id:'10000000-0000-4000-8000-000000000002',planner_id:planner,kind:'background',width:1080,height:1080,checksum:sha(bytes),metadata:{}};
const base={planner_id:planner,background_id:bg.id,output_type:'square',font_family:'Lora',composition_profile:'balanced_premium',headline:'Travel thoughtfully\nExplore beautifully',supporting_copy:'A considered journey starts here.',planner_page_ids:[],layout_preset:'vista_hook'};
test('all twenty approved font families load and visibly render exact copy',{timeout:120000},async()=>{for(const font_family of FONTS){console.log('Checking font: '+font_family);const result=await render({...base,font_family},[bg],async()=>bytes);assert.equal(result.validation.font_loaded,true);assert.equal(result.validation.font_families,1);assert.ok(result.validation.visible_text.every(x=>x.visible_pixels>20));}});
test('re-render has identical PNG bytes and preserves explicit line breaks',{timeout:30000},async()=>{const a=await render(base,[bg],async()=>bytes),b=await render(base,[bg],async()=>bytes);assert.equal(a.checksum,b.checksum);assert.equal(a.layout.layers.find(l=>l.name==='headline').text,base.headline);});
test('long copy, insufficient contrast, unsupported glyphs and corrupted assets fail closed',{timeout:60000},async()=>{
 await assert.rejects(render({...base,headline:'W'.repeat(230)},[bg],async()=>bytes),/overflow/);
 await assert.rejects(render({...base,ink:'#142C35'},[bg],async()=>bytes),/not visibly|contrast/);
 await assert.rejects(render({...base,headline:'Travel 🛩'},[bg],async()=>bytes),/glyph/);
 await assert.rejects(render(base,[{...bg,checksum:'0'.repeat(64)}],async()=>bytes),/checksum/);
 await assert.rejects(fontBank('Prata',{weight:700}),/unavailable/);
});
