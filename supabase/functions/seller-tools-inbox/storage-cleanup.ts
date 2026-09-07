// A failed delete remains queued so a retry can finish without re-uploading.
export async function drainStorageCleanup(admin:any,userId:string) {
 const {data,error}=await admin.from('seller_storage_cleanup').select('id,bucket,path').eq('user_id',userId).limit(200);
 if(error)throw error;
 for(const job of data||[]){
  if(job.bucket!=='seller-master-files'||!job.path.startsWith(userId+'/'))throw new Error('Invalid cleanup ownership.');
  const removed=await admin.storage.from(job.bucket).remove([job.path]);
  if(removed.error)throw new Error('The current backup is saved, but old-file cleanup is pending. Retry to finish cleanup.');
  const cleared=await admin.from('seller_storage_cleanup').delete().eq('id',job.id).eq('user_id',userId);
  if(cleared.error)throw cleared.error;
 }
 return {cleanup_complete:(data||[]).length<200};
}
