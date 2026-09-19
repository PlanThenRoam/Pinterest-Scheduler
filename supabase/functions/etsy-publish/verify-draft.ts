import { listingSnapshot, verifyFields } from './safety.ts';
import { verifyNewListingAssets } from './assets.ts';

// Read-only on Etsy. This check cannot create, upload, repair or activate anything.
export async function verifyExistingDraft(project: any, credential: any, token: string, listing: any, api: any) {
  const checkpoint = project.manifest?.etsyPublish || {};
  const listingId = String(checkpoint.listingId || '');
  if (listing.editMode || !['failed', 'ready'].includes(project.status)
      || !/^\d+$/.test(listingId) || String(project.platform_id || '') !== listingId) {
    throw new Error('Only an existing failed or ready new-listing draft can be revalidated.');
  }
  if (!checkpoint.fileUploaded || !checkpoint.fileId || checkpoint.imagesUploaded !== 6
      || checkpoint.imageIds?.length !== 6 || checkpoint.imageUploadAttempted) {
    throw new Error('The existing draft uploads are incomplete or uncertain. No uploads were repeated.');
  }
  const draft = await api.fetch(`/listings/${listingId}?includes=Personalization`, token);
  if (String(draft.listing_id) !== listingId || String(draft.user_id) !== String(credential.etsy_user_id)) {
    throw new Error('The existing draft identity or owner differs.');
  }
  if (draft.state !== 'draft') throw new Error('The existing Etsy listing is no longer a draft.');
  const images = (await api.fetch(`/listings/${listingId}/images`, token)).results;
  const files = (await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`, token)).results;
  if (!Array.isArray(images) || !Array.isArray(files)) throw new Error('Etsy draft asset readback is unavailable.');
  verifyNewListingAssets({images}, files, checkpoint, project.manifest.altText);
  verifyFields({title: listing.title, description: listing.description, tags: listing.tags,
    price: Number(project.manifest.listingDefaults?.price ?? project.manifest.price)}, listingSnapshot(draft), {});
  return {verified: true, listing_id: listingId, state: 'draft', file_id: String(files[0].listing_file_id),
    image_ids: [...checkpoint.imageIds], alt_texts_verified: 6, published: false};
}
