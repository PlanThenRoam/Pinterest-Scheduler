import { NEW_LISTING_IMAGE_COUNT } from '../etsy-publish/new-listing.ts';

function sameJson(left: any, right: any): boolean {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

// This only validates the proposed repair. The caller must authenticate the owner,
// check the revision, verify the existing Etsy draft using GET requests, and save
// with a revision/status compare-and-swap. It never releases the approval lock.
export function priceRecoveryCandidate(project: any, args: any): number {
  const current = project?.manifest;
  if (project?.kind !== 'etsy' || project.status !== 'failed' || !current
      || current.mode === 'edit' || current.listingId || current.etsyListingId
      || current.archived) {
    throw new Error('Price recovery requires an existing failed new-listing draft.');
  }
  if (!args || args.project_id !== project.id) throw new Error('The price recovery project identity differs.');
  const allowed = new Set(['project_id', 'expected_revision', 'manifest', 'title', 'mark_ready']);
  if (Object.keys(args).some(key => !allowed.has(key))
      || (Object.prototype.hasOwnProperty.call(args, 'mark_ready') && args.mark_ready !== false)
      || (Object.prototype.hasOwnProperty.call(args, 'title') && args.title !== project.title)) {
    throw new Error('Price recovery can change only the proposed price.');
  }
  const checkpoint = current.etsyPublish || {};
  const listingId = String(checkpoint.listingId || '');
  if (!/^\d+$/.test(listingId) || String(project.platform_id || '') !== listingId
      || checkpoint.activated || checkpoint.publishedAt) {
    throw new Error('Price recovery requires the same unpublished Etsy draft identity.');
  }
  // A confirmed file ID resolves an earlier fileUploadAttempted checkpoint.
  // The publisher retains that historical flag after a successful PDF upload.
  if (checkpoint.fileUploaded !== true || !/^\d+$/.test(String(checkpoint.fileId || ''))
      || checkpoint.imagesUploaded !== NEW_LISTING_IMAGE_COUNT || checkpoint.imageUploadAttempted
      || !Array.isArray(checkpoint.imageIds) || checkpoint.imageIds.length !== NEW_LISTING_IMAGE_COUNT
      || checkpoint.imageIds.some((id: any) => !/^\d+$/.test(String(id)))
      || new Set(checkpoint.imageIds.map(String)).size !== NEW_LISTING_IMAGE_COUNT) {
    throw new Error('Price recovery requires seven confirmed images and the confirmed customer PDF.');
  }
  if (current.listingDefaults?.currency !== 'GBP'
      || (current.currency !== undefined && current.currency !== 'GBP')) {
    throw new Error('Price recovery requires the existing GBP shop currency.');
  }
  const next = args.manifest;
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    throw new Error('Price recovery requires the complete unchanged manifest with its corrected price.');
  }
  const price = next.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0
      || !Number.isSafeInteger(Math.round(price * 100))
      || Math.abs(price * 100 - Math.round(price * 100)) > 1e-8) {
    throw new Error('The Etsy price must be a positive number with at most two decimal places.');
  }
  if (Number(current.price) === price) throw new Error('The proposed price is unchanged; revalidate the existing draft instead.');
  const previousFields = {...current}, proposedFields = {...next};
  delete previousFields.price;
  delete proposedFields.price;
  if (!sameJson(previousFields, proposedFields)) {
    throw new Error('Price recovery must preserve every other manifest field, asset and listing checkpoint.');
  }
  return price;
}
