const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {stripTypeScriptTypes}=require('node:module');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'supabase/functions/seller-tools-inbox/master-files.ts'),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'');
const ctx=vm.createContext({crypto,Uint8Array,TextEncoder,TextDecoder,URL,Blob,Date,Set,Map,AbortSignal,fetch,zipSync:require('fflate').zipSync});vm.runInContext(stripTypeScriptTypes(code),ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const roles=['thumbnail','listing-image-1','listing-image-2','listing-image-3','listing-image-4','listing-image-5'];
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6v8AAAAASUVORK5CYII=','base64'));
function harness(){
 const master={id:'master',user_id:'owner',listing_id:'123',revision:0,files:[{role:'pdf',path:'preserve.pdf',checksum:'unchanged'}]};
 const project={id:'10000000-0000-4000-a000-000000000001',user_id:'owner',revision:1,kind:'etsy',manifest:{listingId:'123',altText:roles.map(r=>'Alt '+r)},media:roles.map((role,i)=>({role,name:`${i+1}.png`,path:`owner/10000000-0000-4000-a000-000000000001/${i+1}.png`,mime:'image/png'}))};
 const uploads=new Map(),objects=new Map(project.media.map(f=>['etsy-assets/'+f.path,png]));let commits=0,writes=0;
 function query(table){let filters={},op='read',value;const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},limit(){return q},insert(v){op='insert';value=v;return q},then(a,b){return Promise.resolve(run()).then(a,b)},maybeSingle:async()=>run(),single:async()=>run()};
 function run(){if(op==='insert'){assert.equal(table,'seller_master_uploads');if(uploads.has(value.id))return {error:{code:'23505'}};uploads.set(value.id,{...value,status:'prepared',expires_at:new Date(Date.now()+600000).toISOString()});return {data:null};}
 let row=table==='seller_master_records'?master:table==='review_projects'?project:uploads.get(filters.id);if(row&&!Object.entries(filters).every(([k,v])=>row[k]===v))row=null;return {data:row||null};}return q;}
 const api={from:query,storage:{from(bucket){return {download:async p=>({data:objects.has(bucket+'/'+p)?new Blob([objects.get(bucket+'/'+p)]):null,error:objects.has(bucket+'/'+p)?null:Error('missing')}),createSignedUploadUrl:async p=>({data:{signedUrl:'https://example.test/'+p,token:'test'}}),upload:async(p,bytes)=>{assert.equal(bucket,'seller-master-files');if(objects.has(bucket+'/'+p))return {error:{statusCode:'409',message:'already exists'}};writes++;objects.set(bucket+'/'+p,bytes);return {data:{path:p}};}}}},rpc:async(name,args)=>{assert.equal(name,'commit_seller_master');const u=uploads.get(args.p_upload);if(u.status==='committed')return {data:{master_id:master.id,revision:u.result_revision,already_committed:true}};assert.equal(args.p_expected,master.revision);master.files=plain(ctx.mergeMasterFiles(master.files,args.p_files));master.revision++;u.status='committed';u.result_revision=master.revision;commits++;return {data:{master_id:master.id,revision:master.revision,saved:true}};}};
 return {context:{db:api,admin:api,userId:'owner'},master,project,uploads,objects,counts:()=>({commits,writes})};
}
const importArgs={master_id:'master',expected_revision:0,project_id:'10000000-0000-4000-a000-000000000001',project_revision:1,idempotency_key:'import-six-20260907',reason:'Approved six listing images'};
test('six-image import preserves master identity, PDF, order, alt text and bytes; retry makes no writes',async()=>{
 const h=harness(),before=JSON.stringify(h.project);
 const saved=plain(await ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context));
 assert.equal(saved.master_id,'master');assert.equal(saved.revision,1);assert.equal(saved.files.length,6);assert.deepEqual(saved.files.map(f=>f.role),roles);assert.deepEqual(saved.files.map(f=>f.position),[1,2,3,4,5,6]);
 for(const f of saved.files){assert.equal(f.status,'saved');assert.equal(f.alt_text,'Alt '+f.role);assert.deepEqual(h.objects.get('seller-master-files/'+f.path),png);}
 assert.deepEqual(h.master.files.find(f=>f.role==='pdf'),{role:'pdf',path:'preserve.pdf',checksum:'unchanged'});
 const retried=plain(await ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context));assert.equal(retried.revision,1);assert.equal(retried.already_committed,true);assert.deepEqual(h.counts(),{commits:1,writes:6});assert.equal(JSON.stringify(h.project),before);
 assert.equal(saved.etsy_updated,false);assert.equal(saved.published,false);assert.equal(saved.scheduled,false);
});
test('wrong planner, another owner and incomplete image sets never write masters',async()=>{
 for(const change of [h=>h.master.listing_id='other',h=>h.project.user_id='someone',h=>h.project.media.pop(),h=>h.project.media.push({...h.project.media[0]})]){
  const h=harness();change(h);await assert.rejects(ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context));assert.deepEqual(h.counts(),{commits:0,writes:0});
 }
});
test('reusing a batch key for changed file content is rejected without extra writes',async()=>{
 const h=harness();await ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context);
 h.objects.set('etsy-assets/owner/10000000-0000-4000-a000-000000000001/1.png',new Uint8Array([...png,10]));
 await assert.rejects(ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context),/Idempotency key/);assert.deepEqual(h.counts(),{commits:1,writes:6});
});
test('partial network upload is safely resumed into the same immutable destinations',async()=>{
 const h=harness(),base=h.context.admin.storage.from;let fail=true;
 h.context.admin.storage.from=bucket=>{const api=base(bucket),original=api.upload;api.upload=async(p,b)=>{if(bucket==='seller-master-files'&&p.endsWith('listing-image-2.png')&&fail){fail=false;return {error:Error('network lost')};}return original(p,b)};return api};
 await assert.rejects(ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context),/network lost/);assert.equal(h.master.revision,0);
 const saved=await ctx.handleMasterTool('import_review_images_to_master',importArgs,h.context);assert.equal(saved.revision,1);assert.deepEqual(h.counts(),{commits:1,writes:6});
});
test('native ChatGPT file attachment is downloaded, verified and committed with the assigned image role',async()=>{
 const h=harness();const original=ctx.fetch;ctx.fetch=async()=>new Response(png,{headers:{'Content-Type':'image/png'}});
 try{const args={master_id:'master',expected_revision:0,idempotency_key:'chat-file-save-1',reason:'Updated thumbnail',files:[{file_id:'file-1',download_url:'https://sdmntprtest.oaiusercontent.com/image.png'}],assignments:[{file_id:'file-1',role:'thumbnail',filename:'thumbnail.png'}]};
 const saved=await ctx.handleMasterTool('upload_master_files',args,h.context);assert.equal(saved.files[0].position,1);assert.equal(saved.files[0].status,'saved');assert.equal(h.master.revision,1);assert.equal(h.project.revision,1);
 }finally{ctx.fetch=original;}
});
test('file input rejects private-network URLs, arbitrary cloud buckets and redirects',async()=>{
 for(const url of ['http://localhost/x','https://127.0.0.1/a','https://attacker.s3.us-east-1.amazonaws.com/a','https://attacker.blob.core.windows.net/a','https://oaiusercontent.com.attacker.test/a','https://user:password@sdmntprtest.oaiusercontent.com/a'])assert.equal(ctx.trustedChatGPTUrl(url),false);
 const original=ctx.fetch;ctx.fetch=async(_,opts)=>{assert.equal(opts.redirect,'error');throw Error('redirect blocked')};
 try{await assert.rejects(ctx.downloadChatGPTFile('https://sdmntprtest.oaiusercontent.com/a'),/redirect blocked/);}finally{ctx.fetch=original;}
});
test('native file schema declares the four required platform properties and role mapping separately',()=>{
 const tool=vm.runInContext("masterTools.find(t=>t.name==='upload_master_files')",ctx);assert.deepEqual(plain(tool._meta),{'openai/fileParams':['files']});
 assert.deepEqual(Object.keys(tool.inputSchema.properties.files.items.properties).sort(),['download_url','file_id','file_name','mime_type']);assert.deepEqual(plain(tool.inputSchema.properties.files.items.required),['download_url','file_id']);
});
test('MCP discovery exposes all master actions without reading private data; calls still require auth',async()=>{
 const source=fs.readFileSync(path.join(root,'supabase/functions/seller-tools-inbox/index.ts'),'utf8').replace(/^import .*?;\s*$/gm,'');
 let handler,authChecks=0;
 const server=vm.createContext({Request,Response,URL,crypto,Date,Set,Map,masterTools:vm.runInContext('masterTools',ctx),masterToolNames:vm.runInContext('masterToolNames',ctx),handleMasterTool:ctx.handleMasterTool,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://project.supabase.co':'test-key'},serve:fn=>{handler=fn}},createClient:()=>{authChecks++;return {auth:{getUser:async()=>({error:Error('invalid')})}}}});
 vm.runInContext(stripTypeScriptTypes(source),server);
 const call=(method,params={},auth)=>handler(new Request('https://project.supabase.co/functions/v1/seller-tools-inbox',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{authorization:auth}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const list=await call('tools/list'),body=await list.json();assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');assert.equal(authChecks,0);
 for(const name of ['list_master_files','get_master_file','prepare_master_upload','commit_master_upload','upload_master_files','import_review_images_to_master']){const t=body.result.tools.find(t=>t.name===name);assert.ok(t);assert.equal(t.inputSchema.type,'object');assert.equal(t.securitySchemes[0].type,'oauth2');}
 for(const name of ['list_master_files','get_master_file','prepare_master_upload','commit_master_upload','upload_master_files','import_review_images_to_master']){const denied=await call('tools/call',{name,arguments:{}});assert.equal(denied.status,401);assert.ok(denied.headers.get('www-authenticate'));assert.equal((await denied.json()).result.isError,true);}
 assert.equal((await call('tools/call',{name:'list_master_files'},'Bearer invalid')).status,401);
});
