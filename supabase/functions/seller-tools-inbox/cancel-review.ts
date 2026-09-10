/** Permanent cancellation, with a publication lock retained for uncertain writes. */
export async function cancelReview(admin:any, project:any, userId:string, readListing?:(id:string)=>Promise<any>) {
 const publish=project.manifest?.etsyPublish||{};
 if(project.manifest?.pinAttempted)throw new Error('A platform submission has started. Verify its result before deleting this submission.');
 // Completed new-listing attempts may have failed only at final verification.
 // Resolve their known Etsy result through an authenticated read, never a retry.
 if(publish.creationAttempted||publish.imageUploadAttempted||publish.fileUploadAttempted){
  const knownId=String(publish.listingId||'');
  if(project.kind!=='etsy'||project.manifest?.mode==='edit'||project.status!=='failed'||
    !/^[0-9]+$/.test(knownId)||String(project.platform_id||'')!==knownId||
    publish.imageUploadAttempted||!publish.fileUploaded||!publish.fileId||
    !Array.isArray(publish.imageIds)||publish.imageIds.length!==6||publish.imagesUploaded!==6||!readListing)
   throw new Error('A platform submission has started. Verify its result before deleting this submission.');
  const live=await readListing(knownId);
  const imageIds=new Set((live?.images||[]).map((image:any)=>String(image.listing_image_id)));
  if(String(live?.listing_id||'')!==knownId||!['active','draft','inactive','expired','sold_out'].includes(live?.state)||
    !publish.imageIds.every((id:any)=>imageIds.has(String(id))))
   throw new Error('The current Etsy result could not be verified. This submission has been kept.');
 }
 const checked=(r:any)=>{if(r.error)throw r.error;return r.data;};
 const runs=checked(await admin.from('seller_publish_runs').select('id,status').eq('project_id',project.id))||[];
 if(project.status==='publishing'||runs.some((r:any)=>['running','needs_review'].includes(r.status)))throw new Error('Publication is still unresolved. Check its live result before deleting this submission.');
 if(project.status==='published')throw new Error('This submission has already been published.');
 // Claim against its captured revision and status so a concurrent approval wins
 // or cancellation wins, never both. Publisher only accepts ready/approved/failed.
 const claimed=checked(await admin.from('review_projects').update({status:'changes_requested'}).eq('id',project.id).eq('revision',project.revision).eq('status',project.status).select('id').maybeSingle());
 if(!claimed)throw new Error('The submission changed. Refresh before cancelling.');
 const versions=checked(await admin.from('review_project_versions').select('media').eq('project_id',project.id))||[];
 const paths=[...new Set([project.preview_path,...(project.media||[]).map((x:any)=>x.path),...versions.flatMap((v:any)=>(v.media||[]).map((x:any)=>x.path))].filter(Boolean))] as string[];
 if(paths.some(path=>!path.startsWith(`${userId}/${project.id}/`)))throw new Error('Unexpected asset owner or project reference. Cancellation stopped.');
 const bucket=project.kind==='etsy'?'etsy-assets':'pinterest-media';
 if(paths.length)checked(await admin.storage.from(bucket).remove(paths));
 checked(await admin.from('seller_master_publications').delete().eq('project_id',project.id).eq('user_id',userId));
 checked(await admin.from('review_project_versions').delete().eq('project_id',project.id));
 checked(await admin.from('seller_publish_runs').delete().eq('project_id',project.id).in('status',['blocked','dismissed','succeeded']));
 checked(await admin.from('review_projects').delete().eq('id',project.id).eq('status','changes_requested'));
 return {project_id:project.id,deleted:true,assets_deleted:paths.length,published:false};
}
