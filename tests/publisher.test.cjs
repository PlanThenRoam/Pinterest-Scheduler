const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const base=require('node:path').join(__dirname,'../supabase/functions/etsy-publish');
const context=vm.createContext({decodeHTMLStrict:require('entities').decodeHTMLStrict,TextDecoder,TextEncoder,Blob,FormData,URLSearchParams,Headers,Response,Request,AbortSignal,crypto,structuredClone,Date,console,setTimeout});
function load(name){return stripTypeScriptTypes(fs.readFileSync(base+'/'+name,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,''));}
vm.runInContext(load('new-listing.ts')+'\n'+load('price-inventory.ts')+'\n'+load('price-review.ts')+'\n'+load('assets.ts')+'\n'+load('alt-text.ts')+'\n'+load('safety.ts')+'\n'+load('image-state.ts')+'\n'+load('resume-images.ts')+'\n'+load('safe-edit.ts')+'\n'+load('reconcile-edit.ts'),context);
const {runEdit,preflightFiles,verifyFields}=context;
test('description verification decodes named, decimal and hexadecimal HTML entities on both sides',()=>{
 for(const [expected,actual] of [["The itinerary's shuttle; Lake O'Hara",'The itinerary&#39;s shuttle; Lake O&#39;Hara'],['A & B < C > D "quote" £ café •','A &amp; B &lt; C &gt; D &quot;quote&quot; &pound; caf&eacute; &bull;'],['Lake O&apos;Hara','Lake O&#x27;Hara'],['A\u00a0B','A&nbsp;B'],['Mountain 🏔','Mountain &#x1F3D4;']]){
  verifyFields({description:expected},{description:actual},{});
  verifyFields({description:actual},{description:expected},{});
  verifyFields({description:'Old copy'},{description:actual},{description:expected});
 }
});
test('description verification accepts trimmed boundaries after one strict entity decode',()=>{
 for(const [expected,actual] of [['A guide.\n','A guide.'],[' \tA\n\nB\r\n','A\n\nB'],['&#10;A &amp; B&nbsp;','A & B'],['A &amp;amp; B\n','A &amp;amp; B']]){
  verifyFields({description:expected},{description:actual},{});
  verifyFields({description:actual},{description:expected},{});
  verifyFields({description:'Old copy'},{description:actual},{description:expected});
 }
});
test('description verification still rejects changed wording, punctuation, internal whitespace and literal entity text',()=>{
 for(const [expected,actual] of [["Lake O'Hara",'Lake O&#39;Hare'],['5 days','7 days'],['A & B','A and B'],['Guide','guide'],['A\nB','A B'],['A\n\nB\n','A\nB'],['A  B\n','A B'],['A\u00a0B','A B'],['Guide.','Guide'],['<b>Guide</b>','Guide'],['&amp;amp;','&amp;'],['&amp;#10;Guide','Guide'],['&notin','¬in'],['Guide',null]])assert.throws(()=>verifyFields({description:expected},{description:actual},{}),/description differs/);
 assert.throws(()=>verifyFields({title:'A & B'},{title:'A &amp; B'},{}),/title differs/);
 assert.throws(()=>verifyFields({title:'Guide\n'},{title:'Guide'},{}),/title differs/);
});
const source=fs.readFileSync(base+'/index.ts','utf8');
vm.runInContext(stripTypeScriptTypes(source.slice(source.indexOf('function numberValue('),source.indexOf('async function etsyFetch('))),context);
function setup({count=2,uploadFail=false,drift=false,unexpectedField=false}={}){
 const files=Array.from({length:count},(_,i)=>({listing_file_id:String(100+i),rank:i+1,filename:`file${i}.pdf`}));
 const original={user_id:'owner',title:'Old title',description:'Original copy',listing_type:'download',price:{amount:1499,divisor:100,currency_code:'GBP'},tags:['one'],images:[]};
 const current=structuredClone(original),runs=[],writes=[];
 const inventory={products:[{product_id:1,sku:'KEEP-SKU',is_deleted:false,property_values:[],offerings:[{offering_id:2,price:{amount:1499,divisor:100,currency_code:'GBP'},quantity:999,is_enabled:true,is_deleted:false,readiness_state_id:null}]}],price_on_property:[],quantity_on_property:[],sku_on_property:[],readiness_state_on_property:[]};
 const project={id:'project',kind:'etsy',title:'Sample',revision:1,status:'ready',media:[{role:'pdf',path:'safe/path',name:'new.pdf'}],manifest:{mode:'edit',listingId:'12345',updateScope:['files'],updateFields:{},fileUpdates:[{action:'replace',listingFileId:'100',role:'pdf',filename:'new.pdf'}]}};
 const admin={from(table){const q={changes:null,filters:[],insert:async value=>{if(table==='seller_publish_runs'&&runs.some(r=>r.listing_key===value.listing_key&&['running','needs_review'].includes(r.status)))return {error:Error('duplicate')};runs.push({...structuredClone(value)});return {error:null};},update(v){this.changes=structuredClone(v);return this;},eq(k,v){this.filters.push([k,v]);return this;},in(k,v){this.filters.push([k,v]);return this;},select(){return this;},order(){return this;},limit(){return this;},maybeSingle(){return Promise.resolve(this.apply());},then(resolve,reject){return Promise.resolve(this.apply()).then(resolve,reject);},apply(){const rows=table==='seller_publish_runs'?runs:[project];const matches=rows.filter(r=>this.filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));matches.forEach(r=>Object.assign(r,this.changes));return {data:matches[0]?structuredClone(matches[0]):null,error:null};}};return q;}};
 const api={wait:async()=>{},fetch:async(path,token,init)=>{if(init?.method==='DELETE'){writes.push('delete');const i=files.findIndex(x=>String(x.listing_file_id)===path.split('/').at(-1));files.splice(i,1);return {};}if(path.endsWith('/inventory')){if(init){assert.equal(init.method,'PUT');assert.equal(init.headers['content-type'],'application/json');writes.push('inventory');const b=JSON.parse(init.body),offer=b.products[0].offerings[0];assert.equal(typeof offer.price,'number');const price={amount:Math.round(offer.price*100),divisor:100,currency_code:'GBP'};Object.assign(inventory.products[0],b.products[0]);inventory.products[0].offerings[0].price=price;current.price=price;}return structuredClone(inventory);}if(path.endsWith('/images'))return {results:structuredClone(current.images)};if(path.endsWith('/files'))return {results:structuredClone(files)};if(drift)current.title='Externally edited';return structuredClone(current);},storageFile:async()=>new Blob(['%PDF-1.7 content']),uploadFile:async()=>{writes.push('upload');if(uploadFail)throw Error('upload timeout');const file={listing_file_id:'200',rank:1,filename:'new.pdf'};files.push(file);return file;},updateFields:async(shop,id,token,fields)=>{assert.ok(!('price' in fields),'PATCH does not support price');writes.push('fields');Object.assign(current,fields);if(unexpectedField)current.description='Unexpected mutation';},uploadImage:async()=>{writes.push('image');},altText:async()=>{writes.push('alt');},personalization:async()=>{writes.push('personalization');}};
 const listing=()=>context.validateProject(project);
 return {project,runs,writes,files,current,inventory,admin,api,listing,run:()=>runEdit(admin,{shop_id:'shop',etsy_user_id:'owner'},'test',project,listing(),api)};
}
test('unsupported edit fields are rejected before publishing',()=>{for(const key of ['tags','alt_text','quantity']){const s=setup();s.project.manifest.updateScope=[key];s.project.manifest.updateFields={[key]:'value'};assert.throws(()=>s.listing(),/unsupported/);}});
test('replacement uploads before deleting original and verifies the exact file set',async()=>{const s=setup();const result=await s.run();assert.equal(result.verified,true);assert.deepEqual(s.writes,['upload','delete']);assert.deepEqual(s.files.map(x=>x.listing_file_id).sort(),['101','200']);assert.equal(s.runs[0].status,'succeeded');});
test('publication accepts Etsy trimming a description without repeating the PDF replacement',async()=>{
 const s=setup(),approved='A & B\n\nPlan the trip.\n';s.project.manifest.updateScope=['description','files'];s.project.manifest.updateFields={description:approved};
 const update=s.api.updateFields;s.api.updateFields=async(...args)=>{await update(...args);s.current.description='A &amp; B\n\nPlan the trip.';};
 const result=await s.run();assert.equal(result.verified,true);assert.equal(s.project.status,'published');assert.deepEqual(s.writes,['fields','upload','delete']);assert.equal(s.current.description,'A &amp; B\n\nPlan the trip.');
});
test('description reconciliation requires internal paragraphs but accepts trimmed boundaries without Etsy writes',async()=>{
 const s=setup(),approved='A & B\n\nPlan the trip.\n';s.project.manifest.updateScope=['description','files'];s.project.manifest.updateFields={description:approved};
 const update=s.api.updateFields;s.api.updateFields=async(...args)=>{await update(...args);s.current.description='A &amp; B\nPlan the trip.';};
 await assert.rejects(s.run(),/description differs/);assert.deepEqual(s.writes,['fields','upload','delete']);
 const mismatch=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(mismatch.verified,false);assert.equal(s.project.status,'failed');
 s.current.description='A &amp; B\n\nPlan the trip.';const before=structuredClone(s.current),files=structuredClone(s.files);
 const result=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(result.verified,true);assert.equal(s.project.status,'published');assert.deepEqual(s.writes,['fields','upload','delete']);assert.deepEqual(s.current,before);assert.deepEqual(s.files,files);
});
test('full five-file listing is blocked before any Etsy write',async()=>{const s=setup({count:5});await assert.rejects(s.run(),/one free Etsy file slot/);assert.deepEqual(s.writes,[]);assert.equal(s.files.length,5);assert.equal(s.runs[0].status,'blocked');});
test('upload failure retains original and blocks unsafe retry',async()=>{const s=setup({uploadFail:true});await assert.rejects(s.run(),/may already be live/);assert.deepEqual(s.writes,['upload']);assert.equal(s.files[0].listing_file_id,'100');assert.equal(s.runs[0].status,'needs_review');await assert.rejects(s.run(),/unresolved update/);assert.deepEqual(s.writes,['upload']);});
test('parallel attempts cannot publish the same listing twice',async()=>{const s=setup();const result=await Promise.allSettled([s.run(),s.run()]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.filter(x=>x.status==='rejected').length,1);assert.deepEqual(s.writes,['upload','delete']);});
test('stale draft is blocked before changing Etsy',async()=>{const s=setup({drift:true});s.project.manifest.existingSnapshot={title:'Old title'};await assert.rejects(s.run(),/changed since this draft/);assert.deepEqual(s.writes,[]);});
test('an unexpected change to an omitted field is reported as requiring review',async()=>{const s=setup({unexpectedField:true});s.project.manifest.updateScope=['title'];s.project.manifest.updateFields={title:'New title'};await assert.rejects(s.run(),/description differs/);assert.equal(s.runs[0].status,'needs_review');});
test('duplicate file targets and excess additions fail preflight',()=>{assert.throws(()=>preflightFiles([{listing_file_id:'1'}],[{action:'replace',listingFileId:'1'},{action:'replace',listingFileId:'1'}]),/only once/);assert.throws(()=>preflightFiles(Array(5).fill({}),[{action:'add'}]),/five digital files/);});
test('archived and publishing projects cannot be submitted',()=>{const s=setup();s.project.status='publishing';assert.throws(()=>s.listing(),/already|another request/);s.project.status='ready';s.project.manifest.archived=true;assert.throws(()=>s.listing(),/archived/);});

