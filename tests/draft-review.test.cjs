const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function setup({verified=true,status='failed',concurrentChange=false,altOnly=false,verificationOverride={},invalidRole=''}={}){
 const roles=['thumbnail',...Array.from({length:6},(_,i)=>`listing-image-${i+1}`),'customer-pdf'];
 const project={id:'review',kind:'etsy',status,revision:24,platform_id:'123',last_error:'description differs',manifest:{title:'Guide',description:'Guide copy',price:14.99,tags:Array.from({length:13},(_,i)=>`tag ${i}`),altText:roles.slice(0,7).map(r=>'Alt '+r),etsyPublish:{listingId:'123',fileId:'pdf',imageIds:['1','2','3','4','5','6','7'],imagesUploaded:7,fileUploaded:true}},media:roles.map(role=>({role,name:role==='customer-pdf'?'guide.pdf':role+'.png',path:'owner/review/'+role})),preview_path:'preview'};
 if(altOnly){project.media=[];project.manifest={mode:'edit',listingId:'123',updateScope:['alt_text'],updateFields:{},imageReplacements:[],existingImages:[{id:'10',rank:1,altText:''}],altTextUpdates:[{listingImageId:'10',rank:1,altText:'Approved description'}]};}
 const publisherCalls=[],writes=[],validated=[];let handler;
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from:()=>({download:async()=>({data:new Blob(['bytes'])})})},from(table){let changes,filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){changes=v;return q},single:async()=>{
   if(table==='app_owners')return {data:{user_id:'owner'}};
   if(changes){if(!filters.every(([k,v])=>project[k]===v))return {error:Error('Changed concurrently')};writes.push(changes);Object.assign(project,changes);}
   return {data:structuredClone(project)};
  },maybeSingle:async()=>({data:{user_id:'owner'}})};return q;}};
 const context=vm.createContext({Error,atob,Request,Response,URL,Blob,crypto,Date,Set,Map,masterTools:[],masterToolNames:new Set(),createClient:()=>db,validateAssetBlob:async asset=>{if(asset.role===invalidRole)throw Error('Invalid image bytes');validated.push(asset.role);return {mime:"image/png"};},fetch:async(url,init)=>{
  const body=JSON.parse(init.body);publisherCalls.push(body);assert.equal(body.action,project.manifest.updateScope?.includes('price')?'validate_price_review':'revalidate_draft');assert.equal(body.project_id,'review');assert.equal(body.expected_revision,project.revision);
  if(concurrentChange)project.status='publishing';
  return new Response(JSON.stringify(verified?{verified:true,state:'draft',listing_id:'123',image_ids:project.manifest.etsyPublish?.imageIds,alt_texts_verified:7,price:body.proposed_price??project.manifest.price,published:false,...verificationOverride}:{error:'description differs'}),{status:verified?200:400});
 },Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://project.supabase.co':'test'},serve:f=>handler=f}});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/etsy-publish/new-listing.ts','utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'')),context);
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/etsy-publish/alt-text.ts','utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'')),context);
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/seller-tools-inbox/recover-draft-price.ts','utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'')),context);
 const source=fs.readFileSync('supabase/functions/seller-tools-inbox/index.ts','utf8').replace(/^import .*?;\s*$/gm,'');vm.runInContext(stripTypeScriptTypes(source),context);
 const call=async(name,args)=>{
  const r=await handler(new Request('https://project.supabase.co/functions/v1/seller-tools-inbox',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));return r.json();
 };
 return {project,writes,publisherCalls,validated,call,run:()=>call('finalize_review_project',{project_id:'review',expected_revision:24})};
}
test('finalization restores revision 24 for owner approval only after read-only Etsy and asset verification',async()=>{
 const s=setup(),before=structuredClone(s.project);const r=await s.run();assert.equal(r.result.isError,undefined,JSON.stringify(r));assert.equal(s.project.status,'ready');assert.equal(s.project.revision,24);assert.equal(s.project.last_error,null);assert.equal(s.publisherCalls.length,1);assert.equal(s.validated.length,8);assert.deepEqual(s.project.manifest,before.manifest);assert.deepEqual(s.project.media,before.media);assert.equal(s.project.platform_id,'123');
});
test('a failed Etsy revalidation keeps approval blocked and all assets intact',async()=>{const s=setup({verified:false}),before=structuredClone(s.project);const r=await s.run();assert.equal(r.error.code,-32000);assert.deepEqual(s.project,before);assert.deepEqual(s.writes,[])});
test('concurrent owner approval prevents stale finalization',async()=>{const s=setup({concurrentChange:true});const r=await s.run();assert.equal(r.error.code,-32000);assert.equal(s.project.status,'publishing');assert.deepEqual(s.writes,[])});
test('publishing and cancelled reviews cannot use failed-draft recovery',async()=>{for(const status of ['publishing','published','changes_requested']){const s=setup({status});const r=await s.run();assert.equal(r.error.code,-32000);assert.equal(s.publisherCalls.length,0);assert.deepEqual(s.writes,[])}});

