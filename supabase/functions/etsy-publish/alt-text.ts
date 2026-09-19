// Alt-text changes refer to existing images, never to replacement upload roles.
export function validateAltTextUpdates(manifest: any) {
  const updates = manifest.altTextUpdates;
  if (!Array.isArray(updates) || !updates.length || updates.length > 20) throw new Error('Choose one to twenty existing images for alt-text updates.');
  const ids = new Set<string>(), ranks = new Set<number>();
  return updates.map((image: any) => {
    const id = String(image?.listingImageId || ''), rank = Number(image?.rank), text = image?.altText;
    if (!/^\d+$/.test(id) || !Number.isInteger(rank) || rank < 1 || rank > 20
        || typeof text !== 'string' || !text.trim() || text.length > 500) throw new Error('Each alt-text update needs an existing image ID, position and 1–500 characters.');
    if (ids.has(id) || ranks.has(rank)) throw new Error('Choose each image only once for alt-text updates.');
    ids.add(id); ranks.add(rank);
    if (!manifest.existingImages?.some((old: any) => String(old.id) === id && Number(old.rank) === rank)) throw new Error('The alt-text image does not match the saved listing. Prepare a fresh update.');
    if (manifest.imageReplacements?.some((replacement: any) => Number(replacement.rank) === rank)) throw new Error('Choose either image replacement or alt text only for each position.');
    return {listingImageId: id, rank, altText: text};
  });
}
