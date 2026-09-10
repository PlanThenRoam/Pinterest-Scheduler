import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelReview } from './cancel-review.ts';
const ids=['1','2','3','4','5','6'];
const project=()=>({id:'project',kind:'etsy',status:'failed',revision:24,platform_id:'123',media:[],manifest:{etsyPublish:{creationAttempted:true,listingId:'123',fileUploaded:true,fileId:'file',fileUploadAttempted:true,imageUploadAttempted:false,imageIds:ids,imagesUploaded:6}}});
const live=()=>({listing_id:'123',state:'active',images:ids.map(listing_image_id=>({listing_image_id}))});
function db(runs=[],claim=true){
 const writes=[];
 return {writes,storage:{from(){return {async remove(){writes.push('assets');return {data:[]}}}}},
 from(table){
  let op='select';
  const result=()=>({data:op==='update'?(claim?{id:'project'}:null):table==='seller_publish_runs'?runs:[]});
  const q={select(){return q},eq(){return q},in(){return q},update(){op='update';writes.push('claim');return q},delete(){op='delete';writes.push(table);return q},async maybeSingle(){return result()},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
  return q;
 }};
}
test('completed manually corrected live listing permits local cancellation',async()=>{
 const admin=db();const r=await cancelReview(admin,project(),'owner',async()=>live());
 assert.equal(r.deleted,true);assert.ok(admin.writes.includes('review_projects'));
});
for(const [name,change,reader,runs] of [
 ['unknown listing',p=>p.manifest.etsyPublish.listingId='',async()=>live(),[]],
 ['upload in flight',p=>p.manifest.etsyPublish.imageUploadAttempted=true,async()=>live(),[]],
 ['file incomplete',p=>p.manifest.etsyPublish.fileUploaded=false,async()=>live(),[]],
 ['missing remote image',()=>{},async()=>({...live(),images:[]}),[]],
 ['wrong listing',()=>{},async()=>({...live(),listing_id:'456'}),[]],
 ['read unavailable',()=>{},async()=>{throw Error('unavailable')},[]],
 ['unresolved run',()=>{},async()=>live(),[{status:'needs_review'}]],
 ['publishing',p=>p.status='publishing',async()=>live(),[]],
 ['Pinterest attempted',p=>p.manifest.pinAttempted=true,async()=>live(),[]]
]){
 test(name+' keeps the submission',async()=>{const p=project();change(p);const admin=db(runs);await assert.rejects(cancelReview(admin,p,'owner',reader));assert.deepEqual(admin.writes,[])});
}
test('concurrent approval prevents deletion',async()=>{const admin=db([],false);await assert.rejects(cancelReview(admin,project(),'owner',async()=>live()));assert.deepEqual(admin.writes,['claim'])});
test('unsubmitted draft still cancels',async()=>{const p=project();p.status='draft';p.manifest={};assert.equal((await cancelReview(db(),p,'owner')).deleted,true)});
