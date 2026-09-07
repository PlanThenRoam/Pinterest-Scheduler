// Etsy's binary overwrite can inherit the old image's alt text. Resolve the
// returned ID first, then update that exact image with overwrite=false.
// Never retry an image upload while its outcome is uncertain.
export function verifyImageLayout(actual:any[],expected:any[],ignoreAltRanks:number[]=[]){
 if(!Array.isArray(actual)||actual.length!==expected.length)throw new Error('Image count is not yet confirmed.');
 if(new Set(actual.map(x=>Number(x.rank))).size!==actual.length)throw new Error('Image order is not yet confirmed.');
 for(const image of expected){
  const current=actual.find(x=>Number(x.rank)===Number(image.rank));
  if(!current||String(current.listing_image_id)!==String(image.listing_image_id))throw new Error(`Image ${image.rank} identity or order is not yet confirmed.`);
  if(!ignoreAltRanks.includes(Number(image.rank))&&String(current.alt_text||'')!==String(image.alt_text||''))throw new Error(`Image ${image.rank} alt text is not yet confirmed.`);
 }
}
export async function readImageState(api:any,listingId:string,token:string,expected:any[],ignoreAltRanks:number[]=[]){
 let last:any;
 for(let attempt=0;attempt<4;attempt++){
  const images=(await api.fetch(`/listings/${listingId}/images`,token)).results;
  try{verifyImageLayout(images,expected,ignoreAltRanks);return images;}catch(error){last=error;}
  if(attempt<3)await (api.wait||((ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))))([1000,2000,4000][attempt]);
 }
 throw last;
}
export async function syncConfirmedImageAlt(admin:any,credential:any,token:string,listingId:string,image:any,expected:any[],api:any,step:any){
 const images=await readImageState(api,listingId,token,expected,[Number(image.rank)]);
 const current=images.find((x:any)=>Number(x.rank)===Number(image.rank));
 if(String(current.alt_text||'')!==String(image.altText)){
  await step(`Confirm image ${image.rank} alt text`,()=>api.altText(credential.shop_id,listingId,token,{listingImageId:current.listing_image_id,rank:Number(image.rank),altText:image.altText}));
 }
 return await readImageState(api,listingId,token,expected);
}
