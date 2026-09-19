const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function setup({verified=true,status='failed',concurrentChange=false}={}){
 const roles=['thumbnail',...Array.from({length:5},(_,i)=>`listing-image-${i+1}`),'customer-pdf'];
 const project={id:'review',kind:'etsy',status,revision:24,platform_id:'123',last_error:'description differs',manifest:{title:'Guide',description:'Guide copy',price:14.99,tags:Array.from({length:13},(_,i)=>`tag ${i}`),altText:roles.slice(0,6).map(r=>'Alt '+r),etsyPublish:{listingId:'123',fileId:'pdf',imageIds:['1','2','3','4','5','6'],imagesUploaded:6,fileUploaded:true}},media:roles.map(role=>({role,name:role==='customer-pdf'?'guide.pdf':role+'.png',path:'owner/review/'+role})),preview_path:'preview'};
 const publisherCalls=[],writes=[],validated=[];let handler;
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from:()=>({download:async()=>({data:new Blob(['bytes'])})})},from(table){let changes,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){changes=v;return q},single:async()=>{
   if(table==='app_owners')return {data:{user_id:'owner'}};
   if(changes){if(!filters.every(([k,v])=>project[k]===v))return {error:Error('Changed concurrently')};writes.push(changes);Object.assign(project,changes);}
   return {data:structuredClone(project)};
  },maybeSingle:async()=>({data:{user_id:'owner'}})};return q;}};
 const context=vm.createContext({Request,Response,URL,Blob,crypto,Date,Set,Map,masterTools:[],masterToolNames:new Set(),createClient:()=>db,validateAssetBlob:async asset=>validated.push(asset.role),fetch:async(url,init)=>{
  const body=JSON.parse(init.body);publisherCalls.push(body);assert.equal(body.action,'revalidate_draft');assert.equal(body.project_id,'review');assert.equal(body.expected_revision,24);
  if(concurrentChange)project.status='publishing';
  return new Response(JSON.stringify(verified?{verified:true,state:'draft',listing_id:'123',published:false}:{error:'description differs'}),{status:verified?200:400});
 },Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://project.supabase.co':'test'},serve:f=>handler=f}});
 const source=fs.readFileSync('supabase/functions/seller-tools-inbox/index.ts','utf8').replace(/^import .*?;\s*$/gm,'');vm.runInContext(stripTypeScriptTypes(source),context);
 return {project,writes,publisherCalls,validated,run:async()=>{
  const r=await handler(new Request('https://project.supabase.co/functions/v1/seller-tools-inbox',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'finalize_review_project',arguments:{project_id:'review',expected_revision:24}}})}));return r.json();
 }};
}
test('finalization restores revision 24 for owner approval only after read-only Etsy and asset verification',async()=>{
 const s=setup(),before=structuredClone(s.project);const r=await s.run();assert.equal(r.result.isError,undefined,JSON.stringify(r));assert.equal(s.project.status,'ready');assert.equal(s.project.revision,24);assert.equal(s.project.last_error,null);assert.equal(s.publisherCalls.length,1);assert.equal(s.validated.length,7);assert.deepEqual(s.project.manifest,before.manifest);assert.deepEqual(s.project.media,before.media);assert.equal(s.project.platform_id,'123');
});
test('a failed Etsy revalidation keeps approval blocked and all assets intact',async()=>{const s=setup({verified:false}),before=structuredClone(s.project);const r=await s.run();assert.equal(r.error.code,-32000);assert.deepEqual(s.project,before);assert.deepEqual(s.writes,[])});
test('concurrent owner approval prevents stale finalization',async()=>{const s=setup({concurrentChange:true});const r=await s.run();assert.equal(r.error.code,-32000);assert.equal(s.project.status,'publishing');assert.deepEqual(s.writes,[])});
test('publishing and cancelled reviews cannot use failed-draft recovery',async()=>{for(const status of ['publishing','published','changes_requested']){const s=setup({status});const r=await s.run();assert.equal(r.error.code,-32000);assert.equal(s.publisherCalls.length,0);assert.deepEqual(s.writes,[])}});
