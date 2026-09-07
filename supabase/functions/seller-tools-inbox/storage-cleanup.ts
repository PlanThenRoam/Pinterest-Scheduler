// Delete superseded objects in bounded batches. Failed deletions keep their jobs.
export async function drainStorageCleanup(admin:any,userId:string) {
 for(let page=0;page<25;page++){
  const {data,error}=await admin.from('seller_storage_cleanup').select('id,bucket,path').eq('user_id',userId).limit(200);if(error)throw error;
  const jobs=data||[];
  for(const job of jobs)if(!['seller-master-files','etsy-assets','pinterest-media'].includes(job.bucket)||!job.path.startsWith(userId+'/'))throw new Error('Invalid cleanup ownership.');
  for(const bucket of [...new Set(jobs.map((j:any)=>j.bucket))]){
   const group=jobs.filter((j:any)=>j.bucket===bucket);
   const removed=await admin.storage.from(bucket).remove(group.map((j:any)=>j.path));
   if(removed.error)throw new Error('The current file is saved, but old-file cleanup is pending. Retry to finish cleanup.');
   const cleared=await admin.from('seller_storage_cleanup').delete().in('id',group.map((j:any)=>j.id)).eq('user_id',userId);if(cleared.error)throw cleared.error;
  }
  if(jobs.length<200)return {cleanup_complete:true};
 }
 throw new Error('Old-file cleanup is pending. Retry to finish cleanup.');
}
