// One contract for new-listing preparation, approval and Etsy readback.
// Existing-listing edits keep their explicit, independently selected positions.
export const NEW_LISTING_IMAGE_ROLES = ['thumbnail', 'listing-image-1', 'listing-image-2',
  'listing-image-3', 'listing-image-4', 'listing-image-5', 'listing-image-6'];
export const NEW_LISTING_IMAGE_COUNT = NEW_LISTING_IMAGE_ROLES.length;

export function validateNewListingAltText(altText: any) {
  if (!Array.isArray(altText) || altText.length !== NEW_LISTING_IMAGE_COUNT
      || Array.from(altText).some(value => typeof value !== 'string' || !value.trim() || value.length > 500)) {
    throw new Error('Add exactly seven non-empty Etsy image alt texts, each at most 500 characters.');
  }
}

export function newListingImages(media: any) {
  const items = Array.isArray(media) ? media : [];
  if (items.some(item => String(item?.role || '').startsWith('listing-image')
      && !NEW_LISTING_IMAGE_ROLES.includes(item.role))) {
    throw new Error('New listings require exactly seven images: thumbnail and listing-image-1 through listing-image-6.');
  }
  return NEW_LISTING_IMAGE_ROLES.map(role => {
    const matches = items.filter(item => item?.role === role);
    if (matches.length !== 1 || !matches[0].path || !matches[0].name) {
      throw new Error(`Attach exactly one ${role}: all seven listing images are required.`);
    }
    return matches[0];
  });
}
