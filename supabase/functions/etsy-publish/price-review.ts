import {sameImageAltText} from './image-state.ts';
import {listingSnapshot,verifyFields} from './safety.ts';
import {preparePriceInventory} from './price-inventory.ts';

// Approval preparation is read-only on Etsy, including inventory and attachments.
export async function verifyPriceReview(project:any,credential:any,token:string,api:any){
 const m=project.manifest||{},listingId=String(m.listingId||'');
 if(m.mode!=='edit'||!m.updateScope?.includes('price')||!/^\d+$/.test(listingId)||!m.existingSnapshot)throw Error('A saved price review is required.');
 const listing=await api.fetch(`/listings/${listingId}?includes=Personalization`,token);
 if(String(listing.user_id)!==String(credential.etsy_user_id))throw Error('Listing ownership changed.');
 if(listing.listing_type!=='download')throw Error('Price review currently supports single-product digital planners only.');
 if(listing.price?.currency_code!=='GBP'||(m.currency&&m.currency!==listing.price.currency_code))throw Error('The live shop currency differs from this GBP price review.');
 const snapshot=listingSnapshot(listing);
 verifyFields(m.existingSnapshot,snapshot,{});
 const inventory=await api.fetch(`/listings/${listingId}/inventory`,token);
 preparePriceInventory(inventory,snapshot.price,m.updateFields?.price,m.currency||listing.price?.currency_code);
 const images=(await api.fetch(`/listings/${listingId}/images`,token)).results;
 const files=(await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`,token)).results;
 if(!Array.isArray(images)||!Array.isArray(files)||!Array.isArray(m.existingImages)||!Array.isArray(m.existingFiles))throw Error('Saved listing assets could not be verified.');
 if(images.length!==m.existingImages.length||m.existingImages.some((saved:any)=>!images.some((x:any)=>String(x.listing_image_id)===String(saved.id)&&Number(x.rank)===Number(saved.rank)&&sameImageAltText(saved.altText,x.alt_text))))throw Error('Listing images changed since this price review was prepared.');
 if(files.length!==m.existingFiles.length||m.existingFiles.some((saved:any)=>!files.some((x:any)=>String(x.listing_file_id)===String(saved.id)&&Number(x.rank)===Number(saved.rank)&&x.filename===saved.name)))throw Error('Customer PDFs changed since this price review was prepared.');
 return {verified:true,listing_id:listingId,current_price:snapshot.price,proposed_price:m.updateFields.price,currency:listing.price?.currency_code,published:false,checked_at:new Date().toISOString()};
}
