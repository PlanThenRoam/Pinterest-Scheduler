import {createRendererSession,sha} from './renderer.mjs';
import {call} from './client.mjs';
const started=Date.now(),concurrency=Math.max(1,Math.min(3,Number(process.env.COMPOSER_CONCURRENCY)||2));let completed=0,failed=0,verifiedAssets=0,session;
const stats={claim_ms:0,result_upload_ms:0,stored_download_verification_ms:0};
for(let batch=0;batch<10;batch++){const a=await call('verify_uploaded');verifiedAssets+=a.verified;if(!a.processed)break;}
async function processJob(job){
 const args={composition_id:job.id,revision:job.revision,lease:job.lease};let r;
 try{
  if(job.job_kind==='preflight'){r=await session.preflight(job.spec,job.assets,{scope:job.user_id});await call('complete_preflight',{...args,preflight:r.preflight,resolved_layout:r.layout,timings:r.timings});completed++;return;}
  r=await session.render(job.spec,job.assets,async a=>{const u=new URL(a.url);if(u.origin!=='https://wyoamcydkbblvujvyljs.supabase.co'||!u.pathname.startsWith('/storage/v1/object/sign/composer-private/'))throw Error('Untrusted asset location');const response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Asset download failed');return response.arrayBuffer();},{scope:job.user_id});
  let tick=Date.now();const {upload_url,phone_upload_url}=await call('prepare_result',args);const uploaded=await fetch(upload_url,{method:'PUT',headers:{'Content-Type':'image/png'},body:r.png,signal:AbortSignal.timeout(120000)});if(!uploaded.ok)throw Error('PNG upload failed');if(r.phone){if(!phone_upload_url)throw Error('Phone preview upload is unavailable');const phoneUpload=await fetch(phone_upload_url,{method:'PUT',headers:{'Content-Type':'image/png'},body:r.phone,signal:AbortSignal.timeout(120000)});if(!phoneUpload.ok)throw Error('Phone preview upload failed');}r.timings.result_upload_ms=Date.now()-tick;stats.result_upload_ms+=r.timings.result_upload_ms;
  await call('complete',{...args,checksum:r.checksum,phone_checksum:r.phone_checksum,validation:r.validation,renderer:r.renderer,resolved_layout:r.layout,preflight:r.preflight,timings:r.timings});tick=Date.now();const saved=await call('verify_result',args),download=await fetch(saved.preview_url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!download.ok||sha(Buffer.from(await download.arrayBuffer()))!==r.checksum)throw Error('Stored preview download verification failed');stats.stored_download_verification_ms+=Date.now()-tick;completed++;
 }catch(e){failed++;await call('fail',{...args,error:String(e.message).replace(/https?:\/\/\S+/g,'[URL]'),preflight:e.preflight||r?.preflight||null,timings:e.timings||r?.timings||{},validation_failure:/overflow|isolated|glyph|font|checksum|dimension|source|planner|copy|collid|protected|PNG|decode/i.test(e.message)}).catch(()=>{});await call('abandon_result',args).catch(()=>{});}
}
try{
 while(Date.now()-started<12*60000&&completed+failed<30){
  const tick=Date.now(),batch=await call('claim_batch',{limit:concurrency});stats.claim_ms+=Date.now()-tick;failed+=batch.validation_failed||0;
  if(!batch.jobs.length){if(batch.validation_failed)continue;break;}
  session??=await createRendererSession();await Promise.all(batch.jobs.map(processJob));
 }
}finally{if(session)await session.close();}
console.log(JSON.stringify({completed,failed,verified_assets:verifiedAssets,concurrency,elapsed_ms:Date.now()-started,...stats,...session?.statistics,private_assets_logged:false}));
