// Pure preflight and comparison helpers shared by the publisher regression tests.
export const FIELD_KEYS: Record<string, string> = {
  title: 'title', description: 'description', price: 'price', quantity: 'quantity',
  tags: 'tags', taxonomyId: 'taxonomy_id', shopSectionId: 'shop_section_id',
  materials: 'materials', styles: 'styles', whoMade: 'who_made', whenMade: 'when_made',
  isSupply: 'is_supply', isTaxable: 'is_taxable', autoRenew: 'should_auto_renew', state: 'state',
  personalization: 'personalization',
};
export function listingSnapshot(listing: any) {
  const result: any = {};
  for (const [key, apiKey] of Object.entries(FIELD_KEYS)) {
    const value = listing[apiKey];
    result[key] = ['tags','materials','styles'].includes(key) && value == null ? [] : key === 'price' && value && typeof value === 'object'
      ? Number(value.amount) / Number(value.divisor || 100) : value ?? null;
  }
  return result;
}
export function equivalent(a: any, b: any): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.every(key => equivalent(a[key], b[key]));
  }
  return a === b;
}
export function preflightFiles(existing: any[], updates: any[]) {
  let count = existing.length;
  const targeted = new Set<string>();
  // Replacements run before additions so that available capacity stays available.
  for (const update of [...updates].sort((a, b) => (a.action === 'add' ? 1 : 0) - (b.action === 'add' ? 1 : 0))) {
    if (update.action === 'add') { if (++count > 5) throw new Error('Etsy allows five digital files. Remove a file in Etsy before adding another.'); continue; }
    const id = String(update.listingFileId);
    if (targeted.has(id)) throw new Error('Select each existing digital file only once.');
    targeted.add(id);
    if (!existing.some(file => String(file.listing_file_id) === id)) throw new Error('An original digital file has changed. Reopen the listing to prepare a fresh update.');
    if (count >= 5) throw new Error('Safe replacement needs one free Etsy file slot. This listing already has five files; replace it in Etsy or free a slot first. No files have been deleted.');
  }
}
export function verifyFields(before: any, after: any, fields: any) {
  for (const key of Object.keys(FIELD_KEYS)) {
    if (!(key in before)) continue;
    const expected = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : before[key];
    if (!equivalent(expected, after[key])) throw new Error(`Etsy verification needs review: ${key} differs from the expected value.`);
  }
}
