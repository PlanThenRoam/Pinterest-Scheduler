import {FONT_CATALOG} from './fonts.mjs';
import {assertCampaignStyle,assertSubmittedCampaignStyle} from './art-direction.mjs';
import {campaignTools,campaignToolNames,handleCampaign} from './campaigns.ts';
import {automaticTools,automaticToolNames,handleAutomatic,compactFonts,checkStoredPromotion,designSchema,syncManualHistory} from './automatic-api.ts';
import {assertPromotion} from './promotions.mjs';
import {wakeRenderer,dispatchConfigured} from './dispatch.ts';
import {FONTS,PROFILES,PRESETS,OUTPUTS,outputSize,VERSION,validateInput,resolveLayout,canonical,hash,assert} from './core.mjs';
export const BUCKET='composer-private';
const str={type:'string'},uid={type:'string',format:'uuid'},rev={type:'integer',minimum:1};
const spec={type:'object',additionalProperties:false,required:['planner_id','output_type','background_id','font_family','composition_profile','headline','planner_page_ids','layout_preset'],properties:{planner_id:uid,output_type:{type:'string',enum:Object.keys(OUTPUTS)},background_id:uid,font_family:{type:'string',enum:FONTS},composition_profile:{type:'string',enum:PROFILES},layout_preset:{type:'string',enum:PRESETS},headline:{type:'string',minLength:1,maxLength:240},supporting_copy:{type:'string',maxLength:450},label:{type:'string',maxLength:100},cta:{type:'string',maxLength:100},cta_style:{type:'string',enum:['outline','solid','text']},planner_page_ids:{type:'array',maxItems:2,items:uid},ink:{type:'string',enum:['#FFF9F0','#172724','#142C35']},contrast:{type:'number',minimum:0,maximum:0.8},typography:{type:'object',additionalProperties:false,properties:{alignment:{type:'string',enum:['left','center','right']},opacity:{type:'number',minimum:0.7,maximum:1},shadow:{type:'boolean'},sizes:{type:'object',additionalProperties:false,properties:{headline:{type:'number',minimum:56,maximum:120},supporting_copy:{type:'number',minimum:32,maximum:60},label:{type:'number',minimum:28,maximum:44},cta:{type:'number',minimum:30,maximum:48}}},weight:{type:'integer',enum:[400,500,600,700]},italic:{type:'boolean'},letter_spacing:{type:'number',minimum:-2,maximum:2},line_height:{type:'number',minimum:1.04,maximum:1.28}}}}};
spec.properties.design=designSchema;
const def=(name:string,description:string,properties:any,required:string[],read=false)=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required},annotations:{readOnlyHint:read,destructiveHint:name.startsWith('delete'),idempotentHint:true,openWorldHint:false}});
export const composerTools=[
 ...automaticTools,
 ...campaignTools(spec),
 def('get_composer_catalog','Search private Composer assets for square or portrait output. Returns compact pages; never publishes.',{planner_id:uid,output_type:{type:'string',enum:Object.keys(OUTPUTS)},kind:{type:'string',enum:['background','page']},query:str,include_options:{type:'boolean'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:20}},[],true),
 def('get_composer_asset','Read one verified private background or genuine planner page, with its signed preview.',{asset_id:uid},['asset_id'],true),
 def('create_marketing_composition','Create a private square or portrait advert from exact copy, approved background and genuine pages. No publishing.',{composition:spec,idempotency_key:{type:'string',minLength:8,maxLength:120}},['composition','idempotency_key']),
 def('get_marketing_composition','Read exact composition, validation and private PNG preview.',{composition_id:uid},['composition_id'],true),
 def('update_marketing_composition','Replace a composition specification at its expected revision. Invalidates its approval only.',{composition_id:uid,expected_revision:rev,composition:spec},['composition_id','expected_revision','composition']),
 def('render_marketing_composition','Queue up to five independent PNG renders. Processing uses existing GitHub Actions and can take several minutes.',{items:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['composition_id','expected_revision'],properties:{composition_id:uid,expected_revision:rev}}}},['items']),
 def('validate_marketing_composition','Validate source identities and geometry; full measured text validation runs during rendering.',{composition_id:uid,expected_revision:rev},['composition_id','expected_revision']),
 def('get_composer_job','Read current rendering status and validation for one composition.',{composition_id:uid},['composition_id'],true),
 def('export_marketing_composition','Return the exact reviewed PNG after explicit owner approval in ChatGPT. Never publishes.',{composition_id:uid,expected_revision:rev,confirmed:{type:'boolean',const:true}},['composition_id','expected_revision','confirmed']),
 def('delete_marketing_composition','Cancel a private composition and delete its exports. Shared source assets are preserved.',{composition_id:uid,expected_revision:rev,confirmed:{type:'boolean',const:true}},['composition_id','expected_revision','confirmed'])];
