'use strict';
// Shared by the interface and dependency-free regression tests.
const SellerCore = (() => {
  const labels = { title:'Title', description:'Description', tags:'13 Tags', price:'Price', images:'Images', alt_text:'Alt Text', files:'Digital Files' };
  const value = v => Array.isArray(v) ? v.join('\n') : v && typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '');
  function changes(manifest) {
    const m = manifest || {};
    const scope = Array.isArray(m.updateScope) ? [...new Set(m.updateScope)] : m.updateScope === 'images_only' ? ['images'] : [];
    const legacy = ['thumbnail','listing-image-1','listing-image-2','listing-image-3','listing-image-4','listing-image-5'];
    return {
      scope, fields:m.updateFields || {},
      images: m.imageReplacements?.length ? m.imageReplacements : scope.includes('images') && m.altText?.length === 6 ? legacy.map((role,i)=>({role,rank:i+1,altText:m.altText[i]})) : [],
      files: (m.fileUpdates || m.fileReplacements || []).map(file=>({...file,action:file.action || 'replace'})),
      alt: m.altTextUpdates || [],
    };
  }
  function errors(project) {
    const c = changes(project.manifest), roles = new Set((project.media || []).map(x=>x.role)), result = [];
    if (!c.scope.length) result.push('Select at least one change.');
    for (const scope of c.scope) if (!['images','files','alt_text'].includes(scope) && !(scope in c.fields)) result.push(`The selected ${labels[scope] || scope} is missing.`);
    if ('title' in c.fields && (!String(c.fields.title).trim() || String(c.fields.title).length > 140)) result.push('Title must contain 1–140 characters.');
    if ('description' in c.fields && !String(c.fields.description).trim()) result.push('Description cannot be empty.');
    if ('price' in c.fields && (!Number.isFinite(Number(c.fields.price)) || Number(c.fields.price) <= 0 || Math.abs(Number(c.fields.price)*100-Math.round(Number(c.fields.price)*100))>1e-8)) result.push('Enter a price greater than zero.');
    if ('tags' in c.fields) {
      const tags = Array.isArray(c.fields.tags) ? c.fields.tags.map(x=>String(x).trim()) : [];
      if (tags.length !== 13 || new Set(tags.map(x=>x.toLowerCase())).size !== 13 || tags.some(x=>!x || x.length>20)) result.push('Use 13 unique tags, each 1–20 characters.');
    }
    if (c.scope.includes('images') && (!c.images.length || c.images.some(x=>!roles.has(x.role) || !String(x.altText || '').trim() || String(x.altText).length>500 || !Number.isInteger(Number(x.rank)) || x.rank<1 || x.rank>20))) result.push('Each image needs its attachment, position and alt text.');
    if (c.scope.includes('alt_text') && (!c.alt.length || c.alt.some(x=>!/^\d+$/.test(String(x.listingImageId)) || !String(x.altText || '').trim() || String(x.altText).length>500 || x.rank<1 || x.rank>20))) result.push('Select an existing image and provide its alt text.');
    if (c.scope.includes('files') && (!c.files.length || c.files.some(x=>!roles.has(x.role) || !x.filename || !['add','replace'].includes(x.action) || (x.action==='replace' && !/^\d+$/.test(String(x.listingFileId)))))) result.push('Each digital file needs its attachment and an add or replace action.');
    const existing = project.manifest?.existingFiles;
    if (c.scope.includes('files') && Array.isArray(existing)) {
      if (existing.length + c.files.filter(x=>x.action==='add').length > 5) result.push('Etsy allows five files. There is no room for all selected additions.');
      if (existing.length >= 5 && c.files.some(x=>x.action==='replace')) result.push('Safe replacement requires one free file slot. Replace this file in Etsy or free a slot first.');
    }
    return result;
  }
  function performance(entry) {
    const visits=Number(entry.visits), orders=Number(entry.orders), revenue=Number(entry.revenue);
    if (!entry.from || !entry.to || entry.from>entry.to || !Number.isInteger(visits) || visits<0 || !Number.isInteger(orders) || orders<0 || !Number.isFinite(revenue) || revenue<0) throw new Error('Enter a valid date range and non-negative visits, orders and revenue.');
    return {...entry,visits,orders,revenue,conversion:visits?orders/visits*100:null};
  }
  return { labels,value,changes,errors,performance };
})();
if (typeof module !== 'undefined') module.exports = SellerCore;
