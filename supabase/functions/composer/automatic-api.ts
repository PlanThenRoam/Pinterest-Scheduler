import {VERSION as RENDERER_VERSION,canonical,hash,assert,outputSize,resolveLayout} from './core.mjs';
import {resolveAutomatic,validateBrief,designSignature,assertCampaignStyle,CAMPAIGN_CTA_TREATMENTS,CAMPAIGN_TREATMENTS,LAYOUT_FAMILIES,TREATMENTS,CTA_TREATMENTS,LOCK_FIELDS,PRESET_VERSION,SIMILARITY_THRESHOLD} from './art-direction.mjs';
import {GOOGLE_FONTS} from './font-manifest.mjs';
import {FONT_CATALOG} from './fonts.mjs';
import {validatePromotion,assertPromotion,validatePromotionRecord} from './promotions.mjs';
import {wakeRenderer,dispatchConfigured} from './dispatch.ts';
import {zipPngs,inspectPng} from './archive.mjs';

const bucket='composer-private',check=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
const uid={type:'string',format:'uuid'},rev={type:'integer',minimum:1},str=(max=500)=>({type:'string',maxLength:max}),date={type:'string',format:'date-time'},bool={type:'boolean'};
const obj=(properties:any,required:string[]=[])=>({type:'object',additionalProperties:false,properties,required});
const array=(items:any,max=20)=>({type:'array',items,maxItems:max});
const choice=(values:string[])=>({type:'string',enum:values});
const modes=['evergreen','promotion'];
const emphasis=array(obj({start:{type:'integer',minimum:0},end:{type:'integer',minimum:1},weight:{type:'integer',minimum:100,maximum:1000},colour:str(7),scale:{type:'number',minimum:1,maximum:1.65}},['start','end']),8);
const block=obj({font_family:str(80),weight:{type:'integer',minimum:100,maximum:1000},italic:bool,size:{type:'number',minimum:30,maximum:180},line_height:{type:'number',minimum:1,maximum:1.5},tracking:{type:'number',minimum:-5,maximum:5},align:choice(['left','center','right']),colour:str(7),uppercase:bool,emphasis,x:{type:'number',minimum:0},y:{type:'number',minimum:0},width:{type:'number',exclusiveMinimum:0},height:{type:'number',exclusiveMinimum:0}},['font_family','weight','italic','size','line_height','tracking','align','colour']);
export const designSchema=obj({style_scope:{type:'string',const:'campaign'},colour_mode:choice(['auto','fixed']),version:{type:'string',const:PRESET_VERSION},system_id:str(80),font_category:str(80),hierarchy:str(80),treatment:choice(TREATMENTS),layout_family:choice(LAYOUT_FAMILIES),role:choice(['hook','proof','cover_cta','pin']),fonts:array(str(80),2),blocks:obj({headline:block,supporting_copy:block,cta:block},['headline']),palette:obj({id:str(80),ink:str(7),panel:str(7),accent:str(7)},['id','ink','panel','accent']),cta:obj({treatment:choice(CTA_TREATMENTS),location:choice(['below_copy','below_headline','footer','side','offer'])},['treatment','location']),seed:str(120),background_source_id:uid},['version','system_id','font_category','hierarchy','treatment','layout_family','role','fonts','blocks','palette','cta','seed','background_source_id']);
const output=obj({key:str(40),format:choice(['square','pinterest']),role:choice(['hook','proof','cover_cta','pin']),headline:str(240),supporting_copy:str(450),cta:str(100),page_ids:array(uid,2),product_identification:str(160),promotion_mode:choice(modes),emphasis:obj({headline:emphasis,supporting_copy:emphasis,cta:emphasis})},['key','format','role','headline','page_ids']);
export const briefSchema=obj({planner_id:uid,angle:str(800),publication_at:date,promotion_mode:choice(modes),promotion_id:uid,structure_override:bool,quantities:obj({slides:{type:'integer',minimum:0,maximum:18,default:5},pins:{type:'integer',minimum:0,maximum:18,default:2}},['slides','pins']),outputs:array(output)},['planner_id','angle','publication_at','promotion_mode','outputs']);
const promotion=obj({planner_ids:array(uid),discount_percent:{type:'number',exclusiveMinimum:0,exclusiveMaximum:100},starts_at:date,ends_at:date,announce_from:date,timezone:str(80),date_wording:str(100),approved_wording:obj({advance:str(450),active:str(450)}),confirmation_status:choice(['pending_wording','confirmed','withdrawn']),enabled:bool,required_roles:array(choice(['hook','proof','cover_cta','pin']),4)},['planner_ids','discount_percent','starts_at','ends_at','timezone','date_wording','confirmation_status']);
const define=(name:string,description:string,schema:any,read=false)=>({name,description,inputSchema:schema,annotations:{readOnlyHint:read,destructiveHint:false,idempotentHint:true,openWorldHint:false}});
export const automaticTools=[
 define('get_automatic_campaign_context','Read the campaign plan, promotions, current genuine page IDs, approved background inventory and last ten distinct designs in one request. No catalogue search loop.',obj({planner_id:uid,query:str(120),include_fonts:bool}),true),
 define('generate_marketing_campaign','Choose one consistent typography, palette, headline effect and CTA treatment for the entire campaign. Supply exact copy, current page IDs and roles. Default brief is five square slides and two matching portrait pins; quantities are configurable. Atomically save and queue all outputs. Queued does not mean rendering has started. Never publishes.',obj({idempotency_key:str(120),title:str(160),brief:briefSchema,seed:str(120),locks:array(choice(LOCK_FIELDS),5),render:bool,preparation_started_at:date},['idempotency_key','title','brief'])),
 define('vary_marketing_campaign','Try another design, change layout only, typography only or CTA only. Preserves exact copy, offers, dates, pages and roles. Approved elements can be locked.',obj({campaign_id:uid,expected_revision:rev,idempotency_key:str(120),mode:choice(['all','layout','typography','cta']),seed:str(120),locks:array(choice(LOCK_FIELDS),5),render:bool},['campaign_id','expected_revision','idempotency_key','mode'])),
 define('correct_marketing_campaign_output','Replace the exact brief for one output at current revisions, retaining all other outputs and their files. Requires an explicit corrected output; never rewrites copy silently.',obj({campaign_id:uid,expected_revision:rev,idempotency_key:str(120),output,render:bool},['campaign_id','expected_revision','idempotency_key','output'])),
 define('save_composer_promotion','Save a central private promotion with planner IDs, dates, business timezone and approved advance/active wording. Does not change Etsy prices or discounts. Confirmation is explicit.',obj({promotion_id:uid,expected_revision:rev,promotion,confirmed_wording:bool},['promotion'])),
 define('save_marketing_campaign_plan','Edit planner marketing priority, focus, season-final status and business timezone without changing existing campaign copy or Etsy promotions.',obj({planner_id:uid,expected_revision:rev,record:obj({priority:{type:'integer',minimum:0,maximum:100},focus:str(500),final_campaign_for_season:bool,season:str(80),timezone:str(80),promotion_required:bool,notes:str(1500)},['priority','focus','timezone'])},['planner_id','record'])),
 define('export_automatic_campaign','Export exactly the reviewed ready revisions as separate PNGs and a ZIP. Requires current preview review token. Technical test exports retain unapproved status; owner_visual requires actual owner approval. Rechecks promotion expiry before reuse. Never publishes.',obj({campaign_id:uid,expected_revision:rev,review_token:str(64),review_kind:choice(['technical_test','owner_visual']),confirmed:bool},['campaign_id','expected_revision','review_token','review_kind','confirmed']))
];
export const automaticToolNames=new Set(automaticTools.map(x=>x.name));
export const compactFonts=()=>[...FONT_CATALOG,...GOOGLE_FONTS.map(f=>({family:f.family,licence:f.licence,catalogue_url:f.catalogue_url,subsets:f.subsets,files:f.files.map(x=>({file:x.file,checksum:x.checksum,weight_min:x.weight_min,weight_max:x.weight_max,style:x.style,character_count:x.character_count,axes:x.axes}))}))];

