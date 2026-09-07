'use strict';
const APP_BUILD = 26;
const demoMode = new URLSearchParams(location.search).get('demo') === '1';
let shopListings = [], listingState = 'active', listingError = '', activeEtsyView = 'listings';
let detailId = null, editBusy = false, loadPromise = null, versionCompatible = false, performanceEntries = [];
let demoVersions = {}, demoRuns = [], inFlightPublishes = new Set();
const legacySaveEdit = initialSaveEdit;
const legacyEtsyBody = etsyBody;
const legacyPinForm = pinForm;
const money = (value,currency='GBP') => new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(Number(value || 0));
const safeUrl = value => { try { const u=new URL(value,location.href); return ['https:','blob:'].includes(u.protocol) || (demoMode && u.protocol==='data:') ? u.href : ''; } catch { return ''; } };
const viewAsset = (url,alt) => `<button type="button" class="assetpreview" data-preview="${esc(safeUrl(url))}" data-alt="${esc(alt)}" aria-label="Enlarge ${esc(alt)}"><img src="${esc(safeUrl(url))}" alt="${esc(alt)}" loading="lazy"></button>`;

function demoData() {
  const sample = name => 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e9e0ce"/><rect x="95" y="55" width="410" height="490" fill="#fffdf8"/><text x="300" y="180" text-anchor="middle" font-family="Georgia" font-size="32" fill="#1f433b">${name}</text><text x="300" y="240" text-anchor="middle" font-family="Georgia" font-size="28" fill="#1f433b">Sample Travel Guide</text><text x="300" y="440" text-anchor="middle" font-family="sans-serif" font-size="19" fill="#68716a">Fictional preview · No product data</text></svg>`);
  const tags=['travel itinerary','holiday guide','trip planner','road trip guide','digital guide','printable travel','travel checklist','weekend itinerary','travel planning','editable itinerary','pdf travel guide','self guided trip','holiday planner'];
  const base = {title:'Coastal Journey Sample Guide',description:'A fictional completed itinerary for interface testing. Editable Word + PDF. No real product content.',price:14.99,quantity:999,tags};
  shopListings = [{listing_id:'900000001',title:base.title,state:'active',price:14.99,currency:'GBP',thumbnail:sample('Coastal Journey'),image_count:6},{listing_id:'900000002',title:'City Break Sample Guide',state:'active',price:14.99,currency:'GBP',thumbnail:sample('City Break'),image_count:6}];
  const manifest = {mode:'edit',listingId:'900000001',existingSnapshot:base,existingImages:Array.from({length:6},(_,i)=>({id:String(800000001+i),rank:i+1,url:sample(i?'Inside The Guide':'Coastal Journey'),altText:`Sample guide page ${i+1}`})),existingFiles:[{id:'700000001',rank:1,name:'Sample_Guide.pdf'},{id:'700000002',rank:2,name:'Sample_Editable_Guide.zip'}],updateScope:['title'],updateFields:{title:'Coastal Journey Itinerary: Sample Word + PDF'}};
  projects=[{id:'demo-edit',kind:'etsy',title:base.title,status:'ready',revision:2,source:'manual',manifest,media:[],updated_at:new Date().toISOString()},{id:'demo-history',kind:'etsy',title:'Completed Sample Update',status:'published',revision:1,source:'manual',manifest:{...structuredClone(manifest),updateScope:['description'],updateFields:{description:base.description}},media:[],updated_at:new Date().toISOString()},{id:'demo-pins',kind:'pinterest',title:'Sample Travel Campaign',status:'ready',revision:1,source:'manual',manifest:{pins:[{title:'A Sample Coastal Escape',description:'Fictional Pin copy for reviewing the planning workflow.',altText:'A sample travel guide cover',link:'https://www.etsy.com/',board:'Travel Inspiration',imageRole:'pin-1'}]},media:[],_urls:{'pin-1':sample('Coastal Escape')},updated_at:new Date().toISOString()}];
  demoVersions={'demo-edit':[{revision:1,title:base.title,manifest:{...structuredClone(manifest),updateScope:[],updateFields:{}},media:[],created_at:new Date().toISOString(),name:'Before title update'}]};
  connections=[{platform:'etsy',status:'connected',metadata:{publish_enabled:true,note:'Simulated Etsy connection'}},{platform:'pinterest',status:'trial_pending',metadata:{note:'Manual preparation only'}}];
}

