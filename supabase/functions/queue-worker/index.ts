import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {drainStorageCleanup} from '../seller-tools-inbox/storage-cleanup.ts';
Deno.serve(async(req:Request)=>{
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret||req.headers.get('authorization')!=='Bearer '+secret)return new Response('Unauthorised',{status:401});
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{const admin=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false}});const owners=await admin.from('app_owners').select('user_id');if(owners.error)throw owners.error;for(const owner of owners.data||[])await drainStorageCleanup(admin,owner.user_id);return Response.json({ok:true,cleanup_complete:true,published:false});}catch{return Response.json({error:'Storage cleanup remains pending; the next run will retry.'},{status:503});}
});
