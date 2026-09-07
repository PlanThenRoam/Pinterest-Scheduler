import { validateAssetBlob } from './assets.ts';
import { listingSnapshot, equivalent, preflightFiles, verifyFields } from './safety.ts';

// Etsy changes span multiple HTTP calls. Persist attempts before each write and
// keep the listing locked when a timeout makes the outcome uncertain.
export async function runEdit(admin: any, credential: any, token: string, project: any, listing: any, api: any) {
  const listingId = String(listing.manifest.listingId || listing.manifest.etsyListingId || project.platform_id || '');
  if (!/^\d+$/.test(listingId)) throw new Error('The existing Etsy listing ID is missing.');
  const runId = crypto.randomUUID();
  const { error: lockError } = await admin.from('seller_publish_runs').insert({
    id: runId, project_id: project.id, listing_key: listingId, revision: project.revision, status: 'running',
  });
  if (lockError) throw new Error('This listing already has a running or unresolved update. Review its publishing history first.');
  const steps: any[] = [];
  let attempted = false, claimed = false;
  const writeRun = async (changes: any) => {
    const { error } = await admin.from('seller_publish_runs').update(changes).eq('id', runId);
    if (error) throw error;
  };
  const step = async (name: string, action: () => Promise<any>) => {
    steps.push({ name, status: 'attempting', at: new Date().toISOString() });
    await writeRun({ steps });
    attempted = true;
    const result = await action();
    steps[steps.length - 1].status = 'confirmed';
    const resource = result?.results?.[0] || result;
    if (resource?.listing_image_id) steps[steps.length - 1].image_id = String(resource.listing_image_id);
    await writeRun({ steps });
    return result;
  };
  try {
    const { data: claim, error: claimError } = await admin.from('review_projects')
      .update({ status: 'publishing', last_error: null }).eq('id', project.id)
      .eq('revision', project.revision).in('status', ['ready', 'approved', 'failed']).select('id').maybeSingle();
    if (claimError || !claim) throw new Error('The project changed or is already publishing. Refresh it before trying again.');
    claimed = true;
    const original = await api.fetch(`/listings/${listingId}?includes=Images,Personalization`, token);
    if (String(original.user_id || '') !== String(credential.etsy_user_id)) throw new Error('That listing does not belong to the connected Etsy account.');
    original.images=(await api.fetch(`/listings/${listingId}/images`,token)).results;
    if(!Array.isArray(original.images))throw new Error('Etsy image readback is unavailable.');
    const files = (await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`, token)).results || [];
    const before = listingSnapshot(original);
    const captured = listing.manifest.existingSnapshot;
    if (captured) for (const key of Object.keys(before)) {
      if (key in captured && !equivalent(captured[key], before[key])) throw new Error(`The live ${key} changed since this draft was prepared. Reopen the listing and review a fresh update.`);
    }
    const updates = [...(listing.fileUpdates || [])].sort((a, b) => (a.action === 'add' ? 1 : 0) - (b.action === 'add' ? 1 : 0));
    if (listing.scopes.includes('files')) preflightFiles(files, updates);
    const images = original.images || [];
    const ranks = new Set<number>();
    for (const image of listing.images || []) {
      if (ranks.has(Number(image.rank))) throw new Error('Choose each image position only once.');
      ranks.add(Number(image.rank));
      if (Array.isArray(listing.manifest.existingImages)) {
        const captured = listing.manifest.existingImages.find((x:any)=>Number(x.rank)===Number(image.rank));
        const actual = images.find((x:any)=>Number(x.rank)===Number(image.rank));
        if (String(captured?.id||'')!==String(actual?.listing_image_id||'')) throw new Error(`Image ${image.rank} changed since this draft was prepared. Review a fresh update.`);
      }
    }
    for (const image of listing.altTextUpdates || []) {
      if (ranks.has(Number(image.rank))) throw new Error('An image position has more than one change.');
      ranks.add(Number(image.rank));
      if (!images.some((x: any) => String(x.listing_image_id) === String(image.listingImageId) && Number(x.rank) === Number(image.rank))) throw new Error('An image moved or was replaced. Reopen the listing before editing its alt text.');
    }
    const resultingRanks=[...new Set([...images.map((x:any)=>Number(x.rank)),...(listing.images||[]).map((x:any)=>Number(x.rank))])].sort((a,b)=>a-b);
    if(resultingRanks.some((rank,i)=>rank!==i+1))throw new Error('Add images in consecutive positions after the current final image.');
    const stored = new Map<string, Blob>();
    for (const entry of [...(listing.images || []), ...(listing.scopes.includes('files') ? updates : [])]) {
      const item = entry.item;
      if (!stored.has(item.path)) {
        const blob = await api.storageFile(admin, item);
        stored.set(item.path, blob);
      }
      entry.item = await validateAssetBlob({...item,name:entry.filename||item.name},stored.get(item.path)!,(listing.images||[]).includes(entry)?'image':'pdf');
    }
    await writeRun({ before_state: { fields: before, images, files } });
    if (Object.keys(listing.fields).some(key => key !== 'personalization')) await step('Update selected listing fields', () => api.updateFields(credential.shop_id, listingId, token, listing.fields));
    if (listing.scopes.includes('personalization')) await step('Update personalisation', () => api.personalization(credential.shop_id, listingId, token, listing.fields.personalization));
    const expectedImages = new Map<number, string>();
    for (const image of listing.images || []) {
      const response = await step(`Replace image ${image.rank}`, () => api.uploadImage(admin, credential.shop_id, listingId, token, image.item, Number(image.rank), image.altText, true));
      const uploaded = response?.results?.[0] || response;
      if (!uploaded?.listing_image_id) throw new Error(`Etsy did not confirm image ${image.rank}'s ID. Inspect the listing before retrying.`);
      expectedImages.set(Number(image.rank), String(uploaded.listing_image_id));

    }
    for (const image of listing.altTextUpdates || []) await step(`Update alt text ${image.rank}`, () => api.altText(credential.shop_id, listingId, token, image));
    const expectedFiles = files.map((x: any) => ({ ...x }));
    if (listing.scopes.includes('files')) for (const file of updates) {
      const index = expectedFiles.findIndex((x: any) => String(x.listing_file_id) === String(file.listingFileId));
      const rank = file.action === 'replace' ? Number(expectedFiles[index].rank) : expectedFiles.length + 1;
      const response = await step(`Upload ${file.filename}`, () => api.uploadFile(admin, credential.shop_id, listingId, token, file.item, rank));
      const uploaded = response.results?.[0] || response;
      if (!uploaded.listing_file_id) throw new Error('Etsy did not confirm the new file ID. Inspect the listing before retrying.');
      if (file.action === 'replace') {
        await step(`Remove replaced file ${file.listingFileId}`, () => api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files/${file.listingFileId}`, token, { method: 'DELETE' }));
        expectedFiles[index] = { ...uploaded, rank };
      } else expectedFiles.push({ ...uploaded, rank });
    }
    const current = await api.fetch(`/listings/${listingId}?includes=Images,Personalization`, token);
    current.images=(await api.fetch(`/listings/${listingId}/images`,token)).results;
    if(!Array.isArray(current.images))throw new Error('Etsy image readback is unavailable.');
    const currentFiles = (await api.fetch(`/shops/${credential.shop_id}/listings/${listingId}/files`, token)).results || [];
    await writeRun({ after_state: { fields: listingSnapshot(current), images: current.images, files: currentFiles } });
    verifyFields(before, listingSnapshot(current), listing.fields);
    const expectedCount=images.length+(listing.images||[]).filter((x:any)=>!images.some((old:any)=>Number(old.rank)===Number(x.rank))).length;
    if(current.images?.length!==expectedCount||new Set((current.images||[]).map((x:any)=>Number(x.rank))).size!==expectedCount)throw new Error('Image count or order verification needs review.');
    const ids = (items: any[]) => items.map(x => String(x.listing_file_id)).sort();
    if (!equivalent(ids(expectedFiles), ids(currentFiles))) throw new Error('Digital file verification needs review. The live file IDs differ from the expected set.');
    for (const previous of images) {
      const rank = Number(previous.rank);
      const replacement = (listing.images || []).find((x: any) => Number(x.rank) === rank);
      const alt = (listing.altTextUpdates || []).find((x: any) => Number(x.rank) === rank);
      const actual = (current.images || []).find((x: any) => Number(x.rank) === rank);
      if (!actual || (!replacement && String(actual.listing_image_id) !== String(previous.listing_image_id)) || String(actual.alt_text || '') !== String(replacement?.altText ?? alt?.altText ?? previous.alt_text ?? '')) throw new Error(`Image ${rank} verification needs review.`);
    }
    for (const replacement of listing.images || []) {
      const actual = (current.images || []).find((x: any) => Number(x.rank) === Number(replacement.rank));
      if (!actual || String(actual.listing_image_id) !== expectedImages.get(Number(replacement.rank)) || String(actual.alt_text || '') !== String(replacement.altText)) throw new Error(`Image ${replacement.rank} verification needs review.`);
    }
    const completedAt = new Date().toISOString();

    const audit = { runId, scopes: listing.scopes, before, approvedFields: listing.fields, verified: true, completedAt };
    const { error } = await admin.from('review_projects').update({ status: 'published', platform_id: listingId, published_at: completedAt, last_error: null, manifest: { ...project.manifest, etsyUpdateAudit: audit } }).eq('id', project.id);
    if (error) throw error;
    await writeRun({ status: 'succeeded', after_state: { fields: listingSnapshot(current), images: current.images, files: currentFiles }, finished_at: completedAt });
    return { ok: true, updated: true, verified: true, updated_fields: listing.scopes, listing_id: listingId, listing_url: `https://www.etsy.com/listing/${listingId}` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Etsy update failed.';
    const message = attempted ? `Some changes may already be live. Inspect the listing before another update. ${detail}` : detail;
    await writeRun({ status: attempted ? 'needs_review' : 'blocked', last_error: message, finished_at: new Date().toISOString() });
    if (claimed) await admin.from('review_projects').update({ status: 'failed', last_error: message }).eq('id', project.id);
    throw new Error(message);
  }
}