async function campaign(admin:any,userId:string,id:string){return check(await admin.from('composer_campaigns').select('*').eq('id',id).eq('user_id',userId).neq('status','cancelled').single());}
export async function autoContext(admin:any,userId:string,args:any){
 let q=admin.from('seller_master_records').select('id,title,revision,files').eq('user_id',userId);
 if(args.planner_id)q=q.eq('id',args.planner_id);else if(args.query)q=q.ilike('title','%'+String(args.query).replace(/[%_]/g,'')+'%');else throw Error('Choose planner_id or a planner query');
 const matches=check(await q.limit(2));assert(matches.length===1,'Choose one unambiguous planner');const master=matches[0],checksum=master.files?.find((f:any)=>f.role==='docx')?.checksum;assert(checksum,'Current DOCX master is required');
 const [assets,plan,promotions,history]=await Promise.all([
  admin.from('composer_assets').select('*').eq('user_id',userId).eq('planner_id',master.id).eq('ready',true).order('logical_key'),
  admin.from('composer_campaign_plans').select('*').eq('user_id',userId).eq('planner_id',master.id).maybeSingle(),
  admin.from('composer_promotions').select('*').eq('user_id',userId).contains('planner_ids',[master.id]),
  admin.from('composer_design_history').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(10)
 ]);
 return {master,assets:check(assets).filter((a:any)=>a.kind!=='page'||a.source_checksum===checksum),plan:check(plan),promotions:check(promotions).map((p:any)=>({...p.record,id:p.id,revision:p.revision,planner_ids:p.planner_ids})),history:check(history).map((h:any)=>({...h.record,campaign_id:h.campaign_id,revision:h.revision,created_at:h.created_at}))};
}
export async function checkStoredPromotion(admin:any,camp:any,{reuse=false}={}){
 if(!camp.source?.automatic)return {valid:true,issues:[],legacy:true};
 const p=check(await admin.from('composer_promotions').select('*').eq('user_id',camp.user_id).contains('planner_ids',[camp.planner_id]));
 const brief=structuredClone(camp.source.automatic.brief),rows=check(await admin.from('composer_compositions').select('slide_number,spec').eq('campaign_id',camp.id).eq('user_id',camp.user_id).order('slide_number'));
 for(const row of rows){const out=brief.outputs[row.slide_number-1];if(out){out.headline=row.spec.headline;out.supporting_copy=row.spec.supporting_copy;out.cta=row.spec.cta;out.page_ids=row.spec.planner_page_ids;}}
 const plan=check(await admin.from('composer_campaign_plans').select('record').eq('user_id',camp.user_id).eq('planner_id',camp.planner_id).maybeSingle());
 return validatePromotion(brief,p.map((x:any)=>({...x.record,id:x.id,revision:x.revision,planner_ids:x.planner_ids})),{reuse,plan:plan?.record});
}
export async function automaticResponse(admin:any,camp:any,{details=false}={}){
 const rows=check(await admin.from('composer_compositions').select('*').eq('campaign_id',camp.id).eq('user_id',camp.user_id).order('slide_number'));
 const attempts=rows.length?check(await admin.from('composer_render_attempts').select('*').eq('user_id',camp.user_id).in('composition_id',rows.map((x:any)=>x.id))):[];
 const config=camp.source.automatic,expected=config.outputs.length;
 const outputs=await Promise.all(rows.map(async(c:any,i:number)=>{
  const key=config.outputs[i].key,filename=key+'.png';let urls={};
  if(c.status==='ready'&&c.result?.path){urls={preview_url:check(await admin.storage.from(bucket).createSignedUrl(c.result.path,900,{download:filename})).signedUrl,...(c.result.phone_path?{phone_preview_url:check(await admin.storage.from(bucket).createSignedUrl(c.result.phone_path,900)).signedUrl}:{})};}
  return {key,format:c.spec.output_type,role:c.spec.design?.role,product_identification:config.brief.outputs[i].product_identification||null,promotion_mode:config.brief.outputs[i].promotion_mode||config.brief.promotion_mode,composition_id:c.id,revision:c.revision,status:c.status,...urls,filename,checksum:c.result?.checksum||null,validation:c.result?.validation||{valid:null,approval:'automated_checks_only'},error:c.result?.error||null,text_preflight:c.result?.preflight||null,design:{style_scope:c.spec.design?.style_scope,font_families:c.spec.design?.fonts,treatment:c.spec.design?.treatment,layout:c.spec.design?.layout_family,cta:c.spec.design?.cta},timings:{queue_wait_ms:c.started_at&&c.queued_at?Date.parse(c.started_at)-Date.parse(c.queued_at):null,...c.timings},...(details?{spec:c.spec}:{} )};
 }));
 const snapshot=outputs.map(o=>({key:o.key,composition_id:o.composition_id,revision:o.revision,checksum:o.checksum}));
 const reviewToken=await hash(canonical({campaign_id:camp.id,revision:camp.revision,outputs:snapshot}));
 const ready=outputs.length===expected&&outputs.every(o=>o.status==='ready');
 const firstStart=attempts.map((a:any)=>a.started_at).filter(Boolean).sort()[0],lastEnd=ready?rows.map((c:any)=>c.completed_at).filter(Boolean).sort().at(-1):null;
 const firstAttempts=rows.map((c:any)=>attempts.filter((a:any)=>a.composition_id===c.id).sort((a:any,b:any)=>Date.parse(a.started_at)-Date.parse(b.started_at))[0]).filter(Boolean),firstEnd=firstAttempts.length===expected&&firstAttempts.every((a:any)=>a.completed_at)?firstAttempts.map((a:any)=>a.completed_at).sort().at(-1):null;
 const ms=(a:any,b:any)=>a&&b?Math.max(0,Date.parse(b)-Date.parse(a)):null;
 const promotion=await checkStoredPromotion(admin,camp,{reuse:true});
 return {campaign_id:camp.id,title:camp.title,revision:camp.revision,status:camp.status,all_ready:ready,outputs,review_token:reviewToken,seed:config.seed,preset_version:config.version,locks:config.locks,variation_exceptions:config.exceptions,similarity:config.similarity,promotion,stale:!promotion.valid,validation_approval:'automated_checks_only',visual_review_required:true,renderer_start:{configured:dispatchConfigured(),state:outputs.some(o=>o.status==='running')?'running':outputs.some(o=>o.status==='queued')?'queued':ready?'ready':'not_queued',backup:'scheduled_workflow'},timings:{preparation_ms:ms(camp.preparation_started_at,camp.first_submitted_at),queue_wait_ms:ms(camp.first_submitted_at,firstStart),first_pass_ms:ms(firstStart,firstEnd),rendering_and_corrections_ms:ms(firstStart,lastEnd),corrections_ms:ms(firstEnd,lastEnd),export:camp.metrics?.automatic_export||null,end_to_end_ms:ms(camp.preparation_started_at||camp.created_at,camp.metrics?.automatic_export?.completed_at||lastEnd),observed_elapsed_ms:ms(camp.created_at,new Date().toISOString()),note:'Wall-clock durations; independent output timings overlap.'},poll_after_seconds:30,published:false,scheduled:false};
}

