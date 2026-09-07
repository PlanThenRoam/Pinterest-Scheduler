import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
export async function pinterestRequest(path:string,init:RequestInit={},userId?:string) {
 let token=Deno.env.get('PINTEREST_ACCESS_TOKEN');
 if(userId){
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const current=await admin.from('pinterest_credentials').select('*').eq('user_id',userId).maybeSingle();if(current.error)throw current.error;
  if(current.data){token=current.data.access_token;if(Date.parse(current.data.expires_at)<Date.now()+60000){
   const id=Deno.env.get('PINTEREST_APP_ID')||'',secret=Deno.env.get('PINTEREST_APP_SECRET')||'';
   if(!id||!secret||!current.data.refresh_token)throw new Error('Reconnect Pinterest from your account.');
   const response=await fetch('https://api.pinterest.com/v5/oauth/token',{method:'POST',headers:{authorization:'Basic '+btoa(id+':'+secret),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:current.data.refresh_token}),signal:AbortSignal.timeout(30000)});
   const refreshed=await response.json();if(!response.ok||!refreshed.access_token)throw new Error('Reconnect Pinterest from your account.');
   const saved=await admin.from('pinterest_credentials').update({access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||current.data.refresh_token,expires_at:new Date(Date.now()+Number(refreshed.expires_in)*1000).toISOString()}).eq('user_id',userId);if(saved.error)throw saved.error;token=refreshed.access_token;
  }}
 }
 if(!token)throw new Error('Pinterest is not connected. An authorised Pinterest access token is required.');
 const response=await fetch('https://api.pinterest.com/v5'+path,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json',...init.headers},signal:AbortSignal.timeout(30000)});
 const data=await response.json();
 if(!response.ok)throw new Error(`Pinterest request failed (${response.status}). ${String(data.message||'Check the connection.').slice(0,180)}`);
 return data;
}
export async function listBoards(userId?:string){
 const boards:any[]=[];let bookmark:string|undefined;
 do{const data=await pinterestRequest('/boards?page_size=100'+(bookmark?'&bookmark='+encodeURIComponent(bookmark):''),{},userId);boards.push(...(data.items||[]).map((b:any)=>({id:b.id,name:b.name,description:b.description||'',privacy:b.privacy})));bookmark=data.bookmark;if(boards.length>10000)throw new Error('Too many boards to retrieve safely.');}while(bookmark);
 return boards;
}
