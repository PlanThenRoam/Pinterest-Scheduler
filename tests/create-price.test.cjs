const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function setup(){
 const inserted=[],requests=[];let handler;
 const defaults={price:6.99,quantity:999,currency:'GBP',taxonomy_id:343};
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){let pending;const q={select(){return q},eq(){return q},insert(row){pending=structuredClone(row);return q},maybeSingle:async()=>({data:table==='app_owners'?{user_id:'owner'}:null}),single:async()=>{assert.equal(table,'review_projects');assert.ok(pending);inserted.push(pending);return {data:{id:pending.id,kind:pending.kind,title:pending.title,status:pending.status,revision:1}}}};return q;}};
 const context=vm.createContext({Request,Response,URL,crypto,TextEncoder,Date,Set,Map,masterTools:[],masterToolNames:new Set(),createClient:()=>db,fetch:async(url,init={})=>{
  requests.push({url,method:init.method||'GET'});
  assert.equal(url,'https://project.supabase.co/functions/v1/etsy-publish?defaults=1');assert.equal(init.method||'GET','GET','Creating a private review may only read Etsy defaults');
  return new Response(JSON.stringify({defaults}),{status:200});
 },Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://project.supabase.co':'test'},serve:f=>handler=f}});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/etsy-publish/new-listing.ts','utf8').replace(/\bexport /g,'')),context);
 const source=fs.readFileSync('supabase/functions/seller-tools-inbox/index.ts','utf8').replace(/^import .*?;\s*$/gm,'');vm.runInContext(stripTypeScriptTypes(source),context);
 const manifest={title:'Utah Mighty Five Road Trip Planner',description:'The approved planner description.',price:7.99,quantity:999,tags:Array.from({length:13},(_,i)=>`tag ${i}`),altText:Array.from({length:7},(_,i)=>`Approved image ${i}`)};
 return {manifest,inserted,requests,run:async()=>{
  const response=await handler(new Request('https://project.supabase.co/functions/v1/seller-tools-inbox',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_review_project',arguments:{kind:'etsy',title:manifest.title,idempotency_key:'utah-price-regression',manifest}}})}));return response.json();
 }};
}
test('creating a review preserves its explicit price while retaining the different captured template default',async()=>{
 const s=setup(),result=await s.run();assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(s.inserted.length,1);
 const review=s.inserted[0];assert.equal(review.manifest.price,7.99);assert.equal(review.manifest.listingDefaults.price,6.99);assert.equal(review.manifest.listingDefaults.currency,'GBP');assert.equal(review.status,'editing');assert.equal(review.manifest.description,s.manifest.description);assert.deepEqual(review.manifest.tags,s.manifest.tags);
 assert.deepEqual(s.requests,[{url:'https://project.supabase.co/functions/v1/etsy-publish?defaults=1',method:'GET'}]);
});
test('review creation rejects missing and invalid explicit prices instead of substituting template defaults',async()=>{
 for(const price of [undefined,null,'7.99',0,-1,7.999,Infinity,NaN]){
  const s=setup();if(price===undefined)delete s.manifest.price;else s.manifest.price=price;
  const result=await s.run();assert.match(result.error?.message||'',/price must be a positive number with at most two decimal places/);assert.deepEqual(s.inserted,[]);assert.deepEqual(s.requests,[]);
 }
});


test('new-listing creation rejects six or eight alt texts and an invalid seventh alt text',async()=>{
 for(const change of [a=>a.pop(),a=>a.push('Extra'),a=>a[6]='',a=>a[6]=null,a=>a[6]='x'.repeat(501)]){
  const s=setup();change(s.manifest.altText);const result=await s.run();assert.match(result.error?.message||'',/seven.*alt texts/);assert.deepEqual(s.inserted,[]);assert.deepEqual(s.requests,[]);
 }
});