test('alt-text-only finalization preserves the draft text and needs no thumbnail or Etsy writes',async()=>{const s=setup({status:'editing',altOnly:true}),before=structuredClone(s.project);const r=await s.run();assert.equal(r.result.structuredContent.status,'ready',JSON.stringify(r));assert.equal(s.project.status,'ready');assert.deepEqual(s.project.manifest,before.manifest);assert.deepEqual(s.project.media,[]);assert.equal(s.publisherCalls.length,0);assert.equal(s.validated.length,0)});

test('adding a price to an existing title review preserves its identity and requires fresh owner review',async()=>{
 const s=setup({status:'ready',altOnly:true});
 s.project.manifest={mode:'edit',listingId:'123',updateScope:['title'],updateFields:{title:'New title'},existingSnapshot:{title:'Old title',price:14.99,description:'Keep copy',quantity:999,tags:['keep']},existingImages:[{id:'10',rank:1,altText:'Keep alt'}],existingFiles:[{id:'file',name:'keep.pdf'}],imageReplacements:[],altTextUpdates:[],fileUpdates:[],submissionFingerprint:'original',preparationComplete:true};
 const before=structuredClone(s.project),manifest={...structuredClone(s.project.manifest),updateScope:['title','price'],updateFields:{title:'New title',price:5.99}};
 const updated=await s.call('update_review_project',{project_id:'review',expected_revision:24,manifest});
 assert.equal(updated.result.structuredContent.revision,25,JSON.stringify(updated));assert.equal(s.project.status,'editing');assert.equal(s.project.id,before.id);
 for(const key of ['existingSnapshot','existingImages','existingFiles','submissionFingerprint','preparationComplete'])assert.deepEqual(s.project.manifest[key],before.manifest[key]);
 const ready=await s.call('finalize_review_project',{project_id:'review',expected_revision:25});
 assert.equal(ready.result.structuredContent.status,'ready',JSON.stringify(ready));assert.equal(s.publisherCalls.length,1);assert.equal(s.validated.length,0);assert.deepEqual(s.project.media,[]);
});

test('price-only review needs no assets and invalid prices are rejected without draft writes',async()=>{
 for(const price of [5.99,6.99,7.99]){const s=setup({status:'editing',altOnly:true});s.project.manifest={mode:'edit',listingId:'123',updateScope:['price'],updateFields:{price}};const result=await s.run();assert.equal(result.result.structuredContent.status,'ready',JSON.stringify(result));assert.equal(s.publisherCalls.length,1);assert.equal(s.validated.length,0);}
 for(const price of [0,-1,5.999,'5.99',true,null]){const s=setup({status:'editing',altOnly:true});s.project.manifest={mode:'edit',listingId:'123',updateScope:['price'],updateFields:{price}};const result=await s.run();assert.match(result.error.message,/price must be/);assert.deepEqual(s.writes,[]);assert.equal(s.publisherCalls.length,0);}
});

test('price review cannot change the captured shop currency',async()=>{
 const s=setup({status:'ready',altOnly:true});s.project.manifest.currency='GBP';const before=structuredClone(s.project);
 const result=await s.call('update_review_project',{project_id:'review',expected_revision:24,manifest:{...structuredClone(s.project.manifest),currency:'USD',updateScope:['price'],updateFields:{price:5.99}}});
 assert.match(result.error.message,/protected submission field currency/);assert.deepEqual(s.project,before);assert.deepEqual(s.writes,[]);assert.equal(s.publisherCalls.length,0);
});

test('failed live price preflight cannot mark a review ready',async()=>{const s=setup({verified:false,status:'editing',altOnly:true});s.project.manifest={mode:'edit',listingId:'123',updateScope:['price'],updateFields:{price:7.99}};const before=structuredClone(s.project);const r=await s.run();assert.equal(r.error.code,-32000);assert.deepEqual(s.project,before);assert.deepEqual(s.writes,[]);assert.equal(s.publisherCalls.length,1);});

