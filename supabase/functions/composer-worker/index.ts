import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.3';
import {hash,assert,outputSize} from '../composer/core.mjs';
import {checkStoredPromotion} from '../composer/automatic-api.ts';
import {assertPromotion} from '../composer/promotions.mjs';
import {inspectPng} from '../composer/archive.mjs';
import {BUCKET,checked,selectedAssets,assetUrls,handleComposer} from '../composer/actions.ts';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function github(token:string){
 const {payload:p}=await jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:'seller-tools-composer',maxTokenAge:'10m'});
 assert(p.repository_id==='1357989355'&&p.repository_owner_id==='325055588'&&p.repository==='PlanThenRoam/Pinterest-Scheduler'&&p.ref==='refs/heads/main'&&p.workflow_ref==='PlanThenRoam/Pinterest-Scheduler/.github/workflows/composer-render.yml@refs/heads/main'&&['push','schedule','workflow_dispatch'].includes(String(p.event_name)),'Worker identity is not authorized');
}
export function pngInfo(bytes:Uint8Array){return inspectPng(bytes);}
const sourceCurrent=async(admin:any,c:any)=>{if(c.campaign_id&&c.spec.design){const campaign=checked(await admin.from('composer_campaigns').select('*').eq('id',c.campaign_id).eq('user_id',c.user_id).single());assertPromotion(await checkStoredPromotion(admin,campaign,{reuse:true}));}const assets=await selectedAssets(admin,c.user_id,c.spec);assert(assets.every((a:any)=>c.assets.some((old:any)=>old.id===a.id&&old.checksum===a.checksum)),'Source asset changed during rendering');return assets;};
const safeTimings=(x:any)=>Object.fromEntries(Object.entries(x||{}).filter(([k,v])=>/^[a-z_]+_ms$/.test(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<3600000));
async function verifyObject(admin:any,path:string,expected:any){const blob=checked(await admin.storage.from(BUCKET).download(path));assert(blob.size<=52428800,'File too large');const b=new Uint8Array(await blob.arrayBuffer()),info=pngInfo(b);assert(info.width===expected.width&&info.height===expected.height,'PNG dimensions differ');const checksum=await hash(b);assert(checksum===expected.checksum,'PNG checksum differs');if(expected.size)assert(b.length===expected.size,'PNG size differs');return {checksum,size:b.length,...info};}
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');assert(token,'Authentication required');
  const raw=await req.text();assert(raw.length<200000,'Request too large');const a=JSON.parse(raw);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  if(['import_prepare','import_commit'].includes(a.action)){
   const ticket=checked(await admin.from('composer_imports').select('*').eq('token_hash',await hash(token)).eq('revoked',false).gt('expires_at',new Date().toISOString()).maybeSingle());assert(ticket,'Import authorization expired or invalid');assert(Array.isArray(a.asset_ids)&&a.asset_ids.length>0&&a.asset_ids.length<=20,'Import batch must have one to twenty assets');
   assert(a.asset_ids.every((id:string)=>ticket.asset_ids.includes(id)),'Asset outside import grant');
   const assets=checked(await admin.from('composer_assets').select('*').eq('user_id',ticket.user_id).in('id',a.asset_ids));assert(assets.length===new Set(a.asset_ids).size,'Asset missing');const results=await Promise.all(assets.map(async(x:any)=>{try{if(x.ready){return {asset_id:x.id,saved:true,already_saved:true,checksum:x.checksum};}
    if(a.action==='import_prepare'){const u=checked(await admin.storage.from(BUCKET).createSignedUploadUrl(x.path));return {asset_id:x.id,upload_url:u.signedUrl};}
    else{await verifyObject(admin,x.path,x);checked(await admin.from('composer_assets').update({ready:true}).eq('id',x.id).eq('user_id',ticket.user_id));return {asset_id:x.id,saved:true,checksum:x.checksum};}
   }catch(e){return {asset_id:x.id,error:(e as Error).message};}}));
   return json({results});
  }
  await github(token);
  if(a.action==='has_work'){const q=await admin.from('composer_compositions').select('id',{count:'exact',head:true}).in('status',['queued','running']);checked(q);const audits=await admin.from('composer_assets').select('id',{count:'exact',head:true}).eq('ready',false).eq('metadata->>verify_uploaded','true');checked(audits);return json({pending:(q.count||0)>0||(audits.count||0)>0});}
  if(a.action==='verify_uploaded'){
   // Verify only administrator-identified objects already present in private storage. No upload or external source URL is accepted here.
   const assets=checked(await admin.from('composer_assets').select('*').eq('ready',false).eq('metadata->>verify_uploaded','true').limit(20));
   const results=await Promise.all(assets.map(async(x:any)=>{try{await verifyObject(admin,x.path,x);checked(await admin.from('composer_assets').update({ready:true,metadata:{...x.metadata,verify_uploaded:false}}).eq('id',x.id));return {verified:true};}catch(e){checked(await admin.from('composer_assets').update({metadata:{...x.metadata,verify_uploaded:false,verification_error:(e as Error).message.slice(0,200)}}).eq('id',x.id));return {verified:false};}}));
   return json({processed:results.length,verified:results.filter(r=>r.verified).length});
  }
  if(['claim','claim_batch'].includes(a.action)){
   const queue=checked(await admin.rpc('composer_claim_jobs',{p_limit:a.action==='claim'?1:Math.min(3,Math.max(1,Number(a.limit)||2))}));const jobs=[];let validationFailed=0;
   for(const c of queue){try{const assets=await sourceCurrent(admin,c);jobs.push({...c,assets:await assetUrls(admin,assets)});}catch(e){validationFailed++;checked(await admin.rpc('composer_finish_job',{p_id:c.id,p_revision:c.revision,p_lease:c.lease,p_status:'validation_failed',p_result:{error:(e as Error).message,validation:{valid:false}},p_timings:{},p_validation:{valid:false}}));}}
   return json(a.action==='claim'?{job:jobs[0]||null,validation_failed:validationFailed>0}:{jobs,validation_failed:validationFailed});
  }
  const c=checked(await admin.from('composer_compositions').select('*').eq('id',a.composition_id).single());
  if(a.action==='verify_result'){assert(c.status==='ready'&&c.revision===a.revision,'Result is not current');return json(await handleComposer('get_marketing_composition',{composition_id:c.id},{admin,userId:c.user_id}));}
  if(a.action==='abandon_result'){assert(Number.isInteger(a.revision)&&a.revision>0&&/^[a-f0-9-]{36}$/.test(a.lease||''),'Invalid output identity');const oldPath=`${c.user_id}/exports/${c.id}/r${a.revision}/${a.lease}.png`;assert(c.result?.path!==oldPath,'Output is current');const history=checked(await admin.from('composer_revisions').select('result').eq('composition_id',c.id));assert(!history.some((r:any)=>r.result?.path===oldPath),'Output is retained by a composition revision');checked(await admin.storage.from(BUCKET).remove([oldPath]));return json({removed:true});}
  assert(c.status==='running'&&c.revision===a.revision&&c.lease===a.lease&&new Date(c.lease_until).getTime()>Date.now(),'Job lease or revision is no longer current');
  const path=`${c.user_id}/exports/${c.id}/r${c.revision}/${c.lease}.png`;
  if(a.action==='prepare_result'){const u=checked(await admin.storage.from(BUCKET).createSignedUploadUrl(path));const phone=c.spec.design?checked(await admin.storage.from(BUCKET).createSignedUploadUrl(path.replace(/\.png$/,'.phone.png'))):null;return json({upload_url:u.signedUrl,...(phone?{phone_upload_url:phone.signedUrl}:{})});}
  if(a.action==='fail'){const msg=String(a.error||'Render failed').slice(0,300),saved=checked(await admin.rpc('composer_finish_job',{p_id:c.id,p_revision:c.revision,p_lease:c.lease,p_status:a.validation_failure?'validation_failed':'failed',p_result:{error:msg,validation:{valid:false},preflight:a.preflight||null},p_timings:safeTimings(a.timings),p_validation:{valid:false}}));return json({saved});}
  if(a.action==='complete_preflight'){
   assert(c.job_kind==='preflight'&&a.preflight?.valid===true&&a.preflight?.exact_text===true&&a.preflight?.font_loaded===true,'Text preflight failed');await sourceCurrent(admin,c);
   const saved=checked(await admin.rpc('composer_finish_job',{p_id:c.id,p_revision:c.revision,p_lease:c.lease,p_status:'draft',p_result:{preflight:a.preflight,resolved_layout:a.resolved_layout,validation:{valid:null,text_valid:true,stage:'text_preflight'}},p_timings:safeTimings(a.timings),p_validation:{text_valid:true}}));return json({saved});
  }
  if(a.action==='complete'){
   assert(a.validation?.valid===true&&a.validation.exact_text===true&&Number.isInteger(a.validation.font_families)&&a.validation.font_families>=1&&a.validation.font_families<=(c.spec.design?2:1)&&a.validation.font_loaded===true&&a.validation.overflow===false,'Render validation failed');
   if(c.spec.design||['1.1.0','1.2.0','2.0.0'].includes(a.renderer?.version))assert(a.validation.full_decode===true&&a.validation.asset_checksums===true&&a.validation.page_contain===true&&a.validation.isolated_words===false&&a.preflight?.valid===true,'Complete integrity validation is required');
   if(c.spec.design?.style_scope==='campaign')assert(a.validation.campaign_style_locked===true&&a.resolved_layout?.panels?.length===0&&a.preflight?.lines?.every((l:any)=>l.font_size===c.spec.design.blocks[l.name]?.size),'Campaign typography or panel policy changed during rendering');
   const started=performance.now(),verified=await verifyObject(admin,path,{checksum:a.checksum,...outputSize(c.spec.output_type)});await sourceCurrent(admin,c);
   const phonePath=c.spec.design?path.replace(/\.png$/,'.phone.png'):null;if(phonePath)await verifyObject(admin,phonePath,{checksum:a.phone_checksum,width:360,height:Math.round(360*outputSize(c.spec.output_type).height/outputSize(c.spec.output_type).width)});
   const timings={...safeTimings(a.timings),storage_verification_ms:Math.round(performance.now()-started)},saved=checked(await admin.rpc('composer_finish_job',{p_id:c.id,p_revision:c.revision,p_lease:c.lease,p_status:'ready',p_result:{...verified,path,...(phonePath?{phone_path:phonePath,phone_checksum:a.phone_checksum}:{}),validation:a.validation,renderer:a.renderer,resolved_layout:a.resolved_layout,preflight:a.preflight||null},p_timings:timings,p_validation:a.validation}));if(!saved){checked(await admin.storage.from(BUCKET).remove([path]));throw Error('Composition changed while rendering');}return json({saved:true,...verified});
  }
  throw Error('Unknown worker action');
 }catch(e){return json({error:(e as Error).message},/Authentication|required|authorization|authorized|JWT|signature/i.test((e as Error).message)?401:400);}
});
