const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const context=vm.createContext({Error,Set});
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/seller-tools-inbox/cancel-review.ts','utf8').replace('export async','async')),context);
function setup({status='ready',runStatus='blocked',race=false}={}){
 const project={id:'project',revision:1,status,kind:'etsy',media:[{path:'owner/project/current.pdf'}]};const calls=[];
 const admin={from(table){let operation='select';const q={select(){return q},eq(){return q},in(){return q},update(){operation='update';return q},delete(){operation='delete';return q},maybeSingle(){return Promise.resolve({data:race?null:{id:'project'}})},then(resolve){calls.push([table,operation]);return Promise.resolve({data:table==='seller_publish_runs'&&operation==='select'?[{status:runStatus}]:table==='review_project_versions'&&operation==='select'?[{media:[{path:'owner/project/old.pdf'}]}]:[]}).then(resolve)}};return q;},storage:{from(){return {remove:async paths=>{calls.push(['remove',paths]);return {error:null}}}}}};
 return {project,calls,run:()=>context.cancelReview(admin,project,'owner')};
}
test('cancellation deletes current and previous assets and the pending project',async()=>{const s=setup();const r=await s.run();assert.equal(r.deleted,true);assert.equal(r.assets_deleted,2);assert.ok(s.calls.some(x=>x[0]==='review_projects'&&x[1]==='delete'));});
test('uncertain external writes cannot lose their retry lock through cancellation',async()=>{const s=setup({runStatus:'needs_review'});await assert.rejects(s.run(),/unresolved/);assert.ok(!s.calls.some(x=>x[0]==='remove'));});
test('approval winning the claim prevents asset deletion',async()=>{const s=setup({race:true});await assert.rejects(s.run(),/changed/);assert.ok(!s.calls.some(x=>x[0]==='remove'));});
test('cross-project asset references are never deleted',async()=>{const s=setup();s.project.media[0].path='other/project/file.pdf';await assert.rejects(s.run(),/Unexpected asset owner/);assert.ok(!s.calls.some(x=>x[0]==='remove'));});