export async function syncManualHistory(admin:any,userId:string,campaignId:string){
 const rows=check(await admin.from('composer_compositions').select('spec,assets').eq('user_id',userId).eq('campaign_id',campaignId).order('slide_number'));
 const history=check(await admin.from('composer_design_history').select('*').eq('user_id',userId).eq('campaign_id',campaignId).single());
 const signatures={campaign:designSignature(rows.map((r:any)=>r.spec)),carousel:designSignature(rows.filter((r:any)=>r.spec.output_type==='square').map((r:any)=>r.spec)),pins:rows.filter((r:any)=>r.spec.output_type==='pinterest').map((r:any)=>designSignature([r.spec]))};
 check(await admin.from('composer_design_history').update({revision:history.revision+1,record:{...history.record,...signatures,manual_controls_used:true,asset_versions:rows.flatMap((r:any)=>r.assets.map((a:any)=>({id:a.id,checksum:a.checksum,source_checksum:a.source_checksum})))}}).eq('user_id',userId).eq('campaign_id',campaignId).eq('revision',history.revision).select('campaign_id').single());
}

export async function handleAutomatic(name:string,args:any,{admin,userId}:any){
 if(name==='get_automatic_campaign_context'){
  const c=await autoContext(admin,userId,args);
  return {planner:{id:c.master.id,title:c.master.title,revision:c.master.revision},campaign_plan:c.plan,promotions:c.promotions,pages:c.assets.filter((a:any)=>a.kind==='page').map((a:any)=>({id:a.id,title:a.metadata.page_title,page_number:a.metadata.page_number,checksum:a.checksum,source_checksum:a.source_checksum,width:a.width,height:a.height})),backgrounds:c.assets.filter((a:any)=>a.kind==='background').map((a:any)=>({id:a.id,source_image_id:a.metadata.source_asset_id||a.id,format:a.width===1080?'square':'pinterest',scene:a.metadata.scene_description,checksum:a.checksum,protected_zones_reviewed:a.metadata.zones_reviewed===true})),design_history:c.history,default_quantities:{slides:5,pins:2},formats:{square:{width:1080,height:1080},pinterest:{width:1000,height:1500}},...(args.include_fonts?{fonts:compactFonts()}:{}),controls:{style_scope:'campaign',variation_scope:'between_campaigns',layouts:LAYOUT_FAMILIES,treatments:CAMPAIGN_TREATMENTS,cta_treatments:CAMPAIGN_CTA_TREATMENTS,locks:LOCK_FIELDS,similarity_threshold:SIMILARITY_THRESHOLD},renderer:{version:RENDERER_VERSION,dispatch_configured:dispatchConfigured(),recovery:'scheduled_workflow'},published:false};
 }
 if(name==='save_composer_promotion'){
  validatePromotionRecord(args.promotion);if(args.promotion.confirmation_status==='confirmed')assert(args.confirmed_wording===true,'Confirm actual owner approval of both wording variants');
  const masters=check(await admin.from('seller_master_records').select('id').eq('user_id',userId).in('id',args.promotion.planner_ids));assert(masters.length===new Set(args.promotion.planner_ids).size,'Promotion planner is not owned');
  const old=args.promotion_id?check(await admin.from('composer_promotions').select('*').eq('id',args.promotion_id).eq('user_id',userId).single()):null;
  if(old)assert(old.revision===args.expected_revision,'Promotion revision conflict');
  const value={user_id:userId,planner_ids:args.promotion.planner_ids,record:args.promotion,revision:(old?.revision||0)+1,updated_at:new Date().toISOString()};
  const saved=old?check(await admin.from('composer_promotions').update(value).eq('id',old.id).eq('revision',old.revision).select('*').single()):check(await admin.from('composer_promotions').insert(value).select('*').single());
  return {promotion:saved,etsy_changed:false};
 }
 if(name==='save_marketing_campaign_plan'){
  await autoContext(admin,userId,{planner_id:args.planner_id});new Intl.DateTimeFormat('en-GB',{timeZone:args.record.timezone}).format(new Date());
  const old=check(await admin.from('composer_campaign_plans').select('*').eq('planner_id',args.planner_id).eq('user_id',userId).maybeSingle());if(old)assert(old.revision===args.expected_revision,'Campaign plan revision conflict');
  const values={planner_id:args.planner_id,user_id:userId,record:args.record,revision:(old?.revision||0)+1,updated_at:new Date().toISOString()};
  const saved=old?check(await admin.from('composer_campaign_plans').update(values).eq('planner_id',args.planner_id).eq('user_id',userId).eq('revision',old.revision).select('*').single()):check(await admin.from('composer_campaign_plans').insert(values).select('*').single());return {campaign_plan:saved,published:false};
 }
 if(name==='export_automatic_campaign')return automaticExport(admin,userId,args);
 assert(typeof args.idempotency_key==='string'&&args.idempotency_key.length>=8&&args.idempotency_key.length<=120,'Stable idempotency key required');
 const requestHash=await hash(canonical(args)),replay=check(await admin.from('composer_campaign_requests').select('*').eq('user_id',userId).eq('request_key',args.idempotency_key).maybeSingle());
 if(replay){assert(replay.request_hash===requestHash,'Idempotency key belongs to different content');return {...await automaticResponse(admin,await campaign(admin,userId,replay.campaign_id)),replayed:true};}
 const old=args.campaign_id?await campaign(admin,userId,args.campaign_id):null;
 if(old)assert(old.source?.automatic&&old.revision===args.expected_revision,'Automatic campaign revision conflict');
 const brief=structuredClone(args.brief||old.source.automatic.brief);
 if(name==='correct_marketing_campaign_output'){const i=brief.outputs.findIndex((o:any)=>o.key===args.output.key);assert(i>=0,'Output key not found');brief.outputs[i]=args.output;}
 const context=await autoContext(admin,userId,{planner_id:brief.planner_id});validateBrief(brief,context.assets);
 const promo=validatePromotion(brief,context.promotions,{reuse:true,plan:context.plan?.record});assertPromotion(promo);
 if(context.plan?.record?.final_campaign_for_season){const past=check(await admin.from('composer_campaigns').select('id').eq('user_id',userId).eq('planner_id',brief.planner_id).neq('status','cancelled').limit(2));const already=past.some((h:any)=>h.id!==old?.id);assert(!already,'SEASON_FINAL_CAMPAIGN_ALREADY_EXISTS: update the editable campaign plan before creating another');}
 let previous=old?.source.automatic;
 if(previous){previous=structuredClone(previous);const rows=check(await admin.from('composer_compositions').select('id,revision,slide_number,spec').eq('campaign_id',old.id).eq('user_id',userId).order('slide_number'));previous.outputs=previous.outputs.map((o:any,i:number)=>({...o,composition:rows[i].spec,composition_id:rows[i].id,revision:rows[i].revision}));}
 const mode=name==='correct_marketing_campaign_output'?'correction':args.mode||'all',seed=args.seed||await hash(userId+'/'+args.idempotency_key);
 const resolved=resolveAutomatic(brief,context.assets,context.history,{seed,previous,mode,locks:args.locks||previous?.locks||[]});
 const prepared=await Promise.all(resolved.outputs.map(async(o:any,i:number)=>{const ids=[o.composition.background_id,...o.composition.planner_page_ids];return {number:i+1,expected_revision:o.expected_revision,composition:o.composition,layout:resolveLayout(o.composition,context.assets),assets:context.assets.filter((a:any)=>ids.includes(a.id)),hash:await hash(canonical(o.composition))};}));
 const source={...(old?.source||{}),output_type:'mixed',automatic:{...resolved,promotion_snapshot:promo.snapshots,history_snapshot:context.history.map((h:any)=>({campaign_id:h.campaign_id,revision:h.revision}))}},campId=old?.id||crypto.randomUUID();
 const save=check(await admin.rpc('composer_save_campaign',{p_owner:userId,p_id:campId,p_expected:old?.revision||null,p_key:args.idempotency_key,p_hash:requestHash,p_brief_hash:await hash(canonical(source)),p_title:args.title||old.title,p_planner:brief.planner_id,p_source:source,p_position:old?.queue_position||null,p_preparation:args.preparation_started_at||null,p_slides:prepared,p_queue:args.render!==false,p_job_kind:'render'}));
 const saved=await campaign(admin,userId,save.campaign_id);
 const dispatch=args.render!==false?await wakeRenderer():{mode:'not_requested',immediate_start:false};
 return {...await automaticResponse(admin,saved),submission:save,dispatch};
}

