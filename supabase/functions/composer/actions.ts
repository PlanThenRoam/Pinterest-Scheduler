import {FONT_CATALOG} from './fonts.mjs';
import {FONTS,PROFILES,PRESETS,VERSION,validateInput,resolveLayout,canonical,hash,assert} from './core.mjs';
export const BUCKET='composer-private';
const str={type:'string'},uid={type:'string',format:'uuid'},rev={type:'integer',minimum:1};
const spec={type:'object',additionalProperties:false,required:['planner_id','output_type','background_id','font_family','composition_profile','headline','planner_page_ids','layout_preset'],properties:{planner_id:uid,output_type:{type:'string',enum:['square']},background_id:uid,font_family:{type:'string',enum:FONTS},composition_profile:{type:'string',enum:PROFILES},layout_preset:{type:'string',enum:PRESETS},headline:{type:'string',minLength:1,maxLength:240},supporting_copy:{type:'string',maxLength:450},label:{type:'string',maxLength:100},cta:{type:'string',maxLength:100},cta_style:{type:'string',enum:['outline','solid','text']},planner_page_ids:{type:'array',maxItems:2,items:uid},ink:{type:'string',enum:['#FFF9F0','#172724','#142C35']},contrast:{type:'number',minimum:0,maximum:0.8},typography:{type:'object',additionalProperties:false,properties:{alignment:{type:'string',enum:['left','center','right']},opacity:{type:'number',minimum:0.7,maximum:1},shadow:{type:'boolean'},sizes:{type:'object',additionalProperties:false,properties:{headline:{type:'number',minimum:56,maximum:120},supporting_copy:{type:'number',minimum:32,maximum:60},label:{type:'number',minimum:28,maximum:44},cta:{type:'number',minimum:30,maximum:48}}},weight:{type:'integer',enum:[400,500,600,700]},italic:{type:'boolean'},letter_spacing:{type:'number',minimum:-2,maximum:2},line_height:{type:'number',minimum:1.04,maximum:1.28}}}}};
const def=(name:string,description:string,properties:any,required:string[],read=false)=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required},annotations:{readOnlyHint:read,destructiveHint:name.startsWith('delete'),idempotentHint:true,openWorldHint:false}});
export const composerTools=[
 def('get_composer_catalog','Search private square Composer assets. Returns compact pages; never publishes.',{planner_id:uid,kind:{type:'string',enum:['background','page']},query:str,include_options:{type:'boolean'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:20}},[],true),
 def('get_composer_asset','Read one verified private background or genuine planner page, with its signed preview.',{asset_id:uid},['asset_id'],true),
 def('create_marketing_composition','Create a private square advert from exact copy, approved background and genuine pages. No publishing.',{composition:spec,idempotency_key:{type:'string',minLength:8,maxLength:120}},['composition','idempotency_key']),
 def('get_marketing_composition','Read exact composition, validation and private PNG preview.',{composition_id:uid},['composition_id'],true),
 def('update_marketing_composition','Replace a composition specification at its expected revision. Invalidates its approval only.',{composition_id:uid,expected_revision:rev,composition:spec},['composition_id','expected_revision','composition']),
 def('render_marketing_composition','Queue up to five independent square PNG renders. Processing uses existing GitHub Actions and can take several minutes.',{items:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['composition_id','expected_revision'],properties:{composition_id:uid,expected_revision:rev}}}},['items']),
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
export async function assetUrls(admin:any,assets:any[]){const out=[];for(const a of assets){const r=checked(await admin.storage.from(BUCKET).createSignedUrl(a.path,900));out.push({...a,url:r.signedUrl});}return out;}
async function response(admin:any,c:any){const out={composition_id:c.id,revision:c.revision,status:c.status,spec:c.spec,layout:c.layout,asset_ids:c.assets.map((a:any)=>a.id),validation:c.result?.validation||{valid:null,stage:'preflight'},export_status:c.approved_revision===c.revision?'approved':'unapproved',result:c.result?{checksum:c.result.checksum,width:1080,height:1080,error:c.result.error}:null,poll_after_seconds:30,renderer_version:VERSION};if(c.status==='ready'&&c.result?.path){const r=checked(await admin.storage.from(BUCKET).createSignedUrl(c.result.path,900,{download:`${c.spec.planner_id}_${c.id}_r${c.revision}.png`}));return {...out,preview_url:r.signedUrl};}return out;}
export async function handleComposer(name:string,args:any,{admin,userId}:any){
 if(name==='get_composer_asset'){const a=checked(await admin.from('composer_assets').select('*').eq('id',args.asset_id).eq('user_id',userId).eq('ready',true).single());return {asset:(await assetUrls(admin,[a]))[0]};}
 if(name==='get_composer_catalog'){
  const limit=Math.min(20,args.limit||10),offset=args.offset||0;assert(Number.isInteger(offset)&&offset>=0,'Invalid offset');
  let q=admin.from('composer_assets').select('id,planner_id,kind,logical_key,width,height,source_checksum,metadata,checksum',{count:'exact'}).eq('user_id',userId).eq('ready',true).order('logical_key').order('id').range(offset,offset+limit-1);
  if(args.planner_id)q=q.eq('planner_id',args.planner_id);if(args.kind)q=q.eq('kind',args.kind);if(args.query)q=q.ilike('logical_key','%'+String(args.query).replace(/[%_]/g,'')+'%');
  const r=await q;checked(r);return {assets:r.data,next_offset:offset+limit<(r.count||0)?offset+limit:null,total:r.count,...(args.include_options?{fonts:FONT_CATALOG,profiles:PROFILES,presets:PRESETS}:{}),output_type:'square',renderer_version:VERSION};
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
  for(const item of args.items){try{const c=checked(await admin.from('composer_compositions').select('*').eq('id',item.composition_id).eq('user_id',userId).single());assert(c.revision===item.expected_revision,'Revision conflict');assert(c.status!=='cancelled','Composition is cancelled');await selectedAssets(admin,userId,c.spec);if(!['queued','running','ready'].includes(c.status))checked(await admin.from('composer_compositions').update({status:'queued',attempts:0,result:null}).eq('id',c.id).eq('revision',c.revision).eq('status',c.status).select('id').single());results.push({composition_id:c.id,revision:c.revision,status:c.status==='ready'?'ready':'queued'});}catch(e){results.push({composition_id:item.composition_id,error:String((e as Error).message)});}}
  return {results,poll_after_seconds:30,published:false};
 }
 const c=checked(await admin.from('composer_compositions').select('*').eq('id',args.composition_id).eq('user_id',userId).single());
 if(name==='get_composer_job')return {composition_id:c.id,revision:c.revision,status:c.status,error:c.result?.error||null,preview_available:c.status==='ready',poll_after_seconds:30,next_action:c.status==='ready'?'get_marketing_composition':null};
 if(name==='get_marketing_composition')return response(admin,c);
 assert(c.revision===args.expected_revision,'Revision conflict: read the current composition');assert(c.status!=='cancelled'||name==='delete_marketing_composition','Composition is cancelled');
 if(name==='validate_marketing_composition'){const assets=await selectedAssets(admin,userId,c.spec);return {composition_id:c.id,revision:c.revision,layout:resolveLayout(c.spec,assets),validation:c.result?.validation||{valid:null,geometry_valid:true,text_measurement:'pending_render'}};}
 if(name==='update_marketing_composition'){
  const assets=await selectedAssets(admin,userId,args.composition),layout=resolveLayout(args.composition,assets);
  checked(await admin.from('composer_revisions').upsert({composition_id:c.id,revision:c.revision,user_id:userId,spec:c.spec,assets:c.assets,layout:c.layout,result:c.result},{onConflict:'composition_id,revision',ignoreDuplicates:true}));
  const saved=checked(await admin.from('composer_compositions').update({spec:args.composition,layout,assets,revision:c.revision+1,status:'draft',result:null,approved_revision:null,lease:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',c.id).eq('revision',c.revision).neq('status','cancelled').select('*').single());return response(admin,saved);
 }
 if(name==='export_marketing_composition'){
  assert(args.confirmed===true,'Owner approval is required');assert(c.status==='ready'&&c.result?.validation?.valid===true,'A validated rendered preview is required');await selectedAssets(admin,userId,c.spec);
  const saved=checked(await admin.from('composer_compositions').update({approved_revision:c.revision}).eq('id',c.id).eq('revision',c.revision).eq('status','ready').select('*').single());return {...await response(admin,saved),published:false,scheduled:false};
 }
 if(name==='delete_marketing_composition'){
  assert(args.confirmed===true,'Confirm deletion');checked(await admin.from('composer_compositions').update({status:'cancelled',lease:null,lease_until:null}).eq('id',c.id).eq('revision',c.revision).select('id').single());
  const old=checked(await admin.from('composer_revisions').select('result').eq('composition_id',c.id));const paths=[c.result?.path,...old.map((x:any)=>x.result?.path)].filter(Boolean);if(paths.length)checked(await admin.storage.from(BUCKET).remove(paths));checked(await admin.from('composer_revisions').delete().eq('composition_id',c.id));checked(await admin.from('composer_compositions').update({spec:{},layout:{},assets:[],result:null}).eq('id',c.id).eq('status','cancelled'));return {composition_id:c.id,deleted:true,published:false};
 }
 throw Error('Unknown Composer action');
}
