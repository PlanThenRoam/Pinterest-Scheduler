import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.3';
import {hash,assert} from '../composer/core.mjs';
import {BUCKET,checked,selectedAssets,assetUrls,handleComposer} from '../composer/actions.ts';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function github(token:string){
 const {payload:p}=await jwtVerify(token,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:'seller-tools-composer',maxTokenAge:'10m'});
 assert(p.repository_id==='1357989355'&&p.repository_owner_id==='325055588'&&p.repository==='PlanThenRoam/Pinterest-Scheduler'&&p.ref==='refs/heads/main'&&p.workflow_ref==='PlanThenRoam/Pinterest-Scheduler/.github/workflows/composer-render.yml@refs/heads/main'&&['push','schedule','workflow_dispatch'].includes(String(p.event_name)),'Worker identity is not authorized');
}
export function pngInfo(bytes:Uint8Array){assert(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x),'Invalid PNG');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert(String.fromCharCode(...bytes.slice(12,16))==='IHDR','Missing PNG header');return {width:v.getUint32(16),height:v.getUint32(20)}}
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
  if(a.action==='has_work'){const q=await admin.from('composer_compositions').select('id',{count:'exact',head:true}).in('status',['queued','running']);checked(q);return json({pending:(q.count||0)>0});}
  if(a.action==='claim'){
   // A lost runner releases its lease. At most three automatic attempts.
   checked(await admin.from('composer_compositions').update({status:'queued',lease:null,lease_until:null}).eq('status','running').lt('lease_until',new Date().toISOString()).lt('attempts',3));
   checked(await admin.from('composer_compositions').update({status:'failed',result:{error:'Worker lease expired after three attempts'}}).eq('status','running').lt('lease_until',new Date().toISOString()).gte('attempts',3));
   const queue=checked(await admin.from('composer_compositions').select('*').eq('status','queued').order('created_at').limit(1));if(!queue.length)return json({job:null});const c=queue[0],lease=crypto.randomUUID();
   const r=await admin.from('composer_compositions').update({status:'running',lease,lease_until:new Date(Date.now()+15*60000).toISOString(),attempts:c.attempts+1}).eq('id',c.id).eq('revision',c.revision).eq('status','queued').select('*').maybeSingle();checked(r);if(!r.data)return json({job:null});
   try{await selectedAssets(admin,c.user_id,c.spec);return json({job:{...r.data,assets:await assetUrls(admin,c.assets)}});}catch(e){checked(await admin.from('composer_compositions').update({status:'validation_failed',result:{error:(e as Error).message,validation:{valid:false}}}).eq('id',c.id).eq('lease',lease));return json({job:null,validation_failed:true});}
  }
  const c=checked(await admin.from('composer_compositions').select('*').eq('id',a.composition_id).single());
  if(a.action==='verify_result'){assert(c.status==='ready'&&c.revision===a.revision,'Result is not current');return json(await handleComposer('get_marketing_composition',{composition_id:c.id},{admin,userId:c.user_id}));}
  if(a.action==='abandon_result'){assert(Number.isInteger(a.revision)&&a.revision>0&&/^[a-f0-9-]{36}$/.test(a.lease||''),'Invalid output identity');const oldPath=`${c.user_id}/exports/${c.id}/r${a.revision}/${a.lease}.png`;assert(c.result?.path!==oldPath,'Output is current');const history=checked(await admin.from('composer_revisions').select('result').eq('composition_id',c.id));assert(!history.some((r:any)=>r.result?.path===oldPath),'Output is retained by a composition revision');checked(await admin.storage.from(BUCKET).remove([oldPath]));return json({removed:true});}
  assert(c.status==='running'&&c.revision===a.revision&&c.lease===a.lease&&new Date(c.lease_until).getTime()>Date.now(),'Job lease or revision is no longer current');
  const path=`${c.user_id}/exports/${c.id}/r${c.revision}/${c.lease}.png`;
  if(a.action==='prepare_result'){const u=checked(await admin.storage.from(BUCKET).createSignedUploadUrl(path));return json({upload_url:u.signedUrl});}
  if(a.action==='fail'){const msg=String(a.error||'Render failed').slice(0,300);checked(await admin.from('composer_compositions').update({status:a.validation_failure?'validation_failed':'failed',lease:null,lease_until:null,result:{error:msg,validation:{valid:false}}}).eq('id',c.id).eq('lease',c.lease).select('id').single());return json({saved:true});}
  if(a.action==='complete'){
   assert(a.validation?.valid===true&&a.validation.exact_text===true&&a.validation.font_families===1&&a.validation.font_loaded===true&&a.validation.overflow===false,'Render validation failed');
   const verified=await verifyObject(admin,path,{checksum:a.checksum,width:1080,height:1080});await selectedAssets(admin,c.user_id,c.spec);
   const r=await admin.from('composer_compositions').update({status:'ready',lease:null,lease_until:null,result:{...verified,path,validation:a.validation,renderer:a.renderer,resolved_layout:a.resolved_layout}}).eq('id',c.id).eq('revision',c.revision).eq('lease',c.lease).eq('status','running').select('id').maybeSingle();checked(r);if(!r.data){checked(await admin.storage.from(BUCKET).remove([path]));throw Error('Composition changed while rendering');}return json({saved:true,...verified});
  }
  throw Error('Unknown worker action');
 }catch(e){return json({error:(e as Error).message},/Authentication|required|authorization|authorized|JWT|signature/i.test((e as Error).message)?401:400);}
});