test('empty optional styles and materials do not falsely block a PDF-only replacement',async()=>{for(const value of [undefined,null,[]]){const s=setup();s.current.styles=value;s.current.materials=value;s.project.manifest.existingSnapshot={styles:[],materials:[]};await s.run();assert.deepEqual(s.writes,['upload','delete']);}});
test('real styles changes still block before any Etsy writes',async()=>{const s=setup();s.current.styles=['Modern'];s.project.manifest.existingSnapshot={styles:[]};await assert.rejects(s.run(),/live styles changed/);assert.deepEqual(s.writes,[]);});
test('draft preparation and publishing use the same snapshot function',()=>{assert.match(source,/existingSnapshot:listingSnapshot\(existing\)/);const snap=context.listingSnapshot({styles:null,materials:undefined,tags:[],price:{amount:1499,divisor:100}});assert.equal(snap.price,14.99);assert.deepEqual(JSON.parse(JSON.stringify(snap.styles)),[]);});

function imageSetup(){const s=setup();s.api.storageFile=async()=>new Blob([new Uint8Array([137,80,78,71,...Array(20).fill(0)])]);s.current.images=[{listing_image_id:'10',rank:1,alt_text:'Old alt'}];s.project.manifest.updateScope=['images'];s.project.manifest.imageReplacements=[{role:'listing-image-1',rank:1,altText:'Approved alt'}];s.project.media=[{role:'listing-image-1',path:'image/path',name:'new.png'}];s.api.uploadImage=async()=>{s.writes.push('image');s.current.images[0].listing_image_id='20';return {...s.current.images[0]};};s.api.altText=async(shop,id,token,image)=>{s.writes.push('alt');assert.equal(String(image.listingImageId),'20');s.current.images[0].alt_text=image.altText;return {...s.current.images[0]};};return s;}
test('image alt comparison accepts one layer of named and numeric entities on either side',()=>{
 for(const [plain,encoded] of [['Read "what to book"','Read &quot;what to book&quot;'],['A & B','A &amp; B'],["Visitor's guide",'Visitor&apos;s guide'],["Visitor's guide",'Visitor&#39;s guide'],["Visitor's guide",'Visitor&#x27;s guide'],['Café, Tromsø, £ and 🏔','Caf&eacute;, Troms&oslash;, &pound; and &#x1F3D4;'],['A\u00a0B','A&nbsp;B']]){
  assert.equal(context.sameImageAltText(plain,encoded),true,encoded);assert.equal(context.sameImageAltText(encoded,plain),true,encoded);
 }
 assert.equal(context.sameImageAltText('Literal &amp;quot; text','Literal &amp;quot; text'),true);
 assert.equal(context.sameImageAltText('Unknown &madeup; entity','Unknown &madeup; entity'),true);
});
test('image alt comparison rejects wording, case, whitespace and nested entity differences',()=>{
 for(const [expected,actual] of [['A & B','A and B'],['Guide','guide'],['A B','A  B'],['A\nB','A B'],['Guide','Guide '],['Guide.','Guide'],['&amp;amp;','&amp;'],['&amp;quot;','&quot;'],['&notin','¬in'],['<b>Guide</b>','Guide'],['Café','Cafe\u0301']]){
  assert.equal(context.sameImageAltText(expected,actual),false,JSON.stringify([expected,actual]));assert.equal(context.sameImageAltText(actual,expected),false);
 }
});
test('adding image seven accepts encoded alt text with one upload and preserves the first six images',async()=>{
 const s=imageSetup(),approved='Read "what to book" & the visitor\'s guide to Tromsø 🏔',encoded='Read &quot;what to book&quot; &amp; the visitor&#39;s guide to Troms&oslash; &#x1F3D4;';
 s.current.images=Array.from({length:6},(_,i)=>({listing_image_id:String(10+i),rank:i+1,alt_text:`Keep image ${i+1}: A & B`}));
 s.project.manifest.fileUpdates=[];s.project.manifest.existingImages=s.current.images.map(x=>({id:x.listing_image_id,rank:x.rank,altText:x.alt_text}));s.project.manifest.imageReplacements=[{role:'listing-image-1',rank:7,altText:approved}];
 const before=structuredClone(s.current),files=structuredClone(s.files);
 s.api.uploadImage=async(admin,shop,id,token,item,rank,alt,overwrite)=>{s.writes.push('image');assert.equal(rank,7);assert.equal(alt,approved);assert.equal(overwrite,false);const image={listing_image_id:'70',rank:7,alt_text:encoded};s.current.images.push(image);return {...image};};
 const result=await s.run();assert.equal(result.verified,true);assert.equal(s.project.status,'published');assert.deepEqual(s.writes,['image']);assert.deepEqual(s.current.images.slice(0,6),before.images);assert.deepEqual(s.files,files);
 before.images.push({listing_image_id:'70',rank:7,alt_text:encoded});assert.deepEqual(s.current,before);assert.equal(s.runs[0].steps.length,1);assert.equal(s.runs[0].steps[0].image_id,'70');
});
test('replacement corrects inherited alt text by confirmed image ID without another upload',async()=>{const s=imageSetup();await s.run();assert.deepEqual(s.writes,['image','alt']);assert.equal(s.runs[0].steps[0].image_id,'20');assert.equal(s.current.images[0].alt_text,'Approved alt');});
test('failed alt verification retains readback and blocks duplicate uploads',async()=>{const s=imageSetup();s.api.altText=async()=>{};s.api.uploadImage=async()=>{s.writes.push('image');s.current.images[0].listing_image_id='20';return {listing_image_id:'20'};};await assert.rejects(s.run(),/Image 1 (verification|alt text|identity)/);assert.equal(s.current.images[0].alt_text,'Old alt');await assert.rejects(s.run(),/unresolved/);assert.deepEqual(s.writes,['image']);});
test('wrong returned image identity cannot pass even with matching alt text',async()=>{const s=imageSetup();s.api.uploadImage=async()=>{s.writes.push('image');return {listing_image_id:'20'};};await assert.rejects(s.run(),/Image 1 (verification|alt text|identity)/);assert.equal(s.runs[0].status,'needs_review');});
test('non-PDF bytes are rejected before any Etsy write',async()=>{const s=setup();s.api.storageFile=async()=>new Blob(['not a PDF']);await assert.rejects(s.run(),/genuine PDFs/);assert.deepEqual(s.writes,[]);});
test('unsupported image formats are rejected before any Etsy write',async()=>{const s=imageSetup();s.api.storageFile=async()=>new Blob(['RIFF webp']);await assert.rejects(s.run(),/PNG or JPEG/);assert.deepEqual(s.writes,[]);});
test('overlong replacement alt text is rejected rather than silently truncated',()=>{const s=imageSetup();s.project.manifest.imageReplacements[0].altText='a'.repeat(501);assert.throws(()=>s.listing(),/alt text/);});
test('image position 20 is accepted and position 21 rejected',()=>{const s=imageSetup();s.project.manifest.imageReplacements[0].rank=20;assert.equal(s.listing().images[0].rank,20);s.project.manifest.imageReplacements[0].rank=21;assert.throws(()=>s.listing(),/rank/);});
test('new listing asset verification rejects missing, reordered or wrong-alt images and wrong PDF',()=>{const images=Array.from({length:7},(_,i)=>({rank:i+1,listing_image_id:String(i+10),alt_text:`Alt ${i}`}));const checkpoint={imageIds:images.map(x=>x.listing_image_id),fileId:'55'},alt=images.map(x=>x.alt_text),files=[{listing_file_id:'55'}];context.verifyNewListingAssets({images},files,checkpoint,alt);for(const change of [x=>x.pop(),x=>x[3].alt_text='old',x=>x[3].listing_image_id='999',x=>x[3].rank=6]){const bad=structuredClone(images);change(bad);assert.throws(()=>context.verifyNewListingAssets({images:bad},files,checkpoint,alt),/not been activated/);}assert.throws(()=>context.verifyNewListingAssets({images},[{listing_file_id:'wrong'}],checkpoint,alt),/PDF/);});
test('new listing asset verification accepts encoded alt text without weakening identity checks',()=>{
 const images=Array.from({length:7},(_,i)=>({rank:i+1,listing_image_id:String(i+10),alt_text:`Image ${i+1}: &quot;Guide&quot; &amp; visitor&#39;s plan`})),checkpoint={imageIds:images.map(x=>x.listing_image_id),fileId:'55'},alt=images.map((_,i)=>`Image ${i+1}: "Guide" & visitor's plan`),files=[{listing_file_id:'55'}];
 context.verifyNewListingAssets({images},files,checkpoint,alt);images[3].listing_image_id='999';assert.throws(()=>context.verifyNewListingAssets({images},files,checkpoint,alt),/not been activated/);
});
test('invalid or overprecise price cannot cause a partial listing update',()=>{for(const price of [Infinity,NaN,0,-1,1.999,'5.99',true,null]){const s=setup();s.project.manifest.updateScope=['price'];s.project.manifest.updateFields={price};assert.throws(()=>s.listing(),/price must be/);}});
test('each requested text field is independent and leaves images and files untouched',async()=>{for(const [key,value] of Object.entries({title:'New title',description:'New description'})){const s=setup();const oldFiles=JSON.stringify(s.files);s.project.manifest.updateScope=[key];s.project.manifest.updateFields={[key]:value};await s.run();assert.deepEqual(s.writes,['fields']);assert.equal(JSON.stringify(s.files),oldFiles);assert.deepEqual(s.current[key],value);}});
test('an externally replaced selected image blocks before writes',async()=>{const s=imageSetup();s.project.manifest.existingImages=[{id:'9',rank:1}];await assert.rejects(s.run(),/changed since this draft/);assert.deepEqual(s.writes,[]);});
test('unexpected additional image is not mistaken for a successful replacement',async()=>{const s=imageSetup();const upload=s.api.uploadImage;s.api.uploadImage=async(...args)=>{const result=await upload(...args);s.current.images.push({listing_image_id:'30',rank:2,alt_text:'Unexpected'});return result;};await assert.rejects(s.run(),/Image count/);assert.equal(s.runs[0].status,'needs_review');});
test('a gap in new image positions blocks before any Etsy write',async()=>{const s=imageSetup();s.project.manifest.imageReplacements[0].rank=20;await assert.rejects(s.run(),/consecutive/);assert.deepEqual(s.writes,[]);});

