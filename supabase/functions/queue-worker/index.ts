import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {drainStorageCleanup} from '../seller-tools-inbox/storage-cleanup.ts';
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!serviceKey)return new Response('Unavailable',{status:503});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey,{auth:{persistSession:false}});
 const token=req.headers.get('x-cleanup-token');
 if(req.headers.get('authorization')!=='Bearer '+serviceKey){
  if(!token||token.length!==72)return new Response('Unauthorised',{status:401});
  const verified=await admin.rpc('verify_seller_cleanup_token',{p_token:token});
  if(verified.error||verified.data!==true)return new Response('Unauthorised',{status:401});
 }
 try{const owners=await admin.from('app_owners').select('user_id');if(owners.error)throw owners.error;for(const owner of owners.data||[])await drainStorageCleanup(admin,owner.user_id);return Response.json({ok:true,cleanup_complete:true,published:false});}catch{return Response.json({error:'Storage cleanup remains pending; the next run will retry.'},{status:503});}
});
