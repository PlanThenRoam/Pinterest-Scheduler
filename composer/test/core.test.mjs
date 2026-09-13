import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveLayout,FONTS,PROFILES,validateInput} from '../../supabase/functions/composer/core.mjs';
const planner='10000000-0000-4000-8000-000000000001';
const bg={id:'10000000-0000-4000-8000-000000000002',planner_id:planner,kind:'background',width:1080,height:1080,metadata:{}};
const page={id:'10000000-0000-4000-8000-000000000003',planner_id:planner,kind:'page',width:1414,height:2000};
const base={planner_id:planner,background_id:bg.id,output_type:'square',font_family:'Lora',composition_profile:'balanced_premium',headline:'Plan your escape',planner_page_ids:[page.id],layout_preset:'proof_right'};
test('all approved families and profiles resolve deterministic layouts',()=>{assert.equal(FONTS.length,40);assert.equal(PROFILES.length,10);for(const family of FONTS)for(const profile of PROFILES){const s={...base,font_family:family,composition_profile:profile};assert.deepEqual(resolveLayout(s,[bg,page]),resolveLayout(s,[bg,page]));}});
test('page fit preserves exact proportions and is fully inside canvas',()=>{const l=resolveLayout(base,[bg,page]).layers.find(l=>l.asset_id);assert.ok(Math.abs(l.width/l.height-page.width/page.height)<1e-10);assert.ok(l.x+l.width<=1080&&l.y+l.height<=1080);});
test('wrong destination, low resolution, mixed fonts, unsupported output and protected zones fail',()=>{
 assert.throws(()=>resolveLayout(base,[bg,{...page,planner_id:'other'}]),/another planner/);
 assert.throws(()=>resolveLayout(base,[bg,{...page,width:300,height:400}]),/resolution/);
 assert.throws(()=>validateInput({...base,support_font:'Poppins'}),/Unknown/);
 assert.throws(()=>validateInput({...base,output_type:'landscape'}),/Unsupported output/);
 assert.throws(()=>resolveLayout(base,[{...bg,metadata:{protected_zones:[{x:0,y:0,width:1080,height:1080}]}},page]),/protected/);
});
test('automatic profile choices support safe hook, single and pair layouts',()=>{for(const p of PROFILES){const s={...base,layout_preset:'auto',composition_profile:p,planner_page_ids:[]};assert.ok(resolveLayout(s,[bg]).layers.length);}const right=resolveLayout({...base,layout_preset:'auto',composition_profile:'right'},[bg,page]);assert.equal(right.preset,'proof_left');});
test('text is preserved literally and unsupported typography is rejected',()=>{const s={...base,headline:'Travel & explore\nTromsø <safely>'};assert.equal(validateInput(s).headline,s.headline);assert.throws(()=>validateInput({...base,typography:{font_family:'Arial'}}),/Unknown typography/);assert.throws(()=>validateInput({...base,typography:{sizes:{headline:12}}}),/readable/);});
