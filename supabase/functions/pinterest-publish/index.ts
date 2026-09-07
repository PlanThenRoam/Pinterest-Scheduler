import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {pinterestRequest,listBoards} from './api.ts';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS'};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'content-type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 let admin:any,project:any,claimed=false,attempted=false;
 try{
  const url=Deno.env.get('SUPABASE_URL')!,auth=req.headers.get('authorization')||'';
  const db=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:user,error}=await db.auth.getUser(auth.replace(/^Bearer /,''));
  if(error||!user.user)return json({error:'Sign in to continue.'},401);
  const {data:owner}=await db.from('app_owners').select('user_id').eq('user_id',user.user.id).maybeSingle();
  if(!owner)return json({error:'Owner access required.'},403);
  const body=await req.json();
  if(body.action==='list_boards')return json({boards:await listBoards(user.user.id)});
  const p=await db.from('review_projects').select('*').eq('id',body.project_id).eq('kind','pinterest').single();if(p.error)throw p.error;project=p.data;
  if(project.status==='published')return json({ok:true,already_published:true,pin_url:'https://www.pinterest.com/pin/'+project.platform_id+'/'});
  if(project.status!=='ready'||project.revision!==body.expected_revision)throw new Error('Refresh and review the current pin before publishing.');
  const pins=project.manifest?.pins||[];if(pins.length!==1)throw new Error('Approve one pin per submission.');const pin=pins[0];
  if(project.manifest.pinAttempted)throw new Error('The previous Pinterest submission has an uncertain result. Check Pinterest before retrying.');
  const boards=await listBoards(user.user.id);if(!boards.some(b=>b.id===pin.boardId))throw new Error('The selected Pinterest board is no longer available.');
  if(!/^https:\/\/www\.etsy\.com\/listing\/\d+\/?$/.test(pin.link))throw new Error('The planner Etsy link is missing or invalid.');
  const asset=project.media.find((x:any)=>x.role===pin.imageRole);if(!asset||!asset.path.startsWith(user.user.id+'/'+project.id+'/'))throw new Error('The pin image is unavailable.');
  const image=await db.storage.from('pinterest-media').download(asset.path);if(image.error)throw image.error;
  if(!['image/png','image/jpeg'].includes(image.data.type)||image.data.size>20000000)throw new Error('Pinterest requires a JPEG or PNG image under 20 MB.');
  const bytes=new Uint8Array(await image.data.arrayBuffer());
  if(asset.checksum){const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==asset.checksum)throw new Error('The pin image changed after review.');}
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const claim=await admin.from('review_projects').update({status:'publishing',last_error:null}).eq('id',project.id).eq('revision',body.expected_revision).eq('status','ready').select('id').maybeSingle();if(claim.error||!claim.data)throw new Error('This pin changed or is already publishing.');claimed=true;
  const manifest={...project.manifest,pinAttempted:true};const before=await admin.from('review_projects').update({manifest}).eq('id',project.id);if(before.error)throw before.error;attempted=true;
  const created=await pinterestRequest('/pins',{method:'POST',body:JSON.stringify({board_id:pin.boardId,title:pin.title,description:pin.description,alt_text:pin.altText||pin.title,link:pin.link,media_source:{source_type:'image_base64',content_type:image.data.type,data:btoa(binary)}})},user.user.id);
  if(!created.id)throw new Error('Pinterest did not confirm the pin ID.');
  const saved=await admin.from('review_projects').update({platform_id:created.id}).eq('id',project.id);if(saved.error)throw saved.error;
  const verified=await pinterestRequest('/pins/'+encodeURIComponent(created.id),{},user.user.id);
  if(verified.board_id!==pin.boardId||verified.link!==pin.link||verified.title!==pin.title||verified.description!==pin.description)throw new Error('Pinterest readback needs review.');
  const done=await admin.from('review_projects').update({status:'published',published_at:new Date().toISOString(),last_error:null,manifest:{submissionFingerprint:project.manifest.submissionFingerprint,published:true},media:[],preview_path:null,title:'Published submission'}).eq('id',project.id);if(done.error)throw done.error;
  return json({ok:true,verified:true,pin_url:'https://www.pinterest.com/pin/'+created.id+'/'});
 }catch(error){const message=(error instanceof Error?error.message:'Pinterest request failed.');if(claimed)await admin.from('review_projects').update({status:'failed',last_error:(attempted?'Some changes may be live. ':'')+message}).eq('id',project.id);return json({error:message},400);}
});
