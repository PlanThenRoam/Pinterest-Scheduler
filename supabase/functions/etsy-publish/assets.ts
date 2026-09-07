// Validate every selected attachment before making any Etsy changes.
export async function validateAssetBlob(item:any, blob:Blob, kind:'image'|'pdf') {
  if(!blob.size||blob.size>20*1024*1024)throw new Error(`${item.name}: use a non-empty file no larger than 20 MB.`);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(kind==='pdf'){
    if(!/^[^/\\\x00-\x1f]{1,70}\.pdf$/i.test(String(item.name||''))||String(item.name).length>70||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('Etsy customer files must be genuine PDFs with filenames of at most 70 characters.');
  }else{
    const png=bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
    const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!(png&&/\.png$/i.test(item.name)||jpeg&&/\.jpe?g$/i.test(item.name)))throw new Error('Use a genuine PNG or JPEG for Etsy listing images. Convert other formats before review.');
  }
  if(item.checksum){const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==item.checksum)throw new Error(`${item.name}: attachment integrity check failed.`);}
  return {...item,mime:kind==='pdf'?'application/pdf':bytes[0]===137?'image/png':'image/jpeg',blob};
}

export function verifyNewListingAssets(current:any, files:any[], checkpoint:any, altText:string[]) {
  if(current.images?.length!==6||checkpoint.imageIds?.length!==6)throw new Error('The six new listing images could not be verified. The listing has not been activated.');
  for(let i=0;i<6;i++){
    const image=current.images.find((x:any)=>Number(x.rank)===i+1);
    if(!image||String(image.listing_image_id)!==String(checkpoint.imageIds[i])||String(image.alt_text||'')!==String(altText[i]))throw new Error(`New listing image ${i+1} verification needs review. The listing has not been activated.`);
  }
  if(files.length!==1||!checkpoint.fileId||String(files[0].listing_file_id)!==String(checkpoint.fileId))throw new Error('The new listing PDF could not be verified. The listing has not been activated.');
}
