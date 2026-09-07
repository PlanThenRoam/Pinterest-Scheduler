import { zipSync } from 'npm:fflate@0.8.2';

export const MASTER_BUCKET = 'seller-master-files';
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MIME: Record<string,string> = {
 pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', zip:'application/zip',
};
const uuid = {type:'string',format:'uuid'};
const revision = {type:'integer',minimum:0};
const categories = ['planner','blueprint','image','other'];
const tool = (name:string,description:string,properties:any,required:string[],readOnly=false) => ({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required},annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}});
export const masterTools = [
 tool('list_master_files','Find current private master planners, blueprints and assets by title. Read the current master before editing; stored chat attachments may be stale. Returns metadata, not binary files.',{query:{type:'string'},category:{type:'string',enum:categories}},[],true),
 tool('get_master_file','Retrieve the latest master or a saved revision, its Word/PDF/image download URLs and version history. URLs expire in 15 minutes. Preserve master_id and current_revision for the save workflow.',{master_id:uuid,revision:{type:'integer',minimum:1}},['master_id'],true),
 tool('create_master_file','Create a private master record for a planner, blueprint or asset. Does not upload or publish files. Search first to avoid duplicate masters.',{title:{type:'string',minLength:1,maxLength:180},category:{type:'string',enum:categories},listing_id:{type:'string',pattern:'^[0-9]+$'}},['title','category']),
 tool('prepare_master_upload','Reserve immutable signed upload destinations for one master revision. Upload the bytes, then call commit_master_upload. Batch matching Word and PDF together when both changed. Existing files remain current until commit succeeds.',{master_id:uuid,expected_revision:revision,reason:{type:'string',minLength:1,maxLength:500},files:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['role','filename','size','checksum'],properties:{role:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,59}$'},filename:{type:'string',maxLength:120},size:{type:'integer',minimum:1,maximum:MAX_FILE_BYTES},checksum:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}},['master_id','expected_revision','reason','files']),
 tool('commit_master_upload','Verify every uploaded file against its reserved size and SHA-256, then atomically make the batch current. Retrying the same upload_id is safe. A version conflict requires reading and reconciling the latest master. Never publish as part of saving.',{upload_id:uuid},['upload_id']),
 tool('update_master_details','Change a master title, category or linked Etsy listing while retaining its files and creating a saved revision. Empty listing_id removes the link.',{master_id:uuid,expected_revision:revision,title:{type:'string',minLength:1,maxLength:180},category:{type:'string',enum:categories},listing_id:{type:'string'},reason:{type:'string',minLength:1,maxLength:500}},['master_id','expected_revision','reason']),
 tool('restore_master_version','Restore a saved master as a new current revision. Retains intervening history and never changes the live Etsy listing.',{master_id:uuid,expected_revision:revision,revision:{type:'integer',minimum:1}},['master_id','expected_revision','revision']),
 tool('attach_master_files_to_review','Copy selected current master files into an existing Etsy review project. Explicitly choose add or replacement and the existing listing_file_id. Word files are packaged as ZIP for Etsy delivery. Does not publish or change unselected listing fields.',{master_id:uuid,expected_revision:revision,project_id:uuid,files:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['role','action'],properties:{role:{type:'string'},action:{type:'string',enum:['add','replace']},listing_file_id:{type:'string',pattern:'^[0-9]+$'}}}}},['master_id','expected_revision','project_id','files']),
];
export const masterToolNames = new Set(masterTools.map(x=>x.name));

