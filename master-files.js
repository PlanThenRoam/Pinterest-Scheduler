'use strict';
(() => {
 let records=[],error='',loading=false,detail=null,busy=false,pendingUpload=null,stagingProject=null;
 const demoHistory=new Map();
 const bytesLabel=n=>Number(n)<1048576?Math.ceil(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';
 const typeLabel=v=>({planner:'Planner',blueprint:'Blueprint',image:'Image',other:'Other'}[v]||v);
 const rpc=async(name,args)=>{const raw=await mcp(name,args);if(raw.structuredContent)return raw.structuredContent;const text=raw.content?.find(x=>x.type==='text')?.text;return text?JSON.parse(text):raw;};
 function reset(){records=[];detail=null;error='';pendingUpload=null;stagingProject=null;render();$('#masterBody').innerHTML='';}
 function demo(){
  const now=new Date().toISOString();
  records=[{id:'demo-master',title:'Coastal Journey Sample Guide',category:'planner',listing_id:'900000001',revision:2,updated_at:now,files:[{role:'docx',name:'Sample_Guide.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:45000,checksum:'sample-word'},{role:'pdf',name:'Sample_Guide.pdf',mime:'application/pdf',size:120000,checksum:'sample-pdf'}]},{id:'demo-blueprint',title:'Sample Guide Blueprint',category:'blueprint',revision:0,files:[],updated_at:now}];
  demoHistory.set('demo-master',[{...structuredClone(records[0]),revision:1,reason:'Initial sample files',created_at:now},{...structuredClone(records[0]),reason:'Updated sample itinerary',created_at:now}]);
 }
 async function load(redraw=true){
  if(loading)return;if(!demoMode&&!session)return;
  loading=true;error='';if(redraw)render();
  try{if(demoMode){if(!records.length)demo();}else records=(await rpc('list_master_files',{})).masters||[];}
  catch(e){error=e.message;}finally{loading=false;render();}
 }
 function render(){
  const el=$('#masterGrid');if(!el)return;
  const query=$('#masterSearch').value.toLowerCase().trim(),category=$('#masterCategory').value;
  const filtered=records.filter(r=>(!query||r.title.toLowerCase().includes(query))&&(!category||category===r.category));
  $('#masterSummary').textContent=records.length?`${records.length} masters · ${records.filter(r=>r.files.length).length} with saved files`:'Your current files, together in one place.';
  if(error){el.innerHTML=`<div class="notice error">${esc(error)} <button class="btn secondary" onclick="MasterFiles.load()">Retry</button></div>`;return;}
  if(loading&&!records.length){el.innerHTML='<p role="status">Loading your master files…</p>';return;}
  el.innerHTML=filtered.length?filtered.map(r=>`<article class="card mastercard"><div class="mastertype">${esc(typeLabel(r.category))}<span>${r.files.length?'Version '+r.revision:'Files Needed'}</span></div><h2>${esc(r.title)}</h2><div class="masterformats">${r.files.map(f=>`<span class="tag">${esc(f.name.split('.').pop().toUpperCase())}</span>`).join('')||'<p class="muted">Add the approved files to establish this master.</p>'}</div><p class="muted">${r.files.length?`${r.files.length} files · ${formatDate(r.updated_at)}`:'No master version saved yet'}</p><button class="btn primary" onclick="MasterFiles.open('${r.id}')">Open Master</button></article>`).join(''):'<div class="card empty"><h2>'+ (records.length?'No Matching Masters':'Add Your First Master') +'</h2><p>Keep each planner’s Word and PDF together. Blueprints and images can have their own master records.</p><button class="btn primary" onclick="MasterFiles.create()">Add Master</button></div>';
 }
 function listingOptions(selected){const list=shopListings.slice();if(selected&&!list.some(x=>String(x.listing_id)===String(selected)))list.push({listing_id:selected,title:'Currently Linked Etsy Listing'});return '<option value="">No Etsy Listing</option>'+list.map(x=>`<option value="${esc(x.listing_id)}" ${String(x.listing_id)===String(selected)?'selected':''}>${esc(x.title)}</option>`).join('');}
 function categoryOptions(selected){return ['planner','blueprint','image','other'].map(x=>`<option value="${x}" ${x===selected?'selected':''}>${typeLabel(x)}</option>`).join('');}
 function create(){
  $('#masterCreateForm').innerHTML=`<label>Title<input name="title" maxlength="180" required placeholder="Japan First-Timer Itinerary Planner"></label><label>Category<select name="category">${categoryOptions('planner')}</select></label><label>Linked Etsy Listing<select name="listing_id">${listingOptions('')}</select></label><p class="muted">You can link an Etsy listing later. Adding a master does not change your shop.</p><p class="notice error hidden" id="masterCreateError"></p><button type="submit" class="btn primary">Create Master</button>`;
  $('#masterCreateModal').classList.add('open');$('#masterCreateForm [name="title"]').focus();
 }
 async function saveNew(e){e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;try{
  const args=Object.fromEntries(new FormData(e.currentTarget));if(!args.listing_id)delete args.listing_id;
  let r;if(demoMode){r={...args,id:'demo-'+crypto.randomUUID(),revision:0,files:[],updated_at:new Date().toISOString()};records.push(r);}else r=(await rpc('create_master_file',args)).master;
  $('#masterCreateModal').classList.remove('open');await load();await open(r.id);
 }catch(e){$('#masterCreateError').textContent=e.message;$('#masterCreateError').classList.remove('hidden');}finally{button.disabled=false;}}
 async function open(id,version){
  if(busy)return;pendingUpload=null;stagingProject=null;
  $('#masterModal').classList.add('open');$('#masterBody').innerHTML='<p role="status">Opening master…</p>';
  try{
   if(demoMode){const current=records.find(r=>r.id===id);const master=version?(demoHistory.get(id)||[]).find(v=>v.revision===version):current;if(!master)throw Error('Saved version not found.');detail={master:structuredClone(master),current_revision:current.revision,is_current:master.revision===current.revision,history:[...(demoHistory.get(id)||[])].reverse(),publications:[]};}
   else detail=await rpc('get_master_file',{master_id:id,...(version?{revision:version}:{})});
   renderDetail();
  }catch(e){$('#masterBody').innerHTML=`<p class="notice error">${esc(e.message)}</p><button class="btn secondary" onclick="MasterFiles.open('${id}')">Retry</button>`;}
 }
 function publicationLabel(r){
  if(!r.listing_id)return 'No Etsy Listing Linked';
  const delivered=r.files.filter(f=>f.name.split('.').pop().toLowerCase()==='pdf');
  const matches=delivered.filter(f=>detail.publications.some(p=>p.listing_id===r.listing_id&&p.role===f.role&&p.checksum===f.checksum));
  if(delivered.length&&matches.length===delivered.length)return 'Current Files Last Published Through Seller Tools';
  return detail.publications.some(p=>p.listing_id===r.listing_id)?'Master Has Files Not Recorded As Published':'Published Version Not Yet Recorded';
 }
 function renderDetail(){
  const r=detail.master;$('#masterTitle').textContent=r.title;
  const history=detail.history||[];
  $('#masterBody').innerHTML=`<div class="masterdetailtop"><span class="tag">${esc(typeLabel(r.category))}</span><strong>${r.files.length?'Version '+r.revision:'No Files Yet'}</strong><span>${detail.is_current?'Current Master':'Earlier Version'}</span></div>${!detail.is_current?`<p class="notice">Viewing a saved version. Current master: version ${detail.current_revision}.</p><button class="btn secondary" onclick="MasterFiles.open('${r.id}')">Return To Current Master</button>`:''}<div class="masterfilelist">${r.files.map((f,i)=>`<div class="masterfile"><div><strong>${esc(f.name)}</strong><p>${esc(f.role)} · ${bytesLabel(f.size)}</p></div>${f.download_url?`<a href="${esc(safeUrl(f.download_url))}" class="btn secondary" target="_blank" rel="noopener" download="${esc(f.name)}">Download</a>`:'<span class="muted">Sample File</span>'}</div>`).join('')||'<p class="notice">Upload your approved files below to create the first master version.</p>'}</div><p class="masterpublication">${esc(publicationLabel(r))}</p><p class="muted small">Publication tracking records successful updates made through Seller Tools. Changes made directly in Etsy need a fresh check.</p>${detail.is_current?`<details class="mastersection" open><summary>Upload Or Replace Files</summary><p class="muted">Use the same role to replace a file. Upload matching Word and PDF together when both change. Every other file stays as it is.</p><form id="masterUploadForm"><label>Choose Files<input id="masterUploadInput" type="file" multiple accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.zip" required></label><p class="muted small">50 MB per file · 100 MB per save</p><div id="masterUploadRoles"></div><label>Change Note<input name="reason" maxlength="500" required placeholder="Updated accommodation suggestions"></label><div id="masterSaveStatus" role="status" aria-live="polite"></div><button id="masterSaveButton" type="submit" class="btn primary">Save New Version</button></form></details><details class="mastersection"><summary>Master Details</summary><form id="masterDetailsForm"><label>Title<input name="title" value="${esc(r.title)}" maxlength="180" required></label><label>Category<select name="category">${categoryOptions(r.category)}</select></label><label>Linked Etsy Listing<select name="listing_id">${listingOptions(r.listing_id)}</select></label><button type="submit" class="btn secondary">Save Details</button></form></details><details class="mastersection"><summary>Prepare An Etsy File Update</summary><p class="muted">Choose the customer PDF to add or replace, then review before publishing. Word files and blueprints stay private.</p><button class="btn secondary" onclick="MasterFiles.startEtsy()" ${r.listing_id&&r.files.some(f=>f.mime==='application/pdf')?'':'disabled'}>Choose Etsy Files To Update</button><div id="masterEtsyStage"></div></details>`:''}<details class="mastersection"><summary>Version History (${history.length}${history.length===100?'+':''})</summary>${history.length?history.map(v=>`<div class="historyitem"><strong>Version ${v.revision}</strong><p>${esc(v.reason)} · ${formatDate(v.created_at)}</p><div class="actions"><button class="btn secondary" onclick="MasterFiles.open('${r.id}',${v.revision})">View Files</button><button class="btn secondary" onclick="MasterFiles.restore(${v.revision})" ${v.revision===detail.current_revision?'disabled':''}>Restore Version</button></div></div>`).join(''):'<p class="muted">History starts when the first files are saved.</p>'}</details><p class="notice">Saving or restoring a master never publishes to Etsy.</p>`;
  if(detail.is_current){$('#masterUploadInput').onchange=renderUploadRoles;$('#masterUploadForm').onsubmit=upload;$('#masterUploadForm').oninput=()=>{if(!busy)pendingUpload=null;};$('#masterDetailsForm').onsubmit=saveDetails;}
 }
 function renderUploadRoles(){
  pendingUpload=null;const files=[...$('#masterUploadInput').files];
  $('#masterUploadRoles').innerHTML=files.map((f,i)=>{
   const ext=f.name.split('.').pop().toLowerCase();const same=detail.master.files.find(x=>x.name===f.name);
   const role=same?.role||(['docx','pdf'].includes(ext)?ext:f.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50));
   return `<label class="masteruploadrow"><span>${esc(f.name)} · ${bytesLabel(f.size)}</span><input name="role_${i}" value="${esc(/^[a-z]/.test(role)?role:'file-'+role)}" pattern="[a-z][a-z0-9_-]{0,59}" maxlength="60" aria-label="File role for ${esc(f.name)}" required></label>`;
  }).join('');
 }
 function status(message,isError=false){const el=$('#masterSaveStatus');if(el){el.className='notice'+(isError?' error':'');el.textContent=message;}}
 async function upload(e){
  e.preventDefault();if(busy)return;busy=true;$('#masterSaveButton').disabled=true;
  try{
   const files=[...$('#masterUploadInput').files],fd=new FormData(e.currentTarget),reason=String(fd.get('reason')||'').trim();
   if(!files.length||!reason)throw Error('Choose files and add a change note.');
   if(files.some(f=>!f.size||f.size>50*1048576)||files.reduce((s,f)=>s+f.size,0)>100*1048576)throw Error('Choose files up to 50 MB each and 100 MB in total.');
   const roles=files.map((f,i)=>String(fd.get('role_'+i)));if(new Set(roles).size!==roles.length)throw Error('Each file needs a unique role. Use one Word file and one PDF per planner.');for(const control of e.currentTarget.elements)control.disabled=true;
   if(demoMode){const r=records.find(x=>x.id===detail.master.id);const added=files.map((f,i)=>({role:roles[i],name:f.name,mime:f.type,size:f.size,checksum:'sample-'+crypto.randomUUID()}));r.files=[...r.files.filter(f=>!roles.includes(f.role)),...added];r.revision++;r.updated_at=new Date().toISOString();demoHistory.set(r.id,[...(demoHistory.get(r.id)||[]),{...structuredClone(r),reason,created_at:r.updated_at}]);}
   else{
    if(!pendingUpload){
     status('Checking files…');const manifest=[];
     for(let i=0;i<files.length;i++){const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await files[i].arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');manifest.push({role:roles[i],filename:files[i].name,size:files[i].size,checksum});}
     pendingUpload=await rpc('prepare_master_upload',{master_id:detail.master.id,expected_revision:detail.current_revision,reason,files:manifest});
    }
    for(let i=0;i<pendingUpload.files.length;i++){const f=pendingUpload.files[i];if(f.done)continue;status(`Uploading ${i+1} of ${files.length}: ${f.name}`);const {error}=await sb.storage.from(pendingUpload.bucket).uploadToSignedUrl(f.path,f.token,files[i],{contentType:f.mime,upsert:false});if(error&&String(error.statusCode)!=='409')throw error;f.done=true;}
    status('Verifying files and saving the new version…');await rpc('commit_master_upload',{upload_id:pendingUpload.upload_id});
   }
   const id=detail.master.id;busy=false;pendingUpload=null;await load();await open(id);toast(demoMode?'Sample version saved.':'Master files saved and verified.');
  }catch(e){status(e.message+' Your previous master is still available.',true);}finally{busy=false;if($('#masterUploadForm'))for(const control of $('#masterUploadForm').elements)control.disabled=false;}
 }
 async function saveDetails(e){e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.querySelector('button');button.disabled=true;try{
  const changes=Object.fromEntries(new FormData(e.currentTarget));const r=detail.master;
  if(demoMode){const current=records.find(x=>x.id===r.id);Object.assign(current,changes,{revision:current.revision+1,updated_at:new Date().toISOString()});demoHistory.set(r.id,[...(demoHistory.get(r.id)||[]),{...structuredClone(current),reason:'Updated master details',created_at:current.updated_at}]);}
  else await rpc('update_master_details',{master_id:r.id,expected_revision:detail.current_revision,...changes,reason:'Updated master details'});
  busy=false;await load();await open(r.id);toast('Master details saved.');
 }catch(e){toast(e.message);}finally{busy=false;button.disabled=false;}}
 async function restore(version){if(busy||!confirm(`Restore version ${version} as a new master version? Your history is retained and Etsy stays unchanged.`))return;busy=true;try{
  const id=detail.master.id;
  if(demoMode){const old=structuredClone(demoHistory.get(id).find(v=>v.revision===version)),current=records.find(r=>r.id===id);Object.assign(current,old,{revision:current.revision+1,updated_at:new Date().toISOString()});demoHistory.get(id).push({...structuredClone(current),reason:'Restored revision '+version,restored_from:version,created_at:current.updated_at});}
  else await rpc('restore_master_version',{master_id:id,expected_revision:detail.current_revision,revision:version});
  busy=false;await load();await open(id);toast('Earlier files restored as a new version.');
 }catch(e){toast(e.message);}finally{busy=false;}}
 async function startEtsy(){
  if(busy)return;busy=true;$('#masterEtsyStage').innerHTML='<p role="status">Reading current Etsy downloads…</p>';
  try{
   if(demoMode)stagingProject=structuredClone(projects.find(p=>p.id==='demo-edit'));
   else{const prepared=await publisher({action:'prepare_edit',listing_id:detail.master.listing_id});await loadData();stagingProject=projects.find(p=>p.id===prepared.project.id);}
   if(!stagingProject)throw Error('The listing update could not be loaded.');
   const existing=stagingProject.manifest.existingFiles||[];
   $('#masterEtsyStage').innerHTML=`<form id="masterEtsyForm">${detail.master.files.map((f,i)=>f.mime==='application/pdf'?`<label>${esc(f.name)}<select name="file_${i}"><option value="">Do Not Include</option><option value="add">Add As New Download</option>${existing.map(x=>`<option value="${esc(x.id)}">Replace ${esc(x.name)}</option>`).join('')}</select></label>`:'').join('')}<p class="muted">${existing.length}/5 current Etsy files. Replacement requires a free slot while the new upload is confirmed.</p><button class="btn primary" type="submit">Save Files For Etsy Review</button></form>`;$('#masterEtsyForm').onsubmit=stage;
  }catch(e){$('#masterEtsyStage').innerHTML=`<p class="notice error">${esc(e.message)}</p>`;}finally{busy=false;}
 }
 async function stage(e){e.preventDefault();if(busy)return;busy=true;const button=e.currentTarget.querySelector('button');button.disabled=true;try{
  const fd=new FormData(e.currentTarget),files=detail.master.files.flatMap((f,i)=>{const v=fd.get('file_'+i);return v?[{role:f.role,action:v==='add'?'add':'replace',...(v==='add'?{}:{listing_file_id:v})}]:[];});
  if(!files.length)throw Error('Choose at least one file to add or replace.');
  if(demoMode){toast('Sample only: no files were sent to Etsy.');return;}
  await rpc('attach_master_files_to_review',{master_id:detail.master.id,expected_revision:detail.current_revision,project_id:stagingProject.id,files});
  const id=stagingProject.id;await loadData();$('#masterModal').classList.remove('open');showScreen('etsy');switchEtsyView('review');await openProject(id);toast('Files prepared for review. Nothing published yet.');
 }catch(e){toast(e.message);}finally{busy=false;button.disabled=false;}}
 window.MasterFiles={load,render,reset,open,create,restore,startEtsy};
 $('#masterSearch').oninput=render;$('#masterCategory').onchange=render;$('#masterRefresh').onclick=()=>load();$('#masterAdd').onclick=create;$('#masterCreateForm').onsubmit=saveNew;
 document.querySelector('[data-screen="masters"]').addEventListener('click',()=>load());
 for(const id of ['masterModal','masterCreateModal'])document.querySelector(`[data-close="${id}"]`).onclick=()=>{if(busy)return toast('Wait for the save to finish.');if(id==='masterModal'&&$('#masterUploadInput')?.files?.length&&!confirm('Close without finishing this save? Your existing master is retained.'))return;$('#'+id).classList.remove('open');};
 if(demoMode){demo();render();}else if(session)load();
})();
