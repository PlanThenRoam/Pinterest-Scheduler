const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {stripTypeScriptTypes}=require('node:module');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'supabase/functions/seller-tools-inbox/master-files.ts'),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'');
const ctx=vm.createContext({crypto,Uint8Array,TextEncoder,TextDecoder,URL,Blob,Date,Set,Map,AbortSignal,fetch,unzipSync:require('fflate').unzipSync,drainStorageCleanup:async()=>({cleanup_complete:true})});vm.runInContext(stripTypeScriptTypes(code),ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const roles=['thumbnail','listing-image-1','listing-image-2','listing-image-3','listing-image-4','listing-image-5'];
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6v8AAAAASUVORK5CYII=','base64'));
function harness(){
 const master={id:'master',user_id:'owner',listing_id:'123',revision:0,files:[]};
 const project={id:'10000000-0000-4000-a000-000000000001',revision:1,kind:'etsy',manifest:{listingId:'123',altText:roles.map(r=>'Alt '+r)},media:roles.map((role,i)=>({role,name:`${i+1}.png`,path:`owner/10000000-0000-4000-a000-000000000001/${i+1}.png`,mime:'image/png'}))};
 const uploads=new Map(),objects=new Map(project.media.map(f=>['etsy-assets/'+f.path,png]));let commits=0,writes=0;
 function query(table){let filters={},op='read',value;const q={select(){return q},eq(k,v){if(table==='review_projects'&&k==='user_id')throw Error('column review_projects.user_id does not exist');filters[k]=v;return q},order(){return q},limit(){return q},insert(v){op='insert';value=v;return q},then(a,b){return Promise.resolve(run()).then(a,b)},maybeSingle:async()=>run(),single:async()=>run()};
 function run(){if(op==='insert'){assert.equal(table,'seller_master_uploads');if(uploads.has(value.id))return {error:{code:'23505'}};uploads.set(value.id,{...value,status:'prepared',expires_at:new Date(Date.now()+600000).toISOString()});return {data:null};}
 let row=table==='seller_master_records'?master:table==='review_projects'?project:uploads.get(filters.id);if(row&&!Object.entries(filters).every(([k,v])=>row[k]===v))row=null;return {data:row||null};}return q;}
 const api={from:query,storage:{from(bucket){return {download:async p=>({data:objects.has(bucket+'/'+p)?new Blob([objects.get(bucket+'/'+p)]):null,error:objects.has(bucket+'/'+p)?null:Error('missing')}),createSignedUploadUrl:async p=>({data:{signedUrl:'https://example.test/'+p,token:'test'}}),upload:async(p,bytes)=>{assert.equal(bucket,'seller-master-files');if(objects.has(bucket+'/'+p))return {error:{statusCode:'409',message:'already exists'}};writes++;objects.set(bucket+'/'+p,bytes);return {data:{path:p}};}}}},rpc:async(name,args)=>{assert.equal(name,'commit_seller_master');const u=uploads.get(args.p_upload);if(u.status==='committed')return {data:{master_id:master.id,revision:u.result_revision,already_committed:true}};assert.equal(args.p_expected,master.revision);master.files=plain(args.p_files);master.revision++;u.status='committed';u.result_revision=master.revision;commits++;return {data:{master_id:master.id,revision:master.revision,saved:true}};}};
 return {context:{db:api,admin:api,userId:'owner'},master,project,uploads,objects,counts:()=>({commits,writes})};
}
const docx=require('fflate').zipSync({'[Content_Types].xml':new TextEncoder().encode('<Types/>'),'word/document.xml':new TextEncoder().encode('<document/>')});
const uploadArgs={master_id:'master',expected_revision:0,idempotency_key:'chat-file-save-1',reason:'Updated Word backup',files:[{file_id:'file-1',download_url:'https://sdmntprtest.oaiusercontent.com/planner.docx'}],assignments:[{file_id:'file-1',role:'docx',filename:'Planner.docx'}]};
test('native DOCX transfer verifies bytes and retry neither uploads nor commits twice',async()=>{
 const h=harness(),original=ctx.fetch;ctx.fetch=async()=>new Response(docx);
 try{const saved=await ctx.handleMasterTool('upload_master_files',uploadArgs,h.context);assert.equal(saved.files[0].role,'docx');assert.equal(saved.files[0].status,'saved');assert.equal(saved.etsy_updated,false);assert.equal(saved.published,false);assert.equal(saved.scheduled,false);assert.equal(h.master.files.length,1);assert.deepEqual(h.objects.get('seller-master-files/'+saved.files[0].path),docx);
 const retry=await ctx.handleMasterTool('upload_master_files',uploadArgs,h.context);assert.equal(retry.already_committed,true);assert.deepEqual(h.counts(),{commits:1,writes:1});}finally{ctx.fetch=original;}
});
test('changed bytes cannot reuse a committed transfer key',async()=>{const h=harness(),original=ctx.fetch;ctx.fetch=async()=>new Response(docx);try{await ctx.handleMasterTool('upload_master_files',uploadArgs,h.context);ctx.fetch=async()=>new Response(new Uint8Array([...docx,10]));await assert.rejects(ctx.handleMasterTool('upload_master_files',uploadArgs,h.context),/Idempotency key/);assert.deepEqual(h.counts(),{commits:1,writes:1});}finally{ctx.fetch=original;}});
test('lost upload response resumes by verifying the already stored object',async()=>{const h=harness(),original=ctx.fetch,base=h.context.admin.storage.from;let fail=true;ctx.fetch=async()=>new Response(docx);h.context.admin.storage.from=bucket=>{const api=base(bucket),upload=api.upload;api.upload=async(p,b)=>{const r=await upload(p,b);if(fail){fail=false;return {error:Error('network lost')};}return r;};return api;};try{await assert.rejects(ctx.handleMasterTool('upload_master_files',uploadArgs,h.context),/network lost/);assert.equal(h.master.revision,0);await ctx.handleMasterTool('upload_master_files',uploadArgs,h.context);assert.deepEqual(h.counts(),{commits:1,writes:1});}finally{ctx.fetch=original;}});
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
 for(const name of ['list_master_files','get_master_file','prepare_master_upload','commit_master_upload','upload_master_files','delete_master_file']){const t=body.result.tools.find(t=>t.name===name);assert.ok(t);assert.equal(t.inputSchema.type,'object');assert.equal(t.securitySchemes[0].type,'oauth2');}
 for(const name of ['list_master_files','get_master_file','prepare_master_upload','commit_master_upload','upload_master_files','delete_master_file']){const denied=await call('tools/call',{name,arguments:{}});assert.equal(denied.status,401);assert.ok(denied.headers.get('www-authenticate'));assert.equal((await denied.json()).result.isError,true);}
 assert.equal((await call('tools/call',{name:'list_master_files'},'Bearer invalid')).status,401);
});

test('plain database errors preserve their message for connector diagnostics',()=>{assert.throws(()=>ctx.result({error:{code:'42703',message:'column review_projects.user_id does not exist'}}),/column review_projects.user_id does not exist/);});