async function publisher(body,query='') {
  if (demoMode) throw new Error('Demo mode cannot contact the live publisher.');
  if (!session?.access_token) throw new Error('Sign in to use your private workspace.');
  const response=await fetch(SUPABASE_URL+'/functions/v1/etsy-publish'+query,{method:body?'POST':'GET',headers:{authorization:'Bearer '+session.access_token,apikey:SUPABASE_KEY,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body?.project_id?150000:35000)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error || 'Etsy request failed.');
  return data;
}
async function mcp(name,args) {
  if(demoMode)throw new Error('Demo mode cannot contact your private connector.');
  const response=await fetch(SELLER_TOOLS_ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+session.access_token,apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok || data.error || data.result?.isError)throw new Error(data.error?.message || data.result?.content?.[0]?.text || 'Project request failed.');
  return data.result;
}
async function loadAppVersion() {
  $('#appVersion').textContent=String(APP_BUILD);
  if(demoMode){versionCompatible=true;$('#backendVersion').textContent='Sample mode';return;}
  try {
    const response=await fetch('./release.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    const release=await response.json();
    if(release.app_version!==APP_BUILD)$('#updateBar').classList.add('show');
    if(!session)return;
    const api=await fetch(SELLER_TOOLS_ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+session.access_token,apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'version',method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'seller-tools-web',version:String(APP_BUILD)}}}),signal:AbortSignal.timeout(7000)});
    const data=await api.json();
    const backend=data.result?.appVersion;
    versionCompatible=api.ok && Number(backend)>=release.minimum_backend_version;
    $('#backendVersion').textContent=versionCompatible?`Backend ${backend} · compatible`:'Backend compatibility not verified';
  } catch { versionCompatible=false;$('#backendVersion').textContent='Connection check unavailable. Refresh before publishing.'; }
}
async function hydrateMedia(selected=projects.filter(p=>p.status!=='published'&&!p.manifest?.archived)) {
  if(demoMode)return;
  for(const kind of ['etsy','pinterest']) {
    const records=selected.filter(p=>p.kind===kind), paths=[...new Set(records.flatMap(p=>[p.preview_path,...(p.media||[]).map(x=>x.path)]).filter(Boolean))];
    if(!paths.length)continue;
    const {data,error}=await sb.storage.from(BUCKET[kind]).createSignedUrls(paths,3600);
    if(error)throw error;
    const urls=new Map((data||[]).map(x=>[x.path,x.signedUrl]));
    for(const p of records){p._urls={};for(const item of p.media||[])p._urls[item.role]=urls.get(item.path)||'';if(p.preview_path)p._urls.preview=urls.get(p.preview_path)||'';}
  }
}
async function loadData(showToast=false) {
  if(demoMode){render();if(showToast)toast('Sample workspace refreshed');return;}
  if(!session)return;
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
    $('#syncState').textContent='Refreshing private workspace…';
    const [a,b,c]=await Promise.all([sb.from('review_projects').select('*').in('kind',['etsy','pinterest']).order('updated_at',{ascending:false}),sb.from('platform_connections').select('*').in('platform',['etsy','pinterest']),sb.from('app_settings').select('value').eq('key','seller_performance').maybeSingle()]);
    if(a.error)throw a.error;if(b.error)throw b.error;
    projects=a.data||[];connections=b.data||[];performanceEntries=c.data?.value?.entries||[];
    render();
    await Promise.all([hydrateMedia().catch(e=>toast('Some previews could not load: '+e.message)),loadAppVersion(),loadListings(false)]);
    render();$('#syncState').textContent='Private · updated '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(showToast)toast('Workspace refreshed');
  })();
  try{return await loadPromise;}catch(e){$('#syncState').textContent='Refresh failed. Check your connection.';throw e;}finally{loadPromise=null;}
}
async function loadListings(redraw=true) {
  if(demoMode){if(redraw)renderListingGrid();return;}
  if(!isConnected('etsy')){shopListings=[];listingError='Connect Etsy in Settings to browse your listings.';return;}
  try{const data=await publisher(null,'?state='+encodeURIComponent(listingState));shopListings=data.listings||[];listingError='';}
  catch(e){listingError=e.message;}
  if(redraw)renderListingGrid();
}
function render() {
  const active=projects.filter(p=>!p.manifest?.archived && p.status!=='published');
  $('#etsyList').innerHTML=active.filter(p=>p.kind==='etsy').map(projectCard).join('') || empty('etsy');
  $('#pinterestList').innerHTML=active.filter(p=>p.kind==='pinterest').map(projectCard).join('') || empty('pinterest');
  for(const kind of ['etsy','pinterest']){const badge=$('#'+(kind==='etsy'?'etsyCount':'pinCount'));badge.textContent=active.filter(p=>p.kind===kind).length;badge.classList.toggle('hidden',badge.textContent==='0');}
  $('#workspaceSummary').innerHTML=`<div class="card"><strong>${shopListings.length}</strong><span>${esc(listingState)} listings</span></div><div class="card"><strong>${active.filter(p=>p.kind==='etsy').length}</strong><span>updates to review</span></div><div class="card"><strong>${projects.filter(p=>p.status==='failed'&&!p.manifest?.archived).length}</strong><span>need attention</span></div>`;
  renderListingGrid();renderQueue();renderConnections();renderPerformance();
  if(detailId && $('#detailModal').classList.contains('open'))renderDetail();
}
function renderListingGrid() {
  const query=($('#listingSearch')?.value||'').toLowerCase();
  const list=shopListings.filter(x=>x.title.toLowerCase().includes(query));
  $('#listingGrid').innerHTML=listingError?`<div class="notice error">${esc(listingError)} <button class="btn secondary" onclick="loadListings()">Retry</button></div>`:list.length?list.map(x=>`<article class="card listingcard">${x.thumbnail?viewAsset(x.thumbnail,x.title):''}<div class="listinginfo"><h3>${esc(x.title)}</h3><div class="listingmeta"><span>${money(x.price,x.currency)}</span><span>${esc(x.state)}</span></div><span class="muted">${x.image_count} images</span><button class="btn primary" onclick="prepareListing('${esc(x.listing_id)}')">Edit listing</button></div></article>`).join(''):'<div class="card empty"><h2>No matching listings</h2><p>Try another search or listing state.</p></div>';
}
function switchEtsyView(view){activeEtsyView=view;$('#liveListings').classList.toggle('hidden',view!=='listings');$('#etsyList').classList.toggle('hidden',view!=='review');$$('[data-etsy-view]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.etsyView===view)));}
async function prepareListing(id){
  try{
    toast('Reading the current listing…');
    let projectId;
    if(demoMode){const source=structuredClone(projects.find(x=>x.id==='demo-edit'));source.id='demo-'+crypto.randomUUID();source.title=shopListings.find(x=>x.listing_id===id).title;source.status='editing';source.revision=1;source.manifest.listingId=id;source.manifest.existingSnapshot.title=source.title;source.manifest.updateScope=[];source.manifest.updateFields={};source.manifest.imageReplacements=[];source.manifest.altTextUpdates=[];source.manifest.fileUpdates=[];projects.unshift(source);projectId=source.id;render();}
    else{const data=await publisher({action:'prepare_edit',listing_id:id});projectId=data.project.id;await loadData();}
    switchEtsyView('review');openEdit(projectId);
  }catch(e){toast(e.message);}
}
function publishEnabled(platform){return platform==='etsy' && (demoMode || isConnected(platform)&&conn(platform)?.metadata?.publish_enabled===true&&versionCompatible);}
function etsyFieldLabel(key){return SellerCore.labels[key]||key;}
function etsyBodyScoped(p){
  if(p.manifest?.mode!=='edit')return legacyEtsyBody(p);
  const c=SellerCore.changes(p.manifest), before=p.manifest.existingSnapshot||{}, errors=SellerCore.errors(p), locked=['publishing','published'].includes(p.status)||p.manifest.archived||inFlightPublishes.has(p.id);
  const fields=c.scope.filter(k=>!['images','alt_text','files'].includes(k)).map(key=>`<h3>${esc(etsyFieldLabel(key))}</h3><div class="compare"><div><strong>Current</strong><p>${key in before?esc(SellerCore.value(before[key])):'Not captured in this older draft'}</p></div><div><strong>Proposed</strong><p>${esc(SellerCore.value(c.fields[key]))}</p></div></div>`).join('');
  const files=c.scope.includes('files')?c.files.map(x=>`<div class="notice"><strong>${x.action==='add'?'Add file':'Replace file'}</strong><p>${x.action==='replace'?esc((p.manifest.existingFiles||[]).find(f=>String(f.id)===String(x.listingFileId))?.name||'Existing file '+x.listingFileId)+' → ':''}${esc(x.filename)}</p><button class="btn secondary" onclick="openAsset('${p.id}','${esc(x.role)}')">Preview new file</button></div>`).join(''):'';
  const images=c.scope.includes('images')?`<div class="gallery">${c.images.map(x=>`<div>${p._urls?.[x.role]?viewAsset(p._urls[x.role],x.altText):'<p>Preview loading</p>'}<p>Position ${x.rank}: ${esc(x.altText)}</p></div>`).join('')}</div>`:'';
  const alt=c.scope.includes('alt_text')?c.alt.map(x=>`<div class="compare"><div><strong>Image ${x.rank}: Current Alt Text</strong><p>${esc((p.manifest.existingImages||[]).find(i=>String(i.id)===String(x.listingImageId))?.altText||'No alt text')}</p></div><div><strong>Proposed Alt Text</strong><p>${esc(x.altText)}</p></div></div>`).join(''):'';
  return `<p class="notice">Review the selected changes below. Publishing checks the live listing again before applying them.</p>${fields}${images}${alt}${files}${errors.length?`<ul class="validation">${errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${p.last_error?`<p class="notice error">${esc(p.last_error)}</p>`:''}<div class="actions"><button class="btn secondary" onclick="openEdit('${p.id}')" ${locked?'disabled':''}>Edit selected changes</button><button class="btn primary" onclick="publishEtsy('${p.id}')" ${locked||errors.length||!publishEnabled('etsy')?'disabled':''}>${p.status==='published'?'Completed':p.status==='publishing'?'Updating…':demoMode?'Simulate update':'Apply selected changes'}</button></div><div class="actions"><button class="btn secondary" onclick="openHistory('${p.id}')">Revision & publish history</button><button class="btn secondary" onclick="clearProject('${p.id}')" ${p.status==='publishing'?'disabled':''}>${p.manifest.archived?'Restore archive':'Archive project'}</button></div>`;
}
function openEdit(id){
  const p=projects.find(x=>x.id===id);if(!p)return;
  if(['publishing','published'].includes(p.status))return toast('Open the live listing to prepare a fresh update.');
  editingId=id;$('#editTitle').textContent=p.kind==='pinterest'?'Edit Pins':'Edit Listing';
  $('#editForm').innerHTML=p.kind==='etsy'&&p.manifest?.mode==='edit'?scopedForm(p):p.kind==='etsy'?etsyForm(p):legacyPinForm(p);
  $('#detailModal').classList.remove('open');$('#editModal').classList.add('open');$('#editForm').dataset.dirty='false';
}
function scopedForm(p){
  const m=p.manifest,c=SellerCore.changes(m),base=m.existingSnapshot||{};
  const fields=['title','description','price','tags'].map(key=>{
    const val=key in c.fields?c.fields[key]:base[key];
    const editor=key==='tags'?`<div class="taginputs">${Array.from({length:13},(_,i)=>`<label>Tag ${i+1}<input name="tag_${i}" maxlength="20" value="${esc(val?.[i]||'')}"></label>`).join('')}</div>`:key==='description'?`<textarea name="field_description">${esc(val||'')}</textarea>`:`<input name="field_${key}" type="${key==='price'?'number':'text'}" ${key==='price'?'step="0.01" min="0.01"':'maxlength="140"'} value="${esc(val??'')}">`;
    return `<fieldset class="fieldblock"><label><input type="checkbox" name="scope_${key}" ${c.scope.includes(key)?'checked':''}> Change ${esc(etsyFieldLabel(key))}</label><details><summary class="muted">Current value</summary><div class="currentvalue">${esc(SellerCore.value(base[key]))}</div></details><div class="field">${editor}</div></fieldset>`;
  }).join('');
  const maxRank=Math.max(0,...(m.existingImages||[]).map(x=>Number(x.rank)));
  const imageRows=[...(m.existingImages||[]),...(maxRank<10?[{rank:maxRank+1,id:'',altText:'',url:''}]:[])].map(image=>{
    const proposed=c.images.find(x=>Number(x.rank)===Number(image.rank)), alt=c.alt.find(x=>String(x.listingImageId)===String(image.id));
    return `<div class="assetrow">${image.url?viewAsset(image.url,image.altText||'Current image'):''}<h3>${image.id?'Image '+image.rank:'Add Image '+image.rank}</h3>${proposed?`<p class="muted">Attached replacement: ${esc((p.media||[]).find(x=>x.role===proposed.role)?.name||proposed.role)}</p><label><input type="checkbox" name="drop_image_${image.rank}"> Remove this proposed replacement</label>`:''}<label>Choose ${image.id?'replacement':'new'} image<input type="file" name="image_${image.rank}" accept="image/png,image/jpeg"></label><div class="field"><label>Alt text<textarea name="image_alt_${image.rank}" maxlength="500">${esc(proposed?.altText??alt?.altText??image.altText??'')}</textarea></label></div>${image.id?`<label><input type="checkbox" name="alt_only_${image.rank}" ${alt?'checked':''}> Change alt text only</label>`:''}</div>`;
  }).join('');
  const fileRows=(m.existingFiles||[]).map(file=>`<div class="assetrow"><h3>${esc(file.name)}</h3><span class="muted">Current download · position ${file.rank}</span><label>Choose replacement file<input type="file" name="replace_${esc(file.id)}"></label></div>`).join('');
  const pending=c.files.map((x,i)=>`<div class="notice">${x.action==='replace'?'Replace':'Add'}: ${esc(x.filename)} <label><input type="checkbox" name="drop_file_${i}"> Remove proposed change</label></div>`).join('');
  return `<p class="notice">Tick each text field you want to change. Choosing a file selects that upload. Save for review before applying anything to Etsy.</p>${fields}<fieldset class="fieldblock"><legend>Images And Alt Text</legend><p class="muted">Inspect full images before saving. Alt-text-only changes keep the existing image.</p>${imageRows}</fieldset><fieldset class="fieldblock"><legend>Digital Files</legend><p class="muted">${(m.existingFiles||[]).length}/5 current files. Maximum 20 MB per file. A replacement needs one free slot so the original remains available during upload.</p>${fileRows}${pending}<label>Add digital files<input type="file" name="add_files" multiple></label></fieldset><div id="editErrors" aria-live="polite"></div><div class="stickyactions"><button type="submit" class="btn primary" style="width:100%">Save For Review</button></div>`;
}
async function attachUpload(p,file,role){
  if(file.size>20*1024*1024 || !file.size)throw new Error(file.name+' must be between 1 byte and 20 MB.');
  if(demoMode)return {role,name:file.name,path:'demo/'+crypto.randomUUID(),mime:file.type,size:file.size,demoUrl:URL.createObjectURL(file)};
  const path=`${session.user.id}/${p.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const {error}=await sb.storage.from(BUCKET[p.kind]).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw error;
  const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {role,name:file.name,path,mime:file.type,size:file.size,checksum,upload_status:'stored',storage_status:'verified'};
}
async function saveEdit(event){
  event.preventDefault();if(editBusy)return;
  const p=projects.find(x=>x.id===editingId);if(!p)return;
  if(p.kind!=='etsy'||p.manifest?.mode!=='edit'){try{await legacySaveEdit(event);}catch(e){toast(e.message);}return;}
  editBusy=true;const submit=$('#editForm button[type=submit]');submit.disabled=true;submit.textContent='Saving…';
  const fd=new FormData(event.currentTarget),m=structuredClone(p.manifest),c=SellerCore.changes(m),uploaded=[];
  try{
    m.updateFields={...c.fields};
    for(const key of ['title','description','price','tags']){delete m.updateFields[key];if(fd.has('scope_'+key))m.updateFields[key]=key==='tags'?Array.from({length:13},(_,i)=>String(fd.get('tag_'+i)||'').trim()):key==='price'?Number(fd.get('field_price')):String(fd.get('field_'+key)||'').trim();}
    m.imageReplacements=c.images.filter(x=>!fd.has('drop_image_'+x.rank));m.altTextUpdates=[];m.fileUpdates=c.files.filter((x,i)=>!fd.has('drop_file_'+i));delete m.fileReplacements;
    const tasks=[];
    for(const [name,file] of fd.entries())if(file instanceof File && file.size){
      if(name.startsWith('image_')&&!name.startsWith('image_alt_')){
        const rank=Number(name.slice(6)),altText=String(fd.get('image_alt_'+rank)||'').trim();if(!altText)throw new Error('Add alt text for image '+rank+'.');
        if(!['image/png','image/jpeg'].includes(file.type))throw new Error('Choose a PNG or JPEG listing image.');
        const role='listing-image-'+rank+'-'+crypto.randomUUID();m.imageReplacements=m.imageReplacements.filter(x=>Number(x.rank)!==rank);m.imageReplacements.push({role,rank,altText});tasks.push({file,role});
      }else if(name.startsWith('replace_')||name==='add_files'){
        const existingId=name.startsWith('replace_')?name.slice(8):undefined,role='digital-file-'+crypto.randomUUID();
        if(existingId)m.fileUpdates=m.fileUpdates.filter(x=>String(x.listingFileId)!==existingId);
        m.fileUpdates.push({action:existingId?'replace':'add',role,filename:file.name,...(existingId?{listingFileId:existingId}:{})});tasks.push({file,role});
      }
    }
    for(const image of m.existingImages||[])if(fd.has('alt_only_'+image.rank)&&!m.imageReplacements.some(x=>Number(x.rank)===Number(image.rank)))m.altTextUpdates.push({listingImageId:String(image.id),rank:Number(image.rank),altText:String(fd.get('image_alt_'+image.rank)||'').trim()});
    for(const image of m.imageReplacements)image.altText=String(fd.get('image_alt_'+image.rank)??image.altText).trim();
    m.updateScope=[...Object.keys(m.updateFields),...(m.imageReplacements.length?['images']:[]),...(m.altTextUpdates.length?['alt_text']:[]),...(m.fileUpdates.length?['files']:[])];
    const errors=SellerCore.errors({...p,manifest:m,media:[...(p.media||[]),...tasks.map(x=>({role:x.role}))]});if(errors.length)throw new Error(errors.join(' '));
    for(const task of tasks)uploaded.push(await attachUpload(p,task.file,task.role));
    await updateProject(p.id,{manifest:m,media:[...(p.media||[]),...uploaded],status:'ready',last_error:null});
    if(demoMode){const current=projects.find(x=>x.id===p.id);current._urls={...(current._urls||{}),...Object.fromEntries(uploaded.map(x=>[x.role,x.demoUrl]))};}
    $('#editModal').classList.remove('open');$('#editForm').dataset.dirty='false';switchEtsyView('review');openProject(p.id);toast('Saved. Review your changes before applying them.');
  }catch(e){$('#editErrors').innerHTML=`<p class="notice error">${esc(e.message)}</p>`;if(!demoMode && uploaded.length)await sb.storage.from(BUCKET.etsy).remove(uploaded.map(x=>x.path));}
  finally{editBusy=false;submit.disabled=false;submit.textContent='Save For Review';}
}
async function updateProject(id,changes){
  const p=projects.find(x=>x.id===id);if(!p)throw new Error('Project not found.');
  if(demoMode){(demoVersions[id]||= []).unshift({revision:p.revision,title:p.title,manifest:structuredClone(p.manifest),media:structuredClone(p.media),created_at:new Date().toISOString()});Object.assign(p,changes,{revision:p.revision+1,updated_at:new Date().toISOString()});render();return;}
  const {data,error}=await sb.from('review_projects').update(changes).eq('id',id).eq('revision',p.revision).neq('status','publishing').select('id').maybeSingle();
  if(error)throw error;if(!data)throw new Error('The project changed in another session. Refresh before saving.');
  Object.assign(p,changes);
  await loadData().catch(e=>toast('Saved, but refresh failed: '+e.message));
}
async function publishEtsy(id){
  const p=projects.find(x=>x.id===id);if(!p||inFlightPublishes.has(id)||['published','publishing'].includes(p.status))return;
  if(!publishEnabled('etsy'))return toast('Check the Etsy connection and backend status in Settings.');
  if(p.manifest?.mode==='edit'&&SellerCore.errors(p).length)return toast('Resolve the missing values before publishing.');
  if(!confirm(demoMode?'Simulate this update using sample data only?':`Apply the reviewed changes to “${p.title}” on Etsy now?`))return;
  inFlightPublishes.add(id);render();
  try{
    if(demoMode){await updateProject(id,{status:'published',manifest:{...p.manifest,etsyUpdateAudit:{verified:true,completedAt:new Date().toISOString()}}});toast('Sample update completed. No Etsy data changed.');return;}
    toast('Applying changes. Keep this screen open.');
    await publisher({project_id:id,expected_revision:p.revision});await loadData();toast('Etsy confirmed the update.');
  }catch(e){toast(e.message);await loadData().catch(()=>{});}
  finally{inFlightPublishes.delete(id);render();}
}
function renderQueue(){
  $('#queueList').innerHTML=projects.length?projects.map(p=>`<article class="card"><div class="row"><h3>${esc(p.title)}</h3><span class="badge ${esc(p.status)}">${p.manifest?.archived?'Archived':esc(statusLabel(p.status))}</span></div><p class="muted">Revision ${p.revision} · ${formatDate(p.updated_at)}</p>${p.last_error?`<p class="notice error">${esc(p.last_error)}</p>`:''}<div class="actions"><button class="btn secondary" onclick="openProject('${p.id}')">Open project</button><button class="btn secondary" onclick="openHistory('${p.id}')">View history</button></div></article>`).join(''):'<div class="card"><h2>No activity yet</h2></div>';
}
async function openProject(id){detailId=id;$('#detailModal').classList.add('open');renderDetail();try{await hydrateMedia(projects.filter(x=>x.id===id));renderDetail();}catch(e){toast(e.message);}}
function renderDetail(){const p=projects.find(x=>x.id===detailId);if(!p)return;$('#detailTitle').textContent=p.title;$('#detailBody').innerHTML=projectCard(p);if(p.status==='published'||p.manifest?.archived)$('#detailBody').querySelectorAll('button').forEach(b=>{if(/publishEtsy|openEdit/.test(b.getAttribute('onclick')||''))b.disabled=true;});}
async function clearProject(id){const p=projects.find(x=>x.id===id);if(!p||p.status==='publishing')return;const archived=!!p.manifest?.archived;try{await updateProject(id,{manifest:{...p.manifest,archived:!archived}});toast(archived?'Project restored':'Project archived. Files and history retained.');}catch(e){toast(e.message);}}
async function openHistory(id){
  const p=projects.find(x=>x.id===id);if(!p)return;detailId=null;$('#detailTitle').textContent='History: '+p.title;$('#detailBody').innerHTML='<p class="loading">Loading history…</p>';$('#detailModal').classList.add('open');
  try{
    const [versions,runs]=demoMode?[{data:demoVersions[id]||[]},{data:demoRuns}]:await Promise.all([sb.from('review_project_versions').select('revision,name,title,manifest,media,created_at').eq('project_id',id).order('revision',{ascending:false}),sb.from('seller_publish_runs').select('*').eq('project_id',id).order('created_at',{ascending:false})]);
    if(versions.error)throw versions.error;if(runs.error)throw runs.error;
    $('#detailBody').innerHTML=`<p class="notice">Restoring a revision changes the review project. It does not reverse a live Etsy publication.</p><h3>Publishing Attempts</h3>${(runs.data||[]).map(run=>`<div class="historyitem"><strong>${esc(statusLabel(run.status))}</strong><p>${formatDate(run.created_at)}</p>${run.last_error?`<p class="notice error">${esc(run.last_error)}</p>`:''}<ul>${(run.steps||[]).map(step=>`<li>${esc(step.name)}: ${esc(step.status)}</li>`).join('')}</ul>${(run.status==='needs_review'||run.status==='running'&&Date.now()-Date.parse(run.created_at)>300000)?`<a class="btn secondary" href="https://www.etsy.com/listing/${esc(run.listing_key)}" target="_blank" rel="noopener">Inspect Etsy listing</a><button class="btn secondary" onclick="acknowledgeRun('${run.id}','${id}')">I Have Checked The Live Listing</button>`:''}</div>`).join('')||'<p class="muted">No publishing attempts recorded since this feature was added.</p>'}<h3>Saved Revisions</h3>${(versions.data||[]).map(v=>`<div class="historyitem"><strong>Revision ${v.revision}</strong><p>${esc(v.name||v.title)} · ${formatDate(v.created_at)}</p><details><summary>View saved changes</summary><pre>${esc(JSON.stringify(v.manifest.updateFields||v.manifest,null,2))}</pre></details><p class="muted">${(v.media||[]).length} attached files</p><button class="btn secondary" onclick="restoreRevision('${id}',${v.revision})">Restore To Review</button></div>`).join('')||'<p class="muted">No earlier revisions recorded. Future content and attachment edits are saved automatically.</p>'}`;
  }catch(e){$('#detailBody').innerHTML=`<p class="notice error">${esc(e.message)}</p>`;}
}
async function restoreRevision(id,revision){if(!confirm('Restore this saved revision to the review project? Your live Etsy listing will stay as it is.'))return;try{if(demoMode){const v=(demoVersions[id]||[]).find(x=>x.revision===revision);await updateProject(id,{title:v.title,manifest:structuredClone(v.manifest),media:structuredClone(v.media),status:'editing'});}else{await mcp('restore_project_version',{project_id:id,revision});await loadData();}openProject(id);toast('Revision restored for review.');}catch(e){toast(e.message);}}
async function acknowledgeRun(runId,projectId){if(!confirm('Confirm that you have inspected Etsy and understand which changes are live. This releases the update lock; it does not undo any changes.'))return;try{await publisher({action:'acknowledge_run',run_id:runId,confirmed_review:true});openHistory(projectId);toast('Acknowledged. Prepare a fresh update from the live listing.');}catch(e){toast(e.message);}}
function pinterestBody(p){const pins=p.manifest?.pins||[];return `<p class="notice">Manual preparation and posting plan. Automatic Pinterest publishing is unavailable.</p>${pins.map((pin,i)=>`<div class="pin">${p._urls?.[pin.imageRole||'pin-'+(i+1)]?viewAsset(p._urls[pin.imageRole||'pin-'+(i+1)],pin.altText||pin.title):'<div class="placeholder">Image unavailable</div>'}<div><h3>${esc(pin.title)}</h3><p>${esc(pin.description)}</p><p><strong>${esc(pin.board)}</strong></p><a href="${esc(safeUrl(pin.link))}" target="_blank" rel="noopener">Check destination</a><p class="muted">${pin.plannedFor?'Plan: '+formatDate(pin.plannedFor):pin.scheduledFor?'Legacy plan: '+formatDate(pin.scheduledFor):'No posting date set'}</p><div class="pinbuttons"><button class="btn secondary" onclick="copyPin('${p.id}',${i})">Copy Text</button><button class="btn secondary" onclick="openAsset('${p.id}','${esc(pin.imageRole||'pin-'+(i+1))}')">Open Image</button><button class="btn secondary" onclick="openSchedule('${p.id}',${i})">Plan Posting</button></div></div></div>`).join('')}<div class="actions"><button class="btn secondary" onclick="openEdit('${p.id}')">Edit Pins</button><button class="btn secondary" onclick="clearProject('${p.id}')">Archive Batch</button></div>`;}
async function copyPin(id,index){const pin=projects.find(x=>x.id===id)?.manifest.pins[index];if(!pin)return;try{await navigator.clipboard.writeText(`${pin.title}\n\n${pin.description}\n\n${pin.link}`);toast('Pin text copied. Paste it in Pinterest.');}catch{toast('Clipboard unavailable. Select and copy the visible text.');}}
async function postPinNow(id,index){return copyPin(id,index);}
async function saveSchedule(){if(!scheduleTarget)return;const raw=$('#scheduleWhen').value,date=new Date(raw);if(!raw||!Number.isFinite(date.getTime())||date<=new Date())return toast('Choose a future date and time.');const p=projects.find(x=>x.id===scheduleTarget.id);if(!p)return;try{const m=structuredClone(p.manifest);if(scheduleTarget.index!=null){m.pins[scheduleTarget.index].plannedFor=date.toISOString();delete m.pins[scheduleTarget.index].scheduledFor;if(m.pins[scheduleTarget.index].status==='scheduled')m.pins[scheduleTarget.index].status='ready';}await updateProject(p.id,{manifest:m,status:p.status==='scheduled'?'ready':p.status,scheduled_for:null});$('#scheduleModal').classList.remove('open');toast('Manual posting plan saved. Nothing will post automatically.');}catch(e){toast(e.message);}}
async function openAsset(id,role){const p=projects.find(x=>x.id===id);if(!p)return;try{const url=demoMode?p._urls?.[role]:await signedMedia(p,role);if(!url)return toast('This sample has no downloadable file.');$('#assetImage').src=safeUrl(url);$('#assetLink').href=safeUrl(url);$('#assetImage').classList.toggle('hidden',!/^image\//.test((p.media||[]).find(x=>x.role===role)?.mime||'')&&!role.includes('image')&&!role.includes('pin')&&role!=='thumbnail');$('#assetModal').classList.add('open');}catch(e){toast(e.message);}}
function renderPerformance(){const latest=performanceEntries.at(-1);$('#performanceReadout').innerHTML=latest?`<p>${esc(latest.from)} to ${esc(latest.to)} · Manually entered from Etsy Stats</p><p><strong>${latest.visits}</strong> visits · <strong>${latest.orders}</strong> orders · <strong>${money(latest.revenue)}</strong> revenue</p><p>Shop conversion: <strong>${latest.visits?(latest.orders/latest.visits*100).toFixed(2)+'%':'Not available without visits'}</strong></p>`:'<p class="muted">No performance data entered. Unknown values are not shown as zero.</p>';}
async function savePerformance(event){event.preventDefault();try{const fd=new FormData(event.currentTarget),entry=SellerCore.performance(Object.fromEntries(fd));const entries=[...performanceEntries,entry];if(!demoMode){const {error}=await sb.from('app_settings').upsert({key:'seller_performance',value:{entries},updated_at:new Date().toISOString()});if(error)throw error;}performanceEntries=entries;renderPerformance();toast('Performance period saved.');}catch(e){toast(e.message);}}
function subscribe(){if(demoMode)return;if(realtime)sb.removeChannel(realtime);realtime=sb.channel('review-projects-live').on('postgres_changes',{event:'*',schema:'public',table:'review_projects'},()=>{clearTimeout(subscribe.timer);subscribe.timer=setTimeout(()=>loadData().catch(e=>toast(e.message)),600);}).subscribe();}
async function authChanged(s){if(demoMode)return;session=s;if(!s){projects=[];shopListings=[];connections=[];performanceEntries=[];detailId=null;$$('.modal').forEach(x=>x.classList.remove('open'));$('#nav').classList.add('hidden');showScreen('authScreen');$('#syncState').textContent='Private workspace';if(realtime){sb.removeChannel(realtime);realtime=null;}return;}$('#nav').classList.remove('hidden');$('#accountEmail').textContent=s.user.email||'Signed in';showScreen((location.hash||'#etsy').slice(1)==='authScreen'?'etsy':(location.hash||'#etsy').slice(1));try{await loadData();subscribe();}catch(e){toast(e.message);}}

$('#editForm').onsubmit=saveEdit;$('#editForm').oninput=()=>{$('#editForm').dataset.dirty='true';};$('#confirmSchedule').onclick=saveSchedule;
$('#listingSearch').oninput=renderListingGrid;$('#listingState').onchange=event=>{listingState=event.target.value;loadListings();};
$$('[data-etsy-view]').forEach(button=>button.onclick=()=>switchEtsyView(button.dataset.etsyView));
$('#performanceForm').onsubmit=savePerformance;
$('#refreshData').onclick=()=>loadData(true).catch(e=>toast(e.message));
$('#signOut').onclick=()=>demoMode?location.assign(location.pathname):sb.auth.signOut();
$('#signIn').onclick=async()=>{const email=$('#email').value.trim();if(!email)return toast('Enter your email.');$('#signIn').disabled=true;try{const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});toast(error?error.message:'Check your email for the secure sign-in link.');}finally{$('#signIn').disabled=false;}};
$$('[data-close]').forEach(button=>{button.setAttribute('aria-label','Close');button.onclick=()=>{if(button.dataset.close==='editModal'&&$('#editForm').dataset.dirty==='true'&&!confirm('Discard unsaved edits?'))return;$('#'+button.dataset.close).classList.remove('open');};});
document.addEventListener('click',event=>{const target=event.target.closest('[data-preview]');if(!target)return;$('#assetImage').src=target.dataset.preview;$('#assetImage').alt=target.dataset.alt||'Full image preview';$('#assetImage').classList.remove('hidden');$('#assetLink').href=target.dataset.preview;$('#assetModal').classList.add('open');});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const modal=$$('.modal.open').at(-1);modal?.querySelector('[data-close]')?.click();}});
$('#reloadApp').onclick=()=>{if($('#editModal').classList.contains('open')&&$('#editForm').dataset.dirty==='true'&&!confirm('Refresh and discard unsaved edits?'))return;location.reload();};
if(demoMode){demoData();$('#nav').classList.remove('hidden');$('#sampleBanner').classList.remove('hidden');$('#syncState').textContent='Sample mode · no private data or live publishing';$('#accountEmail').textContent='Fictional sample workspace';versionCompatible=true;render();showScreen('etsy');loadAppVersion();}
else{sb.auth.onAuthStateChange((_event,s)=>setTimeout(()=>authChanged(s),0));sb.auth.getSession().then(({data})=>authChanged(data.session));}