async function automaticExport(admin:any,userId:string,args:any){
 assert(args.confirmed===true,'Confirm review of the returned previews');assert(['technical_test','owner_visual'].includes(args.review_kind),'Explicit review kind required');
 const camp=await campaign(admin,userId,args.campaign_id);assert(camp.source.automatic&&camp.revision===args.expected_revision,'Campaign revision conflict');
 const started=performance.now(),review=await automaticResponse(admin,camp);assert(review.review_token===args.review_token,'Reviewed outputs changed');assert(review.all_ready&&review.outputs.every((o:any)=>o.validation.valid),'Complete validated previews required before export');assertPromotion(review.promotion);
 const rows=check(await admin.from('composer_compositions').select('*').eq('campaign_id',camp.id).eq('user_id',userId).order('slide_number'));
 if(rows.some((r:any)=>r.spec.design?.style_scope==='campaign'))assertCampaignStyle(rows.map((r:any)=>r.spec));
 const context=await autoContext(admin,userId,{planner_id:camp.planner_id});
 const currentIds=new Map(context.assets.map((a:any)=>[a.id,a]));
 for(const c of rows)for(const a of c.assets)assert(currentIds.get(a.id)?.checksum===a.checksum,'STALE_SOURCE: reviewed asset changed');
 const files=[];let total=0;const downloadStart=performance.now();
 for(let i=0;i<rows.length;i++){const c=rows[i],blob=check(await admin.storage.from(bucket).download(c.result.path));total+=blob.size;assert(total<=64*1024*1024,'Export exceeds 64 MiB: reduce the configurable batch size');const bytes=new Uint8Array(await blob.arrayBuffer());assert(await hash(bytes)===c.result.checksum,'Stored PNG checksum mismatch');const actual=inspectPng(bytes),expected=outputSize(c.spec.output_type);assert(actual.width===expected.width&&actual.height===expected.height,'Stored PNG dimensions mismatch');files.push({name:review.outputs[i].filename,bytes});}
 const downloadMs=performance.now()-downloadStart,bytes=zipPngs(files,{expectedCount:files.length}),checksum=await hash(bytes),path=`${userId}/campaign-exports/${camp.id}/r${camp.revision}/${args.review_token}_${args.review_kind}.zip`;
 const uploaded=await admin.storage.from(bucket).upload(path,bytes,{contentType:'application/zip',upsert:false});if(uploaded.error&&!/already exists|Duplicate/i.test(uploaded.error.message))throw Error(uploaded.error.message);
 const stored=check(await admin.storage.from(bucket).download(path));assert(await hash(new Uint8Array(await stored.arrayBuffer()))===checksum,'Stored ZIP checksum mismatch');
 const current=await automaticResponse(admin,await campaign(admin,userId,camp.id));assert(current.review_token===args.review_token,'Reviewed outputs changed during export');assertPromotion(current.promotion);
 const snapshot=rows.map((c:any)=>({number:c.slide_number,composition_id:c.id,revision:c.revision,checksum:c.result.checksum}));
 const metrics={download_validation_ms:Math.round(downloadMs),total_ms:Math.round(performance.now()-started),completed_at:new Date().toISOString(),review_kind:args.review_kind};
 check(await admin.rpc('composer_record_automatic_export',{p_owner:userId,p_id:camp.id,p_revision:camp.revision,p_snapshot:snapshot,p_bundle:{path,checksum,size:bytes.length,review_token:args.review_token,review_kind:args.review_kind,promotion_snapshots:current.promotion.snapshots},p_metrics:metrics,p_owner_approved:args.review_kind==='owner_visual'}));
 return {...await automaticResponse(admin,await campaign(admin,userId,camp.id)),zip:{filename:camp.id+'_campaign.zip',checksum,size:bytes.length,download_url:check(await admin.storage.from(bucket).createSignedUrl(path,900,{download:camp.id+'_campaign.zip'})).signedUrl},review_kind:args.review_kind,owner_approved:args.review_kind==='owner_visual',published:false,scheduled:false};
}