function ensure(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
function result(r:any){if(r.error)throw r.error;return r.data;}
function checkRevision(value:unknown){ensure(Number.isInteger(value)&&Number(value)>=0,'Read the current master revision before saving.');return Number(value);}
function checkMetadata(args:any,creating=false){
 const data:any={};
 if(creating||'title' in args){ensure(typeof args.title==='string'&&args.title.trim().length>0&&args.title.trim().length<=180,'Enter a title between 1 and 180 characters.');data.title=args.title.trim();}
 if(creating||'category' in args){ensure(categories.includes(args.category),'Choose planner, blueprint, image or other.');data.category=args.category;}
 if('listing_id' in args){ensure(args.listing_id===null||typeof args.listing_id==='string'&&(!args.listing_id||/^\d+$/.test(args.listing_id)),'Choose a valid Etsy listing.');data.listing_id=args.listing_id||null;}
 return data;
}
export function validateUploadFiles(files:any){
 ensure(Array.isArray(files)&&files.length>0&&files.length<=20,'Choose between 1 and 20 files.');
 let total=0;const roles=new Set();
 const clean=files.map(f=>{
  ensure(typeof f.role==='string'&&/^[a-z][a-z0-9_-]{0,59}$/.test(f.role)&&!roles.has(f.role),'Each file needs a unique role, such as docx, pdf or cover.');roles.add(f.role);
  ensure(typeof f.filename==='string'&&f.filename.length<=120&&/^[^/\\\x00-\x1f]+$/.test(f.filename)&&f.filename!=='.'&&f.filename!=='..','Use a filename without folder paths.');
  const ext=f.filename.split('.').pop()?.toLowerCase()||'';ensure(MIME[ext],'Supported files: Word (.docx), PDF, PNG, JPG, WebP and ZIP.');
  ensure(Number.isInteger(f.size)&&f.size>0&&f.size<=MAX_FILE_BYTES,'Each file must be between 1 byte and 50 MB.');total+=f.size;
  ensure(typeof f.checksum==='string'&&/^[a-f0-9]{64}$/.test(f.checksum),'Each file requires its SHA-256 checksum.');
  if(f.role==='docx'||f.role==='pdf')ensure(ext===f.role,`The ${f.role} role must contain a .${f.role} file.`);
  return {role:f.role,name:f.filename,mime:MIME[ext],size:f.size,checksum:f.checksum};
 });
 ensure(total<=MAX_BATCH_BYTES,'One save can contain up to 100 MB in total.');return clean;
}
export async function verifyMasterBytes(file:any,bytes:Uint8Array){
 ensure(bytes.byteLength===file.size,`${file.name}: the upload is incomplete or has changed.`);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 ensure(hash===file.checksum,`${file.name}: checksum verification failed. Upload the original bytes again.`);
 const head=new TextDecoder('latin1').decode(bytes.slice(0,16));
 if(file.mime===MIME.pdf)ensure(head.startsWith('%PDF-'),`${file.name}: not a PDF file.`);
 if(file.mime===MIME.docx||file.mime===MIME.zip)ensure(bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4,`${file.name}: not a Word/ZIP file.`);
 if(file.mime===MIME.png)ensure(bytes[0]===137&&head.slice(1,4)==='PNG',`${file.name}: not a PNG file.`);
 if(file.mime===MIME.jpg)ensure(bytes[0]===255&&bytes[1]===216&&bytes[2]===255,`${file.name}: not a JPEG file.`);
 if(file.mime===MIME.webp)ensure(head.startsWith('RIFF')&&head.slice(8,12)==='WEBP',`${file.name}: not a WebP file.`);
}
export function mergeMasterFiles(current:any[],next:any[]){const roles=new Set(next.map(x=>x.role));return [...current.filter(x=>!roles.has(x.role)),...next].sort((a,b)=>a.role.localeCompare(b.role));}
export function etsyDelivery(file:any,source:Uint8Array){
 let bytes=source,name=file.name,mime=file.mime;
 if(mime===MIME.docx||mime===MIME.webp){bytes=zipSync({[name]:bytes},{level:0});name=name.replace(/\.[^.]+$/,'.zip');mime=MIME.zip;}
 name=name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_');
 const dot=name.lastIndexOf('.'),ext=name.slice(dot);name=name.slice(0,dot).slice(0,70-ext.length)+ext;
 ensure(bytes.byteLength<=20*1024*1024,'Etsy files must be no larger than 20 MB.');
 return {bytes,name,mime};
}
export async function handleMasterTool(name:string,args:any,ctx:any){
 const {admin,userId,db}=ctx;
 const read=async(id:string)=>{const r=result(await db.from('seller_master_records').select('*').eq('id',id).eq('user_id',userId).maybeSingle());ensure(r,'Master not found or access denied.');return r;};
 const rpc=async(r:any,values:any)=>result(await admin.rpc('commit_seller_master',{p_user:userId,p_master:r.id,p_expected:checkRevision(args.expected_revision),p_files:[],p_reason:args.reason||'Updated master details',...values}));
 if(name==='list_master_files'){
  let q=db.from('seller_master_records').select('*').eq('user_id',userId).order('title').limit(200);
  if(args.category){ensure(categories.includes(args.category),'Invalid category.');q=q.eq('category',args.category);}
  const all=result(await q)||[];const query=String(args.query||'').toLowerCase().trim();
  return {masters:all.filter((x:any)=>!query||x.title.toLowerCase().includes(query)),limit:200,workflow:'get_master_file → prepare_master_upload → upload bytes → commit_master_upload. Saving never publishes to Etsy.'};
 }
 if(name==='create_master_file'){
  const data=checkMetadata(args,true);
  const saved=await admin.from('seller_master_records').insert({...data,user_id:userId}).select('*').single();
  if(saved.error?.code==='23505')throw new Error('A master with this title already exists. Open it to update its files.');
  return {master:result(saved)};
 }
 if(name==='get_master_file'){
  const current=await read(args.master_id);let selected=current;
  if(args.revision!=null){ensure(Number.isInteger(args.revision)&&args.revision>0,'Invalid revision.');selected=result(await db.from('seller_master_versions').select('*').eq('master_id',current.id).eq('user_id',userId).eq('revision',args.revision).single());}
  const history=result(await db.from('seller_master_versions').select('revision,reason,created_at,restored_from').eq('master_id',current.id).eq('user_id',userId).order('revision',{ascending:false}).limit(100));
  const publications=result(await db.from('seller_master_publications').select('*').eq('master_id',current.id).eq('user_id',userId));
  const files=[];for(const f of selected.files||[]){ensure(f.path.startsWith(userId+'/'+current.id+'/'),'Invalid master storage reference.');const signed=result(await admin.storage.from(MASTER_BUCKET).createSignedUrl(f.path,900,{download:f.name}));files.push({...f,download_url:signed.signedUrl});}
  return {master:{...selected,id:current.id,files},current_revision:current.revision,is_current:selected.revision===current.revision,history,publications,urls_expire_at:new Date(Date.now()+900000).toISOString()};
 }
 if(name==='prepare_master_upload'){
  const r=await read(args.master_id);ensure(r.revision===checkRevision(args.expected_revision),'Version conflict: fetch the latest master before saving.');
  ensure(typeof args.reason==='string'&&args.reason.trim().length>0&&args.reason.length<=500,'Add a brief change note.');
  const files=validateUploadFiles(args.files),id=crypto.randomUUID();
  const stored=files.map(f=>({...f,path:`${userId}/${r.id}/${id}/${f.role}.${f.name.split('.').pop()?.toLowerCase()}`}));
  result(await admin.from('seller_master_uploads').insert({id,user_id:userId,master_id:r.id,expected_revision:r.revision,files:stored,reason:args.reason.trim()}));
  const uploads=[];for(const f of stored){const signed=result(await admin.storage.from(MASTER_BUCKET).createSignedUploadUrl(f.path,{upsert:false}));uploads.push({...f,upload_url:signed.signedUrl,token:signed.token});}
  return {upload_id:id,master_id:r.id,expected_revision:r.revision,bucket:MASTER_BUCKET,files:uploads,expires_at:new Date(Date.now()+7200000).toISOString(),next_action:'Upload each file to its signed destination, then call commit_master_upload with upload_id. Use PUT, the reserved Content-Type, and x-upsert: false.'};
 }
 if(name==='commit_master_upload'){
  const u=result(await admin.from('seller_master_uploads').select('*').eq('id',args.upload_id).eq('user_id',userId).maybeSingle());ensure(u,'Upload not found or access denied.');
  if(u.status==='committed')return {master_id:u.master_id,revision:u.result_revision,already_committed:true};
  ensure(u.status==='prepared'&&Date.parse(u.expires_at)>Date.now(),'Upload expired or cancelled. Start a new upload.');
  const r=await read(u.master_id);ensure(r.revision===u.expected_revision,'Version conflict: the master changed. Fetch the latest version and reconcile your edits.');
  for(const f of u.files){ensure(f.path.startsWith(userId+'/'+r.id+'/'+u.id+'/'),'Invalid upload reference.');const blob=result(await admin.storage.from(MASTER_BUCKET).download(f.path));ensure(blob.size<=MAX_FILE_BYTES,'Uploaded file exceeds 50 MB.');await verifyMasterBytes(f,new Uint8Array(await blob.arrayBuffer()));}
  return result(await admin.rpc('commit_seller_master',{p_user:userId,p_master:r.id,p_expected:u.expected_revision,p_files:u.files,p_reason:u.reason,p_upload:u.id}));
 }
 if(name==='update_master_details'){const r=await read(args.master_id);return rpc(r,{p_metadata:checkMetadata(args)});}
 if(name==='restore_master_version'){const r=await read(args.master_id);ensure(Number.isInteger(args.revision)&&args.revision>0,'Choose a saved version.');return rpc(r,{p_restore:args.revision,p_reason:`Restored revision ${args.revision}`});}
 if(name==='attach_master_files_to_review'){
  const r=await read(args.master_id);ensure(r.revision===checkRevision(args.expected_revision),'Version conflict: fetch the latest master first.');
  const p=result(await db.from('review_projects').select('*').eq('id',args.project_id).single());
  ensure(p.kind==='etsy'&&p.manifest?.mode==='edit'&&!['published','publishing'].includes(p.status),'Prepare an editable Etsy listing update first.');
  ensure(r.listing_id&&String(p.manifest.listingId)===r.listing_id,'The review project must match this master’s linked Etsy listing.');
  ensure(Array.isArray(args.files)&&args.files.length>0&&args.files.length<=5,'Select between 1 and 5 master files.');
  const count=(p.manifest.existingFiles||[]).length;
  ensure(!args.files.some((f:any)=>f.action==='replace')||count<5,'A replacement needs one free Etsy file slot. Free a slot in Etsy before preparing the replacement.');
  ensure(count+args.files.filter((f:any)=>f.action==='add').length<=5,'This selection would exceed Etsy’s five-file limit. Choose replacements instead of additions.');
  const changes:any[]=[];const added:any[]=[];const sources:any[]=[];const seen=new Set();const targets=new Set();
  for(const f of args.files){
   const src=r.files.find((x:any)=>x.role===f.role);ensure(src&&!seen.has(f.role),'Choose each existing master file once.');seen.add(f.role);
   ensure(['add','replace'].includes(f.action),'Choose add or replace for each file.');
   if(f.action==='replace'){ensure(!targets.has(f.listing_file_id)&&(p.manifest.existingFiles||[]).some((x:any)=>String(x.id)===String(f.listing_file_id)),'Choose each existing Etsy download only once.');targets.add(f.listing_file_id);}
   ensure(src.path.startsWith(userId+'/'+r.id+'/'),'Invalid master storage reference.');
   let bytes=new Uint8Array(await result(await admin.storage.from(MASTER_BUCKET).download(src.path)).arrayBuffer());await verifyMasterBytes(src,bytes);
   const delivery=etsyDelivery(src,bytes);bytes=delivery.bytes;const filename=delivery.name,mime=delivery.mime;
   const role=`master-${r.id}-${f.role}`,path=`${userId}/${p.id}/${crypto.randomUUID()}-${role}`;
   const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   result(await admin.storage.from('etsy-assets').upload(path,bytes,{contentType:mime,upsert:false}));
   added.push({role,name:filename,path,mime,size:bytes.byteLength,checksum,upload_status:'stored',storage_status:'verified'});
   changes.push({role,filename,action:f.action,...(f.action==='replace'?{listingFileId:String(f.listing_file_id)}:{})});
   sources.push({master_id:r.id,user_id:userId,master_revision:r.revision,role:f.role,asset_role:role,checksum:src.checksum,asset_checksum:checksum});
  }
  const manifest={...p.manifest,fileUpdates:changes,updateScope:[...new Set([...(Array.isArray(p.manifest.updateScope)?p.manifest.updateScope:[]),'files'])],masterSources:sources};
  const media=[...(p.media||[]).filter((x:any)=>!added.some(a=>a.role===x.role)),...added];
  const changed=result(await db.from('review_projects').update({manifest,media,status:'ready',last_error:null}).eq('id',p.id).eq('revision',p.revision).select('id').maybeSingle());
  ensure(changed,'The review project changed while attaching files. Refresh it before retrying.');
  return {project_id:p.id,master_id:r.id,master_revision:r.revision,status:'ready',published:false,message:'Master files attached for review. Approve the selected file changes in Seller Tools to publish.'};
 }
 throw new Error('Unknown master-file action.');
}