export const composerToolNames=new Set(composerTools.map(t=>t.name));
export const checked=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
export async function selectedAssets(admin:any,userId:string,s:any){
 validateInput(s);const ids=[s.background_id,...s.planner_page_ids];
 const assets=checked(await admin.from('composer_assets').select('*').eq('user_id',userId).eq('ready',true).in('id',ids));
 assert(assets.length===ids.length,'One or more assets are missing or unverified');
 const master=checked(await admin.from('seller_master_records').select('files').eq('id',s.planner_id).eq('user_id',userId).single());const checksum=master.files?.find((f:any)=>f.role==='docx')?.checksum;
 for(const a of assets)if(a.kind==='page')assert(a.source_checksum===checksum,'STALE_SOURCE: refresh the genuine page bank from the current DOCX');
 return assets;
}
export async function assetUrls(admin:any,assets:any[]){return Promise.all(assets.map(async a=>({...a,url:checked(await admin.storage.from(BUCKET).createSignedUrl(a.path,900)).signedUrl})));}
async function response(admin:any,c:any){const out={composition_id:c.id,revision:c.revision,status:c.status,spec:c.spec,layout:c.result?.resolved_layout||c.layout,renderer:c.result?.renderer||null,asset_ids:c.assets.map((a:any)=>a.id),validation:c.result?.validation||{valid:null,stage:'preflight'},export_status:c.approved_revision===c.revision?'approved':'unapproved',result:c.result?{checksum:c.result.checksum,...outputSize(c.spec.output_type),error:c.result.error}:null,poll_after_seconds:30,renderer_version:VERSION,text_preflight:c.result?.preflight||null,timings:c.timings||{}};if(c.status==='ready'&&c.result?.path){const r=checked(await admin.storage.from(BUCKET).createSignedUrl(c.result.path,900,{download:`${c.spec.planner_id}_${c.id}_r${c.revision}.png`}));return {...out,preview_url:r.signedUrl};}return out;}
export async function handleComposer(name:string,args:any,{admin,userId}:any){
 if(automaticToolNames.has(name))return handleAutomatic(name,args,{admin,userId});
 if(campaignToolNames.has(name))return handleCampaign(name,args,{admin,userId,selectedAssets,handleComposer});
 if(name==='get_composer_asset'){const a=checked(await admin.from('composer_assets').select('*').eq('id',args.asset_id).eq('user_id',userId).eq('ready',true).single());return {asset:(await assetUrls(admin,[a]))[0]};}
 if(name==='get_composer_catalog'){
  const size=outputSize(args.output_type||'square');const limit=Math.min(20,args.limit||10),offset=args.offset||0;assert(Number.isInteger(offset)&&offset>=0,'Invalid offset');
  let q=admin.from('composer_assets').select('id,planner_id,kind,logical_key,width,height,source_checksum,metadata,checksum',{count:'exact'}).eq('user_id',userId).eq('ready',true).order('logical_key').order('id').range(offset,offset+limit-1);
  q=q.or(`kind.eq.page,and(kind.eq.background,width.eq.${size.width},height.eq.${size.height})`);if(args.planner_id)q=q.eq('planner_id',args.planner_id);if(args.kind)q=q.eq('kind',args.kind);if(args.query)q=q.ilike('logical_key','%'+String(args.query).replace(/[%_]/g,'')+'%');
  const r=await q;checked(r);return {assets:r.data,next_offset:offset+limit<(r.count||0)?offset+limit:null,total:r.count,...(args.include_options?{fonts:compactFonts(),profiles:PROFILES,presets:PRESETS,renderer_start:{configured:dispatchConfigured(),backup:'scheduled_workflow'}}:{}),output_type:args.output_type||'square',dimensions:size,renderer_version:VERSION};
 }
 if(name==='create_marketing_composition'){
  assert(typeof args.idempotency_key==='string'&&args.idempotency_key.length>=8&&args.idempotency_key.length<=120,'Stable request key required');
  const h=await hash(canonical(args.composition));const old=checked(await admin.from('composer_compositions').select('*').eq('user_id',userId).eq('request_key',args.idempotency_key).maybeSingle());
  if(old){assert(old.request_hash===h,'Idempotency key belongs to different content');return response(admin,old);}
  const assets=await selectedAssets(admin,userId,args.composition),layout=resolveLayout(args.composition,assets);
  const r=await admin.from('composer_compositions').insert({user_id:userId,request_key:args.idempotency_key,request_hash:h,spec:args.composition,layout,assets}).select('*').single();
  if(r.error?.code==='23505')return handleComposer(name,args,{admin,userId});return response(admin,checked(r));
 }
 if(name==='render_marketing_composition'){
  assert(Array.isArray(args.items)&&args.items.length>0&&args.items.length<=5,'Batch requires one to five items');const results=[];
  for(const item of args.items){try{const c=checked(await admin.from('composer_compositions').select('*').eq('id',item.composition_id).eq('user_id',userId).single());assert(c.revision===item.expected_revision,'Revision conflict');assert(c.status!=='cancelled','Composition is cancelled');await selectedAssets(admin,userId,c.spec);if(c.campaign_id&&c.spec.design){const camp=checked(await admin.from('composer_campaigns').select('*').eq('id',c.campaign_id).eq('user_id',userId).single());assertPromotion(await checkStoredPromotion(admin,camp));}if(!['queued','running','ready'].includes(c.status))checked(await admin.from('composer_compositions').update({status:'queued',job_kind:'render',queued_at:new Date().toISOString(),started_at:null,completed_at:null,attempts:0,result:null}).eq('id',c.id).eq('revision',c.revision).eq('status',c.status).select('id').single());results.push({composition_id:c.id,revision:c.revision,status:['running','ready'].includes(c.status)?c.status:'queued'});}catch(e){results.push({composition_id:item.composition_id,error:String((e as Error).message)});}}
  return {results,poll_after_seconds:30,published:false,renderer_start:results.some(r=>r.status==='queued')?await wakeRenderer():{mode:'not_needed',immediate_start:false}};
 }
 const c=checked(await admin.from('composer_compositions').select('*').eq('id',args.composition_id).eq('user_id',userId).single());
 if(name==='get_composer_job')return {composition_id:c.id,campaign_id:c.campaign_id||null,slide_number:c.slide_number||null,revision:c.revision,status:c.status,error:c.result?.error||null,timings:c.timings||{},preview_available:c.status==='ready',poll_after_seconds:30,next_action:c.status==='ready'?'get_marketing_composition':null};
 if(name==='get_marketing_composition')return response(admin,c);
 assert(c.revision===args.expected_revision,'Revision conflict: read the current composition');assert(c.status!=='cancelled'||name==='delete_marketing_composition','Composition is cancelled');
 if(name==='validate_marketing_composition'){const assets=await selectedAssets(admin,userId,c.spec);return {composition_id:c.id,revision:c.revision,layout:resolveLayout(c.spec,assets),validation:c.result?.validation||{valid:null,geometry_valid:true,text_measurement:'pending_render'}};}
 if(name==='update_marketing_composition'){
  if(c.campaign_id&&!c.spec.design)assertSubmittedCampaignStyle([c.spec,args.composition]);
  if(c.campaign_id&&c.spec.design){
   for(const key of ['headline','supporting_copy','cta','planner_page_ids'])assert(canonical(c.spec[key])===canonical(args.composition[key]),'Use correct_marketing_campaign_output for exact copy or page changes');
   assert(args.composition.design?.role===c.spec.design.role,'Slide roles are locked');
   if(c.spec.design.style_scope==='campaign')assertCampaignStyle([c.spec,args.composition]);
   if(c.spec.output_type==='square'){const siblings=checked(await admin.from('composer_compositions').select('id,spec').eq('campaign_id',c.campaign_id).eq('user_id',userId));assert(siblings.filter((s:any)=>s.id!==c.id&&s.spec.output_type==='square').every((s:any)=>canonical(s.spec.design.fonts)===canonical(args.composition.design.fonts)),'Keep the coherent carousel font pairing; use Change typography only for the campaign');}
  }
  const assets=await selectedAssets(admin,userId,args.composition),layout=resolveLayout(args.composition,assets);
  checked(await admin.from('composer_revisions').upsert({composition_id:c.id,revision:c.revision,user_id:userId,spec:c.spec,assets:c.assets,layout:c.layout,result:c.result},{onConflict:'composition_id,revision',ignoreDuplicates:true}));
  const saved=checked(await admin.from('composer_compositions').update({spec:args.composition,layout,assets,revision:c.revision+1,status:'draft',result:null,approved_revision:null,lease:null,lease_until:null,queued_at:null,started_at:null,completed_at:null,timings:{},updated_at:new Date().toISOString()}).eq('id',c.id).eq('revision',c.revision).neq('status','cancelled').select('*').single());if(c.campaign_id&&c.spec.design)await syncManualHistory(admin,userId,c.campaign_id);return response(admin,saved);
 }
 if(name==='export_marketing_composition'){
  if(c.campaign_id&&c.spec.design){const camp=checked(await admin.from('composer_campaigns').select('*').eq('id',c.campaign_id).eq('user_id',userId).single());assertPromotion(await checkStoredPromotion(admin,camp,{reuse:true}));}
  assert(args.confirmed===true,'Owner approval is required');assert(c.status==='ready'&&c.result?.validation?.valid===true,'A validated rendered preview is required');await selectedAssets(admin,userId,c.spec);
  const saved=checked(await admin.from('composer_compositions').update({approved_revision:c.revision}).eq('id',c.id).eq('revision',c.revision).eq('status','ready').select('*').single());return {...await response(admin,saved),published:false,scheduled:false};
 }
 if(name==='delete_marketing_composition'){
  assert(args.confirmed===true,'Confirm deletion');checked(await admin.from('composer_compositions').update({status:'cancelled',lease:null,lease_until:null}).eq('id',c.id).eq('revision',c.revision).select('id').single());
  const old=checked(await admin.from('composer_revisions').select('result').eq('composition_id',c.id));const paths=[c.result?.path,...old.map((x:any)=>x.result?.path)].filter(Boolean);if(paths.length)checked(await admin.storage.from(BUCKET).remove(paths));checked(await admin.from('composer_revisions').delete().eq('composition_id',c.id));checked(await admin.from('composer_compositions').update({spec:{},layout:{},assets:[],result:null}).eq('id',c.id).eq('status','cancelled'));return {composition_id:c.id,deleted:true,published:false};
 }
 throw Error('Unknown Composer action');
}