test('delayed Etsy image readback can reconcile without another image upload',async()=>{const s=imageSetup();s.api.altText=async()=>{throw Error('alt timeout')};s.project.manifest.fileUpdates=[];s.api.uploadImage=async()=>{s.writes.push('image');s.current.images[0].listing_image_id='20';return {listing_image_id:'20'};};await assert.rejects(s.run());s.current.images[0].alt_text='Approved alt';const checked=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(checked.verified,true);assert.equal(s.project.status,'published');assert.deepEqual(s.writes,['image']);});
test('reconciliation retains a mismatch without changing Etsy',async()=>{const s=imageSetup();s.api.altText=async()=>{throw Error('alt timeout')};s.project.manifest.fileUpdates=[];s.api.uploadImage=async()=>{s.writes.push('image');s.current.images[0].listing_image_id='20';return {listing_image_id:'20'};};await assert.rejects(s.run());const checked=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(checked.verified,false);assert.equal(s.project.status,'failed');assert.ok(s.runs[0].after_state.checked_at);assert.deepEqual(s.writes,['image']);});
test('image reconciliation accepts delayed encoded alt text without repeating an upload or alt write',async()=>{
 const s=imageSetup();s.project.manifest.fileUpdates=[];s.project.manifest.imageReplacements[0].altText='Read "what to book" & visitor\'s guide';s.api.altText=async()=>{s.writes.push('alt');throw Error('alt timeout');};
 await assert.rejects(s.run());s.current.images[0].alt_text='Read &quot;what to book&quot; &amp; visitor&#39;s guide';const before=structuredClone(s.current),files=structuredClone(s.files);
 const result=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(result.verified,true);assert.equal(s.project.status,'published');assert.deepEqual(s.writes,['image','alt']);assert.deepEqual(s.current,before);assert.deepEqual(s.files,files);
});

