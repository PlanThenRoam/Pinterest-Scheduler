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
export const IMAGE_ROLES = ['thumbnail','listing-image-1','listing-image-2','listing-image-3','listing-image-4','listing-image-5'];
const requestKey = {type:'string',minLength:8,maxLength:120,pattern:'^[a-zA-Z0-9._:-]+$'};
const fileInput = {type:'object',additionalProperties:false,properties:{download_url:{type:'string'},file_id:{type:'string'},mime_type:{type:'string'},file_name:{type:'string'}},required:['download_url','file_id']};
const categories = ['planner','blueprint','image','other'];
const tool = (name:string,description:string,properties:any,required:string[],readOnly=false) => ({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required},annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}});
export const masterTools: any[] = [
 tool('list_master_files','Find current private master planners, blueprints and assets by title. Read the current master before editing; stored chat attachments may be stale. Returns metadata, not binary files.',{query:{type:'string'},category:{type:'string',enum:categories}},[],true),
 tool('get_master_file','Retrieve the latest master or a saved revision, its Word/PDF/image download URLs and version history. URLs expire in 15 minutes. Preserve master_id and current_revision for the save workflow.',{master_id:uuid,revision:{type:'integer',minimum:1}},['master_id'],true),
 tool('create_master_file','Create a private master record for a planner, blueprint or asset. Does not upload or publish files. Search first to avoid duplicate masters.',{title:{type:'string',minLength:1,maxLength:180},category:{type:'string',enum:categories},listing_id:{type:'string',pattern:'^[0-9]+$'}},['title','category']),
 tool('prepare_master_upload','Reserve immutable signed upload destinations for one master revision. Upload the bytes, then call commit_master_upload. Batch matching Word and PDF together when both changed. Existing files remain current until commit succeeds.',{master_id:uuid,expected_revision:revision,reason:{type:'string',minLength:1,maxLength:500},idempotency_key:requestKey,files:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['role','filename','size','checksum'],properties:{role:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,59}$'},filename:{type:'string',maxLength:120},size:{type:'integer',minimum:1,maximum:MAX_FILE_BYTES},checksum:{type:'string',pattern:'^[a-f0-9]{64}$'},alt_text:{type:'string',maxLength:500},source_project_id:uuid}}}},['master_id','expected_revision','reason','files']),
 tool('commit_master_upload','Verify every uploaded file against its reserved size and SHA-256, then atomically make the batch current. Retrying the same upload_id is safe. A version conflict requires reading and reconciling the latest master. Never publish as part of saving.',{upload_id:uuid},['upload_id']),
 tool('update_master_details','Change a master title, category or linked Etsy listing while retaining its files and creating a saved revision. Empty listing_id removes the link.',{master_id:uuid,expected_revision:revision,title:{type:'string',minLength:1,maxLength:180},category:{type:'string',enum:categories},listing_id:{type:'string'},reason:{type:'string',minLength:1,maxLength:500}},['master_id','expected_revision','reason']),
 tool('restore_master_version','Restore a saved master as a new current revision. Retains intervening history and never changes the live Etsy listing.',{master_id:uuid,expected_revision:revision,revision:{type:'integer',minimum:1}},['master_id','expected_revision','revision']),
 tool('attach_master_files_to_review','Copy selected current master files into an existing Etsy review project. Explicitly choose add or replacement and the existing listing_file_id. Only customer PDFs may be selected for this shop. Does not publish or change unselected listing fields.',{master_id:uuid,expected_revision:revision,project_id:uuid,files:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['role','action'],properties:{role:{type:'string'},action:{type:'string',enum:['add','replace']},listing_file_id:{type:'string',pattern:'^[0-9]+$'}}}}},['master_id','expected_revision','project_id','files']),
];
masterTools.push(
 {...tool('upload_master_files','Save actual ChatGPT files directly into a private master as one verified version. Provide file attachments and map each file_id to its role. Thumbnail is position 1; listing-image-1 through listing-image-5 are positions 2 through 6. Reuse the idempotency_key on retry. Never changes Etsy or scheduling.',{master_id:uuid,expected_revision:revision,idempotency_key:requestKey,reason:{type:'string',minLength:1,maxLength:500},files:{type:'array',minItems:1,maxItems:20,items:fileInput},assignments:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['file_id','role','filename'],properties:{file_id:{type:'string'},role:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,59}$'},filename:{type:'string',minLength:1,maxLength:120},alt_text:{type:'string',maxLength:500}}}}},['master_id','expected_revision','idempotency_key','reason','files','assignments']),_meta:{'openai/fileParams':['files']}},
 tool('import_review_images_to_master','Copy the six approved listing images from an existing private Review Box project into its linked planner master. Keeps thumbnail and five listing-photo positions, alt text, original bytes and previous master versions. Does not modify the review project, Etsy or scheduling.',{master_id:uuid,expected_revision:revision,project_id:uuid,project_revision:{type:'integer',minimum:1},idempotency_key:requestKey,reason:{type:'string',minLength:1,maxLength:500}},['master_id','expected_revision','project_id','project_revision','idempotency_key','reason'])
);
for(const t of masterTools){
 if(['commit_master_upload','upload_master_files','import_review_images_to_master'].includes(t.name))t.annotations.idempotentHint=true;
}
const masterOutputSchemas:Record<string,any>={
 list_master_files:{type:'object',required:['masters','limit','workflow'],properties:{masters:{type:'array',items:{type:'object'}},limit:{type:'integer'},workflow:{type:'string'}}},
 get_master_file:{type:'object',required:['master','current_revision','is_current','history','publications','urls_expire_at'],properties:{master:{type:'object'},current_revision:revision,is_current:{type:'boolean'},history:{type:'array',items:{type:'object'}},publications:{type:'array',items:{type:'object'}},urls_expire_at:{type:'string'}}},
 prepare_master_upload:{type:'object',required:['upload_id','master_id','expected_revision','files'],properties:{upload_id:uuid,master_id:uuid,expected_revision:revision,files:{type:'array',items:{type:'object'}},already_committed:{type:'boolean'},revision,bucket:{type:'string'},expires_at:{type:'string'},next_action:{type:'string'}}},
 commit_master_upload:{type:'object',required:['master_id','revision','files','etsy_updated','published','scheduled'],properties:{master_id:uuid,revision,files:{type:'array',items:{type:'object',required:['role','name','size','checksum','path','status'],properties:{role:{type:'string'},name:{type:'string'},size:{type:'integer'},checksum:{type:'string'},path:{type:'string'},status:{type:'string',enum:['saved']},position:{type:'integer',minimum:1,maximum:6},alt_text:{type:'string'}}}},etsy_updated:{type:'boolean',const:false},published:{type:'boolean',const:false},scheduled:{type:'boolean',const:false},already_committed:{type:'boolean'},saved:{type:'boolean'}}}
};
for(const t of masterTools){const schema=masterOutputSchemas[t.name]||(['upload_master_files','import_review_images_to_master'].includes(t.name)?masterOutputSchemas.commit_master_upload:null);if(schema)t.outputSchema=schema;}
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
  const position=IMAGE_ROLES.indexOf(f.role)+1;
  if(position)ensure(['png','jpg','jpeg','webp'].includes(ext),'Listing-image roles must contain an image.');
  if(f.alt_text!=null)ensure(typeof f.alt_text==='string'&&f.alt_text.length<=500,'Image alt text must be at most 500 characters.');
  if(f.source_project_id!=null)ensure(/^[0-9a-f-]{36}$/i.test(f.source_project_id),'Invalid source project ID.');
  return {role:f.role,name:f.filename,mime:MIME[ext],size:f.size,checksum:f.checksum,...(position?{position}:{}),...(f.alt_text!=null?{alt_text:f.alt_text}:{}),...(f.source_project_id?{source_project_id:f.source_project_id}:{})};
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

export function orderedMasterFiles(files:any[]){return [...files].sort((a,b)=>(a.position||100)-(b.position||100)||a.role.localeCompare(b.role));}
export async function sha256(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function uploadIdentity(user:string,master:string,key:unknown){
 ensure(typeof key==='string'&&/^[a-zA-Z0-9._:-]{8,120}$/.test(key),'Use a stable idempotency key of 8–120 letters, numbers, dots, colons, underscores or hyphens.');
 const h=await sha256(new TextEncoder().encode(`${user}/${master}/${key}`));return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function canonicalFile(f:any){return {role:f.role,name:f.name,mime:f.mime,size:f.size,checksum:f.checksum,path:f.path,...(f.position?{position:f.position}:{}),...(f.alt_text!=null?{alt_text:f.alt_text}:{}),...(f.source_project_id?{source_project_id:f.source_project_id}:{})};}
export function trustedChatGPTUrl(raw:string){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
 return /(^|\.)oaiusercontent\.com$/.test(u.hostname)||/^oaisd(?:mnt|sor)pr[a-z0-9-]*\.blob\.core\.windows\.net$/.test(u.hostname)||/^(?:oai)?sdmntpr[a-z0-9-]*\.blob\.core\.windows\.net$/.test(u.hostname)||/^oaisd(?:mnt|sor)pr[a-z0-9-]*aws\.s3[.-][a-z0-9.-]+\.amazonaws\.com$/.test(u.hostname);
 }catch{return false;}
}
export async function downloadChatGPTFile(raw:string){
 ensure(trustedChatGPTUrl(raw),'Use the temporary download URL provided by ChatGPT for the attached file.');
 const response=await fetch(raw,{redirect:'error',signal:AbortSignal.timeout(30000)});
 ensure(response.ok,'Could not download the ChatGPT file. Attach it again to obtain a fresh URL.');
 const size=Number(response.headers.get('content-length'));ensure(!size||size<=MAX_FILE_BYTES,'File exceeds 50 MB.');
 ensure(response.body,'The file response was empty.');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;ensure(total<=MAX_FILE_BYTES,'File exceeds 50 MB.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

export async function handleMasterTool(name:string,args:any,ctx:any){
 const {admin,userId,db}=ctx;
 const read=async(id:string)=>{const r=result(await db.from('seller_master_records').select('*').eq('id',id).eq('user_id',userId).maybeSingle());ensure(r,'Master not found or access denied.');return r;};
 const rpc=async(r:any,values:any)=>result(await admin.rpc('commit_seller_master',{p_user:userId,p_master:r.id,p_expected:checkRevision(args.expected_revision),p_files:[],p_reason:args.reason||'Updated master details',...values}));
 if(name==='list_master_files'){
  let q=db.from('seller_master_records').select('*').eq('user_id',userId).order('title').limit(200);
  if(args.category){ensure(categories.includes(args.category),'Invalid category.');q=q.eq('category',args.category);}
  const all=result(await q)||[];const query=String(args.query||'').toLowerCase().trim();
  return {masters:all.filter((x:any)=>!query||x.title.toLowerCase().includes(query)).map((x:any)=>({...x,files:orderedMasterFiles(x.files)})),limit:200,workflow:'get_master_file → prepare_master_upload → upload bytes → commit_master_upload. Saving never publishes to Etsy.'};
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
  const files=[];for(const f of orderedMasterFiles(selected.files||[])){ensure(f.path.startsWith(userId+'/'+current.id+'/'),'Invalid master storage reference.');const signed=result(await admin.storage.from(MASTER_BUCKET).createSignedUrl(f.path,900,{download:f.name}));files.push({...f,download_url:signed.signedUrl});}
  return {master:{...selected,id:current.id,files},current_revision:current.revision,is_current:selected.revision===current.revision,history,publications,urls_expire_at:new Date(Date.now()+900000).toISOString()};
 }
 if(name==='prepare_master_upload'){
  const r=await read(args.master_id),expected=checkRevision(args.expected_revision);
  if(!args.idempotency_key)ensure(r.revision===expected,'Version conflict: fetch the latest master before saving.');
  ensure(typeof args.reason==='string'&&args.reason.trim().length>0&&args.reason.length<=500,'Add a brief change note.');
  const files=validateUploadFiles(args.files);
  const id=args.idempotency_key?await uploadIdentity(userId,r.id,args.idempotency_key):crypto.randomUUID();
  const stored=files.map(f=>({...f,path:`${userId}/${r.id}/${id}/${f.role}.${f.name.split('.').pop()?.toLowerCase()}`}));
  let u:any=args.idempotency_key?result(await admin.from('seller_master_uploads').select('*').eq('id',id).eq('user_id',userId).maybeSingle()):null;
  const match=()=>{ensure(u.master_id===r.id&&u.expected_revision===expected&&u.reason===args.reason.trim()&&JSON.stringify(u.files.map(canonicalFile))===JSON.stringify(stored.map(canonicalFile)),'Idempotency key already belongs to a different save. Use the original request or a new key.');};
  if(u)match();
  else{
   ensure(r.revision===expected,'Version conflict: fetch the latest master before saving.');
   const inserted=await admin.from('seller_master_uploads').insert({id,user_id:userId,master_id:r.id,expected_revision:expected,files:stored,reason:args.reason.trim()});
   if(inserted.error?.code==='23505'){u=result(await admin.from('seller_master_uploads').select('*').eq('id',id).eq('user_id',userId).single());match();}
   else{result(inserted);u={status:'prepared',expires_at:new Date(Date.now()+7200000).toISOString()};}
  }
  if(u.status==='committed')return {upload_id:id,master_id:r.id,expected_revision:expected,revision:u.result_revision,already_committed:true,files:stored};
  ensure(r.revision===expected,'Version conflict: fetch the latest master before saving.');
  ensure(u.status==='prepared'&&Date.parse(u.expires_at)>Date.now(),'Upload expired or cancelled. Use a new idempotency key.');
  const uploads=[];for(const f of stored){const signed=result(await admin.storage.from(MASTER_BUCKET).createSignedUploadUrl(f.path,{upsert:false}));uploads.push({...f,upload_url:signed.signedUrl,token:signed.token});}
  return {upload_id:id,master_id:r.id,expected_revision:expected,bucket:MASTER_BUCKET,files:uploads,expires_at:u.expires_at,next_action:'Upload each file to its signed destination, then call commit_master_upload with upload_id. Use PUT, the reserved Content-Type, and x-upsert: false.'};
 }
 if(name==='commit_master_upload'){
  const u=result(await admin.from('seller_master_uploads').select('*').eq('id',args.upload_id).eq('user_id',userId).maybeSingle());ensure(u,'Upload not found or access denied.');
  const report=()=>({files:orderedMasterFiles(u.files||[]).map((f:any)=>({...canonicalFile(f),status:'saved'})),etsy_updated:false,published:false,scheduled:false});
  if(u.status==='committed')return {master_id:u.master_id,revision:u.result_revision,already_committed:true,...report()};
  ensure(u.status==='prepared'&&Date.parse(u.expires_at)>Date.now(),'Upload expired or cancelled. Start a new upload.');
  const r=await read(u.master_id);ensure(r.revision===u.expected_revision,'Version conflict: the master changed. Fetch the latest version and reconcile your edits.');
  for(const f of u.files){ensure(f.path.startsWith(userId+'/'+r.id+'/'+u.id+'/'),'Invalid upload reference.');const blob=result(await admin.storage.from(MASTER_BUCKET).download(f.path));ensure(blob.size<=MAX_FILE_BYTES,'Uploaded file exceeds 50 MB.');await verifyMasterBytes(f,new Uint8Array(await blob.arrayBuffer()));}
  const saved=result(await admin.rpc('commit_seller_master',{p_user:userId,p_master:r.id,p_expected:u.expected_revision,p_files:u.files,p_reason:u.reason,p_upload:u.id}));
  return {...saved,...report()};
 }
 if(name==='upload_master_files'||name==='import_review_images_to_master'){
  const r=await read(args.master_id);checkRevision(args.expected_revision);await uploadIdentity(userId,r.id,args.idempotency_key);
  const sources:any[]=[];let downloadedTotal=0;
  if(name==='import_review_images_to_master'){
   const p=result(await db.from('review_projects').select('*').eq('id',args.project_id).eq('user_id',userId).maybeSingle());
   ensure(p&&p.kind==='etsy'&&r.listing_id&&String(p.manifest?.listingId)===r.listing_id,'The review project must belong to this owner and match the master’s linked planner listing.');
   ensure(p.revision===args.project_revision,'The review project changed. Read the current project before importing.');
   for(const [i,role] of IMAGE_ROLES.entries()){
    const matches=(p.media||[]).filter((f:any)=>f.role===role);ensure(matches.length===1,`The project must have exactly one ${role}.`);
    const f=matches[0];ensure(typeof f.path==='string'&&f.path.startsWith(userId+'/'+p.id+'/')&&!f.path.includes('..'),'Invalid private project file reference.');
    const blob=result(await admin.storage.from('etsy-assets').download(f.path));ensure(blob.size<=MAX_FILE_BYTES,'Source image exceeds 50 MB.');
    const bytes=new Uint8Array(await blob.arrayBuffer());downloadedTotal+=bytes.length;ensure(downloadedTotal<=MAX_BATCH_BYTES,'One save can contain up to 100 MB.');
    if(f.checksum)await verifyMasterBytes({...f,size:f.size??bytes.length},bytes);
    sources.push({role,filename:f.name,alt_text:String(p.manifest?.altText?.[i]||''),source_project_id:p.id,bytes});
   }
  }else{
   ensure(Array.isArray(args.files)&&args.files.length>0&&args.files.length<=20&&Array.isArray(args.assignments)&&args.assignments.length===args.files.length,'Map each attached file exactly once.');
   const seen=new Set();
   for(const a of args.assignments){
    ensure(!seen.has(a.file_id),'Map each attached file exactly once.');seen.add(a.file_id);
    const matches=args.files.filter((f:any)=>f.file_id===a.file_id);ensure(matches.length===1,'Each assignment must identify exactly one attached file.');
    const bytes=await downloadChatGPTFile(matches[0].download_url);downloadedTotal+=bytes.length;ensure(downloadedTotal<=MAX_BATCH_BYTES,'One save can contain up to 100 MB.');
    sources.push({...a,bytes});
   }
  }
  let total=0;for(const f of sources){total+=f.bytes.length;ensure(total<=MAX_BATCH_BYTES,'One save can contain up to 100 MB.');f.size=f.bytes.length;f.checksum=await sha256(f.bytes);}
  const checked=validateUploadFiles(sources);for(let i=0;i<checked.length;i++)await verifyMasterBytes(checked[i],sources[i].bytes);
  const prepared=await handleMasterTool('prepare_master_upload',{master_id:r.id,expected_revision:args.expected_revision,idempotency_key:args.idempotency_key,reason:args.reason,files:sources},ctx);
  if(!prepared.already_committed){
   for(const f of prepared.files){
    const bytes=sources.find(s=>s.role===f.role).bytes;
    const upload=await admin.storage.from(MASTER_BUCKET).upload(f.path,bytes,{contentType:f.mime,upsert:false});
    if(upload.error){
     if(!['409','Duplicate'].includes(String(upload.error.statusCode||upload.error.status))&&!/already exists|duplicate/i.test(upload.error.message||''))throw upload.error;
     const existing=result(await admin.storage.from(MASTER_BUCKET).download(f.path));await verifyMasterBytes(f,new Uint8Array(await existing.arrayBuffer()));
    }
   }
  }
  return {...await handleMasterTool('commit_master_upload',{upload_id:prepared.upload_id},ctx),upload_id:prepared.upload_id,verification_action:'get_master_file'};
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
  const changes:any[]=[];const added:any[]=[];const sources:any[]=[];let downloadedTotal=0;const seen=new Set();const targets=new Set();
  for(const f of args.files){
   const src=r.files.find((x:any)=>x.role===f.role);ensure(src&&!seen.has(f.role),'Choose each existing master file once.');ensure(src.mime===MIME.pdf,'Only PDFs are delivered through this shop’s Etsy listings.');seen.add(f.role);
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
