const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const base=require('node:path').join(__dirname,'../supabase/functions/etsy-publish');
const context=vm.createContext({decodeHTMLStrict:require('entities').decodeHTMLStrict,TextDecoder,TextEncoder,Blob,crypto,structuredClone,Date,console,setTimeout});
for(const file of ['new-listing.ts','safety.ts','assets.ts','image-state.ts','resume-images.ts']){
 const source=fs.readFileSync(base+'/'+file,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'');
 vm.runInContext(stripTypeScriptTypes(source),context);
}

function setup({originalCount=6,finalCount=7,confirmed=[1,2],encodedAlt=false}={}){
 const beforeImages=Array.from({length:originalCount},(_,i)=>({listing_image_id:String(101+i),rank:i+1,alt_text:`Original alt ${i+1}`}));
 const approved=Array.from({length:finalCount},(_,i)=>({role:`image-${i+1}`,rank:i+1,altText:i===1?'Preview of "Itinerary choices"':`Approved alt ${i+1}`}));
 const encode=value=>encodedAlt?value.replaceAll('"','&quot;'):value;
 const images=structuredClone(beforeImages);
 for(const rank of confirmed){
  const next={listing_image_id:String(200+rank),rank,alt_text:encode(approved[rank-1].altText)},index=images.findIndex(image=>image.rank===rank);
  if(index<0)images.push(next);else images[index]=next;
 }
 const files=[{listing_file_id:'900',rank:1,filename:'unchanged.pdf'}];
 const current={listing_id:'12345',user_id:'owner',listing_type:'download',title:'Original title',description:'Original description',price:{amount:1499,divisor:100,currency_code:'GBP'},quantity:999,tags:['original'],state:'active'};
 const project={id:'review',kind:'etsy',revision:9,status:'failed',media:approved.map(image=>({role:image.role,path:'owner/review/'+image.role,name:image.role+'.png'})),manifest:{mode:'edit',listingId:'12345',updateScope:['images'],updateFields:{},imageReplacements:structuredClone(approved),submissionFingerprint:'original'}};
 const run={id:'run',project_id:project.id,listing_key:'12345',revision:9,status:'needs_review',before_state:{fields:context.listingSnapshot(current),images:structuredClone(beforeImages),files:structuredClone(files)},steps:confirmed.map(rank=>({name:`Replace image ${rank}`,status:'confirmed',image_id:String(200+rank)}))};
 const writes=[],dbWrites=[];
 const admin={from(table){const q={changes:null,filters:[],select(){return this;},order(){return this;},limit(){return this;},eq(key,value){this.filters.push([key,value]);return this;},in(key,value){this.filters.push([key,value]);return this;},update(changes){this.changes=structuredClone(changes);return this;},maybeSingle(){return Promise.resolve(this.apply());},then(resolve,reject){return Promise.resolve(this.apply()).then(resolve,reject);},apply(){
  const row=table==='seller_publish_runs'?run:project;
  if(!this.filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value))return {data:null,error:null};
  if(this.changes){dbWrites.push({table,changes:structuredClone(this.changes)});Object.assign(row,this.changes);}
  return {data:structuredClone(row),error:null};
 }};return q;}};
 const api={wait:async()=>{},fetch:async(path,token,init)=>{
  assert.ok(!init||!init.method||init.method==='GET','Recovery metadata reads must use GET');
  if(path.endsWith('/images'))return {results:structuredClone(images)};
  if(path.endsWith('/files'))return {results:structuredClone(files)};
  return structuredClone(current);
 },storageFile:async()=>new Blob([new Uint8Array([137,80,78,71,...Array(20).fill(0)])]),uploadImage:async(admin,shop,id,token,item,rank,altText,overwrite)=>{
  writes.push({kind:'upload',rank,overwrite});
  const index=images.findIndex(image=>image.rank===rank);
  assert.equal(overwrite,index>=0);
  if(index<0)assert.equal(rank,images.length+1,'Appends must run consecutively');
  const next={listing_image_id:String(300+rank),rank,alt_text:encode(altText)};
  if(index<0)images.push(next);else images[index]=next;
  return structuredClone(next);
 },altText:async(shop,id,token,image)=>{
  writes.push({kind:'alt',rank:image.rank,id:String(image.listingImageId)});
  const existing=images.find(x=>String(x.listing_image_id)===String(image.listingImageId)&&x.rank===image.rank);assert.ok(existing);existing.alt_text=encode(image.altText);return structuredClone(existing);
 }};
 return {project,run,images,beforeImages,approved,files,current,writes,dbWrites,api,admin,resume:()=>context.resumeImages(admin,{shop_id:'shop',etsy_user_id:'owner'},'test',project,api)};
}

test('six-to-seven recovery keeps both confirmed replacements and uploads only the five unfinished positions',async()=>{
 const s=setup(),files=structuredClone(s.files),fields=structuredClone(s.current),confirmed=structuredClone(s.images.slice(0,2));
 const result=await s.resume();
 assert.equal(result.verified,true);assert.equal(s.images.length,7);
 assert.deepEqual(s.writes,[3,4,5,6,7].map(rank=>({kind:'upload',rank,overwrite:rank<7})));
 assert.deepEqual(s.images.slice(0,2),confirmed);assert.deepEqual(s.files,files);assert.deepEqual(s.current,fields);
 assert.equal(s.project.status,'published');assert.equal(s.run.status,'succeeded');
});