function recoverySetup(options={}) {
 const s=setup(options);s.project.manifest.price=6.99;s.project.manifest.listingDefaults={price:6.99,currency:'GBP'};s.project.manifest.etsyPublish.fileId='99';
 return s;
}
test('failed draft price correction verifies Etsy then retains the lock until finalisation',async()=>{
 const s=recoverySetup(),before=structuredClone(s.project),manifest={...structuredClone(s.project.manifest),price:7.99};
 const r=await s.call('update_review_project',{project_id:'review',expected_revision:24,manifest});
 assert.equal(r.result.structuredContent.revision,25,JSON.stringify(r));assert.equal(s.project.status,'failed');assert.equal(s.project.manifest.price,7.99);
 assert.equal(s.publisherCalls[0].proposed_price,7.99);assert.deepEqual(s.project.media,before.media);assert.deepEqual(s.project.manifest.listingDefaults,before.manifest.listingDefaults);assert.equal(s.project.platform_id,before.platform_id);
 const ready=await s.call('finalize_review_project',{project_id:'review',expected_revision:25});assert.equal(ready.result.structuredContent.status,'ready',JSON.stringify(ready));assert.equal(s.validated.length,8);assert.equal(s.publisherCalls.length,2);
});
test('failed, concurrent and stale recovery cannot change the saved price or release approval',async()=>{
 for(const options of [{verified:false},{concurrentChange:true},{}]){
  const s=recoverySetup(options),manifest={...structuredClone(s.project.manifest),price:7.99};
  const r=await s.call('update_review_project',{project_id:'review',expected_revision:Object.keys(options).length?24:23,manifest});
  assert.equal(r.error.code,-32000);assert.deepEqual(s.writes,[]);assert.equal(s.project.manifest.price,6.99);assert.notEqual(s.project.status,'ready');
 }
});
test('failed draft recovery cannot change any unrelated field',async()=>{
 const s=recoverySetup(),before=structuredClone(s.project),manifest={...structuredClone(s.project.manifest),price:7.99,description:'changed'};
 const r=await s.call('update_review_project',{project_id:'review',expected_revision:24,manifest});assert.equal(r.error.code,-32000);assert.deepEqual(s.project,before);assert.equal(s.publisherCalls.length,0);
});


test('new review cannot become ready with six images, missing seventh alt text or duplicate roles',async()=>{
 for(const change of [s=>s.project.media=s.project.media.filter(x=>x.role!=='listing-image-6'),s=>s.project.manifest.altText.pop(),s=>s.project.manifest.altText[6]=' ',s=>s.project.media.push({...s.project.media[6]})]){
  const s=setup({status:'editing'});delete s.project.manifest.etsyPublish;delete s.project.platform_id;change(s);const before=structuredClone(s.project);
  const r=await s.run();assert.equal(r.error.code,-32000);assert.deepEqual(s.writes,[]);assert.deepEqual(s.project,before);assert.equal(s.publisherCalls.length,0);
 }
});
test('all seven stored images and the PDF are checked before a new review becomes ready',async()=>{
 const s=setup({status:'editing'});delete s.project.manifest.etsyPublish;delete s.project.platform_id;
 const r=await s.run();assert.equal(r.result.structuredContent.status,'ready',JSON.stringify(r));assert.equal(s.validated.length,8);assert.ok(s.validated.includes('listing-image-6'));assert.equal(s.publisherCalls.length,0);
 const broken=setup({status:'editing',invalidRole:'listing-image-6'});delete broken.project.manifest.etsyPublish;const blocked=await broken.run();assert.match(blocked.error.message,/Invalid image/);assert.deepEqual(broken.writes,[]);
});
test('stale six-image verification or an unverified seventh image cannot restore readiness',async()=>{
 for(const verificationOverride of [{alt_texts_verified:6},{image_ids:['1','2','3','4','5','6']},{image_ids:['1','2','3','4','5','6','6']},{image_ids:['1','2','3','4','5','6','999']},{published:true}]){
  const s=setup({verificationOverride}),before=structuredClone(s.project),r=await s.run();assert.equal(r.error.code,-32000);assert.deepEqual(s.writes,[]);assert.deepEqual(s.project,before);
 }
});


test('the seventh image role is accepted by the attachment endpoint',async()=>{
 const s=setup({status:'editing'}),asset=s.project.media.find(x=>x.role==='listing-image-6');
 const bytes=Buffer.from('stored image bytes');asset.checksum=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const result=await s.call('attach_project_asset',{project_id:'review',expected_revision:24,role:'listing-image-6',filename:asset.name,content_type:'image/png',base64_data:bytes.toString('base64')});
 assert.equal(result.result.structuredContent.already_saved,true,JSON.stringify(result));assert.deepEqual(s.writes,[]);assert.equal(s.publisherCalls.length,0);
});