test('resume corrects inherited alt text without uploading or deleting any photo',async()=>{const s=imageSetup();s.project.manifest.fileUpdates=[];const alt=s.api.altText;s.api.altText=async()=>{throw Error('timeout')};await assert.rejects(s.run());s.api.altText=alt;const result=await context.resumeImages(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(result.verified,true);assert.deepEqual(s.writes,['image','alt']);assert.equal(s.project.status,'published');});
test('resume refuses to repeat an upload whose response was lost',async()=>{const s=imageSetup();s.api.uploadImage=async()=>{s.writes.push('image');throw Error('timeout')};await assert.rejects(s.run());await assert.rejects(context.resumeImages(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api),/not confirmed/);assert.deepEqual(s.writes,['image']);});
test('resume rejects externally changed photo identity without writes',async()=>{const s=imageSetup();s.api.altText=async()=>{throw Error('timeout')};await assert.rejects(s.run());s.current.images[0].listing_image_id='external';await assert.rejects(context.resumeImages(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api),/outside this update/);assert.deepEqual(s.writes,['image']);});
test('alt-text request explicitly disables image replacement',()=>{const helper=source.slice(source.indexOf('async function updateExistingImageAltText'),source.indexOf('async function updateListing('));assert.match(helper,/form.set\("overwrite","false"\)/);assert.doesNotMatch(helper,/"overwrite","true"/);});

function altOnlySetup(){
 const s=setup();s.project.media=[];s.project.manifest.updateScope=['alt_text'];s.project.manifest.fileUpdates=[];
 s.current.images=[{listing_image_id:'10',rank:1,alt_text:''},{listing_image_id:'11',rank:2,alt_text:'Keep this text'}];
 s.project.manifest.existingImages=s.current.images.map(x=>({id:x.listing_image_id,rank:x.rank,altText:x.alt_text}));
 s.project.manifest.altTextUpdates=[{listingImageId:'10',rank:1,altText:'New thumbnail description'}];
 s.api.altText=async(shop,id,token,image)=>{s.writes.push('alt');assert.equal(image.listingImageId,'10');assert.equal(image.rank,1);s.current.images[0].alt_text=image.altText;return {...s.current.images[0]};};
 return s;
}
test('alt-text-only publication needs no attachment and preserves all image IDs, other alt text, files and fields',async()=>{
 const s=altOnlySetup(),files=structuredClone(s.files),before=structuredClone(s.current);const r=await s.run();assert.equal(r.verified,true);assert.deepEqual(s.writes,['alt']);assert.deepEqual(s.files,files);before.images[0].alt_text='New thumbnail description';assert.deepEqual(s.current,before);assert.equal(s.project.status,'published');
});
test('alt-text-only edit accepts equivalent saved and returned entities with exactly one alt write',async()=>{
 const s=altOnlySetup();s.project.manifest.existingImages[0].altText='Old "guide" & notes';s.current.images[0].alt_text='Old &quot;guide&quot; &amp; notes';s.project.manifest.altTextUpdates[0].altText='New "guide" & visitor\'s notes';
 const before=structuredClone(s.current),files=structuredClone(s.files);
 s.api.altText=async(shop,id,token,image)=>{s.writes.push('alt');assert.equal(image.listingImageId,'10');assert.equal(image.rank,1);assert.equal(image.altText,'New "guide" & visitor\'s notes');s.current.images[0].alt_text='New &quot;guide&quot; &amp; visitor&apos;s notes';return {...s.current.images[0]};};
 const result=await s.run();assert.equal(result.verified,true);assert.deepEqual(s.writes,['alt']);before.images[0].alt_text='New &quot;guide&quot; &amp; visitor&apos;s notes';assert.deepEqual(s.current,before);assert.deepEqual(s.files,files);
});
test('moved, replaced or externally edited alt text blocks before any Etsy write',async()=>{
 for(const change of [s=>s.current.images[0].listing_image_id='20',s=>s.current.images[0].rank=3,s=>s.current.images[0].alt_text='Changed elsewhere']){const s=altOnlySetup();change(s);await assert.rejects(s.run(),/moved|replaced|alt text changed/);assert.deepEqual(s.writes,[]);}
});
test('alt-text validation rejects duplicate, missing, mismatched and replacement targets',()=>{
 for(const change of [m=>m.altTextUpdates.push({...m.altTextUpdates[0]}),m=>delete m.altTextUpdates[0].listingImageId,m=>m.altTextUpdates[0].rank=2,m=>m.altTextUpdates[0].altText='a'.repeat(501),m=>m.imageReplacements=[{rank:1,role:'thumbnail'}]]){const s=altOnlySetup();change(s.project.manifest);assert.throws(()=>s.listing(),/existing image|image only once|saved listing|replacement/);assert.deepEqual(s.writes,[]);}
});
test('unconfirmed alt text does not pass verification and cannot be written again blindly',async()=>{const s=altOnlySetup();s.api.altText=async()=>{s.writes.push('alt');return {listing_image_id:'10'}};await assert.rejects(s.run(),/Image 1 verification/);await assert.rejects(s.run(),/unresolved/);assert.deepEqual(s.writes,['alt']);});
test('delayed confirmed alt-text readback can reconcile without repeating the write',async()=>{
 const s=altOnlySetup();s.api.altText=async()=>{s.writes.push('alt');return {listing_image_id:'10'}};await assert.rejects(s.run());s.current.images[0].alt_text='New thumbnail description';const r=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(r.verified,true);assert.deepEqual(s.writes,['alt']);
});
test('alt-text-only reconciliation accepts delayed encoded readback without another write',async()=>{
 const s=altOnlySetup();s.project.manifest.altTextUpdates[0].altText='New "guide" & notes';s.api.altText=async()=>{s.writes.push('alt');return {listing_image_id:'10'};};
 await assert.rejects(s.run());s.current.images[0].alt_text='New &quot;guide&quot; &amp; notes';const before=structuredClone(s.current),files=structuredClone(s.files);
 const result=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(result.verified,true);assert.deepEqual(s.writes,['alt']);assert.deepEqual(s.current,before);assert.deepEqual(s.files,files);
});

test('price-only and title-plus-price changes preserve every omitted field, image and PDF',async()=>{
 for(const fields of [{price:5.99},{title:'New title',price:7.99}]){
  const s=setup();s.project.media=[];s.project.manifest.fileUpdates=[];s.project.manifest.updateScope=Object.keys(fields);s.project.manifest.updateFields=fields;
  s.current.images=[{listing_image_id:'10',rank:1,alt_text:'Original alt'}];s.current.quantity=999;s.current.taxonomy_id=343;s.current.state='active';
  const before=context.listingSnapshot(s.current),images=structuredClone(s.current.images),files=structuredClone(s.files);
  const result=await s.run();assert.equal(result.verified,true);assert.deepEqual(s.writes,'title' in fields?['inventory','fields']:['inventory']);assert.deepEqual(s.files,files);assert.deepEqual(s.current.images,images);
  const after=context.listingSnapshot(s.current);for(const key of Object.keys(before))assert.deepEqual(after[key],key in fields?fields[key]:before[key]);
 }
});
test('listing PATCH rejects price and sends only supported selected text fields',async()=>{
 const requests=[];const c=vm.createContext({URLSearchParams,etsyFetch:async(path,token,init)=>{requests.push({path,method:init.method,fields:Object.fromEntries(init.body)});}});
 const text=source.slice(source.indexOf('async function updateSelectedListingFields('),source.indexOf('async function updatePersonalization('));vm.runInContext(stripTypeScriptTypes(text),c);
 for(const fields of [{price:5.99},{title:'New title',price:7.99}])await assert.rejects(c.updateSelectedListingFields('shop','123','token',fields),/inventory endpoint/);
 await c.updateSelectedListingFields('shop','123','token',{title:'New title'});
 assert.deepEqual(requests,[{path:'/shops/shop/listings/123',method:'PATCH',fields:{title:'New title'}}]);
});
test('unapplied inventory price is held for review before title is changed',async()=>{
 const s=setup();s.project.manifest.fileUpdates=[];s.project.manifest.updateScope=['title','price'];s.project.manifest.updateFields={title:'New title',price:5.99};const read=s.api.fetch;
 s.api.fetch=async(path,token,init)=>{if(init?.method==='PUT'){s.writes.push('inventory');return structuredClone(s.inventory);}return read(path,token,init);};
 await assert.rejects(s.run(),/inventory readback differs/);assert.equal(s.runs[0].status,'needs_review');assert.deepEqual(s.writes,['inventory']);assert.equal(s.current.title,'Old title');
});
test('missing inventory and non-download listings block price changes before title writes',async()=>{
 for(const invalid of ['missing','multiple','physical']){const s=setup();s.project.manifest.fileUpdates=[];s.project.manifest.updateScope=['title','price'];s.project.manifest.updateFields={title:'New title',price:5.99};if(invalid==='physical')s.current.listing_type='physical';else if(invalid==='multiple')s.inventory.products.push(structuredClone(s.inventory.products[0]));else s.inventory.products=[];
 await assert.rejects(s.run(),/digital planners|exactly one/);assert.deepEqual(s.writes,[]);assert.equal(s.runs[0].status,'blocked');}
});
test('price reconciliation checks inventory and never repeats an uncertain write',async()=>{
 const s=setup();s.project.manifest.fileUpdates=[];s.project.manifest.updateScope=['price'];s.project.manifest.updateFields={price:5.99};const read=s.api.fetch;
 s.api.fetch=async(path,token,init)=>{if(init?.method==='PUT'){const r=await read(path,token,init);s.current.price={amount:1499,divisor:100,currency_code:'GBP'};return r;}return read(path,token,init);};
 await assert.rejects(s.run(),/price differs/);s.current.price={amount:599,divisor:100,currency_code:'GBP'};
 const result=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(result.verified,true);assert.deepEqual(s.writes,['inventory']);
});
test('inventory preservation failure cannot reconcile as a successful price update',async()=>{
 const s=setup();s.project.manifest.fileUpdates=[];s.project.manifest.updateScope=['price'];s.project.manifest.updateFields={price:5.99};const read=s.api.fetch;
 s.api.fetch=async(path,token,init)=>{const r=await read(path,token,init);if(init?.method==='PUT')s.inventory.products[0].offerings[0].quantity=888;return r;};
 await assert.rejects(s.run(),/inventory readback differs/);const result=await context.reconcileEdit(s.admin,{shop_id:'shop',etsy_user_id:'owner'},'test',s.project,s.api);assert.equal(result.verified,false);assert.equal(s.project.status,'failed');assert.deepEqual(s.writes,['inventory']);
});

test('price review preflight checks real inventory and attachments using GET only',async()=>{
 const s=setup();s.project.manifest.updateScope=['price'];s.project.manifest.updateFields={price:7.99};s.project.manifest.existingSnapshot=context.listingSnapshot(s.current);s.project.manifest.existingImages=[];s.project.manifest.existingFiles=s.files.map(f=>({id:f.listing_file_id,rank:f.rank,name:f.filename}));
 const result=await context.verifyPriceReview(s.project,{shop_id:'shop',etsy_user_id:'owner'},'test',s.api);assert.equal(result.verified,true);assert.equal(result.published,false);assert.equal(result.current_price,14.99);assert.deepEqual(s.writes,[]);
 s.files[0].filename='changed.pdf';await assert.rejects(context.verifyPriceReview(s.project,{shop_id:'shop',etsy_user_id:'owner'},'test',s.api),/PDFs changed/);assert.deepEqual(s.writes,[]);
});
test('price review accepts entity-equivalent image alt text but rejects real changes without writes',async()=>{
 const s=setup();s.project.manifest.updateScope=['price'];s.project.manifest.updateFields={price:7.99};s.project.manifest.existingSnapshot=context.listingSnapshot(s.current);s.project.manifest.existingFiles=s.files.map(f=>({id:f.listing_file_id,rank:f.rank,name:f.filename}));
 s.current.images=[{listing_image_id:'10',rank:1,alt_text:'Read &quot;what to book&quot; &amp; visitor&#39;s guide'}];s.project.manifest.existingImages=[{id:'10',rank:1,altText:'Read "what to book" & visitor\'s guide'}];
 const result=await context.verifyPriceReview(s.project,{shop_id:'shop',etsy_user_id:'owner'},'test',s.api);assert.equal(result.verified,true);assert.deepEqual(s.writes,[]);
 s.current.images[0].alt_text='Read &quot;what to book&quot; &amp; visitor&#39;s guides';await assert.rejects(context.verifyPriceReview(s.project,{shop_id:'shop',etsy_user_id:'owner'},'test',s.api),/images changed/i);assert.deepEqual(s.writes,[]);
});

test('inventory drift during preflight blocks every write',async()=>{
 const s=setup();s.project.manifest.fileUpdates=[];s.project.manifest.updateScope=['title','price'];s.project.manifest.updateFields={title:'New title',price:5.99};const read=s.api.fetch;let reads=0;
 s.api.fetch=async(path,token,init)=>{if(path.endsWith('/inventory')&&!init&&++reads===2)s.inventory.products[0].offerings[0].quantity=998;return read(path,token,init);};
 await assert.rejects(s.run(),/inventory readback differs/);assert.deepEqual(s.writes,[]);assert.equal(s.runs[0].status,'blocked');
});