test('Korea-style encoded quotes do not force repeated uploads or alt-text writes',async()=>{
 const s=setup({encodedAlt:true});s.run.steps.push({name:'Confirm image 2 alt text',status:'confirmed',image_id:'202'});
 const result=await s.resume();assert.equal(result.verified,true);assert.deepEqual(s.writes.map(x=>x.rank),[3,4,5,6,7]);assert.ok(s.writes.every(x=>x.kind==='upload'));
});

test('a previously confirmed append is retained on retry and never uploaded again',async()=>{
 const s=setup({confirmed:[1,2,7]}),appended=structuredClone(s.images.find(image=>image.rank===7));
 await s.resume();assert.deepEqual(s.writes.map(x=>x.rank),[3,4,5,6]);assert.deepEqual(s.images.find(image=>image.rank===7),appended);
});

test('multiple approved appends run consecutively even when the saved plan order differs',async()=>{
 const s=setup({finalCount:8});s.project.manifest.imageReplacements.reverse();
 await s.resume();assert.deepEqual(s.writes.map(x=>x.rank),[3,4,5,6,7,8]);assert.deepEqual(s.images.map(x=>x.rank).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
});

test('legacy missing original final slot can still be restored once',async()=>{
 const s=setup({finalCount:6,confirmed:[1,2,3,4,5,6]});s.images.pop();
 await s.resume();assert.deepEqual(s.writes,[{kind:'upload',rank:6,overwrite:false}]);assert.ok(s.run.steps.some(step=>step.name==='Restore image 6'&&step.status==='confirmed'));
});

test('a missing untouched original final slot remains recoverable',async()=>{
 const s=setup({finalCount:6,confirmed:[1,2,3,4,5]});s.images.pop();
 await s.resume();assert.deepEqual(s.writes,[{kind:'upload',rank:6,overwrite:false}]);
});

test('a confirmed appended image that subsequently disappears is never uploaded again',async()=>{
 const s=setup({confirmed:[1,2,7]});s.images.pop();
 await assert.rejects(s.resume(),/missing image/);assert.deepEqual(s.writes,[]);
});

test('unconfirmed uploads, stale revisions and different listing identities cannot resume',async()=>{
 for(const change of [s=>s.run.steps.push({name:'Replace image 7',status:'attempting'}),s=>s.run.steps[0].status='attempting',s=>delete s.run.steps[0].image_id,s=>s.run.revision=8,s=>s.run.listing_key='54321']){
  const s=setup();change(s);await assert.rejects(s.resume(),/not confirmed|identity needs verification|approved revision/);assert.deepEqual(s.writes,[]);
 }
});

test('changed selected or untouched image identities and unexpected image counts block recovery',async()=>{
 for(const change of [s=>s.images[0].listing_image_id='external',s=>s.images[4].listing_image_id='external',s=>s.images.push({listing_image_id:'external',rank:7,alt_text:'Unexpected'}),s=>s.images.push({listing_image_id:'external',rank:8,alt_text:'Unexpected'})]){
  const s=setup();change(s);await assert.rejects(s.resume(),/outside this update|count|identity|order/);assert.deepEqual(s.writes,[]);
 }
});

test('missing interior images and repeated legacy restoration are blocked',async()=>{
 for(const change of [s=>s.images.splice(3,1),s=>{s.images.pop();s.run.steps.push({name:'Restore image 6',status:'confirmed',image_id:'206'});}]){
  const s=setup({finalCount:6,confirmed:[1,2,3,4,5,6]});change(s);await assert.rejects(s.resume(),/missing image/);assert.deepEqual(s.writes,[]);
 }
});

test('duplicate or gapped approved ranks and invalid original ranks are blocked before uploads',async()=>{
 for(const change of [s=>s.project.manifest.imageReplacements[6].rank=8,s=>s.project.manifest.imageReplacements.push({...s.project.manifest.imageReplacements[6]}),s=>s.run.before_state.images[5].rank=5,s=>s.project.manifest.imageReplacements[6].rank=21]){
  const s=setup();change(s);await assert.rejects(s.resume(),/positions|consecutive/);assert.deepEqual(s.writes,[]);
 }
});

test('unselected alt text, listing fields and PDFs keep their original protection',async()=>{
 for(const change of [s=>s.current.title='External title',s=>s.files[0].listing_file_id='changed',s=>{s.project.manifest.imageReplacements=s.project.manifest.imageReplacements.filter(image=>image.rank!==6);s.images[5].alt_text='External alt';},s=>s.current.user_id='other']){
  const s=setup();change(s);await assert.rejects(s.resume(),/title differs|PDFs changed|alt text|connected Etsy/);assert.deepEqual(s.writes,[]);
 }
});

test('all unfinished attachments are validated before the first recovery upload',async()=>{
 const s=setup();s.api.storageFile=async(admin,item)=>item.role==='image-7'?new Blob(['invalid']):new Blob([new Uint8Array([137,80,78,71,...Array(20).fill(0)])]);
 await assert.rejects(s.resume(),/PNG or JPEG/);assert.deepEqual(s.writes,[]);
});

test('only one concurrent recovery can own the paused run',async()=>{
 const s=setup();const results=await Promise.allSettled([s.resume(),s.resume()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.writes.length,5);
});

test('completed or running projects cannot use paused recovery',async()=>{
 for(const status of ['ready','publishing','published','changes_requested']){
  const s=setup();s.project.status=status;await assert.rejects(s.resume(),/failed image-only/);assert.deepEqual(s.writes,[]);assert.deepEqual(s.dbWrites,[]);
 }
});
