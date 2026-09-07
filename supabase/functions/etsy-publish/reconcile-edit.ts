import {listingSnapshot,verifyFields,equivalent} from './safety.ts';
// Read-only on Etsy: never repeat an upload while checking an uncertain result.
export async function reconcileEdit(admin:any,credential:any,token:string,project:any,api:any){
 const listingId=String(project.manifest.listingId||'');if(!/^\d+$/.test(listingId))throw new Error('This submission has no existing listing.');
 const read=await admin.from('seller_publish_runs').select('*').eq('project_id',project.id).in('status',['needs_review','running']).order('created_at',{ascending:false}).limit(1).maybeSingle();if(read.error)throw read.error;const run=read.data;
 if(!run)return {verified:false,message:'No unresolved publishing attempt was found.',listing_url:'https://www.etsy.com/listing/'+listingId};
 if(run.status==='running'&&Date.now()-Date.parse(run.created_at)<300000)throw new Error('Publication is still running. Wait for its result.');
 const listing=await api.fetch('/listings/'+listingId+'?includes=Personalization',token);if(String(listing.user_id)!==String(credential.etsy_user_id))throw new Error('Listing ownership changed.');
 const images=(await api.fetch('/listings/'+listingId+'/images',token)).results;
 const files=(await api.fetch('/shops/'+credential.shop_id+'/listings/'+listingId+'/files',token)).results;
 if(!Array.isArray(images)||!Array.isArray(files))throw new Error('Etsy readback is unavailable.');
 const m=project.manifest,steps=run.steps||[],before=run.before_state||{},replacements=m.imageReplacements||[],updates=m.fileUpdates||[];
 let verified=true;
 try{
  if(!before.fields||!before.images||!before.files)throw Error('The complete operation was not confirmed.');
  if(Object.keys(m.updateFields||{}).length&&!steps.some((s:any)=>s.name==='Update selected listing fields'&&s.status==='confirmed'))throw Error('Text update was not confirmed.');
  if(steps.some((s:any)=>s.status!=='confirmed'&&!/^Confirm image \d+ alt text$/.test(s.name)))throw Error('An operation remains uncertain.');
  verifyFields(before.fields,listingSnapshot(listing),m.updateFields||{});
  if(images.length!==before.images.length+replacements.filter((r:any)=>!before.images.some((i:any)=>Number(i.rank)===Number(r.rank))).length)throw Error('Image count differs.');
  for(const old of before.images){if(replacements.some((r:any)=>Number(r.rank)===Number(old.rank)))continue;const actual=images.find((i:any)=>Number(i.rank)===Number(old.rank));if(!actual||String(actual.listing_image_id)!==String(old.listing_image_id)||String(actual.alt_text||'')!==String(old.alt_text||''))throw Error('Untouched image differs.');}
  for(const replacement of replacements){const step=steps.findLast((s:any)=>(s.name==='Replace image '+replacement.rank||s.name==='Restore image '+replacement.rank)&&s.status==='confirmed'),actual=images.find((i:any)=>Number(i.rank)===Number(replacement.rank));if(!step?.image_id||!actual||String(actual.listing_image_id)!==String(step.image_id)||String(actual.alt_text||'')!==String(replacement.altText))throw Error('Image result differs.');}
  const expected=before.files.map((f:any)=>String(f.listing_file_id));
  for(const update of updates){const step=steps.find((s:any)=>s.name==='Upload '+update.filename),index=expected.indexOf(String(update.listingFileId));if(!step?.file_id||step.status!=='confirmed')throw Error('File result is unconfirmed.');if(update.action==='add')expected.push(String(step.file_id));else {if(index<0||!steps.some((s:any)=>s.name==='Remove replaced file '+update.listingFileId&&s.status==='confirmed'))throw Error('File replacement is unconfirmed.');expected[index]=String(step.file_id);}}
  if(!equivalent(expected.sort(),files.map((f:any)=>String(f.listing_file_id)).sort()))throw Error('File result differs.');
 }catch{verified=false;}
 const checkedAt=new Date().toISOString();
 if(verified){const done=await admin.from('review_projects').update({status:'published',published_at:checkedAt,last_error:null,manifest:{submissionFingerprint:project.manifest.submissionFingerprint,published:true},media:[],preview_path:null,title:'Published submission'}).eq('id',project.id).eq('revision',project.revision);if(done.error)throw done.error;const closed=await admin.from('seller_publish_runs').update({status:'succeeded',before_state:{},after_state:{verified:true},finished_at:checkedAt,last_error:null}).eq('id',run.id);if(closed.error)throw closed.error;}
 else {const saved=await admin.from('seller_publish_runs').update({after_state:{fields:listingSnapshot(listing),images,files,checked_at:checkedAt}}).eq('id',run.id);if(saved.error)throw saved.error;}
 return {verified,run_id:run.id,listing_url:'https://www.etsy.com/listing/'+listingId,images:images.map((i:any)=>({rank:i.rank,alt_text:i.alt_text,url:i.url_570xN})),message:verified?'Etsy matches the approved update.':'Etsy differs from the complete approved update. Inspect the live listing before discarding this submission.'};
}
