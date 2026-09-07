import {listingSnapshot,verifyFields,equivalent} from './safety.ts';
import {validateAssetBlob} from './assets.ts';
import {readImageState,syncConfirmedImageAlt,verifyImageLayout} from './image-state.ts';

// Resume only an already approved, image-only operation. A recorded upload ID
// is required; an unconfirmed upload is never repeated. Legacy missing final
// images can be restored once, after verifying every remaining image and file.
export async function resumeImages(admin:any,credential:any,token:string,project:any,api:any){
 const m=project.manifest||{},listingId=String(m.listingId||'');
 if(m.mode!=='edit'||!/^\d+$/.test(listingId)||m.updateScope?.length!==1||m.updateScope[0]!=='images'||Object.keys(m.updateFields||{}).length)throw Error('Only an approved image-only update can use image recovery.');
 const found=await admin.from('seller_publish_runs').select('*').eq('project_id',project.id).in('status',['needs_review']).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(found.error)throw found.error;const run=found.data;if(!run)throw Error('No paused image update was found, or it is already finishing.');
 const claim=await admin.from('seller_publish_runs').update({status:'running'}).eq('id',run.id).eq('status','needs_review').select('id').maybeSingle();if(claim.error||!claim.data)throw Error('This image update is already finishing.');
 const steps=structuredClone(run.steps||[]),before=run.before_state||{};
 const save=async(value:any)=>{const result=await admin.from('seller_publish_runs').update(value).eq('id',run.id);if(result.error)throw result.error;};
 const step=async(name:string,action:any)=>{
  steps.push({name,status:'attempting',at:new Date().toISOString()});await save({steps});
  const result=await action(),image=result?.results?.[0]||result;
  Object.assign(steps[steps.length-1],{status:'confirmed',...(image?.listing_image_id?{image_id:String(image.listing_image_id)}:{})});await save({steps});return result;
 };
 try{
  if(!before.fields||!Array.isArray(before.images)||!Array.isArray(before.files)||!m.imageReplacements?.length)throw Error('The original image update record is incomplete.');
  const current=await api.fetch(`/listings/${listingId}?includes=Personalization`,token);
  if(String(current.user_id)!==String(credential.etsy_user_id))throw Error('This listing does not belong to the connected Etsy account.');
  verifyFields(before.fields,listingSnapshot(current),{});
  const files=(await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`,token)).results;
  if(!Array.isArray(files)||!equivalent(before.files.map((x:any)=>String(x.listing_file_id)).sort(),files.map((x:any)=>String(x.listing_file_id)).sort()))throw Error('The listing PDFs changed. Image recovery stopped.');
  let images=(await api.fetch(`/listings/${listingId}/images`,token)).results;
  if(!Array.isArray(images))throw Error('Etsy image readback is unavailable.');
  const plans=m.imageReplacements.map((image:any)=>{
   const rank=Number(image.rank),old=before.images.find((x:any)=>Number(x.rank)===rank),actual=images.find((x:any)=>Number(x.rank)===rank);
   const uploadSteps=steps.filter((s:any)=>s.name===`Replace image ${rank}`||s.name===`Restore image ${rank}`);
   if(uploadSteps.some((s:any)=>s.status!=='confirmed'))throw Error(`Image ${rank} upload was not confirmed. It will not be repeated.`);
   const upload=uploadSteps.at(-1);
   const legacy=steps.findLast((s:any)=>s.status==='confirmed'&&s.image_id&&(s.name===`Recover alt text ${rank}`||s.name===`Update replacement alt text ${rank}`));
   const recordedId=String(upload?.image_id||legacy?.image_id||'');
   if(upload&&!recordedId)throw Error(`Image ${rank}'s uploaded identity needs verification before recovery.`);
   if(actual&&String(actual.listing_image_id)!==String(upload?recordedId:old?.listing_image_id||''))throw Error(`Image ${rank} changed outside this update. Recovery stopped.`);
   if(!actual&&(rank!==images.length+1||rank!==before.images.length||uploadSteps.some((s:any)=>s.name===`Restore image ${rank}`)))throw Error('The missing image is not an untouched final slot. Recovery stopped.');
   return {...image,rank,actual,upload,recordedId,needsUpload:!actual||!upload};
  });
  const ranks=plans.map((p:any)=>p.rank);
  if(new Set(ranks).size!==ranks.length)throw Error('Image positions are duplicated.');
  const allowed=before.images.map((old:any)=>{const p=plans.find((x:any)=>x.rank===Number(old.rank));return p?(p.actual||null):old;}).filter(Boolean);
  verifyImageLayout(images,allowed,ranks);
  // Validate every asset before any recovery write.
  for(const p of plans.filter((x:any)=>x.needsUpload)){
   const item=(project.media||[]).find((x:any)=>x.role===p.role);if(!item)throw Error('The approved image attachment is missing.');
   p.item=await validateAssetBlob(item,await api.storageFile(admin,item),'image');
  }
  let layout=images.map((x:any)=>({...x}));
  for(const p of plans){
   if(p.needsUpload){
    await readImageState(api,listingId,token,layout);
    const result=await step(p.upload?`Restore image ${p.rank}`:`Replace image ${p.rank}`,()=>api.uploadImage(admin,credential.shop_id,listingId,token,p.item,p.rank,p.altText,Boolean(p.actual)));
    const uploaded=result?.results?.[0]||result;if(!uploaded?.listing_image_id)throw Error('Etsy did not confirm the image ID. Do not repeat the upload.');
    p.recordedId=String(uploaded.listing_image_id);
   }
   layout=layout.filter((x:any)=>Number(x.rank)!==p.rank);layout.push({listing_image_id:p.recordedId,rank:p.rank,alt_text:p.altText});
   await syncConfirmedImageAlt(admin,credential,token,listingId,p,layout,api,step);
  }
  images=await readImageState(api,listingId,token,layout);
  const final=await api.fetch(`/listings/${listingId}?includes=Personalization`,token);verifyFields(before.fields,listingSnapshot(final),{});
  const finalFiles=(await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`,token)).results;
  if(!Array.isArray(finalFiles)||!equivalent(before.files.map((x:any)=>String(x.listing_file_id)).sort(),finalFiles.map((x:any)=>String(x.listing_file_id)).sort()))throw Error('PDF verification differs.');
  const at=new Date().toISOString();
  const done=await admin.from('review_projects').update({status:'published',published_at:at,last_error:null,manifest:{submissionFingerprint:m.submissionFingerprint,published:true},media:[],preview_path:null,title:'Published submission'}).eq('id',project.id).eq('revision',project.revision);if(done.error)throw done.error;
  await save({status:'succeeded',before_state:{},after_state:{verified:true},finished_at:at,last_error:null});
  return {ok:true,verified:true,listing_id:listingId,listing_url:`https://www.etsy.com/listing/${listingId}`,images:images.map((x:any)=>({image_id:x.listing_image_id,rank:x.rank,alt_text:x.alt_text}))};
 }catch(error){const detail=error instanceof Error?error.message:'Image recovery paused.';await save({status:'needs_review',last_error:detail,finished_at:new Date().toISOString()});await admin.from('review_projects').update({status:'failed',last_error:detail}).eq('id',project.id);throw Error(detail);}
}
