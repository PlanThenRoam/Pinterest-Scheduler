import { listingSnapshot, verifyFields, equivalent } from './safety.ts';

// Complete only the approved alt text after a confirmed image upload. No image
// upload, file write or listing-field mutation is available in this recovery.
export async function recoverImageAltText(admin:any, credential:any, token:string, project:any, listing:any, body:any, api:any) {
  if (body.confirmed_existing_images !== true || listing.scopes.length !== 1 || listing.scopes[0] !== 'images' || !listing.images.length) throw new Error('Recovery is available only for confirmed image-only updates.');
  const {data:run,error}=await admin.from('seller_publish_runs').select('*').eq('project_id',project.id).eq('status','needs_review').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error||!run||run.revision!==project.revision||!run.before_state)throw new Error('This update cannot be resumed safely. Review its publishing history.');
  const listingId=String(run.listing_key), before=run.before_state;
  if(listing.images.some((x:any)=>!before.images.some((old:any)=>Number(old.rank)===Number(x.rank))))throw new Error('Recovery requires existing image positions.');
  const read=async()=>({listing:await api.fetch(`/listings/${listingId}?includes=Images,Personalization`,token),files:(await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`,token)).results||[]});
  const check=(state:any,final=false)=>{
    if(String(state.listing.user_id)!==String(credential.etsy_user_id))throw new Error('Listing owner differs.');
    verifyFields(before.fields,listingSnapshot(state.listing),{});
    const ids=(items:any[],key:string)=>items.map(x=>String(x[key])).sort();
    if(!equivalent(ids(before.files,'listing_file_id'),ids(state.files,'listing_file_id')))throw new Error('Digital files changed. Recovery stopped.');
    if(state.listing.images?.length!==before.images.length)throw new Error('Image count changed. Recovery stopped.');
    for(const old of before.images){
      const replacement=listing.images.find((x:any)=>Number(x.rank)===Number(old.rank));
      const current=state.listing.images.find((x:any)=>Number(x.rank)===Number(old.rank));
      if(!current)throw new Error('Image order changed. Recovery stopped.');
      if(replacement){
        const confirmed=run.steps.find((x:any)=>x.name===`Replace image ${old.rank}`&&x.status==='confirmed');
        const expected=String(body.expected_image_ids?.[old.rank]||'');
        if(!confirmed||!expected||String(current.listing_image_id)!==expected||expected===String(old.listing_image_id)||(confirmed.image_id&&String(confirmed.image_id)!==expected))throw new Error('The replacement image identity could not be confirmed.');
        if(final&&String(current.alt_text||'')!==String(replacement.altText))throw new Error(`Image ${old.rank} alt text still differs. No image was uploaded again.`);
      }else if(String(current.listing_image_id)!==String(old.listing_image_id)||String(current.alt_text||'')!==String(old.alt_text||''))throw new Error('An unselected image changed. Recovery stopped.');
    }
  };
  const first=await read();check(first);
  const {data:claim,error:claimError}=await admin.from('seller_publish_runs').update({status:'running'}).eq('id',run.id).eq('status','needs_review').select('id').maybeSingle();
  if(claimError||!claim)throw new Error('Recovery is already running.');
  const save=async(changes:any)=>{const {error}=await admin.from('seller_publish_runs').update(changes).eq('id',run.id);if(error)throw error;};
  try{
    const {data:projectClaim,error:claimError}=await admin.from('review_projects').update({status:'publishing'}).eq('id',project.id).eq('revision',project.revision).eq('status','failed').select('id').maybeSingle();
    if(claimError||!projectClaim)throw new Error('The review project changed. Refresh before recovery.');
    for(const replacement of listing.images){
      const current=first.listing.images.find((x:any)=>Number(x.rank)===Number(replacement.rank));
      if(String(current.alt_text||'')===String(replacement.altText))continue;
      const step={name:`Recover alt text ${replacement.rank}`,status:'attempting',image_id:String(current.listing_image_id),at:new Date().toISOString()};
      run.steps.push(step);await save({steps:run.steps});
      await api.altText(credential.shop_id,listingId,token,{listingImageId:current.listing_image_id,rank:replacement.rank,altText:replacement.altText});
      step.status='confirmed';await save({steps:run.steps});
    }
    const final=await read();await save({after_state:{fields:listingSnapshot(final.listing),images:final.listing.images,files:final.files}});check(final,true);
    const completedAt=new Date().toISOString();
    const {error:projectError}=await admin.from('review_projects').update({status:'published',published_at:completedAt,last_error:null,manifest:{...project.manifest,etsyUpdateAudit:{runId:run.id,scopes:listing.scopes,verified:true,recovered:true,completedAt}}}).eq('id',project.id).eq('revision',project.revision);
    if(projectError)throw projectError;
    await save({status:'succeeded',last_error:null,finished_at:completedAt});
    return {ok:true,verified:true,recovered:true,listing_id:listingId};
  }catch(error){await save({status:'needs_review',last_error:error instanceof Error?error.message:'Recovery failed.'});await admin.from('review_projects').update({status:'failed'}).eq('id',project.id).eq('status','publishing');throw error;}
}
