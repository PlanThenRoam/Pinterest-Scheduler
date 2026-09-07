const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const base=require('node:path').join(__dirname,'../supabase/functions/etsy-publish');
function setup({invalidPdf=false,imageTimeout=false,wrongAlt=false,wrongDescription=false}={}){
 const roles=['thumbnail',...Array.from({length:5},(_,i)=>`listing-image-${i+1}`)];
 const project={id:'project',kind:'etsy',status:'ready',revision:1,title:'Test planner',manifest:{title:'Test planner',description:'Guide description',tags:Array.from({length:13},(_,i)=>`Tag ${i}`),altText:roles.map((_,i)=>`Approved alt ${i}`),taxonomyId:1},media:[...roles.map((role,i)=>({role,name:`image${i}.png`,path:`image${i}`})),{role:'customer-pdf',name:'guide.pdf',path:'pdf'}]};
 const writes=[],images=[],files=[];let handler,state='draft',nextId=100,draftFields={};
 const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},storage:{from:()=>({download:async(path)=>({data:path==='pdf'?new Blob([invalidPdf?'bad':'%PDF-1.7 Test']):new Blob([new Uint8Array([137,80,78,71,...Array(20).fill(0)])])})})},from(table){const q={changes:null,filters:[],select(){return this;},eq(k,v){this.filters.push([k,v]);return this;},in(k,v){this.filters.push([k,v]);return this;},update(v){this.changes=structuredClone(v);return this;},single(){return Promise.resolve(this.apply());},maybeSingle(){return Promise.resolve(this.apply());},then(a,b){return Promise.resolve(this.apply()).then(a,b);},apply(){if(table==='app_owners')return {data:{user_id:'owner'}};if(table==='etsy_credentials')return {data:{shop_id:'shop',etsy_user_id:'owner',access_token:'test',expires_at:'2099-01-01'}};if(table!=='review_projects')throw Error('Unexpected table '+table);if(!this.filters.every(([k,v])=>Array.isArray(v)?v.includes(project[k]):project[k]===v))return {data:null};if(this.changes){if(this.changes.manifest)project.revision++;Object.assign(project,this.changes);}return {data:structuredClone(project)};}};return q;}};
 const fetch=async(url,init={})=>{
  const path=new URL(url).pathname,method=init.method||'GET';
  if(!url.startsWith('https://openapi.etsy.com/'))throw Error('Unexpected external request');
  const ok=data=>new Response(JSON.stringify(data),{status:200});
  if(path.endsWith('/listings')&&method==='POST'){writes.push('create');draftFields={title:init.body.get('title'),description:wrongDescription?'Unexpected':init.body.get('description'),tags:init.body.getAll('tags'),price:Number(init.body.get('price'))};return ok({listing_id:'12345'});}
  if(path.endsWith('/images')&&method==='POST'){
   const form=init.body;
   if(form.has('image')){writes.push('image');const image={listing_image_id:String(nextId++),rank:Number(form.get('rank')),alt_text:'retained alt'};images.push(image);if(imageTimeout)throw Error('network timeout after upload');return ok(image);}
   writes.push('alt');const image=images.find(x=>x.listing_image_id===String(form.get('listing_image_id')));if(!wrongAlt)image.alt_text=form.get('alt_text');return ok(image);
  }
  if(path.endsWith('/files')){if(method==='POST'){writes.push('pdf');files.push({listing_file_id:'999'});return ok(files[0]);}return ok({results:files});}
  if(path.endsWith('/listings/12345')&&method==='PATCH'){writes.push('activate');state='active';return ok({listing_id:'12345',state});}
  if(method==='GET'&&/\/listings\/\d+$/.test(path))return ok({listing_id:path.split('/').at(-1),user_id:'owner',state,images,...draftFields,who_made:'i_did',when_made:'2020_2026',taxonomy_id:1});
  throw Error('Unhandled '+method+' '+path);
 };
 const c=vm.createContext({Blob,FormData,URLSearchParams,Headers,Response,Request,AbortSignal,crypto,structuredClone,Date,console,TextDecoder,TextEncoder,URL,fetch,createClient:()=>admin,Deno:{env:{get:()=> 'test'},serve:f=>handler=f}});
 for(const file of ['assets.ts','safety.ts','safe-edit.ts','image-recovery.ts','index.ts']){const source=fs.readFileSync(base+'/'+file,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/\bexport /g,'');vm.runInContext(stripTypeScriptTypes(source),c);}
 return {project,writes,images,files,run:async()=>{const response=await handler(new Request('https://example.com/etsy-publish',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({project_id:'project',expected_revision:project.revision})}));return {status:response.status,body:await response.json()};}};
}
test('new listing verifies six images, alt text and PDF before activation',async()=>{const s=setup();const r=await s.run();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(s.writes.filter(x=>x==='image').length,6);assert.equal(s.writes.filter(x=>x==='alt').length,6);assert.equal(s.writes.at(-1),'activate');assert.equal(s.project.status,'published');});
test('invalid customer file blocks even draft creation',async()=>{const s=setup({invalidPdf:true});const r=await s.run();assert.equal(r.status,400);assert.match(r.body.error,/genuine PDFs/);assert.deepEqual(s.writes,[]);});
test('uncertain new-listing image upload cannot be duplicated by retry',async()=>{const s=setup({imageTimeout:true});assert.equal((await s.run()).status,400);const r=await s.run();assert.match(r.body.error,/uncertain outcome/);assert.deepEqual(s.writes,['create','image']);});
test('incorrect new-listing alt text blocks activation',async()=>{const s=setup({wrongAlt:true});const r=await s.run();assert.equal(r.status,400);assert.match(r.body.error,/image 1 verification/);assert.equal(s.writes.includes('activate'),false);});
test('parallel new-listing requests create only one Etsy draft',async()=>{const s=setup();await Promise.all([s.run(),s.run()]);assert.equal(s.writes.filter(x=>x==='create').length,1);assert.equal(s.writes.filter(x=>x==='image').length,6);});
test('unexpected listing copy is caught before activation',async()=>{const s=setup({wrongDescription:true});const r=await s.run();assert.equal(r.status,400);assert.match(r.body.error,/description differs/);assert.equal(s.writes.includes('activate'),false);});
