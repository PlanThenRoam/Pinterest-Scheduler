const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/etsy-publish/index.ts','utf8');
const helper=source.slice(source.indexOf('async function withListingFiles('),source.indexOf('async function etsyFetch('));
test('retrieves all 35 listing file IDs in order with bounded read-only requests',async()=>{
 let active=0,max=0;const calls=[];
 const c=vm.createContext({Error,etsyFetch:async(path,token)=>{calls.push(path);assert.equal(token,'owner-token');active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;const id=path.split('/').at(-2);return {results:[{listing_file_id:'900'+id,filename:id+'.pdf',rank:1}]};}});
 vm.runInContext(stripTypeScriptTypes(helper),c);
 const rows=Array.from({length:35},(_,i)=>({listing_id:String(i+1),title:'Planner '+i}));
 const result=await c.withListingFiles(rows,'shop','owner-token');
 assert.equal(calls.length,35);assert.equal(max,3);
 result.forEach((x,i)=>{assert.equal(x.listing_id,String(i+1));assert.equal(x.digital_files[0].listing_file_id,'900'+(i+1));assert.equal(x.digital_files_status,'ok');});
 assert.equal(rows[0].digital_files,undefined);
});
test('distinguishes empty files from failed or malformed responses without losing other listings',async()=>{
 const c=vm.createContext({Error,etsyFetch:async path=>{if(path.includes('/1/'))throw new Error('Etsy unavailable');return path.includes('/2/')?{results:[]}:{unexpected:true};}});
 vm.runInContext(stripTypeScriptTypes(helper),c);
 const result=await c.withListingFiles([1,2,3].map(id=>({listing_id:String(id)})),'shop','token');
 assert.equal(result[0].digital_files_status,'error');assert.equal(result[0].digital_files,null);assert.match(result[0].digital_files_error,/Etsy unavailable/);
 assert.equal(result[1].digital_files_status,'ok');assert.equal(result[1].digital_files.length,0);
 assert.equal(result[2].digital_files_status,'error');
});
