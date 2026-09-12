import {render,sha} from './renderer.mjs';
import {call} from './client.mjs';
const started=Date.now();let completed=0,failed=0;
while(Date.now()-started<12*60000&&completed+failed<30){
 const {job,validation_failed}=await call('claim');if(!job){if(validation_failed){failed++;continue;}break;}
 const args={composition_id:job.id,revision:job.revision,lease:job.lease};
 try{
  const r=await render(job.spec,job.assets,async a=>{const u=new URL(a.url);if(u.origin!=='https://wyoamcydkbblvujvyljs.supabase.co'||!u.pathname.startsWith('/storage/v1/object/sign/composer-private/'))throw Error('Untrusted asset location');const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Asset download failed');return r.arrayBuffer();});
  const {upload_url}=await call('prepare_result',args);const uploaded=await fetch(upload_url,{method:'PUT',headers:{'Content-Type':'image/png'},body:r.png,signal:AbortSignal.timeout(120000)});if(!uploaded.ok)throw Error('PNG upload failed');
  await call('complete',{...args,checksum:r.checksum,validation:r.validation,renderer:r.renderer,resolved_layout:r.layout});const saved=await call('verify_result',args);const download=await fetch(saved.preview_url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!download.ok||sha(Buffer.from(await download.arrayBuffer()))!==r.checksum)throw Error('Stored preview download verification failed');completed++;
 }catch(e){failed++;await call('fail',{...args,error:String(e.message).replace(/https?:\/\/\S+/g,'[URL]'),validation_failure:/overflow|glyph|font|checksum|dimension|source|planner|copy|collid|protected/i.test(e.message)}).catch(()=>{});await call('abandon_result',args).catch(()=>{});}
}
console.log(JSON.stringify({completed,failed,private_assets_logged:false}));
