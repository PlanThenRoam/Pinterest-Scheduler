const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const context=vm.createContext({});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/etsy-publish/new-listing.ts','utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'')),context);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/seller-tools-inbox/recover-draft-price.ts','utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'')),context);
const candidate=context.priceRecoveryCandidate;

function fixture(){
 const project={id:'review',kind:'etsy',status:'failed',revision:25,title:'Utah Mighty Five',platform_id:'12345',manifest:{title:'Utah Mighty Five',description:'Approved copy',price:6.99,tags:['unchanged'],altText:['unchanged'],listingDefaults:{price:6.99,currency:'GBP',quantity:999},submissionFingerprint:'same-submission',etsyPublish:{listingId:'12345',imagesUploaded:7,imageIds:['1','2','3','4','5','6','7'],imageUploadAttempted:false,fileId:'999',fileUploaded:true,fileUploadAttempted:true}}};
 const args={project_id:project.id,expected_revision:project.revision,manifest:{...structuredClone(project.manifest),price:7.99}};
 return {project,args};
}

test('a narrow Utah price recovery preserves every input and the failed approval lock',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.equal(candidate(s.project,s.args),7.99);
 assert.deepEqual(s,before);
 assert.equal(s.project.status,'failed');
 assert.equal(s.project.manifest.listingDefaults.price,6.99);
});

test('identical optional titles and reordered object keys do not change the proposal',()=>{
 const s=fixture();s.args.title=s.project.title;s.args.mark_ready=false;
 s.args.manifest=Object.fromEntries(Object.entries(s.args.manifest).reverse());
 s.args.manifest.listingDefaults={quantity:999,currency:'GBP',price:6.99};
 assert.equal(candidate(s.project,s.args),7.99);
});

test('only failed new-listing drafts qualify, never edits or released publication states',()=>{
 for(const change of [s=>s.project.kind='pinterest',...['ready','editing','approved','publishing','published','changes_requested'].map(status=>s=>s.project.status=status),s=>s.project.manifest.mode='edit',s=>s.project.manifest.listingId='12345',s=>s.project.manifest.etsyListingId='12345',s=>s.project.manifest.archived=true]){
  const s=fixture();change(s);assert.throws(()=>candidate(s.project,s.args),/failed new-listing/);
 }
});

test('draft identity and confirmed upload checkpoints must be complete and unambiguous',()=>{
 for(const change of [s=>s.args.project_id='another',s=>s.project.platform_id='54321',s=>s.project.manifest.etsyPublish.listingId='invalid',s=>s.project.manifest.etsyPublish.activated=true,s=>s.project.manifest.etsyPublish.publishedAt='2026-10-06',s=>s.project.manifest.etsyPublish.fileUploaded=false,s=>delete s.project.manifest.etsyPublish.fileId,s=>s.project.manifest.etsyPublish.imagesUploaded=5,s=>s.project.manifest.etsyPublish.imageUploadAttempted=true,s=>s.project.manifest.etsyPublish.imageIds.pop(),s=>s.project.manifest.etsyPublish.imageIds[5]='1',s=>s.project.manifest.etsyPublish.imageIds[5]='invalid']){
  const s=fixture();change(s);assert.throws(()=>candidate(s.project,s.args),/identity|confirmed/);
 }
});

test('price recovery cannot change currency or infer an unknown shop currency',()=>{
 for(const change of [s=>s.project.manifest.listingDefaults.currency='USD',s=>delete s.project.manifest.listingDefaults.currency,s=>s.project.manifest.currency='EUR']){
  const s=fixture();change(s);assert.throws(()=>candidate(s.project,s.args),/GBP/);
 }
});

test('invalid, overprecise and unchanged prices are rejected',()=>{
 for(const price of [0,-1,NaN,Infinity,'7.99',true,null,7.999,Number.MAX_SAFE_INTEGER]){
  const s=fixture();s.args.manifest.price=price;assert.throws(()=>candidate(s.project,s.args),/positive number/);
 }
 const s=fixture();s.args.manifest.price=6.99;assert.throws(()=>candidate(s.project,s.args),/unchanged/);
});

test('every non-price manifest value and protected checkpoint remains locked',()=>{
 for(const change of [s=>s.args.manifest.title='Different',s=>s.args.manifest.description='Different',s=>s.args.manifest.tags.push('new'),s=>s.args.manifest.altText[0]='Different',s=>s.args.manifest.listingDefaults.price=7.99,s=>s.args.manifest.listingDefaults.currency='EUR',s=>s.args.manifest.etsyPublish.fileId='888',s=>s.args.manifest.submissionFingerprint='different',s=>delete s.args.manifest.tags,s=>s.args.manifest.extra='new']){
  const s=fixture();change(s);assert.throws(()=>candidate(s.project,s.args),/preserve every other/);
 }
});

test('recovery cannot modify the display title, release approval or accept extra fields',()=>{
 for(const change of [s=>s.args.title='Different',s=>s.args.mark_ready=true,s=>s.args.status='ready',s=>s.args.media=[]]){
  const s=fixture();change(s);assert.throws(()=>candidate(s.project,s.args),/only the proposed price/);
 }
 const s=fixture();delete s.args.manifest;assert.throws(()=>candidate(s.project,s.args),/complete unchanged manifest/);
});
