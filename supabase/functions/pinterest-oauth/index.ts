import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
const root=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('PINTEREST_APP_ID')||'',secret=Deno.env.get('PINTEREST_APP_SECRET')||'';
const callback=root+'/functions/v1/pinterest-oauth/callback',app='https://planthenroam.github.io/Pinterest-Scheduler/';
const admin=createClient(root,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'access-control-allow-origin':'https://planthenroam.github.io','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json','cache-control':'no-store'};
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 const url=new URL(req.url);
 if(req.method==='GET'&&url.pathname.endsWith('/health'))return json({app_version:36,api_version:'4.0.1',configured:Boolean(key&&secret)});
 try{
  if(!key||!secret)throw new Error('Pinterest app credentials are not configured.');
  if(url.pathname.endsWith('/callback')){
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||!code)throw new Error('Pinterest authorisation was not completed.');
   const consumed=await admin.from('pinterest_oauth_states').delete().eq('state',state).gt('expires_at',new Date().toISOString()).select('user_id').maybeSingle();
   if(consumed.error||!consumed.data)throw new Error('Pinterest sign-in expired. Start again from your account.');
   const response=await fetch('https://api.pinterest.com/v5/oauth/token',{method:'POST',headers:{authorization:'Basic '+btoa(key+':'+secret),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callback}),signal:AbortSignal.timeout(30000)});
   const tokens=await response.json();if(!response.ok||!tokens.access_token)throw new Error('Pinterest could not complete authorisation.');
   const saved=await admin.from('pinterest_credentials').upsert({user_id:consumed.data.user_id,access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:new Date(Date.now()+Number(tokens.expires_in)*1000).toISOString()});if(saved.error)throw saved.error;
   const connection=await admin.from('platform_connections').update({status:'connected',metadata:{oauth_connected:true,publish_enabled:true}}).eq('platform','pinterest');if(connection.error)throw connection.error;
   return Response.redirect(app+'?pinterest=connected#posting',303);
  }
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const auth=req.headers.get('authorization')||'',db=createClient(root,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const user=await db.auth.getUser(auth.replace(/^Bearer /,''));if(user.error||!user.data.user)return json({error:'Sign in to continue.'},401);
  const owner=await db.from('app_owners').select('user_id').eq('user_id',user.data.user.id).maybeSingle();if(!owner.data)return json({error:'Owner access required.'},403);
  const state=crypto.randomUUID()+crypto.randomUUID(),saved=await admin.from('pinterest_oauth_states').insert({state,user_id:user.data.user.id,expires_at:new Date(Date.now()+600000).toISOString()});if(saved.error)throw saved.error;
  const target=new URL('https://www.pinterest.com/oauth/');target.search=new URLSearchParams({client_id:key,redirect_uri:callback,response_type:'code',scope:'boards:read,pins:read,pins:write',state}).toString();return json({url:target.href});
 }catch(error){return json({error:error instanceof Error?error.message:'Pinterest connection failed.'},400);}
});
