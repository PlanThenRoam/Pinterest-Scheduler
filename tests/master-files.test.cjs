const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {stripTypeScriptTypes}=require('node:module');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'supabase/functions/seller-tools-inbox/master-files.ts'),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'');
const ctx=vm.createContext({crypto,Uint8Array,TextDecoder,Blob,Date,Set,Map,zipSync:require('fflate').zipSync});vm.runInContext(stripTypeScriptTypes(source),ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
function query(data){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle:async()=>({data}),single:async()=>({data}),then(fn){return Promise.resolve({data}).then(fn)}};return q;}
const hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
test('upload validation accepts a Word/PDF pair and rejects duplicate roles, unsupported types and paths',()=>{
 const files=[{role:'docx',filename:'Guide.docx',size:10,checksum:'a'.repeat(64)},{role:'pdf',filename:'Guide.pdf',size:12,checksum:'b'.repeat(64)}];
 assert.equal(ctx.validateUploadFiles(files)[0].mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.throws(()=>ctx.validateUploadFiles([files[0],files[0]]),/unique role/);
 assert.throws(()=>ctx.validateUploadFiles([{...files[0],filename:'../Guide.docx'}]),/folder paths/);
 assert.throws(()=>ctx.validateUploadFiles([{...files[0],filename:'Guide.html'}]),/Supported files/);
 assert.throws(()=>ctx.validateUploadFiles([{...files[0],filename:'Guide.pdf'}]),/docx role/);
});
test('replacing Word/PDF preserves unrelated image files',()=>{
 const original=[{role:'docx',path:'old-word'},{role:'pdf',path:'old-pdf'},{role:'cover',path:'keep-image'}],next=[{role:'docx',path:'new-word'},{role:'pdf',path:'new-pdf'}];
 assert.deepEqual(plain(ctx.mergeMasterFiles(original,next)),[{role:'cover',path:'keep-image'},{role:'docx',path:'new-word'},{role:'pdf',path:'new-pdf'}]);assert.equal(original[0].path,'old-word');
});
test('integrity verification rejects changed bytes even when size is unchanged',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7 test'),file={name:'Guide.pdf',mime:'application/pdf',size:bytes.length,checksum:await hash(bytes)};
 await ctx.verifyMasterBytes(file,bytes);const changed=bytes.slice();changed[10]=88;await assert.rejects(ctx.verifyMasterBytes(file,changed),/checksum/);
});
test('Etsy delivery preserves the exact editable Word inside a compatible ZIP',()=>{
 const bytes=new Uint8Array([80,75,3,4,65,66,67]),name='My Editable Guide.docx';
 const delivery=ctx.etsyDelivery({name,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},bytes);
 assert.equal(delivery.name,'My_Editable_Guide.zip');assert.equal(delivery.mime,'application/zip');
 const unzipped=require('fflate').unzipSync(delivery.bytes);assert.deepEqual(Buffer.from(unzipped[name]),Buffer.from(bytes));
});
test('stale upload cannot reserve storage or overwrite a newer master',async()=>{
 let writes=0;const db={from:()=>query({id:'m',revision:4})},admin={from(){writes++;throw Error('unexpected write')}};
 await assert.rejects(ctx.handleMasterTool('prepare_master_upload',{master_id:'m',expected_revision:3},{db,admin,userId:'u'}),/Version conflict/);assert.equal(writes,0);
});
test('retrying a committed upload returns its saved revision without writing again',async()=>{
 const admin={from:()=>query({id:'upload',status:'committed',master_id:'m',result_revision:2}),rpc(){throw Error('unexpected write')}};
 assert.deepEqual(plain(await ctx.handleMasterTool('commit_master_upload',{upload_id:'upload'},{admin,userId:'u'})),{master_id:'m',revision:2,already_committed:true});
});
test('a bad second upload prevents committing the whole Word/PDF batch',async()=>{
 const first=new Uint8Array([80,75,3,4,1,2]),second=new TextEncoder().encode('%PDF-1.7 valid');
 const files=[{name:'Guide.docx',role:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',path:'u/m/upload/docx.docx',size:first.length,checksum:await hash(first)},{name:'Guide.pdf',role:'pdf',mime:'application/pdf',path:'u/m/upload/pdf.pdf',size:second.length,checksum:'a'.repeat(64)}];
 let commits=0;const admin={from:()=>query({id:'upload',status:'prepared',master_id:'m',expected_revision:1,expires_at:new Date(Date.now()+60000).toISOString(),files}),storage:{from:()=>({download:async p=>({data:new Blob([p.endsWith('.docx')?first:second])})})},rpc(){commits++;return {data:{}}}};
 await assert.rejects(ctx.handleMasterTool('commit_master_upload',{upload_id:'upload'},{admin,db:{from:()=>query({id:'m',revision:1})},userId:'u'}),/checksum/);assert.equal(commits,0);
});
